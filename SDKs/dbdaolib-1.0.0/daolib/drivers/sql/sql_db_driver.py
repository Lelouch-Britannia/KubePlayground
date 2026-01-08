import logging
import time
import hashlib
from typing import Optional, Tuple

import sqlalchemy
from sqlalchemy import create_engine, event, Engine, text
from sqlalchemy.exc import (
    SQLAlchemyError,
    OperationalError,
    DatabaseError,
    InvalidRequestError,
)

from daolib.drivers.sql.config import DbConnectionEntry, AbstractDBDriver
from daolib.log_builder import LogBuilder
from daolib.constants import LogEvent, InfraErrorCode

# SDKs MUST use __name__ (Section 2.2)
logger = logging.getLogger(__name__)


class SQLQueryLogger:
    """
    SQLAlchemy Event Listener for query-level logging.
    Logs sql.query events with statement hashing (Section 6.2.4).
    
    Usage:
        Registers on Engine pool to track:
        - Query execution start (before_cursor_execute)
        - Query execution completion (after_cursor_execute)
        - Query failures (handle_error)
    
    Architecture:
        - Tracks start times using context/statement key
        - Hashes SQL statements to avoid logging sensitive data
        - Emits structured logs with duration_ms and db.context
        - Uses DEBUG level for successful queries (Section 8)
        - Uses ERROR level for failed queries
    """

    def __init__(self, logger, database: str, host_label: str, role: str):
        """
        Initialize query logger with database context.
        
        Args:
            logger: Logger instance for emitting logs
            database: Database name
            host_label: Safe host identifier (from config.safe_host_label())
            role: Database role (primary or replica)
        
        Note:
            db_system is extracted dynamically from context.dialect.name during
            event execution (single source of truth). Query start times are stored
            on ExecutionContext objects for thread-safe concurrent query handling.
        """
        # Store context fields for log events
        self.logger = logger
        self.database = database
        self.host_label = host_label
        self.role = role
        
        # self.query_start_time = None  # ❌ DANGER!
        # Timeline:
        # T=0ms:  Query A starts → self.query_start_time = 100.0
        # T=5ms:  Query B starts → self.query_start_time = 105.0 (OVERWRITES A's value!)
        # T=10ms: Query A ends   → uses 105.0 instead of 100.0   (WRONG DURATION!)
        # T=15ms: Query B ends   → uses 105.0  ``

    def before_cursor_execute(
        self, conn, cursor, statement, parameters, context, executemany
    ):
        """
        SQLAlchemy event hook that fires before SQL statement execution.
        
        Args:
            conn: Database connection
            cursor: DB-API cursor
            statement: SQL statement string
            parameters: Bind parameters
            context: ExecutionContext object
            executemany: Boolean indicating batch execution
        
        Note:
            Captures query start time on context object for thread-safe duration
            tracking. No logging occurs at this stage.
        """
        context._query_start_time = time.perf_counter()

    def _get_operation(self, context) -> str:
        """
        Extract operation type from ExecutionContext flags.
        
        Args:
            context: ExecutionContext object
        
        Returns:
            Operation type (INSERT, UPDATE, DELETE, SELECT, OTHER)
        
        Note:
            Uses context built-in flags instead of string parsing for reliability.
            Handles multi-line statements, comments, and CTEs correctly.
        """
        if context.isinsert:
            return "INSERT"
        elif context.isupdate:
            return "UPDATE"
        elif context.isdelete:
            return "DELETE"
        elif context.isselect:
            return "SELECT"
        else:
            # DDL, CALL, PRAGMA, or other non-CRUD
            return "OTHER"

    def after_cursor_execute(
        self, conn, cursor, statement, parameters, context, executemany
    ):
        """
        SQLAlchemy event hook that fires after successful SQL statement execution.
        
        Args:
            conn: Database connection
            cursor: DB-API cursor
            statement: SQL statement string (raw SQL with placeholders)
            parameters: Bind parameters (NEVER log these - may contain PII)
            context: ExecutionContext object
            executemany: Boolean indicating batch execution
        
        Note:
            Logs query with DEBUG level, hashed statement (privacy), duration,
            operation type, and parameter count. Uses LogEvent.SQL_QUERY.
        """
        # Calculate duration
        start = getattr(context, "_query_start_time", None)
        duration_ms = 0.0
        if start is not None:
            duration_ms = (time.perf_counter() - start) * 1000
            
        # Generate statement hash for privacy
        stmt_hash = hashlib.sha256(statement.encode()).hexdigest()[:16]
        
        # Extract operation type using context flags
        operation = self._get_operation(context)
        
        # Extract db_system from context.dialect.name
        db_system = context.dialect.name
        
        # Build and emit log using LogBuilder
        LogBuilder(logger).event(LogEvent.SQL_QUERY).success() \
            .msg(f"Query: {operation}") \
            .duration_ms(duration_ms) \
            .db_context(
                system=db_system,
                database=self.database,
                host=self.host_label,
                role=self.role
            ) \
            .field("db.statement_hash", stmt_hash) \
            .field("db.operation", operation) \
            .field("db.param_count", len(parameters) if parameters else 0) \
            .field("db.executemany", executemany) \
            .level(logging.DEBUG) \
            .emit()

    def handle_error(self, exception_context):
        """
        SQLAlchemy event hook that fires when query execution fails.
        
        Args:
            exception_context: ExceptionContext object containing exception details,
                failed statement, parameters, and execution context
        
        Note:
            Logs query failure with ERROR level, hashed statement, duration (if available),
            mapped InfraErrorCode, and parameter count. Uses LogEvent.SQL_QUERY with
            .failure() for automatic error schema population.
        """
        # Extract exception details
        exec_ctx = exception_context.execution_context
        
        # Calculate duration if start time was captured
        start = getattr(exec_ctx, "_query_start_time", None)
        duration_ms = 0.0
        if start is not None:
            duration_ms = (time.perf_counter() - start) * 1000
        
        # Hash statement for privacy
        statement = exception_context.statement
        stmt_hash = hashlib.sha256(statement.encode()).hexdigest()[:16] 
        
        # Extract operation type using context flags
        operation = self._get_operation(exec_ctx)
        
        # Extract db_system from context.dialect.name
        db_system = exec_ctx.dialect.name
        
        # Map exception to error code
        exc = exception_context.original_exception
        error_code = InfraErrorCode.UNKNOWN_FATAL
        if isinstance(exc, OperationalError):
            error_code = InfraErrorCode.NET_UNREACHABLE
        elif isinstance(exc, DatabaseError):
            error_code = InfraErrorCode.QUERY_SYNTAX
        elif isinstance(exc, InvalidRequestError):
            error_code = InfraErrorCode.CONF_INVALID
        
        # Extract parameters safely (count only, never values)
        parameters = exception_context.parameters
        
        # Build and emit error log  
        LogBuilder(logger).event(LogEvent.SQL_QUERY) \
            .failure(error_code, exc) \
            .msg(f"Query failed: {operation}") \
            .duration_ms(duration_ms) \
            .db_context(
                system=db_system,
                database=self.database,
                host=self.host_label,
                role=self.role
            ) \
            .field("db.statement_hash", stmt_hash) \
            .field("db.operation", operation) \
            .field("db.param_count", len(parameters) if parameters else 0) \
            .emit()

