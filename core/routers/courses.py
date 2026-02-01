"""Course and topic browsing endpoints for curriculum navigation."""

import logging
from typing import Annotated

from auth.dependencies import db_dependency, get_current_user
from auth.models import Course, Topic, User
from fastapi import APIRouter, Depends, HTTPException
from models import LearningUnit, UserProgress
from schema import (
    CourseChaptersResponse,
    CourseInfo,
    LearningUnitSummary,
    TopicSummary,
    TopicUnitsResponse,
)
from starlette import status


router = APIRouter(prefix="/courses", tags=["courses"])
logger = logging.getLogger(__name__)

# Dependency injection for authenticated user
current_user_dependency = Annotated[User, Depends(get_current_user)]


# Endpoints


@router.get("/")
async def list_courses(db: db_dependency) -> list[CourseInfo]:
    """Get all available courses.

    Returns:
        List of all courses in the catalog with topic and unit counts
    """
    courses = db.query(Course).order_by(Course.created_at).all()

    result = []
    for course in courses:
        # Get topic count
        topics_count = db.query(Topic).filter(Topic.course_id == course.id).count()

        # Get all topic IDs for this course
        topic_ids = [t.id for t in db.query(Topic).filter(Topic.course_id == course.id).all()]

        # Get total units count from MongoDB
        total_units = 0
        if topic_ids:
            total_units = await LearningUnit.find({"topic_id": {"$in": topic_ids}}).count()

        result.append(
            CourseInfo(
                id=course.id,
                slug=course.slug,
                name=course.name,
                description=course.description,
                topics_count=topics_count,
                total_units=total_units,
            )
        )

    return result


@router.get("/{course_slug}/chapters")
async def get_course_chapters(
    course_slug: str,
    current_user: current_user_dependency,
    db: db_dependency,
) -> CourseChaptersResponse:
    """Get course with chapters (topics) and user progress.

    This endpoint provides the chapter grid view with completion stats.
    Uses SQLite for fast catalog browsing, MongoDB only for progress.

    Requires:
        Authorization: Bearer <token> header

    Args:
        course_slug: Course identifier (e.g., "kubernetes-fundamentals")
        current_user: Authenticated user
        db: SQLite database session

    Returns:
        CourseChaptersResponse: Course info with chapters and progress

    Raises:
        HTTPException 404: Course not found
    """
    # Find course in SQLite
    course = db.query(Course).filter(Course.slug == course_slug).first()
    if not course:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Course not found: {course_slug}")

    # Get all topics for this course (ordered by learning path)
    topics = db.query(Topic).filter(Topic.course_id == course.id).order_by(Topic.order_position).all()

    # Get user's completed units from MongoDB
    user_progress_records = await UserProgress.find(
        UserProgress.user_id == current_user.id, UserProgress.status == "completed"
    ).to_list()

    completed_unit_ids = {str(prog.unit_id) for prog in user_progress_records}

    # Build chapter summaries with progress
    chapters = []
    for topic in topics:
        # Get units for this topic from MongoDB
        topic_units = await LearningUnit.find(LearningUnit.topic_id == topic.id).to_list()

        units_total = len(topic_units)
        units_completed = sum(1 for unit in topic_units if str(unit.id) in completed_unit_ids)

        progress_pct = (units_completed / units_total * 100) if units_total > 0 else 0.0

        chapters.append(
            TopicSummary(
                id=topic.id,
                slug=topic.slug,
                name=topic.name,
                icon=topic.icon,
                order=topic.order_position,
                units_total=units_total,
                units_completed=units_completed,
                progress_percentage=round(progress_pct, 1),
            )
        )

    return CourseChaptersResponse(
        course=CourseInfo(id=course.id, slug=course.slug, name=course.name, description=course.description),
        chapters=chapters,
    )


@router.get("/topics/{topic_id}/units")
async def get_topic_units(
    topic_id: int,
    current_user: current_user_dependency,
    db: db_dependency,
) -> TopicUnitsResponse:
    """Get all learning units for a topic (lazy loaded).

    This endpoint loads full unit details when user clicks a chapter.
    Uses MongoDB for content retrieval with progress overlay.

    Requires:
        Authorization: Bearer <token> header

    Args:
        topic_id: Topic ID from SQLite
        current_user: Authenticated user
        db: SQLite database session

    Returns:
        TopicUnitsResponse: Topic with units and completion status

    Raises:
        HTTPException 404: Topic not found
    """
    # Find topic in SQLite
    topic = db.query(Topic).filter(Topic.id == topic_id).first()
    if not topic:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Topic not found: {topic_id}")

    # Get all units for this topic from MongoDB
    units = await LearningUnit.find(LearningUnit.topic_id == topic_id).sort(+LearningUnit.order_index).to_list()

    # Get user's completed units
    user_progress_records = await UserProgress.find(
        UserProgress.user_id == current_user.id, UserProgress.status == "completed"
    ).to_list()

    completed_unit_ids = {str(prog.unit_id) for prog in user_progress_records}

    # Build unit summaries
    unit_summaries = [
        LearningUnitSummary(
            slug=unit.slug,
            title=unit.title,
            type=unit.type,
            difficulty=unit.difficulty,
            order_index=unit.order_index,
            is_completed=str(unit.id) in completed_unit_ids,
        )
        for unit in units
    ]

    return TopicUnitsResponse(topic_id=topic.id, topic_name=topic.name, topic_slug=topic.slug, units=unit_summaries)
