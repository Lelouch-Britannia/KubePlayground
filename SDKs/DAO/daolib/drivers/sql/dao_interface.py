from abc import ABC, abstractmethod
from typing import Any

from sqlalchemy.engine import CursorResult


class BaseDAOInterface(ABC):
    """Abstract interface for DAO implementations.

    Note:
        DAOs should be normal instances, not singletons.
        Connection pooling is handled by Engine at driver layer.
    """

    @abstractmethod
    def read(self, connection: Any, query: str, params: list[Any]) -> list[Any]: ...

    @abstractmethod
    def _execute_query(self, connection: Any, query: str, params: list[Any]) -> Any: ...

    @abstractmethod
    def insert_and_retrieve_data(self, connection: Any, query: str, params: list[Any]) -> list[Any]: ...

    @abstractmethod
    def insert(self, connection: Any, query: str, params: list[Any]) -> CursorResult: ...

    @abstractmethod
    def update(self, connection: Any, query: str, params: list[Any]) -> CursorResult: ...

    @abstractmethod
    def delete(self, connection: Any, query: str, params: list[Any]) -> CursorResult: ...
