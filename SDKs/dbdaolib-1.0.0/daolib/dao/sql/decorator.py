from functools import wraps
from sqlalchemy.engine import Connection
from typing import Callable, Any


class InjectConnection:
    def __init__(self, connector_attr: str = "connector", is_write: bool = False):
        self.connector_attr = connector_attr
        self.is_write = is_write

    def __call__(self, func: Callable[..., Any]) -> Callable[..., Any]:
        @wraps(func)
        def wrapper(instance, *args, **kwargs):
            # Manual connection injection still supported
            if args and isinstance(args[0], Connection):
                return func(instance, *args, **kwargs)

            # Base connector (used for fallback decision)
            base_connector = getattr(instance, "connector", None)
            if not base_connector:
                raise AttributeError("Missing base connector 'connector' on instance.")

            # Use the preferred connector for SQLite, or fallback to base
            if getattr(base_connector, "dialect", None) != "sqlite":
                connector = base_connector
            else:
                connector = getattr(instance, self.connector_attr, None)
                if connector is None:
                    raise ValueError(
                        f"Connector '{self.connector_attr}' required for SQLite but not provided."
                    )

            # Get connection factory
            conn_factory = (
                connector.get_write_connection
                if self.is_write
                else connector.get_read_connection
            )

            # Inject and manage transaction
            with conn_factory() as conn:
                if self.is_write:
                    with conn.begin():
                        return func(instance, conn, *args, **kwargs)
                return func(instance, conn, *args, **kwargs)

        return wrapper


