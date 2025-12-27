import os
import sqlalchemy
from typing import Optional, Tuple
from sqlalchemy.pool import StaticPool
from sqlalchemy.engine import Engine
from daolib.drivers.sql.config import AbstractDBDriver
from daolib.exceptions import SqlDaoException

class SqliteDriver(AbstractDBDriver):
    """
    Tiny wrapper that behaves like the SDK’s SQLDriver but for a single
    SQLite file. It now only accepts parameters relevant to its configuration.
    """

    def __init__(self, sqlite_path: str, pool_recycle: int = 3600) -> None:
        """
        Initializes the driver for a SQLite database file.

        Args:
            sqlite_path: The file system path to the SQLite database.
            pool_recycle: The connection recycling time in seconds.
        """
        self._sqlite_path = os.path.abspath(sqlite_path)
        self._url = f"sqlite:///{self._sqlite_path}"
        self._pool_recycle = pool_recycle
        self._engine: Optional[Engine] = None  # The engine is shared for reads and writes

    def connect(self) -> Tuple[Engine, Engine]:
        """
        Creates and returns a SQLAlchemy Engine for the SQLite database.
        Since SQLite is a single file, the same engine is returned for both
        read and write operations.
        """
        try:
            if self._engine is None:
                self._engine = sqlalchemy.create_engine(
                    self._url,
                    # Use StaticPool for SQLite to ensure one connection per thread
                    poolclass=StaticPool,
                    # check_same_thread=False is crucial for allowing the connection
                    # to be used across different threads, common in web apps.
                    connect_args={"check_same_thread": False},
                    # pool_recycle is still useful to prevent stale connections
                    pool_recycle=self._pool_recycle,
                    echo=False,
                )
            # For SQLite, the read and write engine are the same
            return self._engine, self._engine
        except Exception as exc:
            raise SqlDaoException(50011,
                                  f"Error connecting to SQLite file '{self._url}': {exc}")

    def disconnect(self) -> None:
        """
        Disposes of the engine and its connection pool.
        """
        if self._engine:
            self._engine.dispose()
            self._engine = None

    @property
    def database_url(self) -> str:
        """Returns the database connection URL."""
        return self._url

    @property
    def version(self) -> str:
        """Returns the version of the SQLite library."""
        try:
            import sqlite3
            return sqlite3.sqlite_version
        except Exception:
            return ""

