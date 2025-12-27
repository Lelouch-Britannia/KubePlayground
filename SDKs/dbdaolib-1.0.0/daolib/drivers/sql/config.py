from abc import ABC, abstractmethod
from typing import Any, Tuple, Dict

from dataclasses import dataclass, field

@dataclass
class DbConnectionEntry:
    drivername: str
    username: str
    password: str
    host: str
    database: str
    pool_size: int
    port: int
    odbc_driver: Dict[str, str] = field(default_factory=dict)
    # Default values for advanced pooling options - THESE ARE CRUCIAL
    max_overflow: int = 10
    pool_recycle: int = 3600  # 1 hour
    pool_timeout: int = 30  # 30 seconds

    def __post_init__(self):
        if not self.odbc_driver:
            self.odbc_driver = {'driver': 'ODBC Driver 17 for SQL Server'}


class AbstractDBDriver(ABC):

    @abstractmethod
    def connect(self) -> Tuple[Any, Any]:
        ...

    @abstractmethod
    def disconnect(self) -> None:
        ...
    