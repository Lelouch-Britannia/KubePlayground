from datetime import datetime, timezone
from typing import Any, Literal, Optional

from beanie import Document, PydanticObjectId
from pydantic import BaseModel, Field
from pymongo import ASCENDING, IndexModel


class QuizOption(BaseModel):
    """Quiz option with stable ID for answer matching. Frontend can shuffle order."""

    id: str  # Stable identifier: "a", "b", "c", "d"
    text: str


class Quiz(BaseModel):
    """Quiz question (public - no answers). Options can be displayed in random order."""

    id: str  # Unique within unit: "q1", "q2", etc.
    question: str
    options: list[QuizOption]  # Frontend randomizes display order


class EditorConfig(BaseModel):
    """Code editor initial configuration."""

    initial_code: str
    language: str


class LearningUnit(Document):
    """Public content - safe for frontend (NEVER includes answer keys)."""

    slug: str  # URL-friendly unique identifier
    title: str = Field(max_length=50, min_length=3)
    topic: str = Field(max_length=50, min_length=3)
    order_index: int = Field(gt=-1)
    type: Literal["conceptual", "coding"]
    difficulty: Literal["beginner", "intermediate", "advanced"] | None = None
    description: str = Field(max_length=5000)
    steps: list[str] | None = None  # For coding exercises
    hints: list[str] | None = None  # Hints for coding exercises
    quizzes: list[Quiz] | None = None  # For conceptual modules
    editor_config: EditorConfig | None = None  # For coding exercises

    class Settings:
        """Beanie collection settings."""

        name = "learning_units"
        indexes = [
            IndexModel([("slug", ASCENDING)], unique=True),  # Unique constraint
            IndexModel([("topic", ASCENDING), ("order_index", ASCENDING)]),  # Syllabus queries
        ]


class UnitSolution(Document):
    """Private answer keys and validation scripts - NEVER exposed to frontend."""

    unit_id: PydanticObjectId  # Foreign key to LearningUnit
    quiz_answers: dict[str, str] | None = None  # {"q1": "a", "q2": "c"} - quiz_id -> correct_option_id
    quiz_explanations: dict[str, str] | None = None  # {"q1": "Because...", "q2": "The reason..."} - shown after grading
    code_solution: str | None = None  # Model answer for coding exercises
    validation_script: str | None = None  # Hidden test script for code validation

    class Settings:
        """Beanie collection settings."""

        name = "unit_solutions"
        indexes = [
            IndexModel([("unit_id", ASCENDING)], unique=True),  # One solution per unit
        ]


class UserSolution(Document):
    """User submissions with versioning and auto-save support."""

    user_id: str  # Placeholder session ID (no auth yet)
    unit_id: PydanticObjectId  # Foreign key to LearningUnit
    content: str  # User's code OR quiz selections (JSON string)
    version: int = Field(default=1)  # Auto-increment for version history
    auto_saved_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))

    class Settings:
        """Beanie collection settings."""

        name = "user_solutions"
        indexes = [
            IndexModel([("user_id", ASCENDING), ("unit_id", ASCENDING), ("version", ASCENDING)]),
        ]


class UserProgress(Document):
    """Permanent record of user completion and scores."""

    user_id: str  # Placeholder session ID (no auth yet)
    unit_id: PydanticObjectId  # Foreign key to LearningUnit
    status: Literal["started", "completed"]
    score: int | None = None  # Percentage (0-100) for quizzes
    completed_at: datetime | None = None

    class Settings:
        """Beanie collection settings."""

        name = "user_progress"
        indexes = [
            IndexModel([("user_id", ASCENDING), ("unit_id", ASCENDING)], unique=True),  # One progress per user per unit
        ]
