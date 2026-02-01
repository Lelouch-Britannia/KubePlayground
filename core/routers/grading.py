import json
import logging
from datetime import datetime, timezone
from typing import Annotated

from auth.dependencies import db_dependency, get_current_user
from auth.models import ActivityLog, User, UserActivity
from database import get_db
from fastapi import APIRouter, Depends, HTTPException, Request
from models import LearningUnit, UnitSolution
from schema import (
    CodeVerificationRequest,
    CodeVerificationResponse,
    QuizResultItem,
    QuizSubmissionRequest,
    QuizSubmissionResponse,
)
from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette import status
from utils.constants import Constants


# Rate limiter instance
limiter = Limiter(key_func=get_remote_address)

router = APIRouter(prefix="/grading", tags=["grading"])
logger = logging.getLogger(__name__)

# Dependency injection for authenticated user
current_user_dependency = Annotated[User, Depends(get_current_user)]


@router.post("/quiz/submit")
@limiter.limit("30/minute")  # Prevent quiz spam for points farming
async def submit_quiz(
    request: Request,
    submission: QuizSubmissionRequest,
    current_user: current_user_dependency,
    db: db_dependency,
) -> QuizSubmissionResponse:
    """Grade quiz submission by comparing against UnitSolution answer keys.

    Args:
        submission: Quiz answers to grade
        current_user: Authenticated user
        db: Database session

    Requires:
        Authorization: Bearer <token> header

    Args:
        request: FastAPI Request object (for rate limiting)
        submission: QuizSubmissionRequest with unit_slug and answers dict
        current_user: Authenticated user (required for authorization)

    Returns:
        QuizSubmissionResponse: Detailed results with score and explanations

    Raises:
        HTTPException 404: Unit or solution not found
        HTTPException 400: Invalid quiz IDs in submission

    Security:
        - Retrieves answers from UnitSolution (NEVER exposed to frontend)
        - Returns only grading results, not raw answer keys
    """
    # Find unit by slug
    unit = await LearningUnit.find_one(LearningUnit.slug == submission.unit_slug)
    if not unit:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"Learning unit not found: {submission.unit_slug}"
        )

    # Find solution with answer keys
    solution = await UnitSolution.find_one(UnitSolution.unit_id == unit.id)
    if not solution or not solution.quiz_answers:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quiz answers not found for this unit")

    # Grade each answer
    results = []
    correct_count = 0

    for quiz_id, selected_answer in submission.answers.items():
        correct_answer = solution.quiz_answers.get(quiz_id)
        if not correct_answer:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid quiz ID: {quiz_id}")

        is_correct = selected_answer == correct_answer
        if is_correct:
            correct_count += 1

        explanation = solution.quiz_explanations.get(quiz_id) if solution.quiz_explanations else None

        results.append(
            QuizResultItem(
                quiz_id=quiz_id,
                is_correct=is_correct,
                selected_answer=selected_answer,
                correct_answer=correct_answer,
                explanation=explanation,
            )
        )

    total_questions = len(submission.answers)
    score_percentage = (correct_count / total_questions * 100) if total_questions > 0 else 0.0
    passed = score_percentage >= Constants.AppConstants.PASSING_SCORE_THRESHOLD

    response = QuizSubmissionResponse(
        total_questions=total_questions,
        correct_answers=correct_count,
        score_percentage=score_percentage,
        results=results,
        passed=passed,
    )

    # Check if user has already passed this quiz before (no double points)
    previous_pass = (
        db.query(ActivityLog)
        .filter(
            ActivityLog.user_id == current_user.id,
            ActivityLog.activity_type == "quiz_submission",
            ActivityLog.unit_slug == submission.unit_slug,
            ActivityLog.score_percentage >= Constants.AppConstants.PASSING_SCORE_THRESHOLD,
        )
        .first()
    )

    is_first_pass = previous_pass is None and passed

    # Award points based on correct answers (+1 per correct), only on first pass
    points_earned = correct_count * Constants.AppConstants.QUIZ_POINTS_PER_CORRECT if is_first_pass else 0

    # Store detailed results in metadata for later retrieval
    results_data = {
        "total_questions": total_questions,
        "correct": correct_count,
        "answers": submission.answers,  # User's selected answers
        "results": [
            {
                "quiz_id": r.quiz_id,
                "is_correct": r.is_correct,
                "correct_answer": r.correct_answer,
            }
            for r in results
        ],
    }

    activity_log = ActivityLog(
        user_id=current_user.id,
        activity_type="quiz_submission",
        unit_slug=submission.unit_slug,
        points_earned=points_earned,
        score_percentage=int(score_percentage),
        activity_metadata=json.dumps(results_data),
        created_at=datetime.now(timezone.utc),
    )
    db.add(activity_log)

    # Update daily activity aggregation
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    user_activity = (
        db.query(UserActivity)
        .filter(UserActivity.user_id == current_user.id, UserActivity.activity_date == today)
        .first()
    )

    logger.info(
        "Quiz submission - user_id: %s, today: %s, existing activity: %s",
        current_user.id,
        today,
        user_activity is not None,
    )

    if user_activity:
        user_activity.quiz_attempts += 1
        if is_first_pass:
            user_activity.quiz_passes += 1
            user_activity.total_points += points_earned
        user_activity.updated_at = datetime.now(timezone.utc)
    else:
        user_activity = UserActivity(
            user_id=current_user.id,
            activity_date=today,
            total_points=points_earned if is_first_pass else 0,
            quiz_attempts=1,
            quiz_passes=1 if is_first_pass else 0,
            created_at=datetime.now(timezone.utc),
        )
        logger.info("Creating NEW UserActivity: user_id=%s, date=%s, points=%s", current_user.id, today, points_earned)
        db.add(user_activity)

    db.commit()

    return response


