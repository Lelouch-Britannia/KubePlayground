from abc import ABC, abstractmethod
from typing import Any, Tuple
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from daolib.drivers.nosql.config import NoSQLConnectionEntry

class AbstractNoSQLConnector(ABC):
    """
    Responsible for initializing the Motor Client exactly once.
    """

    @property
    @abstractmethod
    def database_name(self) -> str:
        ...

    @abstractmethod
    def read_and_load_config(self) -> NoSQLConnectionEntry:
        """
        Load config from env vars or secrets.
        """
        ...

    @abstractmethod
    async def init(self) -> None:
        """
        Async initialization of the driver/client.
        """
        ...

    @abstractmethod
    def get_client(self) -> AsyncIOMotorClient:
        """
        Return the live AsyncIOMotorClient.
        """
        ...

    @abstractmethod
    def get_database(self) -> AsyncIOMotorDatabase:
        """
        Return the default AsyncIOMotorDatabase object.
        """
        ...
        
    @abstractmethod
    def close(self) -> None:
        """
        Close connections.
        """
        ...