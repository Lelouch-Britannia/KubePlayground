import logging

from auth.dependencies import db_dependency
from auth.models import Course
from fastapi import APIRouter, HTTPException
from models import LearningUnit
from schema import (
    EditorConfigResponse,
    # QuizOptionResponse,  # quiz/grading feature commented out
    # QuizResponse,  # quiz/grading feature commented out
    SyllabusItemResponse,
    SyllabusResponse,
    UnitDetailResponse,
)
from starlette import status


router = APIRouter(prefix="/units", tags=["content"])
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
async def get_unit_detail(slug: str, db: db_dependency) -> UnitDetailResponse:
    """Get full details for specific learning unit (excludes solutions).

    Args:
        slug: Unique unit identifier (URL-friendly)
        db: SQLite database session (used for course slug lookup)

    Returns:
        UnitDetailResponse: Complete unit content without answer keys

    Raises:
        HTTPException 404: Unit not found
    """
    unit = await LearningUnit.find_one(LearningUnit.slug == slug)
    if not unit:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Learning unit not found")

    course_slug = None
    if unit.course_id:
        course = db.query(Course).filter(Course.id == unit.course_id).first()
        if course:
            course_slug = course.slug

    return UnitDetailResponse(**unit.model_dump(), course_slug=course_slug)
