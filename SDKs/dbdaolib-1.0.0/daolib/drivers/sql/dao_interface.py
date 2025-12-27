from abc import ABC, abstractmethod
from typing import Any, List
from sqlalchemy.engine import CursorResult


class BaseDAOInterface(ABC):
    _instance = None

    def __new__(cls, *args: Any, **kwargs: Any) -> Any:
        if not cls._instance:
            cls._instance = super().__new__(cls)
        return cls._instance

    @abstractmethod
    def read(self, connection: Any, query: str, params: List[Any]) -> List[Any]:
        ...

    @abstractmethod
    def _execute_query(self, connection: Any, query: str, params: List[Any]) -> Any:
        ...

    @abstractmethod
    def insert_and_retrieve_data(self, connection: Any, query: str, params: List[Any]) -> List[Any]:
        ...

    @abstractmethod
    def insert(self, connection: Any, query: str, params: List[Any]) -> CursorResult:
        ...

    @abstractmethod
    def update(self, connection: Any, query: str, params: List[Any]) -> CursorResult:
        ...

    @abstractmethod
    def delete(self, connection: Any, query: str, params: List[Any]) -> CursorResult:
        ...