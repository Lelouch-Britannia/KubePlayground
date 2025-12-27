import os
import json
import inspect
import sys
import logging
import multiprocessing
from pathlib import Path
from typing import Any
from BIST_R_EXTRACTION.utils.constants import Constants
from daolib.logger import AbstractLogger


class JsonFormatter(logging.Formatter):
    """Formatter that outputs logs in JSON for GCP Logs Explorer."""

    def format(self, record: logging.LogRecord) -> str:
        log_entry = {
            "severity": record.levelname,
            "message": record.getMessage(),
            "logger": record.name,
            "timestamp": self.formatTime(record, self.datefmt),
            "process": {
                "pid": record.process,
                "name": record.processName,
            },
            "module": record.module,
            "funcName": record.funcName,
            "filename": record.filename,
            "lineno": record.lineno,
        }
        return json.dumps(log_entry)


class ColorFormatter(logging.Formatter):
    """Human-friendly color formatter for local development."""

    _fmt = "[%(levelname)s] %(asctime)s %(message)s"

    def __init__(self):
        super().__init__(fmt=self._fmt, datefmt="%Y-%m-%d %H:%M:%S")

    def format(self, record):
        original_levelname = record.levelname
        padded = f"{original_levelname:<8}"
        color = getattr(Constants.LOG_COLORS, original_levelname, "")
        reset = Constants.LOG_COLORS.RESET
        record.levelname = f"{color}{padded}{reset}"
        formatted = super().format(record)
        record.levelname = original_levelname
        return formatted


class Logger(AbstractLogger):
    _instance = None
    logger = None

    def __new__(cls, use_color: bool = False):
        if cls._instance is None:
            cls._instance = super(Logger, cls).__new__(cls)
            cls._instance.logger = cls._setup_logger(use_color)
        return cls._instance

    @staticmethod
    def _setup_logger(use_color: bool) -> Any:
        print("[Logger] Initialization started")

        stack = inspect.stack()
        calling_file = Path(stack[1].filename).name
        process_id = os.getpid()
        process_name = multiprocessing.current_process().name

        logger = logging.getLogger("cg_logger")
        logger.setLevel(logging.DEBUG)

        if logger.handlers:
            return logger

        stream_handler = logging.StreamHandler(sys.stdout)

        if use_color:
            formatter = ColorFormatter()
        else:
            formatter = JsonFormatter()

        stream_handler.setFormatter(formatter)
        logger.addHandler(stream_handler)

        logger.info(
            f"Logger initialized by '{calling_file}' in process '{process_name}' "
            f"(PID: {process_id}), using {'Color' if use_color else 'JSON'} formatter"
        )
        return logger

    @staticmethod
    def _msg_formatter(msg: Any, args: Any, kwargs: Any) -> str:
        if args and kwargs:
            msg = f"{msg}-{args}-{kwargs}\n"
        elif args:
            msg = f"{msg}-{args}\n"
        elif kwargs:
            msg = f"{msg}-{kwargs}\n"
        return msg

    def info(self, msg: Any, *args: Any, **kwargs: Any) -> None:
        self.logger.info(self._msg_formatter(msg, args, kwargs)) # type: ignore

    def debug(self, msg: Any, *args: Any, **kwargs: Any) -> None:
        self.logger.debug(self._msg_formatter(msg, args, kwargs)) # type: ignore

    def warning(self, msg: Any, *args: Any, **kwargs: Any) -> None:
        self.logger.warning(self._msg_formatter(msg, args, kwargs)) # type: ignore

    def critical(self, msg: Any, *args: Any, **kwargs: Any) -> None:
        self.logger.critical(self._msg_formatter(msg, args, kwargs)) # type: ignore

    def error(self, msg: Any, *args: Any, **kwargs: Any) -> None:
        self.logger.error(self._msg_formatter(msg, args, kwargs)) # type: ignore


if __name__ == "__main__":
    logger = Logger()
    logger.debug("This is a debug message", ('a', 'b'), month='jan')  # type: ignore
    logger.info("This is an info message", ['a', 'b'], month='feb')  # type: ignore
    logger.warning("This is a warning message", 'a', 1, 2, True, month='march')  # type: ignore
    logger.error('This is an error message', {'a': 'a'})  # type: ignore
    logger.critical('This is a critical message')  # type: ignore
