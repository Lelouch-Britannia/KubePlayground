import logging
from typing import Annotated

from auth.dependencies import get_current_user
from auth.models import User
from fastapi import APIRouter, Depends, HTTPException
from models import LearningUnit, UserSubmission
from schema import SubmissionListResponse, SubmissionResponse
from starlette import status


router = APIRouter(prefix="/submissions", tags=["submissions"])
logger = logging.getLogger(__name__)

current_user_dependency = Annotated[User, Depends(get_current_user)]


@router.get("/{unit_slug}")
async def get_submissions(
    unit_slug: str,
    current_user: current_user_dependency,
    limit: int = 20,
) -> SubmissionListResponse:
    """Return the authenticated user's submission history for a unit (newest first).

    Args:
        unit_slug: Unit identifier
        current_user: Authenticated user
        limit: Max records to return (default 20)

    Returns:
        SubmissionListResponse: List of submissions with status and code preview
    """
    unit = await LearningUnit.find_one(LearningUnit.slug == unit_slug)
    if not unit:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Unit not found: {unit_slug}")

    submissions = (
        await UserSubmission.find(
            UserSubmission.user_id == current_user.id,
            UserSubmission.unit_slug == unit_slug,
        )
        .sort(-UserSubmission.submitted_at)
        .limit(limit)
        .to_list()
    )

    items = [
        SubmissionResponse(
            id=str(s.id),
            unit_slug=s.unit_slug,
            language=s.language,
            status=s.status,
            submitted_at=s.submitted_at,
            code_preview=s.code[:120],
        )
        for s in submissions
    ]

    return SubmissionListResponse(
        unit_slug=unit_slug,
        submissions=items,
        total=len(items),
    )
