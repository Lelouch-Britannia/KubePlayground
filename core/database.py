from models import LearningUnit, UnitSolution, UserProgress, UserSolution
from utils.mongo_helper import MongoHelper


class DatabaseState:
    """Container for database connection state."""

    mongo_helper: MongoHelper | None = None


_db_state = DatabaseState()


async def init_db():
    """Initialize the MongoDB connection."""
    # 1. Create MongoHelper with document models
    _db_state.mongo_helper = MongoHelper(document_models=[LearningUnit, UnitSolution, UserSolution, UserProgress])

    # 2. Initialize connection + bind to Beanie
    # Each model is bound directly to database client globally and permanently
    await _db_state.mongo_helper.init()


def get_mongo_helper() -> MongoHelper | None:
    """Get the MongoHelper instance."""
    return _db_state.mongo_helper
