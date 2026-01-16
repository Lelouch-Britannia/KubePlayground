from fastapi import APIRouter, HTTPException
from starlette import status
import logging
from typing import Dict, List
from collections import defaultdict
from models import LearningUnit, UserProgress
from schema import DashboardResponse, TopicProgressSummary, SyllabusItemResponse

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])
logger = logging.getLogger(__name__)


@router.get("", response_model=DashboardResponse)
async def get_dashboard() -> DashboardResponse:
    """
    Get topic-grouped progress dashboard (no authentication yet).
    
    Returns:
        DashboardResponse: Topics with progress stats and unit listings
        
    Note:
        Phase 2A: Returns all units grouped by topic without user filtering.
        Phase 3+: Will add user_id parameter when IAM is implemented.
    """
    
    # Fetch all learning units
    all_units = await LearningUnit.find_all().to_list()
    
    if not all_units:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No learning content available"
        )
    
    # Group units by topic
    topic_units: Dict[str, List[LearningUnit]] = defaultdict(list)
    for unit in all_units:
        topic_units[unit.topic].append(unit)
    
    # Build topic summaries (no user progress for Phase 2A)
    topics: List[TopicProgressSummary] = []
    
    for topic_name, units in topic_units.items():
        # Sort units by order_index
        units.sort(key=lambda u: u.order_index)
        
        # Build unit list for response
        unit_items = [
            SyllabusItemResponse(
                slug=unit.slug,
                title=unit.title,
                topic=unit.topic,
                order_index=unit.order_index,
                type=unit.type,
                difficulty=unit.difficulty
            )
            for unit in units
        ]
        
        topics.append(TopicProgressSummary(
            topic=topic_name,
            total_units=len(units),
            completed_units=0,  # No user progress yet
            in_progress_units=0,
            completion_percentage=0.0,
            units=unit_items
        ))
    
    # Sort topics alphabetically
    topics.sort(key=lambda t: t.topic)
    
    return DashboardResponse(
        user_id="guest",
        greeting="Welcome back, User!",
        topics=topics,
        overall_completion=0.0,
        total_units=len(all_units),
        completed_count=0,
        in_progress_count=0,
        current_streak=0
    )