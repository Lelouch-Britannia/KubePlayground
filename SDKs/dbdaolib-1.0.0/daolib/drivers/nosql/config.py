from dataclasses import dataclass
from typing import Optional

@dataclass
class NoSQLConnectionEntry:
    username: str
    password: str
    host: str
    port: int
    database: str
    # NoSQL specific pooling options
    min_pool_size: int = 10
    max_pool_size: int = 50
    server_selection_timeout_ms: int = 5000
    
    @property
    def connection_string(self) -> str:
        """Builds standard MongoDB connection string."""
        auth_part = ""
        if self.username and self.password:
            auth_part = f"{self.username}:{self.password}@"
            
        return f"mongodb://{auth_part}{self.host}:{self.port}"

class AbstractDBDriver(ABC):

    @abstractmethod
    def connect(self) -> Tuple[Any, Any]:
        ...

    @abstractmethod
    def disconnect(self) -> None:
        ...