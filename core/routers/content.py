import logging

from fastapi import APIRouter, HTTPException
from models import LearningUnit
from schema import (
    EditorConfigResponse,
    QuizOptionResponse,
    QuizResponse,
    SyllabusItemResponse,
    SyllabusResponse,
    UnitDetailResponse,
)
from starlette import status


router = APIRouter(prefix="/api/units", tags=["content"])
logger = logging.getLogger(__name__)


@router.get("/syllabus")
async def get_syllabus() -> SyllabusResponse:
    """Get complete syllabus with all learning units (overview only).

    Returns:
        SyllabusResponse: List of all units with basic metadata
    """
    results = await LearningUnit.find_all().to_list()
    syllabus_items: list[SyllabusItemResponse] = []

    for result in results:
        item = SyllabusItemResponse(
            slug=result.slug,
            title=result.title,
            topic=result.topic,
            order_index=result.order_index,
            type=result.type,
            difficulty=result.difficulty,
        )
        syllabus_items.append(item)

    return SyllabusResponse(units=syllabus_items, total=len(syllabus_items))


@router.get("/{slug}")
async def get_unit_detail(slug: str) -> UnitDetailResponse:
    """Get full details for specific learning unit (excludes solutions).

    Args:
        slug: Unique unit identifier (URL-friendly)

    Returns:
        UnitDetailResponse: Complete unit content without answer keys

    Raises:
        HTTPException 404: Unit not found
    """
    unit = await LearningUnit.find_one(LearningUnit.slug == slug)
    if not unit:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Learning unit not found")

    return UnitDetailResponse(**unit.model_dump())
