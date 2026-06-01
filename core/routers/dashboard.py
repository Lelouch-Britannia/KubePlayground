import logging
from typing import Annotated

from auth.dependencies import db_dependency, get_current_user
from auth.models import Course, Topic, User, UserEnrollment, UserStreak
from fastapi import APIRouter, Depends
from models import LearningUnit, UserProgress
from schema import (
    CourseProgressSummary,
    DashboardResponse,
    PausedCourseSummary,
    SyllabusItemResponse,
    TopicProgressSummary,
)


router = APIRouter(prefix="/dashboard", tags=["dashboard"])
logger = logging.getLogger(__name__)

# Dependency injection for authenticated user
current_user_dependency = Annotated[User, Depends(get_current_user)]


async def _build_course_progress_summary(
    course: Course,
    db,
    progress_map: dict,
) -> tuple[CourseProgressSummary, int, int]:
    """Build a CourseProgressSummary for a given course.

    Returns:
        Tuple of (summary, total_completed, total_in_progress) for this course.
    """
    topics = db.query(Topic).filter(Topic.course_id == course.id).order_by(Topic.order_position).all()
    topic_summaries: list[TopicProgressSummary] = []
    course_completed = 0
    course_in_progress = 0

    for topic in topics:
        units = await LearningUnit.find(LearningUnit.topic_id == topic.id).sort(+LearningUnit.order_index).to_list()

        topic_completed = 0
        topic_in_progress = 0

        for unit in units:
            prog = progress_map.get(str(unit.id))
            if prog:
                if prog.status == "completed":
                    topic_completed += 1
                    course_completed += 1
                elif prog.status == "in_progress":
                    topic_in_progress += 1
                    course_in_progress += 1

        unit_items = [
            SyllabusItemResponse(
                slug=u.slug,
                title=u.title,
                topic=u.topic,
                order_index=u.order_index,
                type=u.type,
                difficulty=u.difficulty,
                status="completed"
                if progress_map.get(str(u.id)) and progress_map[str(u.id)].status == "completed"
                else ("in_progress" if str(u.id) in progress_map else "not_started"),
            )
            for u in units
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

    summary = CourseProgressSummary(
        course_name=course.name,
        course_slug=course.slug,
        course_description=course.description,
        topics=topic_summaries,
    )
    return summary, course_completed, course_in_progress


@router.get("")
async def get_dashboard(current_user: current_user_dependency, db: db_dependency) -> DashboardResponse:
    """Get enrollment-filtered dashboard for authenticated user.

    Requires:
        Authorization: Bearer <token> header

    Returns:
        DashboardResponse: Active course with topics/progress, paused courses summary
    """
    # Fetch user progress records (used across all enrolled courses)
    user_progress = await UserProgress.find(UserProgress.user_id == current_user.id).to_list()
    progress_map = {str(prog.unit_id): prog for prog in user_progress}

    # Fetch user enrollments ordered by last access
    enrollments = (
        db.query(UserEnrollment)
        .filter(UserEnrollment.user_id == current_user.id)
        .order_by(UserEnrollment.last_accessed_at.desc())
        .all()
    )

    # No enrollments — return empty dashboard
    if not enrollments:
        all_units = await LearningUnit.find_all().to_list()
        total_completed = sum(1 for p in user_progress if p.status == "completed")
        total_in_progress = sum(1 for p in user_progress if p.status == "in_progress")
        overall_completion = (total_completed / len(all_units) * 100) if all_units else 0.0
        return DashboardResponse(
            user_id=current_user.id,
            greeting=f"Welcome back, {current_user.username}!",
            active_course=None,
            paused_courses=[],
            overall_completion=round(overall_completion, 1),
            total_units=len(all_units),
            completed_count=total_completed,
            in_progress_count=total_in_progress,
            current_streak=(
                db.query(UserStreak)
                .filter(UserStreak.user_id == current_user.id)
                .with_entities(UserStreak.current_streak)
                .scalar()
                or 0
            ),
        )

    # Separate active and paused enrollments
    active_enrollment = next((e for e in enrollments if e.status == "active"), None)
    paused_enrollments = [e for e in enrollments if e.status == "paused"]

    # Build active course summary
    active_course: CourseProgressSummary | None = None
    total_completed = 0
    total_in_progress = 0
    total_units = 0

    if active_enrollment:
        active_db_course = db.query(Course).filter(Course.id == active_enrollment.course_id).first()
        if active_db_course:
            active_course, total_completed, total_in_progress = await _build_course_progress_summary(
                active_db_course, db, progress_map
            )
            total_units = sum(t.total_units for t in active_course.topics)

    # Build paused courses list
    paused: list[PausedCourseSummary] = []
    for e in paused_enrollments:
        course = db.query(Course).filter(Course.id == e.course_id).first()
        if course:
            units = await LearningUnit.find(LearningUnit.course_id == course.id).to_list()
            p_total = len(units)
            completed = sum(
                1 for u in units if str(u.id) in progress_map and progress_map[str(u.id)].status == "completed"
            )
            pct = round(completed / p_total * 100, 1) if p_total > 0 else 0.0
            paused.append(
                PausedCourseSummary(
                    course_slug=course.slug,
                    course_name=course.name,
                    completion_pct=pct,
                    last_accessed_at=e.last_accessed_at,
                )
            )

    overall_completion = (total_completed / total_units * 100) if total_units > 0 else 0.0

    return DashboardResponse(
        user_id=current_user.id,
        greeting=f"Welcome back, {current_user.username}!",
        active_course=active_course,
        paused_courses=paused,
        overall_completion=round(overall_completion, 1),
        total_units=total_units,
        completed_count=total_completed,
        in_progress_count=total_in_progress,
        current_streak=(
            db.query(UserStreak)
            .filter(UserStreak.user_id == current_user.id)
            .with_entities(UserStreak.current_streak)
            .scalar()
            or 0
        ),
    )
