"""Exception definitions for the DB DAO Library.

Provides structured error wrapping with stable error codes for observability.

Error Code Taxonomy:
- InfraErrorCode (1000-9999): Driver/Connector infrastructure failures
- DaoErrorCode (50000-50999): DAO layer query execution failures
"""

from typing import Optional, Union

from daolib.constants import DaoErrorCode, InfraErrorCode


class DaoException(Exception):
    """Base exception for all Database Access Object errors.

    Carries a structured error code and the original cause.

    Args:
        err_code: Infrastructure or DAO layer error code
        msg: Human-readable error message
        original_exception: The underlying exception that was caught (for chaining)

    Usage:
        # Driver layer (infrastructure)
        raise DaoException(InfraErrorCode.NET_TIMEOUT, "Connection timed out", exc)

        # DAO layer (query execution)
        raise SqlDaoException(DaoErrorCode.INTEGRITY_ERROR, "Unique constraint violated", exc)
    """

    def __init__(self, err_code: InfraErrorCode | DaoErrorCode, msg: str, original_exception: Exception | None = None):
        self.err_code = err_code
        self.msg = msg
        self.original_exception = original_exception

        # Format: [ERROR_NAME] Human message
        # Example: [NET_TIMEOUT] Connection to db.example.com:5432 timed out after 30s
        super().__init__(f"[{err_code.name}] {msg}")


class MongoConnectionException(DaoException):
    """Raised when the library fails to establish a network connection.

    Or handshake with the MongoDB server.

    Error Codes: InfraErrorCode (2000-2999 for NET_*, 3000-3999 for AUTH_*)

    Examples:
        - NET_TIMEOUT: Connection attempt timed out
        - NET_UNREACHABLE: Host/port unreachable
        - AUTH_FAILURE: Invalid credentials
    """


class MongoODMException(DaoException):
    """Raised when the ODM (Object Document Mapper) fails to initialize.

    Usually indicates a code/schema error (e.g., bad model definition).

    Error Codes: InfraErrorCode (4000-4999 for ODM_*, DATA_*)

    Examples:
        - ODM_INIT_FAIL: Beanie model registration failed
        - DATA_VALIDATION: Schema validation error
    """


class SqlDaoException(DaoException):
    """Raised for SQL database failures at both driver and DAO layers.

    Error Codes:
        - InfraErrorCode (1000-9999): Driver/Connector failures (connect, ping, pool)
        - DaoErrorCode (50000-50999): Query execution failures (SELECT, INSERT, etc.)

    Examples:
        # Infrastructure layer (Driver)
        SqlDaoException(InfraErrorCode.NET_TIMEOUT, "Ping failed", exc)
        SqlDaoException(InfraErrorCode.CONF_INVALID, "Invalid pool config", exc)

        # DAO layer (Query execution)
        SqlDaoException(DaoErrorCode.INTEGRITY_ERROR, "FK constraint violated", exc)
        SqlDaoException(DaoErrorCode.PROGRAMMING_ERROR, "Column 'foo' not found", exc)
    """
