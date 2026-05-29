import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Annotated

from auth.dependencies import db_dependency, get_current_user
from auth.models import ActivityLog, User, UserActivity, UserStreak
from database import get_db
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from models import LearningUnit, UserProgress
from schema import ProgressUpdateRequest, ProgressUpdateResponse, UnitProgressItem, UserProgressResponse
from sqlalchemy.orm import Session
from starlette import status


router = APIRouter(prefix="/progress", tags=["progress"])
logger = logging.getLogger(__name__)

# Dependency injection for authenticated user
current_user_dependency = Annotated[User, Depends(get_current_user)]


def update_user_streak_background(user_id: int, activity_date: datetime) -> None:
    """Background task to update user streak calculation.

    This function runs asynchronously after the response is sent to avoid
    blocking the API response. Prevents N+1 query problem by isolating
    streak calculation from the main request/response cycle.

    Performance Optimization:
        - Moves streak calculation out of critical path
        - Separate DB session to avoid transaction conflicts
        - Only runs on completed exercises (not every activity)

    Args:
        user_id: User ID from SQLite
        activity_date: Date of the activity (normalized to midnight UTC)

    Note:
        Uses a fresh database session to avoid stale connection issues.
        Timezone handling ensures accurate day-boundary calculations.
    """
    # Create new session for background task
    from database import SessionLocal

    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        today = activity_date.replace(hour=0, minute=0, second=0, microsecond=0)

        user_streak = db.query(UserStreak).filter(UserStreak.user_id == user_id).first()

        if user_streak:
            # Check if activity was yesterday (streak continues) or today (same day)
            if user_streak.last_activity_date:
                last_activity_date = user_streak.last_activity_date
                if last_activity_date.tzinfo is None:
                    last_activity_date = last_activity_date.replace(tzinfo=timezone.utc)
                days_diff = (today - last_activity_date.replace(hour=0, minute=0, second=0, microsecond=0)).days
            else:
                days_diff = 999

            if days_diff == 0:
                # Same day activity - no streak change
                pass
            elif days_diff == 1:
                # Consecutive day - increment streak
                user_streak.current_streak += 1
                user_streak.longest_streak = max(user_streak.longest_streak, user_streak.current_streak)
                user_streak.last_activity_date = now
            else:
                # Streak broken - reset to 1
                user_streak.current_streak = 1
                user_streak.streak_start_date = now
                user_streak.last_activity_date = now

            user_streak.updated_at = now
        else:
            # First time tracking streak for this user
            user_streak = UserStreak(
                user_id=user_id,
                current_streak=1,
                longest_streak=1,
                last_activity_date=now,
                streak_start_date=now,
                updated_at=now,
            )
            db.add(user_streak)

        db.commit()
        logger.info("Background: Updated streak for user %s, current_streak=%s", user_id, user_streak.current_streak)
    except Exception:
        logger.exception("Background streak update failed for user %s", user_id)
        db.rollback()
    finally:
        db.close()


