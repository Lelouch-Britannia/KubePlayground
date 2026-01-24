from enum import Enum, IntEnum, unique


@unique
class DatabaseType(str, Enum):
    """Supported database types for connection configuration.

    Used to determine URI scheme and connection string format.
    """

    # SQL Databases
    POSTGRESQL = "postgresql"
    MYSQL = "mysql"
    SQLITE = "sqlite"
    SQL_SERVER = "mssql"

    # NoSQL Databases
    MONGODB = "mongodb"


@unique
class DatabaseSchema(str, Enum):
    """URI schemas for building connection strings.

    Maps DatabaseType to corresponding SQLAlchemy/PyMongo URI schema prefix.

    These are schema-only (no credentials or host parts included).
    Connection string builder will append auth_path, host_part, and database accordingly.
    """

    # PostgreSQL: supports ssl_mode parameter
    POSTGRESQL = "postgresql+psycopg2://"

    # MySQL: supports charset and ssl parameters
    MYSQL = "mysql+pymysql://"

    # SQLite: local file-based, no auth
    SQLITE = "sqlite:///"

    # SQL Server: uses ODBC driver
    MSSQL_ODBC = "mssql+pyodbc://"

    # MongoDB: standard scheme
    MONGODB = "mongodb://"

    # MongoDB: SRV variant (MongoDB Atlas)
    MONGODB_SRV = "mongodb+srv://"


@unique
class LogEvent(str, Enum):
    """Mandatory Event Taxonomy as per Section 7 of Logging Design Doc.

    These values populate the 'event.action' field.
    """

    # --- Service Events (Consumed by App, but defined here for consistency) ---
    HTTP_REQUEST = "http.request"

    # --- MongoDB Events (Section 7.2) ---
    MONGO_INIT = "mongo.init"
    MONGO_PING = "mongo.ping"
    MONGO_ODM_INIT = "mongo.odm.init"  # Renamed from ODM_BIND to match doc
    MONGO_QUERY = "mongo.query"
    MONGO_CLOSE = "mongo.close"

    # --- SQL Events (Section 7.3) ---
    SQL_INIT = "sql.init"
    SQL_PING = "sql.ping"
    SQL_POOL_READY = "sql.pool.ready"
    SQL_QUERY = "sql.query"
    SQL_CLOSE = "sql.close"


@unique
class LogOutcome(str, Enum):
    """Mandatory Outcome values as per Section 4.1.

    These values populate the 'event.outcome' field.
    """

    SUCCESS = "success"
    FAILURE = "failure"
    UNKNOWN = "unknown"


@unique
class InfraErrorCode(IntEnum):
    """Infrastructure-level error codes for Driver/Connector layer.

    Used by SQLDriver, MongoDriver, and connectors for infrastructure failures.
    These values populate the 'error.code' field in driver-level logs.

    Ranges:
    1000-1999: Configuration & Validation (Pre-flight)
    2000-2999: Network & Connectivity (Transient)
    3000-3999: Authentication & Permissions (Security)
    4000-4999: Application & Data Logic (Permanent)
    9000+:     System/Unknown
    """

    # --- 1000-1999: Configuration Errors ---
    CONF_INVALID = 1001  # Generic config issue
    CONF_MISSING_CREDS = 1002  # User/Pass missing
    CONF_SSL_ERROR = 1003  # TLS/Cert path invalid
    CONF_POOL_INVALID = 1004  # Min pool > Max pool, etc.

    # --- 2000-2999: Network/Connection Errors ---
    NET_UNREACHABLE = 2001  # Host down / ping failed
    NET_TIMEOUT = 2002  # ServerSelectionTimeoutError
    NET_DNS_FAILURE = 2003  # SRV lookup failed
    NET_CONN_REFUSED = 2004  # IP open, port closed
    NET_HANDSHAKE_FAIL = 2005  # Protocol mismatch

    # --- 3000-3999: Auth Errors ---
    AUTH_FAILURE = 3001  # Bad credentials
    AUTH_FORBIDDEN = 3002  # Creds OK, but DB access denied

    # --- 4000-4999: Application/ODM Errors ---
    ODM_INIT_FAIL = 4001  # Beanie/SQLAlchemy model registry failed
    QUERY_SYNTAX = 4002  # Bad SQL or Mongo query structure
    DATA_VALIDATION = 4003  # Schema validation failed

    # --- 9000+: Critical/Unknown ---
    UNKNOWN_FATAL = 9999


@unique
class DaoErrorCode(IntEnum):
    """DAO-level error codes for query execution failures.

    Used by BaseSqlDao when wrapping SQLAlchemy exceptions.
    Aligned with SQLAlchemy exception hierarchy.

    Ranges:
    50000-50099: Integrity/Constraint violations
    50100-50199: Operational/Connection issues
    50200-50299: Data/Type errors
    50300-50399: Programming/SQL syntax errors
    50900-50999: General/Unknown errors
    """

    # --- 50000-50099: Integrity Errors ---
    INTEGRITY_ERROR = 50090  # Foreign key, unique constraint violations
    INTEGRITY_SELECT = 50095  # Integrity error during SELECT (rare)

    # --- 50100-50199: Operational Errors ---
    OPERATIONAL_ERROR = 50091  # Connection lost, deadlock, lock timeout
    OPERATIONAL_SELECT = 50096  # Operational error during SELECT

    # --- 50200-50299: Data Errors ---
    DATA_ERROR = 50092  # Type mismatch, value out of range
    DATA_SELECT = 50097  # Data error during SELECT

    # --- 50300-50399: Programming Errors ---
    PROGRAMMING_ERROR = 50093  # SQL syntax error, table/column not found
    PROGRAMMING_SELECT = 50098  # Programming error during SELECT

    # --- 50400-50499: SQLAlchemy Errors ---
    SQLALCHEMY_ERROR = 50094  # Generic SQLAlchemy error

    # --- 50900-50999: General Errors ---
    UNKNOWN_ERROR = 50099  # Catch-all for unexpected exceptions
