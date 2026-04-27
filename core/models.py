from datetime import datetime, timezone
from typing import Any, Literal, Optional

from beanie import Document, PydanticObjectId
from pydantic import BaseModel, Field
from pymongo import ASCENDING, IndexModel


# class QuizOption(BaseModel):
#     """Quiz option with stable ID for answer matching. Frontend can shuffle order."""
#
#     id: str  # Stable identifier: "a", "b", "c", "d"
#     text: str
#
#
# class Quiz(BaseModel):
#     """Quiz question (public - no answers). Options can be displayed in random order."""
#
#     id: str  # Unique within unit: "q1", "q2", etc.
#     question: str
#     options: list[QuizOption]  # Frontend randomizes display order


class EditorConfig(BaseModel):
    """Code editor initial configuration."""

    initial_code: str
    language: str


class LearningUnit(Document):
    """Public content - safe for frontend (NEVER includes answer keys).

    Cross-Database Foreign Keys:
        - course_id: References SQLite courses.id (application-level, not enforced)
        - topic_id: References SQLite topics.id (application-level, not enforced)
    """

    slug: str  # URL-friendly unique identifier
    title: str = Field(max_length=50, min_length=3)
    topic: str = Field(max_length=50, min_length=3)  # Deprecated: Use topic_id, kept for backward compatibility
    order_index: int = Field(gt=-1)
    type: Literal["conceptual", "coding"]
    difficulty: Literal["beginner", "intermediate", "advanced"] | None = None
    description: str = Field(max_length=5000)
    steps: list[str] | None = None  # For coding exercises
    hints: list[str] | None = None  # Hints for coding exercises
    # quizzes: list[Quiz] | None = None  # For conceptual modules (quiz/grading feature commented out)
    editor_config: EditorConfig | None = None  # For coding exercises

    # Course/Topic Hierarchy (cross-database FKs)
    course_id: int | None = None  # FK to SQLite courses.id
    topic_id: int | None = None  # FK to SQLite topics.id

    class Settings:
        """Beanie collection settings."""

        name = "learning_units"
        indexes = [
            IndexModel([("slug", ASCENDING)], unique=True),  # Unique constraint
            IndexModel([("topic", ASCENDING), ("order_index", ASCENDING)]),  # Legacy syllabus queries
            IndexModel([("topic_id", ASCENDING), ("order_index", ASCENDING)]),  # Topic-based queries
            IndexModel([("course_id", ASCENDING)]),  # Course-based queries
        ]


# ============================================================================
# UnitSolution — kept active for validation script lookup
# ============================================================================
class UnitSolution(Document):
    """Private answer keys and validation scripts - NEVER exposed to frontend."""

    unit_id: PydanticObjectId  # Foreign key to LearningUnit
    # quiz_answers: dict[str, str] | None = None  # quiz/grading feature commented out
    # quiz_explanations: dict[str, str] | None = None  # quiz/grading feature commented out
    code_solution: str | None = None  # Model answer for coding exercises
    validation_script: str | None = None  # Hidden test script for code validation

    class Settings:
        """Beanie collection settings."""

        name = "unit_solutions"
        indexes = [
            IndexModel([("unit_id", ASCENDING)], unique=True),  # One solution per unit
        ]


class UserSubmission(Document):
    """Record of each code validation attempt by a user."""

    user_id: int  # FK to SQLite User.id
    unit_id: PydanticObjectId  # FK to LearningUnit
    unit_slug: str  # Denormalised for fast lookup without join
    code: str
    language: str = "yaml"
    status: Literal["passed", "failed", "error"]
    submitted_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))

    class Settings:
        """Beanie collection settings."""

        name = "user_submissions"
        indexes = [
            IndexModel([("user_id", ASCENDING), ("unit_slug", ASCENDING), ("submitted_at", ASCENDING)]),
        ]


class UserProgress(Document):
    """Permanent record of user completion and scores.

    Cross-Database Foreign Key:
        user_id references SQLite users.id (integer auto-increment PK)
        No built-in FK constraint - validation must be done at application layer
        See database.validate_user_exists() for reference integrity checks
    """

    user_id: int  # Foreign key to SQLite User.id (integer auto-increment)
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
