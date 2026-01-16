"""
Production-Ready Structured Logging for Core Service.
ECS-compliant JSON output with OpenTelemetry trace context injection.

Usage:
    # In main.py startup
    from utils.logger import setup_logging
    setup_logging()
    
    # In application code
    import logging
    logger = logging.getLogger(__name__)
    logger.info("Server started")
    
    # For structured logs (HTTP requests, DB events)
    from daolib.log_builder import LogBuilder
    from daolib.constants import LogEvent
    LogBuilder(logger).event(LogEvent.HTTP_REQUEST).success() \
        .msg("Request completed").duration_ms(42.5) \
        .field("http.method", "GET").emit()
"""

import os
import sys
import json
import logging
import threading
from datetime import datetime, timezone
from typing import Any, Dict, Optional
from utils.constants import Constants


class TraceContextFilter(logging.Filter):
    """
    Injects OpenTelemetry trace context into log records.
    Returns empty strings when OTel is not configured (future-ready).
    
    Populates:
        - trace.id: OpenTelemetry trace ID (32-hex) or empty string
        - span.id: OpenTelemetry span ID (16-hex) or empty string
    """
    
    def filter(self, record: logging.LogRecord) -> bool:
        # TODO: When OpenTelemetry is configured, extract from context:
        # from opentelemetry import trace
        # span = trace.get_current_span()
        # if span.is_recording():
        #     ctx = span.get_span_context()
        #     record.trace_id = format(ctx.trace_id, '032x')
        #     record.span_id = format(ctx.span_id, '016x')
        
        # For now: dummy fields (ECS schema compliance)
        record.trace_id = getattr(record, 'trace_id', '')
        record.span_id = getattr(record, 'span_id', '')
        return True


class ECSJsonFormatter(logging.Formatter):
    """
    ECS-compliant JSON formatter with security redaction and size limits.
    
    Implements:
        - Section 4: Standard Log Schema (mandatory fields)
        - Section 5: Error Schema (for failures)
        - Section 9: Security & Redaction (bounded)
        - Section 10: Payload Size Limits (16 KB max)
    """
    
    # Security: Keys to redact (case-insensitive)
    REDACTED_KEYS = {
        'password', 'token', 'secret', 'authorization', 
        'api_key', 'access_key', 'auth', 'credentials'
    }
    
    # Size limits per Logging Standard Section 10
    MAX_FIELD_LENGTH = 4096
    MAX_LOG_SIZE = 16 * 1024  # 16 KB
    
    def __init__(self):
        super().__init__()
        self.hostname = Constants.ServiceIdentity.host
    
    def format(self, record: logging.LogRecord) -> str:
        """Format log record as ECS-compliant JSON."""
        
        # Get message and try to parse if it's JSON (PyMongo/Motor often log JSON strings)
        message = record.getMessage()
        parsed_message: Any = message
        if isinstance(message, str) and message.startswith('{') and message.endswith('}'):
            try:
                parsed_message = json.loads(message)
            except (json.JSONDecodeError, ValueError):
                pass  # Keep as string if not valid JSON
        
        # --- Section 4.1: Required Fields (All Logs) ---
        log_entry: Dict[str, Any] = {
            '@timestamp': self._format_timestamp(record.created),
            'severity': record.levelname,
            'message': parsed_message,  # Can be dict or string
            'log.logger': record.name,
            
            # Service Identity (Section 4.1)
            'service.name': Constants.ServiceIdentity.name,
            'service.env': Constants.ServiceIdentity.env,
            'service.version': Constants.ServiceIdentity.version,
            
            # Trace Context (Section 4.1 - empty until OTel configured)
            'trace.id': getattr(record, 'trace_id', ''),
            'span.id': getattr(record, 'span_id', ''),
            
            # Section 4.2: Runtime Fields
            'process.pid': record.process,
            'thread.name': record.threadName,
            'host.name': self.hostname,
        }
        
        # --- Event Context (if present from LogBuilder) ---
        if hasattr(record, 'event.action'):
            log_entry['event.action'] = str(getattr(record, 'event.action', ''))
        if hasattr(record, 'event.outcome'):
            log_entry['event.outcome'] = str(getattr(record, 'event.outcome', ''))
        
        # --- Section 4.3: Duration (for operational events) ---
        if hasattr(record, 'duration_ms'):
            log_entry['duration_ms'] = getattr(record, 'duration_ms')
        
        # --- Section 5: Error Schema (for failures) ---
        if record.exc_info:
            log_entry['error.type'] = record.exc_info[0].__name__ if record.exc_info[0] else 'Unknown'
            log_entry['error.message'] = str(record.exc_info[1]) if record.exc_info[1] else ''
            log_entry['error.stack_trace'] = self.formatException(record.exc_info).replace('\n', '\\n')
        
        if hasattr(record, 'error.code'):
            log_entry['error.code'] = getattr(record, 'error.code')
        
        # --- Extract Structured Fields from LogRecord.extra ---
        # LogBuilder adds fields via extra={...}, which become record attributes
        self._extract_extra_fields(record, log_entry)
        
        # --- Section 9: Security Redaction (Bounded) ---
        self._redact_sensitive_fields(log_entry)
        
        # --- Section 10: Payload Size Limits ---
        json_str = json.dumps(log_entry, default=str)
        
        if len(json_str) > self.MAX_LOG_SIZE:
            log_entry['log.original_size_bytes'] = len(json_str)
            log_entry['message'] = log_entry['message'][:1000] + '... [truncated]'
            # Remove large fields if still over limit
            if 'error.stack_trace' in log_entry:
                log_entry['error.stack_trace'] = log_entry['error.stack_trace'][:2000] + '... [truncated]'
            json_str = json.dumps(log_entry, default=str)
        
        return json_str
    
    def _format_timestamp(self, created: float) -> str:
        """Format timestamp as RFC3339/ISO-8601 UTC (Section 4.1)."""
        dt = datetime.fromtimestamp(created, tz=timezone.utc)
        return dt.isoformat()
    
    def _extract_extra_fields(self, record: logging.LogRecord, log_entry: Dict[str, Any]) -> None:
        """
        Extract structured fields from LogRecord that were added via extra={...}.
        Handles LogBuilder fields (db.*, http.*, etc.).
        """
        # Standard record attributes to skip
        skip_attrs = {
            'name', 'msg', 'args', 'created', 'filename', 'funcName', 'levelname',
            'levelno', 'lineno', 'module', 'msecs', 'message', 'pathname', 'process',
            'processName', 'relativeCreated', 'thread', 'threadName', 'exc_info',
            'exc_text', 'stack_info', 'trace_id', 'span_id'
        }
        
        for key, value in record.__dict__.items():
            # Skip standard attributes and already-processed fields
            if key in skip_attrs or key.startswith('_') or key in log_entry:
                continue
            
            # Add to log entry (dot-notation fields like db.host, http.method)
            log_entry[key] = value
    
    def _redact_sensitive_fields(self, log_entry: Dict[str, Any], depth: int = 0) -> None:
        """
        Redact sensitive values and enforce field length limits.
        Section 9.2: Bounded redaction (max depth 5, max field length 4096).
        """
        if depth > 5:  # Prevent deep recursion
            return
        
        for key, value in list(log_entry.items()):
            # Check if key contains sensitive term (case-insensitive)
            if any(term in key.lower() for term in self.REDACTED_KEYS):
                log_entry[key] = '[REDACTED]'
                continue
            
            # Enforce max field length for strings
            if isinstance(value, str) and len(value) > self.MAX_FIELD_LENGTH:
                log_entry[key] = value[:self.MAX_FIELD_LENGTH] + '... [truncated]'
            
            # Recurse into nested dicts (bounded depth)
            elif isinstance(value, dict):
                self._redact_sensitive_fields(value, depth + 1)


