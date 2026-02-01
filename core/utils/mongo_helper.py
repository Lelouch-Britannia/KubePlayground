import logging
import os
from pathlib import Path
from typing import Any, Optional

from utils.constants import Constants
from utils.file_operator import FileReadEntry, YamlFileOperator

from daolib.drivers.nosql.config import NoSQLConnectionEntry
from daolib.drivers.nosql.mongo_connector import MongoConnector


logger = logging.getLogger(__name__)


class MongoHelper(MongoConnector):
    """Concrete implementation of MongoConnector.

    Loads configuration from a YAML file (injected or default) and Env variables.
    """

    def __init__(self, config_path: Path | None = None, document_models: list[Any] | None = None):
        """Initialize MongoHelper with optional configuration.

        Args:
            config_path: Optional path to YAML config. If None, defaults to config/{env}.yml
            document_models: List of Beanie Document classes to register.
        """
        # 1. Initialize Parent (Registers models and sets up locks)
        super().__init__(document_models=document_models)

        # 2. Singleton Guard: Only setup config path if not already set
        # This prevents overwriting if 'init()' is called multiple times on the singleton
        if not hasattr(self, "_config_path"):
            # Capture the environment context (e.g., 'development', 'production')
            self._env = os.getenv("ENVIRONMENT", "development")

            if config_path:
                self._config_path = config_path
            else:
                # Default logic: Use project_root/config/{env}.yml
                # Adjust 'current_dir' logic as needed for your project structure
                current_dir = Path(__file__).parent.resolve()
                self._config_path = current_dir.joinpath("config", f"{self._env}.yaml").absolute()

            logger.info("MongoHelper configured using path: %s", self._config_path)

    def read_and_load_config(self) -> NoSQLConnectionEntry:
        """Read the YAML file stored in self._config_path and merge with ENV vars.

        Returns:
            NoSQLConnectionEntry with merged configuration values.
        """
        # 1. Read YAML
        try:
            # Verify file exists before trying to read
            if not self._config_path.exists():
                msg = f"Config file not found at: {self._config_path}"
                raise FileNotFoundError(msg)

            configs_data = YamlFileOperator.read(FileReadEntry(read_path=self._config_path))
        except Exception as e:
            logger.exception("Failed to read Mongo config")
            raise e

        # 2. Extract Config Section (Safe navigation)
        nosql_section = configs_data.get(Constants.DBConstants.nosql_creds, {})
        mongo_data = nosql_section.get(Constants.DBConstants.mongo_inst, {})

        # 3. Get Password from Constants based on Environment
        password = Constants.DBConstants.get_mongo_password(self._env)

        # 4. Return the Data Class
        return NoSQLConnectionEntry(
            username=mongo_data.get(Constants.DBConstants.username, ""),
            password=password,
            host=mongo_data.get(Constants.DBConstants.host, "localhost"),
            port=int(mongo_data.get(Constants.DBConstants.port, 27017)),
            database=mongo_data.get(Constants.DBConstants.db_name, "development"),
            min_pool_size=int(mongo_data.get(Constants.DBConstants.min_pool_size, 10)),
            max_pool_size=int(mongo_data.get(Constants.DBConstants.max_pool_size, 50)),
            use_srv=mongo_data.get(Constants.DBConstants.use_srv, False),
            use_ssl=mongo_data.get(Constants.DBConstants.use_ssl, False),
        )

    async def ping(self) -> bool:
        """Ping MongoDB to verify connection health.

        Returns:
            bool: True if connection is healthy, raises exception otherwise
        """
        if self._client:
            await self._client.admin.command("ping")
            return True
        msg = "MongoDB client not initialized"
        raise RuntimeError(msg)
