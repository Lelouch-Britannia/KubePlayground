import logging
import os
from pathlib import Path

from sqlalchemy.engine import Engine

from daolib.drivers.sql.config_loader import ConfigLoader
from daolib.drivers.sql.connection_factory import ConnectionFactory


logger = logging.getLogger(__name__)

_state: dict[str, ConnectionFactory] = {}
_DB_LABEL = "dev-primary"


def _get_config_path() -> Path:
    env = os.getenv("ENVIRONMENT", "development")
    current_dir = Path(__file__).parent.resolve()
    return current_dir / "config" / f"{env}.yaml"


def get_sql_factory() -> ConnectionFactory:
    """Return singleton ConnectionFactory for SQLite."""
    if "factory" not in _state:
        config_path = _get_config_path()
        logger.info("Initializing SQL factory from: %s", config_path)

        configs = ConfigLoader.load_from_yaml(
            config_path=config_path,
            passwords={},  # SQLite needs no password
        )

        factory = ConnectionFactory()
        for config in configs:
            factory.register_database(config)

        logger.info("SQL factory initialized with %d database(s)", len(configs))
        _state["factory"] = factory

    return _state["factory"]


def get_engine() -> Engine:
    """Get SQLAlchemy engine for ORM (sessionmaker) usage.

    Triggers lazy engine initialization via get_connection().
    """
    factory = get_sql_factory()
    db_conn = factory.get_database(_DB_LABEL)

    # Trigger lazy engine init, then return the underlying engine
    with db_conn.get_connection():
        pass

    return db_conn._engine  # noqa: SLF001
