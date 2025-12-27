from abc import ABC, abstractmethod
from sqlalchemy.engine import Connection


class Connector(ABC):
    """
    A Connector is responsible for:
      1. Initializing one (or two) SQLAlchemy Engine(s) exactly once.
      2. Handing out live Connection objects upon request.
    """

    @property
    @abstractmethod
    def dialect(self) -> str:
        """
        Returns the SQL dialect in use (e.g., 'mssql', 'sqlite').
        """
        ...

    @property
    def database_url(self) -> str:
        """
        Optional: Return the DB URL or path for debugging/logging.
        """
        return ""

    @property
    def supports_transactions(self) -> bool:
        """
        Optional: Does this DB support transactions?
        """
        return True

    def is_connected(self) -> bool:
        """
        Optional: Check if the engine is alive.
        """
        return True

    def reset(self) -> None:
        """
        Optional: Reset class-level caches (for tests).
        """
        pass

    def version(self) -> str:
        """
        Optional: Return DB version string.
        """
        return ""

    @abstractmethod
    def get_read_connection(self) -> Connection:
        """
        Return a SQLAlchemy Connection on which read-only queries
        (SELECT, or SELECT-based pandas reads) may be run.
        """
        ...

    @abstractmethod
    def get_write_connection(self) -> Connection:
        """
        Return a SQLAlchemy Connection that has write privileges
        (INSERT / UPDATE / DELETE). In a primary/secondary setup,
        this would come from the “primary” engine.
        """
        ...

    @property
    @abstractmethod
    def pool_size(self) -> int:
        """Returns the primary connection pool size."""
        ...

    @property
    @abstractmethod
    def max_overflow(self) -> int:
        """Returns the primary connection pool max overflow."""
        ...

    @property
    @abstractmethod
    def pool_recycle(self) -> int:
        """Returns the primary connection pool recycle time."""
        ...

    @property
    @abstractmethod
    def pool_timeout(self) -> int:
        """Returns the primary connection pool timeout."""
        ...