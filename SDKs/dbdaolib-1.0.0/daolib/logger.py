from abc import ABC, abstractmethod
from typing import Any


class AbstractLogger(ABC):
    """
    Defines the interface for all loggers.
    """

    @abstractmethod
    def debug(self, msg: Any, *args: Any, **kwargs: Any) -> None:
        ...

    @abstractmethod
    def info(self, msg: Any, *args: Any, **kwargs: Any) -> None:
        ...

    @abstractmethod
    def warning(self, msg: Any, *args: Any, **kwargs: Any) -> None:
        ...

    @abstractmethod
    def error(self, msg: Any, *args: Any, **kwargs: Any) -> None:
        ...

    @abstractmethod
    def critical(self, msg: Any, *args: Any, **kwargs: Any) -> None:
        ...