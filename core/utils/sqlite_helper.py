import logging
import os
from pathlib import Path

from utils.constants import Constants
from utils.file_operator import FileReadEntry, YamlFileOperator

from daolib.drivers.sql.config import DbConnectionEntry
from daolib.drivers.sql.rdbms_connector import RdbmsConnector


logger = logging.getLogger(__name__)


class SqliteHelper(RdbmsConnector):
    """Concrete implementation of RdbmsConnector for SQLite.

    Loads configuration from a YAML file (injected or default) and Env variables.
    """

    def __init__(self, config_path: Path | None = None):
        """Initialize SqliteHelper with optional configuration.

        Args:
            config_path: Optional path to YAML config. If None, defaults to config/{env}.yml
        """
        # 1. Singleton Guard: Only setup config path if not already set
        # This prevents overwriting if '__init__()' is called multiple times on the singleton
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

            logger.info("SqliteHelper configured using path: %s", self._config_path)

        # 2. Initialize parent connector
        super().__init__()

    def read_and_load_configs(self) -> tuple[DbConnectionEntry, DbConnectionEntry]:
        """Read the YAML file stored in self._config_path and merge with ENV vars.

        Returns:
            Tuple of (primary, secondary) DbConnectionEntry. For SQLite, both are the same.
        """

        def raise_file_not_found(path: Path) -> None:
            """Raise FileNotFoundError for missing config file."""
            msg = f"Config file not found at: {path}"
            raise FileNotFoundError(msg)

        # 1. Read YAML
        try:
            # Verify file exists before trying to read
            if not self._config_path.exists():
                raise_file_not_found(self._config_path)

            configs_data = YamlFileOperator.read(FileReadEntry(read_path=self._config_path))
        except Exception:
            logger.exception("Failed to read config file at %s", self._config_path)
            raise

        # 2. Extract sqlite config section
        sqlite_section = configs_data.get(Constants.DBConstants.sqlite_creds, {})
        if not sqlite_section:
            msg = f"SQLite configuration section '{Constants.DBConstants.sqlite_creds}' missing in config."
            logger.error(msg)
            raise KeyError(msg)

        sqlite_data = sqlite_section.get("sqlite", {})

        # 3. Build DbConnectionEntry for SQLite (requires all fields)
        config = DbConnectionEntry(
            system="sqlite",
            username="",  # SQLite doesn't use credentials
            password="",
            host="",
            database="",
            port=0,
            path=sqlite_data.get(Constants.DBConstants.sqlite_path, "kubeplayground.db"),
            pool_size=int(sqlite_data.get(Constants.DBConstants.max_pool_size, 5)),
            max_overflow=int(sqlite_data.get(Constants.DBConstants.max_overflow, 10)),
        )

        # 4. For SQLite (file-based), return same config for both primary and secondary
        # No read replica support for SQLite
        return config, config

    def get_engine(self):
        """Get the SQLAlchemy engine for ORM usage.

        Returns:
            Engine: SQLAlchemy engine instance for creating sessions

        Raises:
            RuntimeError: If connector not initialized
        """
        if self._write_engine is None:
            raise RuntimeError("SqliteHelper not initialized. Ensure __init__() was called.")
        return self._write_engine
