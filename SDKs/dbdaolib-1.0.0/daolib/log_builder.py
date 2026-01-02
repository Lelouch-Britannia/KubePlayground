"""
Fluent Interface for building structured, compliant logs.
Enforces the Logging Standard schema without requiring developers to memorize field names.
"""

from typing import Optional, Dict, Any
import logging
from daolib.constants import LogEvent, LogOutcome, DAOErrorCode


class LogBuilder:
    """
    Fluent Interface to build compliant logs per Logging Standard.
    
    Usage Examples:
        # Success event
        LogBuilder(logger).event(LogEvent.MONGO_INIT).success().msg("Connected").duration_ms(42.5).emit()
        
        # Failure event
        LogBuilder(logger).event(LogEvent.MONGO_INIT).failure(DAOErrorCode.NET_TIMEOUT, exc).msg("Failed").emit()
        
        # With database context
        LogBuilder(logger).event(LogEvent.MONGO_QUERY).success().db_context("mongodb", "mydb", "host").msg("Query OK").emit()
    """

    def __init__(self, logger: logging.Logger):
        self.logger = logger
        self._context: Dict[str, Any] = {}
        self._level = logging.INFO
        self._msg = ""
        self._exc_info = False

    def event(self, evt: LogEvent) -> "LogBuilder":
        """Set event.action (Section 4.1 - Required)"""
        self._context["event.action"] = evt
        return self

    def success(self) -> "LogBuilder":
        """Set event.outcome = success (Section 4.1)"""
        self._context["event.outcome"] = LogOutcome.SUCCESS
        self._level = logging.INFO
        return self

    def failure(self, code: DAOErrorCode, exc: Exception) -> "LogBuilder":
        """
        Set event.outcome = failure and populate error schema (Section 5).
        Automatically sets level to ERROR and enables stack trace.
        """
        self._level = logging.ERROR
        self._exc_info = True
        self._context["event.outcome"] = LogOutcome.FAILURE
        self._context["error.code"] = code
        self._context["error.type"] = type(exc).__name__
        self._context["error.message"] = str(exc)
        return self

    def msg(self, message: str) -> "LogBuilder":
        """Set the human-readable message (Section 4.1 - Required)"""
        self._msg = message
        return self

    def duration_ms(self, ms: float) -> "LogBuilder":
        """Set duration_ms for operational events (Section 4.3)"""
        self._context["duration_ms"] = ms
        return self

    def db_context(
        self,
        system: str,
        database: str,
        host: str,
        **extra_db_fields: Any
    ) -> "LogBuilder":
        """
        Set mandatory DB context fields (Section 6.2).
        Args:
            system: mongodb, postgresql, mysql, etc.
            database: database name
            host: safe host label (no credentials)
            **extra_db_fields: db.srv, db.tls, db.pool.min, db.pool.max, etc.
        """
        self._context["db.system"] = system
        self._context["db.name"] = database
        self._context["db.host"] = host
        self._context.update(extra_db_fields)
        return self

    def field(self, key: str, value: Any) -> "LogBuilder":
        """Add arbitrary structured field (use sparingly)"""
        self._context[key] = value
        return self

    def level(self, lvl: int) -> "LogBuilder":
        """Override log level (default: INFO for success, ERROR for failure)"""
        self._level = lvl
        return self

    def emit(self) -> None:
        """
        Emit the log record to the configured logger.
        This respects the application's logging configuration (Section 2.2).
        """
        self.logger.log(
            self._level,
            self._msg,
            extra=self._context,
            exc_info=self._exc_info
        )