@router.post("/update")
async def update_progress(
    request: ProgressUpdateRequest,
    current_user: current_user_dependency,
    db: db_dependency,
    background_tasks: BackgroundTasks,
) -> ProgressUpdateResponse:
    """Update user progress for a learning unit.

    Args:
        request: Progress update request
        current_user: Authenticated user
        db: Database session
        background_tasks: Background task scheduler

    Returns:
        ProgressUpdateResponse: Updated progress status
    """
    """Update user progress for specific unit.

    Creates new progress record or updates existing one.

    Requires:
        Authorization: Bearer <token> header

    Args:
        request: ProgressUpdateRequest with unit_slug, status, score, time_spent
        current_user: Authenticated user from JWT token

    Returns:
        ProgressUpdateResponse: Update confirmation with timestamp
    """
    # Find unit by slug to get unit_id
    unit = await LearningUnit.find_one(LearningUnit.slug == request.unit_slug)
    if not unit:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"Learning unit not found: {request.unit_slug}"
        )

    # Find existing progress record
    existing = await UserProgress.find_one(
        UserProgress.user_id == current_user.id,
        UserProgress.unit_id == unit.id,
    )

    now = datetime.now(tz=timezone.utc)

    if existing:
        # Update existing record - don't downgrade from completed to started
        if existing.status != "completed" or request.status == "completed":
            existing.status = request.status  # type: ignore
        if request.score is not None:
            existing.score = int(request.score)
        if request.status == "completed" and not existing.completed_at:
            existing.completed_at = now
        await existing.save()
    else:
        # Create new record
        progress = UserProgress(
            user_id=current_user.id,
            unit_id=unit.id,  # type: ignore
            status=request.status,  # type: ignore
            score=int(request.score) if request.score else None,
            completed_at=now if request.status == "completed" else None,
        )
        await progress.insert()

    # Log activity to SQLite
    # Note: Points are NOT awarded here to avoid double-counting
    # - Conceptual (quiz) units: Points awarded in grading.py on first pass (1 per correct answer)
    # - Coding units: Points awarded in grading.py on successful verification (3/5/10 by difficulty)
    # scoring feature commented out — points wiring intentionally disabled
    # points_earned = 0
    activity_type = "exercise_started" if request.status == "started" else "exercise_completed"

    activity_log = ActivityLog(
        user_id=current_user.id,
        activity_type=activity_type,
        unit_slug=request.unit_slug,
        # points_earned=points_earned,  # scoring feature commented out
        score_percentage=int(request.score) if request.score else None,
        activity_metadata=json.dumps(
            {
                "unit_type": unit.type,
                "status": request.status,
            }
        ),
        created_at=now,
    )
    db.add(activity_log)

    # Update daily activity aggregation
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    user_activity = (
        db.query(UserActivity)
        .filter(UserActivity.user_id == current_user.id, UserActivity.activity_date == today)
        .first()
    )

    if user_activity:
        if request.status == "started":
            user_activity.exercises_started += 1
        elif request.status == "completed":
            user_activity.exercises_completed += 1
            # user_activity.total_points += points_earned  # scoring feature commented out
        user_activity.updated_at = now
    else:
        user_activity = UserActivity(
            user_id=current_user.id,
            activity_date=today,
            # total_points=points_earned,  # scoring feature commented out
            exercises_started=1 if request.status == "started" else 0,
            exercises_completed=1 if request.status == "completed" else 0,
            created_at=now,
        )
        db.add(user_activity)

    # Schedule streak update as background task (only for completed exercises)
    # Performance Note: This prevents N+1 query problem by moving streak calculation
    # out of the main request/response cycle. Response is sent immediately while
    # streak calculation happens asynchronously.
    if request.status == "completed":
        background_tasks.add_task(update_user_streak_background, current_user.id, today)

    db.commit()

    return ProgressUpdateResponse(updated_at=now, message="Progress updated successfully")


@router.get("/me")
async def get_user_progress(
    current_user: current_user_dependency,
) -> UserProgressResponse:
    """Get complete progress summary for authenticated user across all units.

    Requires:
        Authorization: Bearer <token> header

    Returns:
        UserProgressResponse: Progress for all units with completion stats

    Raises:
        HTTPException 404: User has no progress records
    """
    # Fetch all progress for user
    progress_records = await UserProgress.find(UserProgress.user_id == current_user.id).to_list()

    # Fetch all units to get total count and slugs
    all_units = await LearningUnit.find_all().to_list()
    unit_map = {str(unit.id): unit for unit in all_units}

    # Build progress items (return empty list if no progress)
    progress_items: list[UnitProgressItem] = []
    completed_count = 0

    for prog in progress_records:
        unit = unit_map.get(str(prog.unit_id))
        if not unit:
            continue

        if prog.status == "completed":
            completed_count += 1

        progress_items.append(
            UnitProgressItem(
                unit_slug=unit.slug,
                status=prog.status,  # type: ignore
                last_accessed=prog.completed_at,
                # quiz_score=float(prog.score) if prog.score else None,  # quiz/grading feature commented out
                attempts=1,
                time_spent_seconds=0,
            )
        )

    total_units = len(all_units)
    completion_pct = (completed_count / total_units * 100) if total_units > 0 else 0.0

    return UserProgressResponse(
        user_id=current_user.id,
        units=progress_items,
        total_completed=completed_count,
        total_units=total_units,
        overall_completion_percentage=round(completion_pct, 1),
    )