@router.get("/quiz/{unit_slug}/last-submission")
async def get_last_quiz_submission(
    unit_slug: str,
    current_user: current_user_dependency,
    db: db_dependency,
):
    """Get the last quiz submission for a unit.

    Returns the stored quiz results including selected answers and correctness.

    Requires:
        Authorization: Bearer <token> header

    Returns:
        Quiz results from last submission or None if no submission found
    """
    # Find most recent quiz submission for this unit
    last_activity = (
        db.query(ActivityLog)
        .filter(
            ActivityLog.user_id == current_user.id,
            ActivityLog.activity_type == "quiz_submission",
            ActivityLog.unit_slug == unit_slug,
        )
        .order_by(ActivityLog.created_at.desc())
        .first()
    )

    if not last_activity or not last_activity.activity_metadata:
        return None

    # Parse and return the stored results (only user's answers and correctness, not correct answers)
    try:
        metadata = json.loads(last_activity.activity_metadata)
        # Filter results to only include is_correct flag, not correct_answer
        results = [
            {
                "quiz_id": r["quiz_id"],
                "is_correct": r["is_correct"],
            }
            for r in metadata.get("results", [])
        ]
        return {
            "answers": metadata.get("answers", {}),  # User's selected answers
            "results": results,
            "score_percentage": last_activity.score_percentage,
        }
    except (json.JSONDecodeError, KeyError):
        return None


@router.post("/code/verify")
async def verify_code(
    _request: CodeVerificationRequest,
    _current_user: current_user_dependency,
) -> CodeVerificationResponse:
    """Verify YAML code submission (STUB for Phase 2 - full implementation in Phase 6).

    Requires:
        Authorization: Bearer <token> header

    Args:
        _request: CodeVerificationRequest with unit_slug, code, language (unused in stub)
        _current_user: Authenticated user (required for authorization)

    Returns:
        CodeVerificationResponse: Validation results (stubbed response)

    Note:
        Phase 6 will implement actual K8s YAML validation via validation-service.
        For now, returns mock success response.
    """
    # Stub implementation - always return success
    return CodeVerificationResponse(
        is_valid=True,
        message="Code validation deferred to Phase 6. Validation-service integration pending.",
        errors=None,
    )
