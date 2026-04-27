from collections.abc import Generator

from models import LearningUnit, UserProgress  # UnitSolution, UserSolution removed (quiz/grading feature commented out)
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
    _db_state.mongo_helper = MongoHelper(
        document_models=[LearningUnit, UserProgress]
    )  # UnitSolution, UserSolution removed

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


# ============================================================================
# Cross-Database Foreign Key Validation
# ============================================================================
# MongoDB does not enforce foreign key constraints. These helper functions
# provide application-level referential integrity checks between SQLite (IAM)
# and MongoDB (content/progress).


def validate_user_exists(db: Session, user_id: int) -> bool:
    """Validate that a user exists in SQLite before creating MongoDB records.

    Args:
        db: SQLAlchemy database session
        user_id: Integer primary key from SQLite users table

    Returns:
        bool: True if user exists and is active

    Example:
        ```python
        if not validate_user_exists(db, current_user.id):
            raise HTTPException(404, "User not found")
        ```

    Note:
        This prevents orphaned records in MongoDB if a user is deleted from SQLite.
        Should be called before creating UserProgress or UserSolution documents.
    """
    # Import here to avoid circular dependency
    from auth.models import User

    user = db.query(User).filter(User.id == user_id, User.is_active == True).first()  # noqa: E712
    return user is not None


async def cascade_delete_user_data(user_id: int) -> dict[str, int]:
    """Delete all MongoDB documents associated with a user (cascade cleanup).

    This function should be called AFTER deleting the user from SQLite to
    maintain referential integrity. It removes all user-specific data from
    MongoDB collections.

    Args:
        user_id: Integer primary key from SQLite users table

    Returns:
        dict: Deletion counts for each collection
            {
                "user_progress": 10,
                "user_solutions": 25
            }

    Example:
        ```python
        # Delete user from SQLite
        db.query(User).filter(User.id == user_id).delete()
        db.commit()

        # Cascade delete from MongoDB
        deleted = await cascade_delete_user_data(user_id)
        logger.info(f"Deleted {deleted} documents for user {user_id}")
        ```

    Note:
        Uses delete_many() for efficiency when a user has many documents.
        This is a permanent operation - ensure user confirmation before calling.
    """
    progress_result = await UserProgress.find(UserProgress.user_id == user_id).delete()
    # solutions_result = await UserSolution.find(UserSolution.user_id == user_id).delete()  # quiz/grading feature commented out

    return {
        "user_progress": progress_result.deleted_count if progress_result else 0,
        # "user_solutions": solutions_result.deleted_count if solutions_result else 0,  # quiz/grading feature commented out
    }
