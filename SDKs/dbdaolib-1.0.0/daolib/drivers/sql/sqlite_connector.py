import os
from typing import Optional
from sqlalchemy.engine import Engine, Connection

from daolib.drivers.sql.connector import Connector
from daolib.exceptions import SqlDaoException
from daolib.drivers.sql.sqlite_db_driver import SqliteDriver


class SqliteConnector(Connector):
    """
    Uses SqliteDriver under the hood. On construction, it initializes the driver
    and engine once, making it available for subsequent connection requests.
    This version is simplified to only handle pool_recycle.
    """

    def __init__(self, sqlite_path: str, pool_recycle: int = 3600):
        """
        Initializes the connector. The underlying driver and engine are created
        only on the first instantiation.

        Args:
            sqlite_path: The file system path to the SQLite database.
            pool_recycle: The connection recycling time in seconds.
        """
        self._primary_engine: Optional[Engine] = None
        self._secondary_engine: Optional[Engine] = None
        self._driver = None
        self._pool_recycle: int = 3600
        
        if self._driver is None:
            # Store instance-specific pooling parameter as a class attribute
            self._pool_recycle = pool_recycle
            
            # Check if the SQLite path exists
            if not os.path.exists(sqlite_path):
                raise SqlDaoException(err_code=50001, msg=f"SQLite database path does not exist: {sqlite_path}")

            # Pass the relevant parameters to the driver
            self._driver = SqliteDriver(
                sqlite_path=sqlite_path,
                pool_recycle=pool_recycle
            )
            # Connect and store the single engine for both read/write
            engines = self._driver.connect()
            self._primary_engine = engines[0]
            self._secondary_engine = engines[1]

    def get_read_connection(self) -> Connection:
        """Returns a new connection from the engine."""
        if self._secondary_engine is None:
            raise RuntimeError("Connector not initialized! Cannot get read connection.")
        return self._secondary_engine.connect()

    def get_write_connection(self) -> Connection:
        """Returns a new connection from the engine."""
        if self._primary_engine is None:
            raise RuntimeError("Connector not initialized! Cannot get write connection.")
        return self._primary_engine.connect()

    def dispose(self) -> None:
        """Disconnects the driver and clears the engine."""
        if self._driver:
            self._driver.disconnect()
            self._driver = None
            self._primary_engine = None
            self._secondary_engine = None

    @property
    def dialect(self) -> str:
        """Returns the SQL dialect."""
        return "sqlite"

    @property
    def database_url(self) -> str:
        """Returns the database URL from the driver."""
        if self._driver:
            return self._driver.database_url
        return ""

    @property
    def supports_transactions(self) -> bool:
        """Indicates that SQLite supports transactions."""
        return True

    def is_connected(self) -> bool:
        """Checks if a connection can be established."""
        if self._primary_engine:
            try:
                with self._primary_engine.connect() as conn:
                    return True
            except Exception:
                return False
        return False

    def reset(self) -> None:
        """Resets the connector by disposing of the current driver and engine."""
        self.dispose()

    def version(self) -> str:
        """Returns the database version from the driver."""
        if self._driver:
            return self._driver.version
        return ""

    @property
    def pool_recycle(self) -> int:
        """Returns the connection pool recycle time."""
        return self._pool_recycle
    
    @property
    def pool_size(self) -> int:
        """SQLite uses a single connection under StaticPool."""
        return 1

    @property
    def max_overflow(self) -> int:
        """No overflow connections with StaticPool."""
        return 0

    @property
    def pool_timeout(self) -> int:
        """Timeout isn’t applicable for StaticPool."""
        return 0