from functools import wraps
from sqlalchemy.engine import Connection
from typing import Callable, Any


class InjectConnection:
    """
    Decorator that injects SQLAlchemy connections into DAO methods and manages transactions.
    
    Features:
    - Automatic connection injection from connector
    - Transaction lifecycle management (begin/commit/rollback) for write operations
    - Read/write connection selection based on is_write parameter
    - Manual connection injection support for testing
    
    Usage:
        class UserDao(BaseHelperSqlDao):
            @InjectConnection(is_write=True)
            def create_user(self, connection, username):
                return self.insert(connection, "INSERT INTO users (username) VALUES (?)", [username])
            
            @InjectConnection(is_write=False)
            def get_user(self, connection, user_id):
                return self.select(connection, "SELECT * FROM users WHERE id = ?", [user_id])
    """
    
    def __init__(self, is_write: bool = False):
        """
        Args:
            is_write: If True, uses write connection and wraps in transaction.
                     If False, uses read connection (no transaction).
        """
        self.is_write = is_write

    def __call__(self, func: Callable[..., Any]) -> Callable[..., Any]:
        @wraps(func)
        def wrapper(instance, *args, **kwargs):
            # Manual connection injection support (for testing)
            if args and isinstance(args[0], Connection):
                return func(instance, *args, **kwargs)

            # Get connector from DAO instance
            connector = getattr(instance, "connector", None)
            if not connector:
                raise AttributeError(
                    f"DAO instance must have 'connector' attribute. "
                    f"Ensure {instance.__class__.__name__}.__init__() sets self.connector"
                )

            # Get connection factory based on operation type
            conn_factory = (
                connector.get_write_connection
                if self.is_write
                else connector.get_read_connection
            )

            # Inject connection and manage transaction lifecycle
            with conn_factory() as conn:
                if self.is_write:
                    # Write operations: wrap in transaction
                    with conn.begin():
                        return func(instance, conn, *args, **kwargs)
                else:
                    # Read operations: no transaction needed
                    return func(instance, conn, *args, **kwargs)

        return wrapper