class SQLDriver(AbstractDBDriver):
    """
    The Mechanic: Knows how to speak 'SQLAlchemy' and create engines.
    Does not manage global state (Connector does that).
    
    Responsibilities:
        - Create SQLAlchemy engines from DbConnectionEntry config
        - Support primary (write) and optional secondary (read replica)
        - Register query logging listeners
        - Validate connectivity with test queries
        - Log lifecycle events (SQL_INIT, SQL_POOL_READY, SQL_CLOSE)
        - Map SQLAlchemy exceptions to InfraErrorCode taxonomy
    
    Design Pattern:
        - Matches MongoDriver architecture
        - Passive logging (no handler configuration)
        - Fail-fast initialization
        - Clean separation: config -> driver -> connector
    """

    def __init__(
        self,
        primary_config: DbConnectionEntry,
        secondary_config: Optional[DbConnectionEntry] = None,
        *,
        enable_query_logging: bool = True,
    ):
        """
        Initialize SQL driver with primary and optional secondary database configs.
        
        Args:
            primary_config: Primary database configuration (write operations)
            secondary_config: Optional secondary/replica config (read operations)
            enable_query_logging: Enable per-query logging with SQLQueryLogger
        
        Note:
            Engines are not created until connect() is called (lazy initialization).
            Never logs config objects directly due to password exposure.
        """
        # Store configuration objects
        self.primary_config = primary_config
        self.secondary_config = secondary_config
        
        # Initialize engine state (None until connect() called)
        self.write_engine: Optional[Engine] = None
        self.read_engine: Optional[Engine] = None
        
        # Query logging setup
        self._enable_query_logging = enable_query_logging
        self._primary_query_logger: Optional[SQLQueryLogger] = None
        self._secondary_query_logger: Optional[SQLQueryLogger] = None

    def connect(self) -> Tuple[Engine, Optional[Engine]]:
        """
        Create SQLAlchemy engines with fail-fast validation and logging.
        
        Returns:
            Tuple[Engine, Optional[Engine]]: (write_engine, read_engine)
        
        Raises:
            SqlDaoException: On connection/configuration errors with InfraErrorCode
        """
        # Idempotency check
        if self.write_engine is not None:
            return self.write_engine, self.read_engine
        
        write_engine = None
        read_engine = None
        
        try:
            # === PRIMARY ENGINE INITIALIZATION ===
            primary_uri = self.primary_config.connection_string
            if self.primary_config.use_ssl:
                primary_uri += self.primary_config.build_ssl_query_params()
            
            start_time = time.perf_counter()
            
            write_engine = sqlalchemy.create_engine(
                primary_uri,
                pool_size=self.primary_config.pool_size,
                max_overflow=self.primary_config.max_overflow,
                pool_recycle=self.primary_config.pool_recycle,
                pool_timeout=self.primary_config.pool_timeout,
                pool_pre_ping=self.primary_config.pool_pre_ping
            )
            
            duration_ms = (time.perf_counter() - start_time) * 1000
            
            # Register query logger if enabled
            if self._enable_query_logging:
                self._primary_query_logger = SQLQueryLogger(
                    logger,
                    database=self.primary_config.database,
                    host_label=self.primary_config.safe_host_label(),
                    role="primary"
                )
                self._register_query_logger(write_engine, self._primary_query_logger)
                
                builder = LogBuilder(logger).event(LogEvent.SQL_INIT).success() \
                    .msg("Primary SQL engine initialized") \
                    .duration_ms(duration_ms) \
                    .db_context(
                        system=self.primary_config.system,
                        database=self.primary_config.database,
                        host=self.primary_config.safe_host_label(),
                        role="primary"
                    )
                self._add_pool_fields(builder, self.primary_config).level(logging.DEBUG).emit()
            
            # Fail-fast connectivity validation
            ping_start = time.perf_counter()
            with write_engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            ping_duration_ms = (time.perf_counter() - ping_start) * 1000
            
            LogBuilder(logger).event(LogEvent.SQL_PING).success() \
                .msg("Primary SQL engine connectivity verified") \
                .duration_ms(ping_duration_ms) \
                .db_context(
                    system=self.primary_config.system,
                    database=self.primary_config.database,
                    host=self.primary_config.safe_host_label(),
                    role="primary"
                ) \
                .level(logging.INFO) \
                .emit()
            
            # Pool ready event
            total_duration = (time.perf_counter() - start_time) * 1000
            builder = LogBuilder(logger).event(LogEvent.SQL_POOL_READY).success() \
                .msg("Primary SQL engine pool is ready") \
                .duration_ms(total_duration) \
                .db_context(
                    system=self.primary_config.system,
                    database=self.primary_config.database,
                    host=self.primary_config.safe_host_label(),
                    role="primary"
                )
            self._add_pool_fields(builder, self.primary_config).level(logging.INFO).emit()
            
            # === SECONDARY ENGINE INITIALIZATION (if configured) ===
            if self.secondary_config is not None:
                secondary_uri = self.secondary_config.connection_string
                if self.secondary_config.use_ssl:
                    secondary_uri += self.secondary_config.build_ssl_query_params()
                
                sec_start_time = time.perf_counter()
                
                read_engine = sqlalchemy.create_engine(
                    secondary_uri,
                    pool_size=self.secondary_config.pool_size,
                    max_overflow=self.secondary_config.max_overflow,
                    pool_recycle=self.secondary_config.pool_recycle,
                    pool_timeout=self.secondary_config.pool_timeout,
                    pool_pre_ping=self.secondary_config.pool_pre_ping
                )
                
                sec_duration_ms = (time.perf_counter() - sec_start_time) * 1000
                
                if self._enable_query_logging:
                    self._secondary_query_logger = SQLQueryLogger(
                        logger,
                        database=self.secondary_config.database,
                        host_label=self.secondary_config.safe_host_label(),
                        role="replica"
                    )
                    self._register_query_logger(read_engine, self._secondary_query_logger)
                    
                    builder = LogBuilder(logger).event(LogEvent.SQL_INIT).success() \
                        .msg("Secondary SQL engine initialized") \
                        .duration_ms(sec_duration_ms) \
                        .db_context(
                            system=self.secondary_config.system,
                            database=self.secondary_config.database,
                            host=self.secondary_config.safe_host_label(),
                            role="replica"
                        )
                    self._add_pool_fields(builder, self.secondary_config).level(logging.DEBUG).emit()
                
                # Fail-fast connectivity validation for replica
                sec_ping_start = time.perf_counter()
                with read_engine.connect() as conn:
                    conn.execute(text("SELECT 1"))
                sec_ping_duration_ms = (time.perf_counter() - sec_ping_start) * 1000
                
                LogBuilder(logger).event(LogEvent.SQL_PING).success() \
                    .msg("Secondary SQL engine connectivity verified") \
                    .duration_ms(sec_ping_duration_ms) \
                    .db_context(
                        system=self.secondary_config.system,
                        database=self.secondary_config.database,
                        host=self.secondary_config.safe_host_label(),
                        role="replica"
                    ) \
                    .level(logging.INFO) \
                    .emit()
                
                # Pool ready event for replica
                sec_total_duration = (time.perf_counter() - sec_start_time) * 1000
                builder = LogBuilder(logger).event(LogEvent.SQL_POOL_READY).success() \
                    .msg("Secondary SQL engine pool is ready") \
                    .duration_ms(sec_total_duration) \
                    .db_context(
                        system=self.secondary_config.system,
                        database=self.secondary_config.database,
                        host=self.secondary_config.safe_host_label(),
                        role="replica"
                    )
                self._add_pool_fields(builder, self.secondary_config).level(logging.INFO).emit()
            
            # Commit state and return
            self.write_engine = write_engine
            self.read_engine = read_engine
            return self.write_engine, self.read_engine
            
        except InvalidRequestError as e:
            # Invalid connection string or pool parameters
            error_code = InfraErrorCode.CONF_INVALID
            self._log_connection_error(error_code, e, "primary")
            self._cleanup_engines(write_engine, read_engine)
            raise
            
        except OperationalError as e:
            # Map operational errors based on message content
            error_msg = str(e).lower()
            if "timeout" in error_msg or "timed out" in error_msg:
                error_code = InfraErrorCode.NET_TIMEOUT
            elif "auth" in error_msg or "password" in error_msg or "login" in error_msg:
                error_code = InfraErrorCode.AUTH_FAILURE
            else:
                error_code = InfraErrorCode.NET_UNREACHABLE
            
            self._log_connection_error(error_code, e, "primary")
            self._cleanup_engines(write_engine, read_engine)
            raise
            
        except DatabaseError as e:
            # General database errors
            error_code = InfraErrorCode.QUERY_SYNTAX
            self._log_connection_error(error_code, e, "primary")
            self._cleanup_engines(write_engine, read_engine)
            raise
            
        except SQLAlchemyError as e:
            # Generic SQLAlchemy errors
            error_code = InfraErrorCode.UNKNOWN_FATAL
            self._log_connection_error(error_code, e, "primary")
            self._cleanup_engines(write_engine, read_engine)
            raise

    def _add_pool_fields(self, builder, config: DbConnectionEntry):
        """
        Add pool configuration fields to LogBuilder.
        
        Args:
            builder: LogBuilder instance for fluent API chaining
            config: DbConnectionEntry with pool configuration
        
        Returns:
            Same LogBuilder instance for continued chaining
        
        Note:
            Eliminates code duplication by centralizing 6 pool fields used in
            SQL_INIT and SQL_POOL_READY log events.
        """
        return builder \
            .field("db.pool.size", config.pool_size) \
            .field("db.pool.max_overflow", config.max_overflow) \
            .field("db.pool.recycle_s", config.pool_recycle) \
            .field("db.pool.timeout_s", config.pool_timeout) \
            .field("db.pool.pre_ping", config.pool_pre_ping) \
            .field("db.ssl.enabled", config.use_ssl)
    
    def _log_connection_error(self, error_code: InfraErrorCode, exc: Exception, role: str) -> None:
        """
        Log connection failure with error details.
        
        Args:
            error_code: InfraErrorCode enum (CONF_INVALID, NET_TIMEOUT, etc.)
            exc: Caught exception
            role: Database role ("primary" or "replica")
        
        Note:
            Centralized error logging for all exception handlers in connect().
            Uses LogBuilder.failure() to auto-populate error schema (code, type,
            message, stack_trace). Guards against None config safely.
        """
        config = self.primary_config if role == "primary" else self.secondary_config
        if config is None:
            return  # Skip if config not available
        
        LogBuilder(logger).event(LogEvent.SQL_INIT) \
            .failure(error_code, exc) \
            .msg(f"{role.capitalize()} SQL engine initialization failed") \
            .db_context(
                system=config.system,
                database=config.database,
                host=config.safe_host_label(),
                role=role
            ) \
            .emit()
    
    def _cleanup_engines(self, write_engine: Optional[Engine], read_engine: Optional[Engine]) -> None:
        """
        Cleanup partially created engines on failure.
        
        Args:
            write_engine: Primary engine (may be None or initialized)
            read_engine: Secondary engine (may be None or initialized)
        
        Note:
            Prevents resource leaks when connect() fails mid-initialization.
            Best-effort disposal (never raises exceptions). Silently catches
            dispose() failures since cleanup code must not mask original errors.
        """
        if write_engine is not None:
            try:
                write_engine.dispose()
            except Exception:
                pass  # Best effort cleanup
        
        if read_engine is not None:
            try:
                read_engine.dispose()
            except Exception:
                pass  # Best effort cleanup

    def disconnect(self) -> None:
        """
        Close engine connections safely and log SQL_CLOSE events.
        
        Note:
            Never raises exceptions (cleanup method). Always sets state to None
            even if dispose() fails. Logs success/failure for both engines.
        """
        # Dispose primary engine with logging
        if self.write_engine is not None:
            try:
                self.write_engine.dispose()
                LogBuilder(logger).event(LogEvent.SQL_CLOSE).success() \
                    .msg("Primary SQL engine closed") \
                    .db_context(
                        system=self.primary_config.system,
                        database=self.primary_config.database,
                        host=self.primary_config.safe_host_label(),
                        role="primary"
                    ) \
                    .level(logging.INFO) \
                    .emit()
            except Exception as e:
                LogBuilder(logger).event(LogEvent.SQL_CLOSE) \
                    .failure(InfraErrorCode.UNKNOWN_FATAL, e) \
                    .msg("Primary SQL engine close failed") \
                    .db_context(
                        system=self.primary_config.system,
                        database=self.primary_config.database,
                        host=self.primary_config.safe_host_label(),
                        role="primary"
                    ) \
                    .emit()
            finally:
                self.write_engine = None
        
        # Dispose secondary engine with logging
        if self.read_engine is not None and self.secondary_config is not None:
            try:
                self.read_engine.dispose()
                LogBuilder(logger).event(LogEvent.SQL_CLOSE).success() \
                    .msg("Secondary SQL engine closed") \
                    .db_context(
                        system=self.secondary_config.system,
                        database=self.secondary_config.database,
                        host=self.secondary_config.safe_host_label(),
                        role="replica"
                    ) \
                    .level(logging.INFO) \
                    .emit()
            except Exception as e:
                LogBuilder(logger).event(LogEvent.SQL_CLOSE) \
                    .failure(InfraErrorCode.UNKNOWN_FATAL, e) \
                    .msg("Secondary SQL engine close failed") \
                    .db_context(
                        system=self.secondary_config.system,
                        database=self.secondary_config.database,
                        host=self.secondary_config.safe_host_label(),
                        role="replica"
                    ) \
                    .emit()
            finally:
                self.read_engine = None
        
        # Clear state
        self._primary_query_logger = None
        self._secondary_query_logger = None

    def _register_query_logger(self, engine: Engine, query_logger: SQLQueryLogger) -> None:
        """
        Register SQLQueryLogger event listeners on engine.
        
        Args:
            engine: SQLAlchemy Engine instance
            query_logger: SQLQueryLogger instance with event methods
        
        Note:
            Hooks SQLQueryLogger methods into SQLAlchemy's event system for automatic
            query logging. Registers three separate events (before_cursor_execute,
            after_cursor_execute, handle_error). Same ExecutionContext object is
            passed to all three hooks for duration tracking.
        """
        event.listen(engine, "before_cursor_execute", query_logger.before_cursor_execute)
        event.listen(engine, "after_cursor_execute", query_logger.after_cursor_execute)
        event.listen(engine, "handle_error", query_logger.handle_error)
