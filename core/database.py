from collections.abc import Generator

from models import LearningUnit, UnitSolution, UserProgress, UserSolution
from sqlalchemy.orm import Session, declarative_base, sessionmaker
from utils.mongo_helper import MongoHelper
from utils.sqlite_helper import SqliteHelper


class DatabaseState:
    """Container for database connection state."""

    mongo_helper: MongoHelper | None = None


_db_state = DatabaseState()

# SQLAlchemy ORM Base for IAM models
Base = declarative_base()

# SQLite setup (synchronous, initialized at module level)
sqlite_helper = SqliteHelper()
engine = sqlite_helper.get_engine()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


async def init_db():
    """Initialize the MongoDB connection (async only)."""
    # Create MongoHelper with document models
    _db_state.mongo_helper = MongoHelper(document_models=[LearningUnit, UnitSolution, UserSolution, UserProgress])

    # Initialize MongoDB connection + bind to Beanie
    await _db_state.mongo_helper.init()


def get_mongo_helper() -> MongoHelper | None:
    """Get the MongoHelper instance."""
    return _db_state.mongo_helper


def get_db() -> Generator[Session, None, None]:
    """Dependency for database session.

    Yields:
        Session: SQLAlchemy database session

    Note:
        Session is automatically closed after request completes.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