def setup_logging(level: Optional[str] = None) -> None:
    """
    Configure application-wide structured logging (ECS-compliant JSON to stdout).
    Call once at FastAPI startup.
    
    Args:
        level: Log level ('DEBUG', 'INFO', 'WARNING', 'ERROR'). 
               Defaults to DEBUG for development, INFO for production.
    
    Usage:
        # In main.py
        from utils.logger import setup_logging
        
        @app.on_event("startup")
        async def startup_event():
            setup_logging()
    """
    
    # Determine log level
    if level is None:
        env = Constants.ServiceIdentity.env
        level = 'DEBUG' if env == 'development' else 'INFO'
    
    log_level = getattr(logging, level.upper(), logging.INFO)
    
    # Suppress PyMongo/Motor debug logs (they log JSON strings causing double encoding)
    logging.getLogger('pymongo').setLevel(logging.WARNING)
    logging.getLogger('motor').setLevel(logging.WARNING)
    
    # --- Configure Root Logger ---
    root_logger = logging.getLogger()
    root_logger.setLevel(log_level)
    
    # Clear existing handlers (prevent duplicate logs)
    root_logger.handlers.clear()
    
    # --- Setup stdout handler with ECS formatter and trace filter ---
    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(log_level)
    handler.setFormatter(ECSJsonFormatter())
    handler.addFilter(TraceContextFilter())
    
    root_logger.addHandler(handler)
    
    # --- Configure Uvicorn Loggers (Section 2.2: Application responsibility) ---
    # Uvicorn access logs should use same format
    for uvicorn_logger_name in ['uvicorn', 'uvicorn.access', 'uvicorn.error']:
        uvicorn_logger = logging.getLogger(uvicorn_logger_name)
        uvicorn_logger.handlers.clear()
        uvicorn_logger.addHandler(handler)
        uvicorn_logger.propagate = False
    
    # Log successful initialization
    logger = logging.getLogger(__name__)
    logger.info(
        f"Structured logging configured: level={level}, service={Constants.ServiceIdentity.name}, "
        f"env={Constants.ServiceIdentity.env}, version={Constants.ServiceIdentity.version}"
    )


# Convenience: Pre-configured logger for this module
logger = logging.getLogger(__name__)
