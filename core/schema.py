from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


# ============================================================================
# Content API Schemas (Read-only learning content)
# ============================================================================


class QuizOptionResponse(BaseModel):
    """Quiz option for frontend display."""

    id: str
    text: str


class QuizResponse(BaseModel):
    """Quiz question without answers (public)."""

    id: str
    question: str
    options: list[QuizOptionResponse]


class EditorConfigResponse(BaseModel):
    """Code editor initial state."""

    initial_code: str
    language: str


class SyllabusItemResponse(BaseModel):
    """Compact unit info for syllabus listing."""

    slug: str
    title: str
    topic: str
    order_index: int
    type: Literal["conceptual", "coding"]
    difficulty: Literal["beginner", "intermediate", "advanced"] | None = None


class SyllabusResponse(BaseModel):
    """Complete syllabus with all units."""

    units: list[SyllabusItemResponse]
    total: int


class UnitDetailResponse(BaseModel):
    """Full unit content (excludes solutions)."""

    slug: str
    title: str
    topic: str
    order_index: int
    type: Literal["conceptual", "coding"]
    difficulty: Literal["beginner", "intermediate", "advanced"] | None = None
    description: str
    steps: list[str] | None = None
    hints: list[str] | None = None
    quizzes: list[QuizResponse] | None = None
    editor_config: EditorConfigResponse | None = None


# ============================================================================
# Grading API Schemas (Quiz and code validation)
# ============================================================================


class QuizSubmissionRequest(BaseModel):
    """Submit quiz answers for grading."""

    unit_slug: str
    answers: dict[str, str]  # {quiz_id: selected_option_id}


class QuizResultItem(BaseModel):
    """Individual quiz result."""

    quiz_id: str
    is_correct: bool
    selected_answer: str
    correct_answer: str
    explanation: str | None = None


class QuizSubmissionResponse(BaseModel):
    """Quiz grading results."""

    total_questions: int
    correct_answers: int
    score_percentage: float
    results: list[QuizResultItem]
    passed: bool  # True if score >= 70%


class CodeVerificationRequest(BaseModel):
    """Submit YAML code for validation (Phase 6 - stub for now)."""

    unit_slug: str
    code: str
    language: str = "yaml"


class CodeVerificationResponse(BaseModel):
    """Code validation results (stubbed for Phase 2)."""

    is_valid: bool
    message: str
    errors: list[str] | None = None


# ============================================================================
# Solutions API Schemas (Auto-save and history)
# ============================================================================


class AutosaveRequest(BaseModel):
    """Auto-save user's work in progress."""

    unit_slug: str
    code: str
    language: str = "yaml"


class AutosaveResponse(BaseModel):
    """Auto-save confirmation."""

    saved_at: datetime
    version: int  # Incremental version number
    message: str = "Auto-saved successfully"


class SolutionHistoryItem(BaseModel):
    """Single save point in history."""

    version: int
    saved_at: datetime
    code_preview: str  # First 100 chars


class SolutionHistoryResponse(BaseModel):
    """List of all save points for a unit."""

    unit_slug: str
    saves: list[SolutionHistoryItem]
    total_saves: int


class RestoreSolutionRequest(BaseModel):
    """Restore code from specific save point."""

    unit_slug: str
    version: int


class RestoreSolutionResponse(BaseModel):
    """Restored code."""

    code: str
    language: str
    saved_at: datetime
    version: int


# ============================================================================
# Progress API Schemas (User completion tracking)
# ============================================================================


class ProgressUpdateRequest(BaseModel):
    """Update user progress for a unit."""

    unit_slug: str
    status: Literal["started", "completed"]  # Must match UserProgress model
    score: float | None = None  # Quiz score percentage
    time_spent_seconds: int | None = None


class ProgressUpdateResponse(BaseModel):
    """Progress update confirmation."""

    updated_at: datetime
    message: str = "Progress updated successfully"


class UnitProgressItem(BaseModel):
    """Progress for single unit."""

    unit_slug: str
    status: Literal["started", "completed"]  # Must match UserProgress model
    last_accessed: datetime | None = None
    quiz_score: float | None = None
    attempts: int = 0
    time_spent_seconds: int = 0


class UserProgressResponse(BaseModel):
    """Complete user progress across all units."""

    user_id: str
    units: list[UnitProgressItem]
    total_completed: int
    total_units: int
    overall_completion_percentage: float


# ============================================================================
# Dashboard API Schemas (Topic-grouped progress overview)
# ============================================================================


class TopicProgressSummary(BaseModel):
    """Progress summary for a single topic/chapter."""

    topic: str  # "Pods", "Deployments", etc.
    total_units: int
    completed_units: int
    in_progress_units: int
    completion_percentage: float
    units: list[SyllabusItemResponse]  # Units in this topic


class DashboardResponse(BaseModel):
    """Complete dashboard view with topic-grouped progress."""

    user_id: str
    greeting: str  # "Welcome back, User!"
    topics: list[TopicProgressSummary]
    overall_completion: float  # Overall percentage
    total_units: int
    completed_count: int
    in_progress_count: int
    current_streak: int = 0  # Placeholder for future
