"""
Exception definitions for the DB DAO Library.
Strictly mapped to the DAOErrorCode Enum for observability consistency.
"""

from typing import Optional
from daolib.constants import DAOErrorCode

class DaoException(Exception):
    """
    Base exception for all Database Access Object errors.
    Carries a structured error code and the original cause.
    """
    def __init__(
        self, 
        err_code: DAOErrorCode, 
        msg: str, 
        original_exception: Optional[Exception] = None
    ):
        self.err_code = err_code
        self.msg = msg
        self.original_exception = original_exception
        
        # Format string representation for easy debugging in text consoles
        # Example: [CONF_INVALID] Missing password in configuration
        super().__init__(f"[{err_code.name}] {msg}")

class MongoConnectionException(DaoException):
    """
    Raised when the library fails to establish a network connection 
    or handshake with the MongoDB server.
    
    Maps to Codes: 2000-2999 (NET_*) and 3000-3999 (AUTH_*)
    """
    pass

class MongoODMException(DaoException):
    """
    Raised when the ODM (Object Document Mapper) fails to initialize.
    Usually indicates a code/schema error (e.g., bad model definition).
    
    Maps to Codes: 4000-4999 (ODM_*, DATA_*)
    """
    pass

class SqlDaoException(DaoException):
    """
    Equivalent wrapper for SQL-specific failures (SQLAlchemy).
    """
    pass