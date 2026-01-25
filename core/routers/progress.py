import logging
from datetime import datetime, timezone
from typing import Annotated

from auth.dependencies import get_current_user
from auth.models import User
from fastapi import APIRouter, Depends, HTTPException
from models import LearningUnit, UserProgress
from schema import ProgressUpdateRequest, ProgressUpdateResponse, UnitProgressItem, UserProgressResponse
from starlette import status


router = APIRouter(prefix="/api/progress", tags=["progress"])
logger = logging.getLogger(__name__)

# Dependency injection for authenticated user
current_user_dependency = Annotated[User, Depends(get_current_user)]


@router.post("/update")
async def update_progress(
    request: ProgressUpdateRequest,
    current_user: current_user_dependency,
) -> ProgressUpdateResponse:
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
        UserProgress.user_id == str(current_user.id),
        UserProgress.unit_id == unit.id,
    )

    now = datetime.now(tz=timezone.utc)

    if existing:
        # Update existing record
        existing.status = request.status  # type: ignore
        if request.score is not None:
            existing.score = int(request.score)
        if request.status == "completed":
            existing.completed_at = now
        await existing.save()
    else:
        # Create new record
        progress = UserProgress(
            user_id=str(current_user.id),
            unit_id=unit.id,  # type: ignore
            status=request.status,  # type: ignore
            score=int(request.score) if request.score else None,
            completed_at=now if request.status == "completed" else None,
        )
        await progress.insert()

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
    progress_records = await UserProgress.find(UserProgress.user_id == str(current_user.id)).to_list()

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
                quiz_score=float(prog.score) if prog.score else None,
                attempts=1,
                time_spent_seconds=0,
            )
        )

    total_units = len(all_units)
    completion_pct = (completed_count / total_units * 100) if total_units > 0 else 0.0

    return UserProgressResponse(
        user_id=str(current_user.id),
        units=progress_items,
        total_completed=completed_count,
        total_units=total_units,
        overall_completion_percentage=round(completion_pct, 1),
    )
