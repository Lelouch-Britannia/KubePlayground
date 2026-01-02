"""
Low-level Driver wrapper for MongoDB (Motor).
Responsible for instantiating the AsyncIOMotorClient and monitoring queries.
"""

import hashlib
import logging
import time
from typing import Optional, Dict, Any

from motor.motor_asyncio import AsyncIOMotorClient
from pymongo.errors import ConfigurationError
from pymongo import monitoring

from daolib.drivers.nosql.config import NoSQLConnectionEntry
from daolib.log_builder import LogBuilder
from daolib.constants import LogEvent, LogOutcome, DAOErrorCode

# SDKs MUST use __name__ (Section 2.2)
logger = logging.getLogger(__name__)


class QueryLogger(monitoring.CommandListener):
    """
    PyMongo Command Monitoring Listener for query-level logging.
    Logs mongo.query events with statement hashing (Section 6.2.4).
    """

    def __init__(self, db_name: str, host_label: str):
        self.db_name = db_name
        self.host_label = host_label
        self._start_times: Dict[int, float] = {}

    def started(self, event: monitoring.CommandStartedEvent) -> None:
        """Track query start time"""
        self._start_times[event.request_id] = time.perf_counter()

    def succeeded(self, event: monitoring.CommandSucceededEvent) -> None:
        """Log successful query completion"""
        duration_ms = (time.perf_counter() - self._start_times.pop(event.request_id, time.perf_counter())) * 1000
        
        # Generate statement hash (Section 6.2.4)
        cmd_str = str(event.command_name)
        stmt_hash = hashlib.sha256(cmd_str.encode()).hexdigest()[:16]
        
        # Log at DEBUG level per Section 8 (high-throughput systems)
        LogBuilder(logger).event(LogEvent.MONGO_QUERY).success() \
            .msg(f"Query: {event.command_name}") \
            .duration_ms(duration_ms) \
            .db_context(
                system="mongodb",
                database=self.db_name,
                host=self.host_label
            ) \
            .field("db.statement_hash", stmt_hash) \
            .field("db.operation", event.command_name) \
            .level(logging.DEBUG) \
            .emit()

    def failed(self, event: monitoring.CommandFailedEvent) -> None:
        """Log query failure"""
        duration_ms = (time.perf_counter() - self._start_times.pop(event.request_id, time.perf_counter())) * 1000
        
        cmd_str = str(event.command_name)
        stmt_hash = hashlib.sha256(cmd_str.encode()).hexdigest()[:16]
        
        # Create a synthetic exception for logging
        exc = Exception(event.failure)
        
        LogBuilder(logger).event(LogEvent.MONGO_QUERY) \
            .failure(DAOErrorCode.QUERY_SYNTAX, exc) \
            .msg(f"Query failed: {event.command_name}") \
            .duration_ms(duration_ms) \
            .db_context(
                system="mongodb",
                database=self.db_name,
                host=self.host_label
            ) \
            .field("db.statement_hash", stmt_hash) \
            .field("db.operation", event.command_name) \
            .emit()


class MongoDriver:
    """
    The Mechanic: Knows how to speak 'Motor' and create clients.
    Does not manage global state (Connector does that).
    """

    def __init__(self, config: NoSQLConnectionEntry, *, extra_client_kwargs: Optional[Dict[str, Any]] = None, enable_query_logging: bool = False):
        self.config = config
        self.client: Optional[AsyncIOMotorClient] = None
        self._extra_client_kwargs = extra_client_kwargs or {}
        self._enable_query_logging = enable_query_logging
        self._query_logger: Optional[QueryLogger] = None

    def connect(self) -> AsyncIOMotorClient:
        """
        Creates and returns the Motor Client.
        Logs 'mongo.init' outcome for the client creation phase.
        
        Raises:
            ConfigurationError: If the URI or params are invalid.
        """
        if self.client is not None:
            return self.client

        # 1. Prepare Parameters
        uri = self.config.connection_string

        try:
            # 2. Configure Motor/PyMongo options
            kwargs: Dict[str, Any] = {
                "minPoolSize": self.config.min_pool_size,
                "maxPoolSize": self.config.max_pool_size,
                "serverSelectionTimeoutMS": self.config.server_selection_timeout_ms,
                "uuidRepresentation": "standard",
            }

            if self.config.use_ssl:
                kwargs["tls"] = True

            # Query-level logging (optional, controlled by env or config)
            if self._enable_query_logging:
                self._query_logger = QueryLogger(
                    db_name=self.config.database,
                    host_label=self.config.safe_host_label
                )
                monitoring.register(self._query_logger)

            # Allow injection of extra args (e.g. for testing or specialized replica sets)
            kwargs.update(self._extra_client_kwargs)

            # 3. Instantiate Client
            # Note: This is non-blocking in Motor, but validation of URI format happens here.
            self.client = AsyncIOMotorClient(uri, **kwargs)
            
            # Log Success (Debug level for Driver, Connector handles Info level lifecycle)
            LogBuilder(logger).event(LogEvent.MONGO_INIT).success() \
                .msg("Motor client created") \
                .db_context(
                    system="mongodb",
                    database=self.config.database,
                    host=self.config.safe_host_label,
                    **{
                        "db.srv": self.config.use_srv,
                        "db.tls": self.config.use_ssl,
                        "db.pool.min": self.config.min_pool_size,
                        "db.pool.max": self.config.max_pool_size,
                        "db.timeout.ms": self.config.server_selection_timeout_ms,
                    }
                ) \
                .level(logging.DEBUG) \
                .emit()
                
            return self.client

        except ConfigurationError as e:
            # Log Failure (Section 5 Error Schema)
            LogBuilder(logger).event(LogEvent.MONGO_INIT) \
                .failure(DAOErrorCode.CONF_INVALID, e) \
                .msg("Invalid MongoDB Configuration") \
                .db_context(
                    system="mongodb",
                    database=self.config.database,
                    host=self.config.safe_host_label,
                    **{
                        "db.srv": self.config.use_srv,
                        "db.tls": self.config.use_ssl,
                        "db.pool.min": self.config.min_pool_size,
                        "db.pool.max": self.config.max_pool_size,
                        "db.timeout.ms": self.config.server_selection_timeout_ms,
                    }
                ) \
                .emit()
            raise  # Re-raise to let Connector handle the hard stop

        except Exception as e:
            # Catch-all for unexpected driver instantiation errors
            LogBuilder(logger).event(LogEvent.MONGO_INIT) \
                .failure(DAOErrorCode.UNKNOWN_FATAL, e) \
                .msg("Unexpected error creating Mongo Client") \
                .db_context(
                    system="mongodb",
                    database=self.config.database,
                    host=self.config.safe_host_label,
                    **{
                        "db.srv": self.config.use_srv,
                        "db.tls": self.config.use_ssl,
                    }
                ) \
                .emit()
            raise

    def disconnect(self) -> None:
        """
        Closes the client connection safely.
        """
        if self.client:
            try:
                self.client.close()
                LogBuilder(logger).event(LogEvent.MONGO_CLOSE).success() \
                    .msg("Mongo client closed") \
                    .field("db.host", self.config.safe_host_label) \
                    .emit()
            except Exception as e:
                LogBuilder(logger).event(LogEvent.MONGO_CLOSE) \
                    .msg("Error closing Mongo client") \
                    .field("error.message", str(e)) \
                    .level(logging.WARNING) \
                    .emit()
            finally:
                self.client = None
                self._query_logger = None