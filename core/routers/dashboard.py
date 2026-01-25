import logging
from collections import defaultdict
from typing import Annotated

from auth.dependencies import get_current_user
from auth.models import User
from fastapi import APIRouter, Depends, HTTPException
from models import LearningUnit, UserProgress
from schema import DashboardResponse, SyllabusItemResponse, TopicProgressSummary
from starlette import status


router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])
logger = logging.getLogger(__name__)

# Dependency injection for authenticated user
current_user_dependency = Annotated[User, Depends(get_current_user)]


@router.get("")
async def get_dashboard(current_user: current_user_dependency) -> DashboardResponse:
    """Get topic-grouped progress dashboard for authenticated user.

    Requires:
        Authorization: Bearer <token> header

    Returns:
        DashboardResponse: Topics with progress stats and unit listings
    """
    # Fetch all learning units
    all_units = await LearningUnit.find_all().to_list()

    if not all_units:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No learning content available")

    # Fetch user progress records
    user_progress = await UserProgress.find(UserProgress.user_id == str(current_user.id)).to_list()
    progress_map = {str(prog.unit_id): prog for prog in user_progress}

    # Group units by topic
    topic_units: dict[str, list[LearningUnit]] = defaultdict(list)
    for unit in all_units:
        topic_units[unit.topic].append(unit)

    # Build topic summaries with user progress
    topics: list[TopicProgressSummary] = []
    total_completed = 0
    total_in_progress = 0

    for topic_name, units in topic_units.items():
        # Sort units by order_index
        units.sort(key=lambda u: u.order_index)

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

        topics.append(
            TopicProgressSummary(
                topic=topic_name,
                total_units=len(units),
                completed_units=topic_completed,
                in_progress_units=topic_in_progress,
                completion_percentage=round(completion_pct, 1),
                units=unit_items,
            )
        )

    # Sort topics alphabetically
    topics.sort(key=lambda t: t.topic)

    # Calculate overall completion
    overall_completion = (total_completed / len(all_units) * 100) if all_units else 0.0

    return DashboardResponse(
        user_id=str(current_user.id),
        greeting=f"Welcome back, {current_user.username}!",
        topics=topics,
        overall_completion=round(overall_completion, 1),
        total_units=len(all_units),
        completed_count=total_completed,
        in_progress_count=total_in_progress,
        current_streak=0,  # Will be updated when activity tracking is implemented
    )
