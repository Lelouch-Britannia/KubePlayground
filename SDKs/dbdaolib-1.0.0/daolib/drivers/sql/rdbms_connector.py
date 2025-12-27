import os
import sqlalchemy
from abc import abstractmethod
from sqlalchemy.engine import Engine, Connection
from typing import Optional, Tuple

from daolib.drivers.sql.config import DbConnectionEntry
from daolib.drivers.sql.sql_db_driver import SQLDriver
from daolib.drivers.sql.connector import Connector


class RdbmsConnector(Connector):
    """
    Uses SQLDriver under the hood. On construction, calls read_and_load_configs()
    exactly once to fetch the two DbConnectionEntry objects, hands them into SQLDriver,
    then stores the returned write_engine/read_engine pair.
    """

    # Class‐level caches: share these across all instances
    _write_engine: Optional[Engine] = None
    _read_engine: Optional[Engine] = None
    _sql_driver: Optional[SQLDriver] = None
    _primary_cfg: Optional[DbConnectionEntry] = None # Store config for properties

    def __init__(self):
        # Only build engines if they haven’t been built yet
        if RdbmsConnector._sql_driver is None:
            primary_cfg, secondary_cfg = self.read_and_load_configs()
            RdbmsConnector._primary_cfg = primary_cfg # Store for properties
            # Build the driver & engines
            RdbmsConnector._sql_driver = SQLDriver(primary_cfg, secondary_cfg)
            RdbmsConnector._write_engine, RdbmsConnector._read_engine = (
                RdbmsConnector._sql_driver.connect())
        # After the first instance, subsequent __init__ calls re‐use the same engines.

    def get_read_connection(self) -> Connection:
        if RdbmsConnector._read_engine is None:
            raise RuntimeError("Connector not initialized!")
        return RdbmsConnector._read_engine.connect()

    def get_write_connection(self) -> Connection:
        if RdbmsConnector._write_engine is None:
            raise RuntimeError("Connector not initialized!")
        return RdbmsConnector._write_engine.connect()

    def dispose(self) -> None:
        if RdbmsConnector._sql_driver:
            RdbmsConnector._sql_driver.disconnect()
            RdbmsConnector._sql_driver = None
            RdbmsConnector._write_engine = None
            RdbmsConnector._read_engine = None
            RdbmsConnector._primary_cfg = None

    # This method must be implemented by subclasses
    @abstractmethod
    def read_and_load_configs(self) -> Tuple[DbConnectionEntry, DbConnectionEntry]:
        ...

    @property
    def dialect(self) -> str:
        return "mssql"

    @property
    def database_url(self) -> str:
        if RdbmsConnector._sql_driver:
            return getattr(RdbmsConnector._sql_driver, "database_url", "")
        if RdbmsConnector._write_engine:
            url = str(RdbmsConnector._write_engine.url)
            return url
        return ""

    @property
    def supports_transactions(self) -> bool:
        return True

    def is_connected(self) -> bool:
        if RdbmsConnector._write_engine:
            try:
                conn = RdbmsConnector._write_engine.connect()
                conn.close()
                return True
            except Exception:
                return False
        return False

    def reset(self) -> None:
        self.dispose()

    def version(self) -> str:
        if RdbmsConnector._sql_driver:
            return getattr(RdbmsConnector._sql_driver, "version", "")
        if RdbmsConnector._write_engine:
            try:
                # Assuming sqlalchemy is imported
                with RdbmsConnector._write_engine.connect() as conn:
                    v = conn.execute(sqlalchemy.text("SELECT @@VERSION"))
                    return str(v.scalar())
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