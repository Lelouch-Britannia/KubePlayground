import contextlib
import logging
from abc import abstractmethod
from typing import Optional

import sqlalchemy
from sqlalchemy.engine import Connection, Engine

from daolib.constants import InfraErrorCode, LogEvent
from daolib.drivers.sql.config import DbConnectionEntry
from daolib.drivers.sql.connector import Connector
from daolib.drivers.sql.driver import SQLDriver
from daolib.logger import LogBuilder


logger = logging.getLogger(__name__)


class RdbmsConnector(Connector):
    """Uses SQLDriver under the hood.

    On construction, calls read_and_load_configs() exactly once to fetch the two
    DbConnectionEntry objects, hands them into SQLDriver, then stores the
    returned write_engine/read_engine pair.
    """

    # Class-level caches: share these across all instances
    _write_engine: Engine | None = None
    _read_engine: Engine | None = None
    _primary_cfg: DbConnectionEntry | None = None

    def __init__(self):
        """Initialize connector by creating SQLDriver and engines on first instantiation."""
        if RdbmsConnector._write_engine is None:
            try:
                primary_cfg, secondary_cfg = self.read_and_load_configs()
                RdbmsConnector._primary_cfg = primary_cfg

                RdbmsConnector._write_engine, RdbmsConnector._read_engine = SQLDriver(
                    primary_cfg, secondary_cfg
                ).connect()

                LogBuilder(logger).event(LogEvent.SQL_INIT).success().field(
                    "db.dialect", RdbmsConnector._write_engine.dialect.name
                ).field("db.host", primary_cfg.safe_host_label()).field("db.name", primary_cfg.database).msg(
                    "Connector initialized with SQLDriver"
                ).emit()
            except Exception as exc:
                LogBuilder(logger).event(LogEvent.SQL_INIT).failure(InfraErrorCode.CONF_INVALID, exc).msg(
                    "Failed to initialize connector"
                ).emit()
                raise

    def get_read_connection(self) -> Connection:
        """Get a read connection from the read engine or fallback to write engine.

        Returns:
            Connection: SQLAlchemy connection object (caller must close)

        Note:
            Falls back to write engine when no secondary config is provided.
        """
        if RdbmsConnector._write_engine is None:
            raise RuntimeError("Connector not initialized!")

        engine = RdbmsConnector._read_engine if RdbmsConnector._read_engine else RdbmsConnector._write_engine
        return engine.connect()

    def get_write_connection(self) -> Connection:
        """Get a write connection from the write engine.

        Returns:
            Connection: SQLAlchemy connection object (caller must close)
        """
        if RdbmsConnector._write_engine is None:
            raise RuntimeError("Connector not initialized!")
        return RdbmsConnector._write_engine.connect()

    def dispose(self) -> None:
        """Dispose all engines and reset class-level state."""
        if RdbmsConnector._write_engine:
            with contextlib.suppress(Exception):
                RdbmsConnector._write_engine.dispose()
                if RdbmsConnector._read_engine:
                    RdbmsConnector._read_engine.dispose()
            RdbmsConnector._write_engine = None
            RdbmsConnector._read_engine = None
            RdbmsConnector._primary_cfg = None
            LogBuilder(logger).event(LogEvent.SQL_CLOSE).success().msg("Connector disposed").emit()

    # This method must be implemented by subclasses
    @abstractmethod
    def read_and_load_configs(self) -> tuple[DbConnectionEntry, DbConnectionEntry]: ...

    @property
    def dialect(self) -> str:
        """Return the SQL dialect name from the active engine."""
        if RdbmsConnector._write_engine:
            return RdbmsConnector._write_engine.dialect.name
        return ""

    @property
    def database_url(self) -> str:
        """Return the database connection URL."""
        if RdbmsConnector._write_engine:
            return str(RdbmsConnector._write_engine.url)
        return ""

    @property
    def supports_transactions(self) -> bool:
        """Check if the database dialect supports transactions."""
        if RdbmsConnector._write_engine:
            dialect_name = RdbmsConnector._write_engine.dialect.name
            return dialect_name not in ("sqlite",)
        return True

    def is_connected(self) -> bool:
        """Check if the database connection is alive."""
        if RdbmsConnector._write_engine:
            try:
                with RdbmsConnector._write_engine.connect() as conn:
                    conn.execute(sqlalchemy.text("SELECT 1"))
                return True
            except Exception:
                return False
        return False

    def reset(self) -> None:
        """Reset connector state (disposes engines for reinitialization)."""
        self.dispose()

    def version(self) -> str:
        """Return database version string (dialect-specific)."""
        if RdbmsConnector._write_engine:
            try:
                dialect_name = RdbmsConnector._write_engine.dialect.name
                version_query = {
                    "mssql": "SELECT @@VERSION",
                    "mysql": "SELECT VERSION()",
                    "postgresql": "SELECT version()",
                    "sqlite": "SELECT sqlite_version()",
                }.get(dialect_name, "SELECT 1")

                with RdbmsConnector._write_engine.connect() as conn:
                    result = conn.execute(sqlalchemy.text(version_query))
                    return str(result.scalar())
            except Exception:
                return ""
        return ""

    # New pooling properties, reflecting the primary connection config
    @property
    def pool_size(self) -> int:
        if RdbmsConnector._primary_cfg:
            return RdbmsConnector._primary_cfg.pool_size
        return 0

    @property
    def max_overflow(self) -> int:
        if RdbmsConnector._primary_cfg:
            return RdbmsConnector._primary_cfg.max_overflow
        return 0

    @property
    def pool_recycle(self) -> int:
        if RdbmsConnector._primary_cfg:
            return RdbmsConnector._primary_cfg.pool_recycle
        return 0

    @property
    def pool_timeout(self) -> int:
        if RdbmsConnector._primary_cfg:
            return RdbmsConnector._primary_cfg.pool_timeout
        return 0
