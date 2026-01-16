from fastapi import APIRouter, HTTPException
from starlette import status
import logging
from typing import List
from models import UserProgress, LearningUnit
from schema import (
    ProgressUpdateRequest, ProgressUpdateResponse,
    UserProgressResponse, UnitProgressItem
)

router = APIRouter(prefix="/api/progress", tags=["progress"])
logger = logging.getLogger(__name__)


@router.post("/update", response_model=ProgressUpdateResponse)
async def update_progress(request: ProgressUpdateRequest) -> ProgressUpdateResponse:
    """
    Update user progress for specific unit.
    Creates new progress record or updates existing one.
    
    Args:
        request: ProgressUpdateRequest with user_id, unit_slug, status, score, time_spent
    
    Returns:
        ProgressUpdateResponse: Update confirmation with timestamp
    """
    from datetime import datetime
    
    # Find unit by slug to get unit_id
    unit = await LearningUnit.find_one(LearningUnit.slug == request.unit_slug)
    if not unit:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Learning unit not found: {request.unit_slug}"
        )
    
    # Find existing progress record
    existing = await UserProgress.find_one(
        UserProgress.user_id == request.user_id,
        UserProgress.unit_id == unit.id
    )
    
    now = datetime.utcnow()
    
    if existing:
        # Update existing record
        existing.status = request.status # type: ignore
        if request.score is not None:
            existing.score = int(request.score)
        if request.status == "completed":
            existing.completed_at = now
        await existing.save()
    else:
        # Create new record
        progress = UserProgress(
            user_id=request.user_id,
            unit_id=unit.id, # type: ignore
            status=request.status, # type: ignore
            score=int(request.score) if request.score else None,
            completed_at=now if request.status == "completed" else None
        )
        await progress.insert()
    
    return ProgressUpdateResponse(
        updated_at=now,
        message="Progress updated successfully"
    )


@router.get("/{user_id}", response_model=UserProgressResponse)
async def get_user_progress(user_id: str) -> UserProgressResponse:
    """
    Get complete progress summary for user across all units.
    
    Args:
        user_id: User/session identifier
    
    Returns:
        UserProgressResponse: Progress for all units with completion stats
        
    Raises:
        HTTPException 404: User has no progress records
    """
    # Fetch all progress for user
    progress_records = await UserProgress.find(
        UserProgress.user_id == user_id
    ).to_list()
    
    if not progress_records:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No progress found for user"
        )
    
    # Fetch all units to get total count and slugs
    all_units = await LearningUnit.find_all().to_list()
    unit_map = {str(unit.id): unit for unit in all_units}
    
    # Build progress items
    progress_items: List[UnitProgressItem] = []
    completed_count = 0
    
    for prog in progress_records:
        unit = unit_map.get(str(prog.unit_id))
        if not unit:
            continue
        
        if prog.status == "completed":
            completed_count += 1
        
        progress_items.append(UnitProgressItem(
            unit_slug=unit.slug,
            status=prog.status, # type: ignore
            last_accessed=prog.completed_at,
            quiz_score=float(prog.score) if prog.score else None,
            attempts=1,
            time_spent_seconds=0
        ))
    
    total_units = len(all_units)
    completion_pct = (completed_count / total_units * 100) if total_units > 0 else 0.0
    
    return UserProgressResponse(
        user_id=user_id,
        units=progress_items,
        total_completed=completed_count,
        total_units=total_units,
        overall_completion_percentage=round(completion_pct, 1)
    )
