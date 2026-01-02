"""
Abstract Base Classes for NoSQL Connectors.
Defines the contract for the 'Connector-Helper' pattern.
"""

from abc import ABC, abstractmethod
from typing import Any
from motor.motor_asyncio import AsyncIOMotorDatabase
from daolib.drivers.nosql.config import NoSQLConnectionEntry


class AbstractNoSQLConnector(ABC):
    """
    Interface for a NoSQL Database Connector.
    Enforces the lifecycle methods (Init -> Use -> Close).
    """
    @property
    @abstractmethod
    def database_name(self) -> str:
        ...

    @abstractmethod
    def read_and_load_config(self) -> NoSQLConnectionEntry:
        """
        [Helper Responsibility]
        Must be implemented by the concrete Helper class (e.g., EnvMongoHelper).
        Should return a fully populated NoSQLConnectionEntry.
        """
        ...

    @abstractmethod
    async def init(self) -> None:
        """
        [Connector Responsibility]
        Idempotent async initialization.
        Must handle:
          1. Loading Config
          2. Creating Client
          3. Pinging Server
          4. Binding ODM (Beanie)
        """
        ...

    @abstractmethod
    def get_client(self) -> Any:
        """
        Returns the underlying raw driver client (e.g. AsyncIOMotorClient).
        Should raise an exception if called before init().
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
        Closes connections and resets the singleton state.
        Must be safe to call multiple times.
        """
        ...