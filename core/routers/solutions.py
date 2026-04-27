import logging
from datetime import datetime, timezone
from typing import Annotated, Optional

from auth.dependencies import get_current_user
from auth.models import User
from fastapi import APIRouter, Depends, HTTPException, Request
from models import LearningUnit, UserSolution
from schema import (
    AutosaveRequest,
    AutosaveResponse,
    RestoreSolutionRequest,
    RestoreSolutionResponse,
    SolutionHistoryItem,
    SolutionHistoryResponse,
)
from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette import status


# Rate limiter instance
limiter = Limiter(key_func=get_remote_address)

router = APIRouter(prefix="/solutions", tags=["solutions"])
logger = logging.getLogger(__name__)

# Dependency injection for authenticated user
current_user_dependency = Annotated[User, Depends(get_current_user)]


@router.post("/autosave")
@limiter.limit("60/minute")  # Allow frequent autosaves but prevent abuse
async def autosave_solution(
    request: Request,  # noqa: ARG001
    autosave_req: AutosaveRequest,
    current_user: current_user_dependency,
) -> AutosaveResponse:
    """Auto-save user's work in progress to MongoDB.

    Creates new version or updates latest save.

    Requires:
        Authorization: Bearer <token> header

    Args:
        request: FastAPI Request object (for rate limiting)
        autosave_req: AutosaveRequest with unit_slug, code, language
        current_user: Authenticated user from JWT token

    Returns:
        AutosaveResponse: Save confirmation with timestamp and version
    """
    # Find unit by slug
    unit = await LearningUnit.find_one(LearningUnit.slug == autosave_req.unit_slug)
    if not unit:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"Learning unit not found: {autosave_req.unit_slug}"
        )

    # Find latest version for this user+unit
    latest = (
        await UserSolution.find(
            UserSolution.user_id == current_user.id,
            UserSolution.unit_id == unit.id,
        )
        .sort(-UserSolution.version)
        .first_or_none()
    )  # type: ignore

    # Increment version
    new_version = (latest.version + 1) if latest else 1
    now = datetime.now(tz=timezone.utc)

    # Create new save
    solution = UserSolution(
        user_id=current_user.id,
        unit_id=unit.id,  # type: ignore
        content=autosave_req.code,
        version=new_version,
        auto_saved_at=now,
    )
    await solution.insert()

    return AutosaveResponse(saved_at=now, version=new_version, message="Auto-saved successfully")


@router.get("/{unit_slug}/history")
async def get_solution_history(
    unit_slug: str,
    current_user: current_user_dependency,
) -> SolutionHistoryResponse:
    """Get all save points for authenticated user's work on specific unit.

    Requires:
        Authorization: Bearer <token> header

    Args:
        unit_slug: Unit identifier
        current_user: Authenticated user from JWT token

    Returns:
        SolutionHistoryResponse: List of all saves with previews

    Raises:
        HTTPException 404: No saves found for this unit/user
    """
    # Find unit by slug
    unit = await LearningUnit.find_one(LearningUnit.slug == unit_slug)
    if not unit:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Learning unit not found: {unit_slug}")

    # Find all saves for this user+unit
    saves = (
        await UserSolution.find(
            UserSolution.user_id == current_user.id,
            UserSolution.unit_id == unit.id,
        )
        .sort(-UserSolution.version)
        .to_list()
    )  # type: ignore

    # Build history items with previews (return empty list if no saves)
    history_items = [
        SolutionHistoryItem(
            version=save.version,
            saved_at=save.auto_saved_at,
            code_preview=save.content[:100] if save.content else "",
            content=save.content or "",
        )
        for save in saves
    ]

    return SolutionHistoryResponse(unit_slug=unit_slug, saves=history_items, total_saves=len(history_items))


@router.get("/{unit_slug}/latest")
async def get_latest_solution(
    unit_slug: str,
    current_user: current_user_dependency,
) -> RestoreSolutionResponse:
    """Get the most recent saved solution for a unit.

    Requires:
        Authorization: Bearer <token> header

    Args:
        unit_slug: Unit identifier
        current_user: Authenticated user from JWT token

    Returns:
        RestoreSolutionResponse: Latest saved code

    Raises:
        HTTPException 404: No saves found for this unit
    """
    # Find unit by slug
    unit = await LearningUnit.find_one(LearningUnit.slug == unit_slug)
    if not unit:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Learning unit not found: {unit_slug}")

    # Find latest save for this user+unit
    latest = (
        await UserSolution.find(
            UserSolution.user_id == current_user.id,
            UserSolution.unit_id == unit.id,
        )
        .sort(-UserSolution.version)
        .first_or_none()
    )  # type: ignore

    if not latest:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No saved solution found for this unit")

    return RestoreSolutionResponse(
        code=latest.content, language="yaml", saved_at=latest.auto_saved_at, version=latest.version
    )


@router.post("/{unit_slug}/restore")
async def restore_solution(
    unit_slug: str,
    request: RestoreSolutionRequest,
    current_user: current_user_dependency,
) -> RestoreSolutionResponse:
    """Restore code from specific save point.

    Requires:
        Authorization: Bearer <token> header

    Args:
        unit_slug: Unit identifier (must match request)
        request: RestoreSolutionRequest with version
        current_user: Authenticated user from JWT token

    Returns:
        RestoreSolutionResponse: Complete code from requested version

    Raises:
        HTTPException 404: Save version not found
        HTTPException 400: Slug mismatch
    """
    # Validate slug match
    if unit_slug != request.unit_slug:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Unit slug in path does not match request body"
        )

    # Find unit by slug
    unit = await LearningUnit.find_one(LearningUnit.slug == unit_slug)
    if not unit:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Learning unit not found: {unit_slug}")

    # Find specific version
    solution = await UserSolution.find_one(
        UserSolution.user_id == current_user.id,
        UserSolution.unit_id == unit.id,
        UserSolution.version == request.version,
    )

    if not solution:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Save version {request.version} not found")

    return RestoreSolutionResponse(
        code=solution.content, language="yaml", saved_at=solution.auto_saved_at, version=solution.version
    )
