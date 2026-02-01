import logging
from collections import defaultdict
from typing import Annotated

from auth.dependencies import db_dependency, get_current_user
from auth.models import Course, Topic, User
from fastapi import APIRouter, Depends, HTTPException
from models import LearningUnit, UserProgress
from schema import CourseProgressSummary, DashboardResponse, SyllabusItemResponse, TopicProgressSummary
from starlette import status


router = APIRouter(prefix="/dashboard", tags=["dashboard"])
logger = logging.getLogger(__name__)

# Dependency injection for authenticated user
current_user_dependency = Annotated[User, Depends(get_current_user)]


@router.get("")
async def get_dashboard(current_user: current_user_dependency, db: db_dependency) -> DashboardResponse:
    """Get course and topic-grouped progress dashboard for authenticated user.

    Requires:
        Authorization: Bearer <token> header

    Returns:
        DashboardResponse: Courses with topics, progress stats and unit listings
    """
    # Fetch all learning units
    all_units = await LearningUnit.find_all().to_list()

    if not all_units:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No learning content available")

    # Fetch user progress records
    user_progress = await UserProgress.find(UserProgress.user_id == current_user.id).to_list()
    progress_map = {str(prog.unit_id): prog for prog in user_progress}

    # Fetch all courses and topics from SQLite
    courses = db.query(Course).order_by(Course.created_at).all()

    # Build course summaries with topics
    course_summaries: list[CourseProgressSummary] = []
    total_completed = 0
    total_in_progress = 0

    for course in courses:
        # Get topics for this course, ordered by order_position
        topics = db.query(Topic).filter(Topic.course_id == course.id).order_by(Topic.order_position).all()

        topic_summaries: list[TopicProgressSummary] = []

        for topic in topics:
            # Get units for this topic from MongoDB
            units = await LearningUnit.find(LearningUnit.topic_id == topic.id).sort(+LearningUnit.order_index).to_list()

            # Calculate progress stats for this topic
            topic_completed = 0
            topic_in_progress = 0

            for unit in units:
                prog = progress_map.get(str(unit.id))
                if prog:
                    if prog.status == "completed":
                        topic_completed += 1
                        total_completed += 1
                    elif prog.status == "in_progress":
                        topic_in_progress += 1
                        total_in_progress += 1

            # Build unit list for response
            unit_items = [
                SyllabusItemResponse(
                    slug=unit.slug,
                    title=unit.title,
                    topic=unit.topic,
                    order_index=unit.order_index,
                    type=unit.type,
                    difficulty=unit.difficulty,
                )
                for unit in units
            ]

            completion_pct = (topic_completed / len(units) * 100) if units else 0.0

            topic_summaries.append(
                TopicProgressSummary(
                    topic=topic.name,
                    topic_slug=topic.slug,
                    topic_icon=topic.icon,
                    topic_order=topic.order_position,
                    total_units=len(units),
                    completed_units=topic_completed,
                    in_progress_units=topic_in_progress,
                    completion_percentage=round(completion_pct, 1),
                    units=unit_items,
                )
            )

        if topic_summaries:
            course_summaries.append(
                CourseProgressSummary(
                    course_name=course.name,
                    course_slug=course.slug,
                    course_description=course.description,
                    topics=topic_summaries,
                )
            )

    # Calculate overall completion
    overall_completion = (total_completed / len(all_units) * 100) if all_units else 0.0

    return DashboardResponse(
        user_id=current_user.id,
        greeting=f"Welcome back, {current_user.username}!",
        courses=course_summaries,
        overall_completion=round(overall_completion, 1),
        total_units=len(all_units),
        completed_count=total_completed,
        in_progress_count=total_in_progress,
        current_streak=0,  # Will be updated when activity tracking is implemented
    )
