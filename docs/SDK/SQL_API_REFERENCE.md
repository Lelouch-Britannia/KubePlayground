# SQL API Reference - dbdaolib

**Version:** 2.0.0  
**Status:** Production-Ready  
**Last Updated:** January 2026

---

## Table of Contents

1. [Configuration API](#1-configuration-api)
2. [Driver API](#2-driver-api)
3. [Connector API](#3-connector-api)
4. [DAO API](#4-dao-api)
5. [Decorator API](#5-decorator-api)
6. [Exception API](#6-exception-api)
7. [Logging API](#7-logging-api)
8. [Error Codes](#8-error-codes)

---

## 1. Configuration API

### 1.1 DbConnectionEntry

**Module**: `daolib.drivers.sql.config`

**Description**: Dataclass for database connection configuration.

```python
@dataclass
class DbConnectionEntry:
    """Database connection configuration with pool settings."""
```

#### Attributes

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `system` | `DatabaseType` | Required | Database type: 'postgresql', 'mysql', 'mssql', 'sqlite' |
| `username` | `str` | Required | Database username (not for SQLite) |
| `password` | `str` | Required | Database password (not for SQLite) |
| `host` | `str` | Required | Database host (not for SQLite) |
| `port` | `int` | Required | Database port (not for SQLite) |
| `database` | `str` | Required | Database name |
| `path` | `str` | `""` | File path (SQLite only) |
| `pool_size` | `int` | `10` | Core pool size (persistent connections) |
| `max_overflow` | `int` | `10` | Extra connections when pool exhausted |
| `pool_recycle` | `int` | `3600` | Recycle connections after N seconds |
| `pool_timeout` | `int` | `30` | Wait timeout for connection from pool |
| `pool_pre_ping` | `bool` | `True` | Health check before reusing connection |
| `use_ssl` | `bool` | `False` | Enable SSL/TLS connection |
| `ssl_verify` | `bool` | `True` | Verify SSL certificate |
| `ssl_ca_path` | `str` | `""` | Path to CA certificate file |
| `trust_cert` | `bool` | `False` | Trust server certificate (SQL Server only) |

#### Methods

##### `connection_string() -> str`

Generate SQLAlchemy connection string.

**Returns**: `str` - URL-encoded connection string

**Example**:
```python
config = DbConnectionEntry(system="postgresql", username="user", ...)
conn_str = config.connection_string()
# Returns: "postgresql+psycopg2://user:pass%40word@host:5432/db"
```

##### `safe_host_label() -> str`

Get host label without credentials for logging.

**Returns**: `str` - Safe host identifier

**Example**:
```python
label = config.safe_host_label()
# Returns: "postgresql@host:5432/db"
```

##### `__post_init__()`

Validate configuration after initialization.

**Raises**:
- `ValueError` - Invalid pool parameters or missing required fields

---

### 1.2 DatabaseType

**Module**: `daolib.drivers.sql.config`

**Description**: Enum for supported database types.

```python
class DatabaseType(str, Enum):
    POSTGRESQL = "postgresql"
    MYSQL = "mysql"
    MSSQL = "mssql"
    SQLITE = "sqlite"
```

---

## 2. Driver API

### 2.1 SQLDriver

**Module**: `daolib.drivers.sql.sql_db_driver`

**Description**: Low-level driver for creating SQLAlchemy engines with query logging.

```python
class SQLDriver:
    """SQLAlchemy engine driver with automatic query logging."""
```

#### Constructor

```python
def __init__(
    self,
    primary_config: DbConnectionEntry,
    secondary_config: Optional[DbConnectionEntry] = None
)
```

**Parameters**:
- `primary_config` - Configuration for write (primary) database
- `secondary_config` - Optional configuration for read (replica) database

#### Methods

##### `connect() -> Tuple[Engine, Optional[Engine]]`

Create and validate SQLAlchemy engines.

**Returns**: `Tuple[Engine, Optional[Engine]]` - (write_engine, read_engine)

**Raises**:
- `SqlDaoException(InfraErrorCode.CONF_INVALID)` - Invalid configuration
- `SqlDaoException(InfraErrorCode.NET_TIMEOUT)` - Connection timeout
- `SqlDaoException(InfraErrorCode.AUTH_FAILURE)` - Authentication failed
- `SqlDaoException(InfraErrorCode.NET_UNREACHABLE)` - Host unreachable

**Example**:
```python
driver = SQLDriver(primary_config, secondary_config)
write_engine, read_engine = driver.connect()
```

##### `disconnect() -> None`

Dispose engines and clear state.

**Returns**: `None`

**Example**:
```python
driver.disconnect()
```

---

### 2.2 SQLQueryLogger

**Module**: `daolib.drivers.sql.sql_db_driver`

**Description**: SQLAlchemy event listener for automatic query logging.

```python
class SQLQueryLogger:
    """Event-based query logger with thread-safe timing."""
```

#### Constructor

```python
def __init__(
    self,
    logger: Logger,
    db_system: str,
    host: str
)
```

**Parameters**:
- `logger` - Python logger instance
- `db_system` - Database system name (postgresql, mysql, etc.)
- `host` - Database host for logging context

#### Event Handlers

##### `before_cursor_execute(conn, cursor, statement, params, context, executemany)`

SQLAlchemy event hook called before query execution.

**Side Effects**: Sets `context._query_start_time` for timing

##### `after_cursor_execute(conn, cursor, statement, params, context, executemany)`

SQLAlchemy event hook called after successful query execution.

**Side Effects**: Logs query success with duration, operation type, statement hash

##### `handle_error(exception_context)`

SQLAlchemy event hook called on query errors.

**Side Effects**: Logs query failure with error code and exception details

---

## 3. Connector API

### 3.1 Connector (Abstract Base)

**Module**: `daolib.drivers.connector`

**Description**: Abstract base class for database connectors.

```python
class Connector(ABC):
    """Base connector interface."""
```

#### Abstract Methods

##### `read_and_load_configs() -> Any`

Load database configuration from application source (YAML, env, secrets, etc.).

**Returns**: Configuration object(s) specific to connector type

**Must be implemented by**: Application subclass

---

### 3.2 RdbmsConnector

**Module**: `daolib.drivers.sql.rdbms_connector`

**Description**: Singleton connector for RDBMS with read/write engine support.

```python
class RdbmsConnector(Connector):
    """Singleton RDBMS connector with dual-engine support."""
```

#### Class Variables

| Name | Type | Description |
|------|------|-------------|
| `_write_engine` | `Optional[Engine]` | Primary (write) engine singleton |
| `_read_engine` | `Optional[Engine]` | Secondary (read) engine singleton |
| `_primary_cfg` | `Optional[DbConnectionEntry]` | Primary configuration |

#### Constructor

```python
def __init__(self)
```

**Side Effects**:
- First instantiation: Creates engines via `read_and_load_configs()` and `SQLDriver.connect()`
- Subsequent instantiations: Reuses existing engines

**Raises**:
- `SqlDaoException(InfraErrorCode.*)` - Engine creation failures

#### Abstract Methods

##### `read_and_load_configs() -> Tuple[DbConnectionEntry, Optional[DbConnectionEntry]]`

Load primary and optional secondary database configurations.

**Returns**: `Tuple[DbConnectionEntry, Optional[DbConnectionEntry]]` - (primary, secondary)

**Must be implemented by**: Application subclass

**Example**:
```python
class MyConnector(RdbmsConnector):
    def read_and_load_configs(self):
        primary = DbConnectionEntry(system="postgresql", ...)
        secondary = None  # Optional
        return primary, secondary
```

#### Methods

##### `get_write_connection() -> Connection`

Get connection from write (primary) engine.

**Returns**: `Connection` - SQLAlchemy connection for write operations

**Example**:
```python
conn = connector.get_write_connection()
try:
    # Use connection
finally:
    conn.close()
```

##### `get_read_connection() -> Connection`

Get connection from read engine (falls back to write if no secondary configured).

**Returns**: `Connection` - SQLAlchemy connection for read operations

**Example**:
```python
conn = connector.get_read_connection()
```

##### `dispose() -> None`

Dispose all engines and clear singleton state.

**Returns**: `None`

**Side Effects**: Logs SQL_CLOSE event

**Example**:
```python
connector.dispose()
```

#### Properties

##### `dialect -> str`

Get database dialect name.

**Returns**: `str` - Dialect name (postgresql, mysql, mssql, sqlite)

##### `database_url -> str`

Get database URL (without credentials).

**Returns**: `str` - Connection URL

##### `pool_size -> int`

Get configured pool size.

**Returns**: `int` - Core pool size

##### `max_overflow -> int`

Get configured max overflow.

**Returns**: `int` - Maximum overflow connections

---

## 4. DAO API

### 4.1 BaseDAOInterface

**Module**: `daolib.dao.dao_interface`

**Description**: Interface for DAO implementations.

```python
class BaseDAOInterface(ABC):
    """Base DAO interface."""
```

#### Attributes

| Name | Type | Description |
|------|------|-------------|
| `connector` | `Connector` | Connector instance for database access |

---

### 4.2 BaseSqlDao

**Module**: `daolib.dao.sql.base_sql_dao`

**Description**: Base class for SQL DAO implementations with CRUD operations and exception wrapping.

```python
class BaseSqlDao(BaseDAOInterface):
    """Base SQL DAO with query execution and exception wrapping."""
```

#### Constructor

```python
def __init__(self, connector: Connector)
```

**Parameters**:
- `connector` - RdbmsConnector instance

#### CRUD Methods

##### `insert(connection: Connection, query: str, params: List) -> CursorResult`

Execute INSERT query.

**Parameters**:
- `connection` - SQLAlchemy connection (injected by decorator)
- `query` - SQL INSERT statement
- `params` - Query parameters (list)

**Returns**: `CursorResult` - Result with `lastrowid`, `rowcount`

**Raises**:
- `SqlDaoException(DaoErrorCode.INTEGRITY_ERROR)` - Constraint violation
- `SqlDaoException(DaoErrorCode.OPERATIONAL_ERROR)` - Database error
- `SqlDaoException(DaoErrorCode.*)` - Other query errors

**Example**:
```python
@InjectConnection(is_write=True)
def create_user(self, connection, username):
    query = "INSERT INTO users (username) VALUES (?)"
    result = self.insert(connection, query, [username])
    return result.lastrowid
```

##### `read(connection: Connection, query: str, params: List) -> List`

Execute SELECT query.

**Parameters**:
- `connection` - SQLAlchemy connection
- `query` - SQL SELECT statement
- `params` - Query parameters (list)

**Returns**: `List` - List of row tuples

**Raises**:
- `SqlDaoException(DaoErrorCode.INTEGRITY_SELECT)` - Integrity error
- `SqlDaoException(DaoErrorCode.OPERATIONAL_SELECT)` - Operational error
- `SqlDaoException(DaoErrorCode.*)` - Other query errors

**Example**:
```python
@InjectConnection(is_write=False)
def get_user(self, connection, user_id):
    query = "SELECT * FROM users WHERE id = ?"
    rows = self.read(connection, query, [user_id])
    return rows[0] if rows else None
```

##### `update(connection: Connection, query: str, params: List) -> CursorResult`

Execute UPDATE query.

**Parameters**:
- `connection` - SQLAlchemy connection
- `query` - SQL UPDATE statement
- `params` - Query parameters (list)

**Returns**: `CursorResult` - Result with `rowcount`

**Raises**:
- `SqlDaoException(DaoErrorCode.*)` - Query errors

**Example**:
```python
@InjectConnection(is_write=True)
def update_email(self, connection, user_id, email):
    query = "UPDATE users SET email = ? WHERE id = ?"
    result = self.update(connection, query, [email, user_id])
    return result.rowcount
```

##### `delete(connection: Connection, query: str, params: List) -> CursorResult`

Execute DELETE query.

**Parameters**:
- `connection` - SQLAlchemy connection
- `query` - SQL DELETE statement
- `params` - Query parameters (list)

**Returns**: `CursorResult` - Result with `rowcount`

**Raises**:
- `SqlDaoException(DaoErrorCode.*)` - Query errors

#### DataFrame Methods

##### `_read_from_pandas(connection: Connection, query: str, params: List) -> DataFrame`

Execute SELECT and return pandas DataFrame.

**Parameters**:
- `connection` - SQLAlchemy connection
- `query` - SQL SELECT statement
- `params` - Query parameters (list)

**Returns**: `pandas.DataFrame` - Query results as DataFrame

**Requires**: `pandas` library

**Example**:
```python
@InjectConnection(is_write=False)
def get_sales_report(self, connection, start_date, end_date):
    query = "SELECT * FROM sales WHERE date BETWEEN ? AND ?"
    return self._read_from_pandas(connection, query, [start_date, end_date])
```

##### `df_placeholders_mapping(df: DataFrame) -> Tuple[str, List]`

Generate SQL placeholders and parameters from DataFrame.

**Parameters**:
- `df` - pandas DataFrame with insert data

**Returns**: `Tuple[str, List]` - (placeholders_string, flat_params_list)

**Example**:
```python
placeholders, params = self.df_placeholders_mapping(products_df)
query = f"INSERT INTO products (name, price) VALUES {placeholders}"
self.insert(connection, query, params)
```

---

## 5. Decorator API

### 5.1 InjectConnection

**Module**: `daolib.dao.sql.decorator`

**Description**: Decorator for automatic connection injection and transaction management.

```python
class InjectConnection:
    """Decorator for connection lifecycle and transaction management."""
```

#### Constructor

```python
def __init__(
    self,
    connector_attr: str = "connector",
    is_write: bool = False
)
```

**Parameters**:
- `connector_attr` - Name of connector attribute on DAO instance (default: "connector")
- `is_write` - If True, uses write connection and manages transaction

#### Usage

```python
class UserDao(BaseSqlDao):
    @InjectConnection(is_write=True)
    def create_user(self, connection, username):
        # connection auto-injected
        # transaction auto-managed (begin/commit/rollback)
        pass
    
    @InjectConnection(is_write=False)
    def get_user(self, connection, user_id):
        # connection auto-injected
        # no transaction (read-only)
        pass
```

#### Behavior

**For `is_write=True`**:
1. Gets write connection from connector
2. Begins transaction (`with conn.begin()`)
3. Executes decorated method
4. Commits on success, rolls back on exception
5. Closes connection

**For `is_write=False`**:
1. Gets read connection from connector
2. Executes decorated method (no transaction)
3. Closes connection

**Manual Injection Support**:
- If first argument is already a `Connection`, uses it directly (for testing)

---

## 6. Exception API

### 6.1 DaoException

**Module**: `daolib.exceptions`

**Description**: Base exception for all DAO-layer errors.

```python
class DaoException(Exception):
    """Base DAO exception with error code."""
```

#### Constructor

```python
def __init__(
    self,
    err_code: Union[InfraErrorCode, DaoErrorCode],
    msg: str,
    original_exception: Optional[Exception] = None
)
```

**Parameters**:
- `err_code` - Error code enum value
- `msg` - Error message
- `original_exception` - Original exception (if wrapping)

#### Attributes

| Name | Type | Description |
|------|------|-------------|
| `err_code` | `Union[InfraErrorCode, DaoErrorCode]` | Error code |
| `msg` | `str` | Error message |
| `original_exception` | `Optional[Exception]` | Wrapped exception |

---

### 6.2 SqlDaoException

**Module**: `daolib.exceptions`

**Description**: SQL-specific exception for both infrastructure and query errors.

```python
class SqlDaoException(DaoException):
    """SQL DAO exception for infrastructure and query errors."""
```

#### Constructor

```python
def __init__(
    self,
    err_code: Union[InfraErrorCode, DaoErrorCode],
    msg: str,
    original_exception: Optional[Exception] = None
)
```

**Usage**:
```python
try:
    dao.create_user(username="alice")
except SqlDaoException as e:
    if e.err_code == DaoErrorCode.INTEGRITY_ERROR:
        # Handle duplicate
        pass
    elif e.err_code == InfraErrorCode.NET_TIMEOUT:
        # Handle connection timeout
        pass
```

---

## 7. Logging API

### 7.1 LogBuilder

**Module**: `daolib.log_builder`

**Description**: Fluent API for structured logging with LogEvent taxonomy.

```python
class LogBuilder:
    """Fluent builder for structured log events."""
```

#### Constructor

```python
def __init__(self, logger: Logger)
```

**Parameters**:
- `logger` - Python logger instance

#### Methods

##### `event(event: LogEvent) -> LogBuilder`

Set log event type.

**Parameters**:
- `event` - LogEvent enum value

**Returns**: `self` for chaining

##### `success() -> LogBuilder`

Mark event as successful (INFO level).

**Returns**: `self` for chaining

##### `failure(error_code: Union[InfraErrorCode, DaoErrorCode], exc: Exception) -> LogBuilder`

Mark event as failed (ERROR level).

**Parameters**:
- `error_code` - Error code enum value
- `exc` - Exception instance

**Returns**: `self` for chaining

##### `field(key: str, value: Any) -> LogBuilder`

Add structured field to log.

**Parameters**:
- `key` - Field name
- `value` - Field value

**Returns**: `self` for chaining

##### `msg(message: str) -> LogBuilder`

Set log message.

**Parameters**:
- `message` - Log message string

**Returns**: `self` for chaining

##### `emit() -> None`

Emit the log event.

**Returns**: `None`

**Example**:
```python
LogBuilder(logger) \
    .event(LogEvent.SQL_QUERY) \
    .success() \
    .field("db.operation", "INSERT") \
    .field("duration_ms", 42.5) \
    .msg("User created") \
    .emit()
```

---

### 7.2 LogEvent

**Module**: `daolib.constants`

**Description**: Enum for SQL log event types.

```python
class LogEvent(str, Enum):
    """SQL log event taxonomy."""
    
    SQL_INIT = "sql.init"
    SQL_PING = "sql.ping"
    SQL_POOL_READY = "sql.pool.ready"
    SQL_QUERY = "sql.query"
    SQL_CLOSE = "sql.close"
```

---

## 8. Error Codes

### 8.1 InfraErrorCode

**Module**: `daolib.constants`

**Description**: Infrastructure error codes (1000-9999).

```python
class InfraErrorCode(IntEnum):
    """Infrastructure-level error codes."""
```

#### Values

| Code | Name | Description |
|------|------|-------------|
| 1001 | CONF_INVALID | Invalid configuration parameter |
| 1002 | CONF_MISSING_CREDS | Missing credentials |
| 1003 | CONF_SSL_ERROR | SSL/TLS configuration error |
| 2001 | NET_UNREACHABLE | Host unreachable |
| 2002 | NET_TIMEOUT | Connection or query timeout |
| 2003 | NET_DNS_FAILURE | DNS resolution failed |
| 3001 | AUTH_FAILURE | Authentication failed |
| 3002 | AUTH_FORBIDDEN | User lacks permissions |
| 4001 | QUERY_EXECUTION | Query execution error |
| 4002 | QUERY_SYNTAX | SQL syntax error |
| 4003 | DATA_VALIDATION | Data validation error |
| 9999 | UNKNOWN_FATAL | Unknown fatal error |

---

### 8.2 DaoErrorCode

**Module**: `daolib.constants`

**Description**: DAO query execution error codes (50000-50999).

```python
class DaoErrorCode(IntEnum):
    """DAO-layer query execution error codes."""
```

#### Values

| Code | Name | Description |
|------|------|-------------|
| 50090 | INTEGRITY_ERROR | Constraint violation (INSERT/UPDATE/DELETE) |
| 50091 | OPERATIONAL_ERROR | Database operational error (INSERT/UPDATE/DELETE) |
| 50092 | DATA_ERROR | Type mismatch, value out of range (INSERT/UPDATE/DELETE) |
| 50093 | PROGRAMMING_ERROR | SQL syntax error, table not found (INSERT/UPDATE/DELETE) |
| 50094 | SQLALCHEMY_ERROR | Generic SQLAlchemy error (INSERT/UPDATE/DELETE) |
| 50095 | INTEGRITY_SELECT | Integrity error during SELECT |
| 50096 | OPERATIONAL_SELECT | Operational error during SELECT |
| 50097 | DATA_SELECT | Data error during SELECT |
| 50098 | PROGRAMMING_SELECT | Programming error during SELECT |
| 50099 | UNKNOWN_ERROR | Unexpected error |

---

## Appendix A: Type Aliases

```python
from sqlalchemy.engine import Engine, Connection, CursorResult
from typing import List, Tuple, Optional, Union, Any
from logging import Logger
from pandas import DataFrame
```

---

## Appendix B: Supported Databases

| Database | system value | Default Port | Driver Package | Connection String Format |
|----------|-------------|--------------|----------------|--------------------------|
| PostgreSQL | `postgresql` | 5432 | `psycopg2` | `postgresql+psycopg2://user:pass@host:5432/db` |
| MySQL | `mysql` | 3306 | `pymysql` | `mysql+pymysql://user:pass@host:3306/db` |
| SQL Server | `mssql` | 1433 | `pyodbc` | `mssql+pyodbc://user:pass@host:1433/db` |
| SQLite | `sqlite` | N/A | built-in | `sqlite:////absolute/path/to/file.db` |

---

**Document Version**: 2.0.0  
**Last Updated**: January 2026  
**For Architecture Details**: See [SQL_ARCHITECTURE.md](./SQL_ARCHITECTURE.md)  
**For NoSQL API**: See [NOSQL_API_REFERENCE.md](./NOSQL_API_REFERENCE.md)
