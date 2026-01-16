from fastapi import APIRouter, HTTPException
from starlette import status
import logging
from typing import Optional
from datetime import datetime
from models import UserSolution, LearningUnit
from schema import (
    AutosaveRequest, AutosaveResponse,
    SolutionHistoryResponse, SolutionHistoryItem,
    RestoreSolutionRequest, RestoreSolutionResponse
)

router = APIRouter(prefix="/api/solutions", tags=["solutions"])
logger = logging.getLogger(__name__)


@router.post("/autosave", response_model=AutosaveResponse)
async def autosave_solution(request: AutosaveRequest) -> AutosaveResponse:
    """
    Auto-save user's work in progress to MongoDB.
    Creates new version or updates latest save.
    
    Args:
        request: AutosaveRequest with unit_slug, user_id, code, language
    
    Returns:
        AutosaveResponse: Save confirmation with timestamp and version
    """
    # Find unit by slug
    unit = await LearningUnit.find_one(LearningUnit.slug == request.unit_slug)
    if not unit:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Learning unit not found: {request.unit_slug}"
        )
    
    # Find latest version for this user+unit
    latest = await UserSolution.find(
        UserSolution.user_id == request.user_id,
        UserSolution.unit_id == unit.id
    ).sort(-UserSolution.version).first_or_none() # type: ignore
    
    # Increment version
    new_version = (latest.version + 1) if latest else 1
    now = datetime.utcnow()
    
    # Create new save
    solution = UserSolution(
        user_id=request.user_id,
        unit_id=unit.id, # type: ignore
        content=request.code,
        version=new_version,
        auto_saved_at=now
    )
    await solution.insert()
    
    return AutosaveResponse(
        saved_at=now,
        version=new_version,
        message="Auto-saved successfully"
    )


@router.get("/{unit_slug}/history", response_model=SolutionHistoryResponse)
async def get_solution_history(unit_slug: str, user_id: str) -> SolutionHistoryResponse:
    """
    Get all save points for user's work on specific unit.
    
    Args:
        unit_slug: Unit identifier
        user_id: User/session identifier
    
    Returns:
        SolutionHistoryResponse: List of all saves with previews
        
    Raises:
        HTTPException 404: No saves found for this unit/user
    """
    # Find unit by slug
    unit = await LearningUnit.find_one(LearningUnit.slug == unit_slug)
    if not unit:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Learning unit not found: {unit_slug}"
        )
    
    # Find all saves for this user+unit
    saves = await UserSolution.find(
        UserSolution.user_id == user_id,
        UserSolution.unit_id == unit.id
    ).sort(-UserSolution.version).to_list() # type: ignore
    
    if not saves:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No saves found for this unit"
        )
    
    # Build history items with previews
    history_items = [
        SolutionHistoryItem(
            version=save.version,
            saved_at=save.auto_saved_at,
            code_preview=save.content[:100] if save.content else ""
        )
        for save in saves
    ]
    
    return SolutionHistoryResponse(
        unit_slug=unit_slug,
        saves=history_items,
        total_saves=len(history_items)
    )


@router.post("/{unit_slug}/restore", response_model=RestoreSolutionResponse)
async def restore_solution(unit_slug: str, request: RestoreSolutionRequest) -> RestoreSolutionResponse:
    """
    Restore code from specific save point.
    
    Args:
        unit_slug: Unit identifier (must match request)
        request: RestoreSolutionRequest with user_id and version
    
    Returns:
        RestoreSolutionResponse: Complete code from requested version
        
    Raises:
        HTTPException 404: Save version not found
        HTTPException 400: Slug mismatch
    """
    # Validate slug match
    if unit_slug != request.unit_slug:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unit slug in path does not match request body"
        )
    
    # Find unit by slug
    unit = await LearningUnit.find_one(LearningUnit.slug == unit_slug)
    if not unit:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Learning unit not found: {unit_slug}"
        )
    
    # Find specific version
    solution = await UserSolution.find_one(
        UserSolution.user_id == request.user_id,
        UserSolution.unit_id == unit.id,
        UserSolution.version == request.version
    )
    
    if not solution:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Save version {request.version} not found"
        )
    
    return RestoreSolutionResponse(
        code=solution.content,
        language="yaml",
        saved_at=solution.auto_saved_at,
        version=solution.version
    )
