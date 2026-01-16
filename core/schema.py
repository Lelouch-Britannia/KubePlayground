from pydantic import BaseModel, Field
from typing import List, Optional, Literal, Dict, Any
from datetime import datetime


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
    options: List[QuizOptionResponse]


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
    difficulty: Optional[Literal["beginner", "intermediate", "advanced"]] = None


class SyllabusResponse(BaseModel):
    """Complete syllabus with all units."""
    units: List[SyllabusItemResponse]
    total: int


class UnitDetailResponse(BaseModel):
    """Full unit content (excludes solutions)."""
    slug: str
    title: str
    topic: str
    order_index: int
    type: Literal["conceptual", "coding"]
    difficulty: Optional[Literal["beginner", "intermediate", "advanced"]] = None
    description: str
    steps: Optional[List[str]] = None
    hints: Optional[List[str]] = None
    quizzes: Optional[List[QuizResponse]] = None
    editor_config: Optional[EditorConfigResponse] = None


# ============================================================================
# Grading API Schemas (Quiz and code validation)
# ============================================================================

class QuizSubmissionRequest(BaseModel):
    """Submit quiz answers for grading."""
    unit_slug: str
    user_id: str  # Session ID or authenticated user ID
    answers: Dict[str, str]  # {quiz_id: selected_option_id}


class QuizResultItem(BaseModel):
    """Individual quiz result."""
    quiz_id: str
    is_correct: bool
    selected_answer: str
    correct_answer: str
    explanation: Optional[str] = None


class QuizSubmissionResponse(BaseModel):
    """Quiz grading results."""
    total_questions: int
    correct_answers: int
    score_percentage: float
    results: List[QuizResultItem]
    passed: bool  # True if score >= 70%


class CodeVerificationRequest(BaseModel):
    """Submit YAML code for validation (Phase 6 - stub for now)."""
    unit_slug: str
    user_id: str
    code: str
    language: str = "yaml"


class CodeVerificationResponse(BaseModel):
    """Code validation results (stubbed for Phase 2)."""
    is_valid: bool
    message: str
    errors: Optional[List[str]] = None


# ============================================================================
# Solutions API Schemas (Auto-save and history)
# ============================================================================

class AutosaveRequest(BaseModel):
    """Auto-save user's work in progress."""
    unit_slug: str
    user_id: str
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
    saves: List[SolutionHistoryItem]
    total_saves: int


class RestoreSolutionRequest(BaseModel):
    """Restore code from specific save point."""
    unit_slug: str
    user_id: str
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
    user_id: str
    unit_slug: str
    status: Literal["not_started", "in_progress", "completed"]
    score: Optional[float] = None  # Quiz score percentage
    time_spent_seconds: Optional[int] = None


class ProgressUpdateResponse(BaseModel):
    """Progress update confirmation."""
    updated_at: datetime
    message: str = "Progress updated successfully"


class UnitProgressItem(BaseModel):
    """Progress for single unit."""
    unit_slug: str
    status: Literal["not_started", "in_progress", "completed"]
    last_accessed: Optional[datetime] = None
    quiz_score: Optional[float] = None
    attempts: int = 0
    time_spent_seconds: int = 0


class UserProgressResponse(BaseModel):
    """Complete user progress across all units."""
    user_id: str
    units: List[UnitProgressItem]
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
    units: List[SyllabusItemResponse]  # Units in this topic


class DashboardResponse(BaseModel):
    """Complete dashboard view with topic-grouped progress."""
    user_id: str
    greeting: str  # "Welcome back, User!"
    topics: List[TopicProgressSummary]
    overall_completion: float  # Overall percentage
    total_units: int
    completed_count: int
    in_progress_count: int
    current_streak: int = 0  # Placeholder for future
