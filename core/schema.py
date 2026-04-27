from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


# ============================================================================
# Content API Schemas (Read-only learning content)
# ============================================================================


# ============================================================================
# Quiz schemas commented out — quiz/grading feature disabled
# ============================================================================
# class QuizOptionResponse(BaseModel):
#     """Quiz option for frontend display."""
#
#     id: str
#     text: str
#
#
# class QuizResponse(BaseModel):
#     """Quiz question without answers (public)."""
#
#     id: str
#     question: str
#     options: list[QuizOptionResponse]


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
    # quizzes: list[QuizResponse] | None = None  # quiz/grading feature commented out
    editor_config: EditorConfigResponse | None = None


# ============================================================================
# Grading API Schemas — commented out (quiz/grading feature disabled)
# ============================================================================

# class QuizSubmissionRequest(BaseModel):
#     unit_slug: str
#     answers: dict[str, str]  # {quiz_id: selected_option_id}
#
# class QuizResultItem(BaseModel):
#     quiz_id: str
#     is_correct: bool
#     selected_answer: str
#     correct_answer: str
#     explanation: str | None = None
#
# class QuizSubmissionResponse(BaseModel):
#     total_questions: int
#     correct_answers: int
#     score_percentage: float
#     results: list[QuizResultItem]
#     passed: bool  # True if score >= 70%
#
# Quiz grading schemas — commented out (quiz/grading feature disabled)
# class CodeVerificationRequest(BaseModel): — moved to Grading section below
# class QuizSubmissionRequest, QuizSubmissionResponse — see git history


# ============================================================================
# Grading / CodeVerification Schemas
# ============================================================================


class CodeVerificationRequest(BaseModel):
    unit_slug: str
    code: str
    language: str = "yaml"


class CodeVerificationResponse(BaseModel):
    is_valid: bool
    message: str
    errors: list[str] | None = None


# ============================================================================
# Validation Service API Schemas
# ============================================================================


class ValidationTestResult(BaseModel):
    name: str
    passed: bool
    output: str
    error_output: str | None = None
    duration_ms: float


class ValidationResourceInfo(BaseModel):
    kind: str
    name: str
    namespace: str
    status: str
    ready: bool
    message: str | None = None
    age: str | None = None


class PodLogEntry(BaseModel):
    pod_name: str
    container_name: str
    logs: str
    phase: str
    ready: bool = False


class KubeEvent(BaseModel):
    type: str
    reason: str
    message: str
    object: str
    age: str
    count: int = 0


class ExecutionPhase(BaseModel):
    name: str
    status: str  # success, failed, skipped
    duration_ms: float
    output: str | None = None
    error: str | None = None


class ValidationErrorDetail(BaseModel):
    type: str | None = None
    code: str | None = None
    message: str
    details: dict[str, Any] | None = None


class ValidationRequest(BaseModel):
    request_id: str
    unit_slug: str
    user_id: int
    user_yaml: str
    validation_script: str
    language: str = "yaml"
    metadata: dict[str, Any] | None = None


class ValidationResponse(BaseModel):
    request_id: str
    is_valid: bool = False
    passed: bool = False
    message: str = ""
    apply_output: str | None = None
    resource_status: list[ValidationResourceInfo] | None = None
    pod_logs: list[PodLogEntry] | None = None
    events: list[KubeEvent] | None = None
    test_results: list[ValidationTestResult] | None = None
    validation_error: ValidationErrorDetail | None = None
    duration_ms: float = 0
    namespace: str | None = None
    phases: list[ExecutionPhase] | None = None


class ValidateOnlyRequest(BaseModel):
    unit_slug: str
    namespace: str
    code: str = ""  # Submitted code — stored in submission history
    language: str = "yaml"


class ValidateOnlyResponse(BaseModel):
    request_id: str
    namespace: str
    passed: bool = False
    message: str = ""
    test_results: list[ValidationTestResult] | None = None
    duration_ms: float = 0


class CleanupRequest(BaseModel):
    namespace: str


class CleanupResponse(BaseModel):
    status: str
    namespace: str


# ============================================================================
# Solutions API Schemas — commented out (quiz/grading feature disabled)
# ============================================================================

# class AutosaveRequest(BaseModel):
#     unit_slug: str
#     code: str
#     language: str = "yaml"
#
# class AutosaveResponse(BaseModel):
#     saved_at: datetime
#     version: int
#     message: str = "Auto-saved successfully"
#
# class SolutionHistoryItem(BaseModel):
#     version: int
#     saved_at: datetime
#     code_preview: str
#     content: str = ""
#
# class SolutionHistoryResponse(BaseModel):
#     unit_slug: str
#     saves: list[SolutionHistoryItem]
#     total_saves: int
#
# class RestoreSolutionRequest(BaseModel):
#     unit_slug: str
#     version: int
#
# class RestoreSolutionResponse(BaseModel):
#     code: str
#     language: str
#     saved_at: datetime
#     version: int


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
    # quiz_score: float | None = None  # quiz/grading feature commented out
    attempts: int = 0
    time_spent_seconds: int = 0


class UserProgressResponse(BaseModel):
    """Complete user progress across all units."""

    user_id: int  # Integer matches SQLite User.id
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
    topic_slug: str | None = None
    topic_icon: str | None = None
    topic_order: int | None = None
    total_units: int
    completed_units: int
    in_progress_units: int
    completion_percentage: float
    units: list[SyllabusItemResponse]  # Units in this topic


class CourseProgressSummary(BaseModel):
    """Progress summary for a course with its topics."""

    course_name: str
    course_slug: str
    course_description: str | None = None
    topics: list[TopicProgressSummary]


class DashboardResponse(BaseModel):
    """Complete dashboard view with course and topic-grouped progress."""

    user_id: int  # Integer matches SQLite User.id
    greeting: str  # "Welcome back, User!"
    courses: list[CourseProgressSummary]
    overall_completion: float  # Overall percentage
    total_units: int
    completed_count: int
    in_progress_count: int
    current_streak: int = 0  # Placeholder for future


# ============================================================================
# Course API Schemas (Course/topic hierarchy navigation)
# ============================================================================


class CourseInfo(BaseModel):
    """Course summary information."""

    id: int
    slug: str
    name: str
    description: str | None = None
    topics_count: int = 0
    total_units: int = 0


class TopicSummary(BaseModel):
    """Topic/chapter summary with progress stats."""

    id: int
    slug: str
    name: str
    icon: str | None = None
    order: int
    units_total: int
    units_completed: int
    progress_percentage: float


class CourseChaptersResponse(BaseModel):
    """Course with chapters and user progress."""

    course: CourseInfo
    chapters: list[TopicSummary]


class LearningUnitSummary(BaseModel):
    """Lightweight unit summary for topic listings."""

    slug: str
    title: str
    type: str
    difficulty: str | None
    order_index: int
    is_completed: bool


class TopicUnitsResponse(BaseModel):
    """Topic with its learning units."""

    topic_id: int
    topic_name: str
    topic_slug: str
    units: list[LearningUnitSummary]


# ============================================================================
# Submissions API Schemas
# ============================================================================


class SubmissionResponse(BaseModel):
    """A single code submission record."""

    id: str
    unit_slug: str
    language: str
    status: Literal["passed", "failed", "error"]
    submitted_at: datetime
    code_preview: str  # First 120 chars of submitted code


class SubmissionListResponse(BaseModel):
    """Paginated list of submissions for a unit."""

    unit_slug: str
    submissions: list[SubmissionResponse]
    total: int
