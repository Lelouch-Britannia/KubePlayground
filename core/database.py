from utils.mongo_helper import MongoHelper
from models import LearningUnit, UnitSolution, UserSolution, UserProgress

# Global connector instance
mongo_helper = None

async def init_db():
    
    """Initializes the MongoDB connection."""
    global mongo_helper
    
    # 1. Create MongoHelper with document models
    mongo_helper = MongoHelper(
        document_models=[LearningUnit, UnitSolution, UserSolution, UserProgress]
    )
    
    # 2. Initalize connection + bind to Beanie
    # Each model is bind directly to database client globally and permanently
    await mongo_helper.init()