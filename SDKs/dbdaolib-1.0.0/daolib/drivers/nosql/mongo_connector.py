from typing import Optional
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from beanie import init_beanie

from daolib.drivers.nosql.connector import AbstractNoSQLConnector
from daolib.drivers.nosql.mongo_driver import MongoDriver
from daolib.drivers.nosql.config import NoSQLConnectionEntry

class MongoConnector(AbstractNoSQLConnector):
    """
    Singleton connector for MongoDB.
    Manages the MongoDriver and Beanie initialization.
    """
    _client: Optional[AsyncIOMotorClient] = None
    _driver: Optional[MongoDriver] = None
    _config: Optional[NoSQLConnectionEntry] = None
    
    # We pass the Beanie Document Models here to initialize them on startup
    _document_models: list = []

    def __init__(self, document_models: list = None):
        if document_models:
            MongoConnector._document_models = document_models

    async def init(self) -> None:
        """
        Async Initialization. Must be awaited at app startup.
        """
        if MongoConnector._client is not None:
            return

        # 1. Load Config (Abstract method call)
        MongoConnector._config = self.read_and_load_config()

        # 2. Initialize Driver
        MongoConnector._driver = MongoDriver(MongoConnector._config)
        client, _ = MongoConnector._driver.connect()
        MongoConnector._client = client

        # 3. Ping to verify
        await MongoConnector._client.admin.command('ping')
        
        # 4. Initialize ODM (Beanie)
        if MongoConnector._document_models:
            await init_beanie(
                database=MongoConnector._client[MongoConnector._config.database],
                document_models=MongoConnector._document_models
            )

    def get_client(self) -> AsyncIOMotorClient:
        if not MongoConnector._client:
            raise RuntimeError("MongoConnector not initialized! Await .init() first.")
        return MongoConnector._client

    def get_database(self) -> AsyncIOMotorDatabase:
        client = self.get_client()
        return client[MongoConnector._config.database]

    def close(self) -> None:
        if MongoConnector._driver:
            MongoConnector._driver.disconnect()
            MongoConnector._client = None
            MongoConnector._driver = None

    @property
    def database_name(self) -> str:
        return MongoConnector._config.database if MongoConnector._config else ""