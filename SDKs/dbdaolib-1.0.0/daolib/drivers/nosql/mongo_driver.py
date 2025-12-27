from typing import Any, Tuple
from motor.motor_asyncio import AsyncIOMotorClient
from daolib.drivers.nosql.config import NoSQLConnectionEntry, AbstractDBDriver

class MongoDriver(AbstractDBDriver):
    """
    Implements the low-level connection logic using Motor.
    """
    def __init__(self, config: NoSQLConnectionEntry):
        self.config = config
        self.client: AsyncIOMotorClient | None = None

    def connect(self) -> Tuple[AsyncIOMotorClient, Any]:
        """
        Creates the Motor Client.
        Returns (client, None) - simplified as Mongo handles its own pooling.
        """
        print(f"Connecting to MongoDB at {self.config.host}:{self.config.port}...")
        try:
            self.client = AsyncIOMotorClient(
                self.config.connection_string,
                minPoolSize=self.config.min_pool_size,
                maxPoolSize=self.config.max_pool_size,
                serverSelectionTimeoutMS=self.config.server_selection_timeout_ms,
                uuidRepresentation="standard"
            )
            return self.client, None
        except Exception as e:
            # Re-raise or wrap in custom exception
            raise ConnectionError(f"Error connecting to MongoDB: {e}")

    def disconnect(self) -> None:
        if self.client:
            print("Disconnecting from MongoDB...")
            self.client.close()
            self.client = None