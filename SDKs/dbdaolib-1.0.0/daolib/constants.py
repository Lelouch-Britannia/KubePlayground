from enum import Enum, IntEnum, unique

@unique
class LogEvent(str, Enum):
    """
    Mandatory Event Taxonomy as per Section 7 of Logging Design Doc.
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
    SQL_POOL_READY = "sql.pool.ready"
    SQL_QUERY = "sql.query"
    SQL_CLOSE = "sql.close"

@unique
class LogOutcome(str, Enum):
    """
    Mandatory Outcome values as per Section 4.1.
    These values populate the 'event.outcome' field.
    """
    SUCCESS = "success"
    FAILURE = "failure"
    UNKNOWN = "unknown"

@unique
class DAOErrorCode(IntEnum):
    """
    Stable Numeric Error Codes as per Section 5.
    These values populate the 'error.code' field.
    
    Ranges:
    1000-1999: Configuration & Validation (Pre-flight)
    2000-2999: Network & Connectivity (Transient)
    3000-3999: Authentication & Permissions (Security)
    4000-4999: Application & Data Logic (Permanent)
    9000+:     System/Unknown
    """
    
    # --- 1000-1999: Configuration Errors ---
    CONF_INVALID = 1001          # Generic config issue
    CONF_MISSING_CREDS = 1002    # User/Pass missing
    CONF_SSL_ERROR = 1003        # TLS/Cert path invalid
    CONF_POOL_INVALID = 1004     # Min pool > Max pool, etc.

    # --- 2000-2999: Network/Connection Errors ---
    # Matches example "20101" from doc (using 20xx for broader categories)
    NET_UNREACHABLE = 2001       # Host down / ping failed
    NET_TIMEOUT = 2002           # ServerSelectionTimeoutError
    NET_DNS_FAILURE = 2003       # SRV lookup failed
    NET_CONN_REFUSED = 2004      # IP open, port closed
    NET_HANDSHAKE_FAIL = 2005    # Protocol mismatch

    # --- 3000-3999: Auth Errors ---
    AUTH_FAILURE = 3001          # Bad credentials
    AUTH_FORBIDDEN = 3002        # Creds OK, but DB access denied

    # --- 4000-4999: Application/ODM Errors ---
    ODM_INIT_FAIL = 4001         # Beanie/SQLAlchemy model registry failed
    QUERY_SYNTAX = 4002          # Bad SQL or Mongo query structure
    DATA_VALIDATION = 4003       # Schema validation failed

    # --- 9000+: Critical/Unknown ---
    UNKNOWN_FATAL = 9999