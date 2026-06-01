import logging
from datetime import datetime, timezone
from typing import Annotated

from auth.dependencies import db_dependency, get_current_user
from auth.models import Course, User, UserEnrollment
from beanie.operators import In
from fastapi import APIRouter, Depends, HTTPException
from models import LearningUnit, UserProgress
from schema import EnrollmentStatusRequest, MyCourseItem
from starlette import status


router = APIRouter(prefix="/courses", tags=["enrollment"])
logger = logging.getLogger(__name__)

current_user_dependency = Annotated[User, Depends(get_current_user)]


@router.post("/{course_slug}/enroll", status_code=status.HTTP_201_CREATED)
async def enroll_course(course_slug: str, current_user: current_user_dependency, db: db_dependency) -> dict:
    course = db.query(Course).filter(Course.slug == course_slug).first()
    if not course:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Course not found: {course_slug}")

    existing = (
        db.query(UserEnrollment)
        .filter(
            UserEnrollment.user_id == current_user.id,
            UserEnrollment.course_id == course.id,
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Already enrolled in this course")

    now = datetime.now(tz=timezone.utc)
    # Auto-pause any currently active enrollment
    db.query(UserEnrollment).filter(
        UserEnrollment.user_id == current_user.id,
        UserEnrollment.status == "active",
    ).update({"status": "paused"})

    enrollment = UserEnrollment(
        user_id=current_user.id,
        course_id=course.id,
        status="active",
        enrolled_at=now,
        last_accessed_at=now,
    )
    db.add(enrollment)
    db.commit()
    return {"status": "enrolled", "course_slug": course_slug}


@router.delete("/{course_slug}/enroll", status_code=status.HTTP_200_OK)
async def unenroll_course(course_slug: str, current_user: current_user_dependency, db: db_dependency) -> dict:
    course = db.query(Course).filter(Course.slug == course_slug).first()
    if not course:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Course not found: {course_slug}")

    enrollment = (
        db.query(UserEnrollment)
        .filter(
            UserEnrollment.user_id == current_user.id,
            UserEnrollment.course_id == course.id,
        )
        .first()
    )
    if not enrollment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not enrolled in this course")

    db.delete(enrollment)
    db.commit()
    return {"status": "unenrolled", "course_slug": course_slug}


@router.patch("/{course_slug}/status")
async def set_course_status(
    course_slug: str,
    request: EnrollmentStatusRequest,
    current_user: current_user_dependency,
    db: db_dependency,
) -> dict:
    course = db.query(Course).filter(Course.slug == course_slug).first()
    if not course:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Course not found: {course_slug}")

    enrollment = (
        db.query(UserEnrollment)
        .filter(
            UserEnrollment.user_id == current_user.id,
            UserEnrollment.course_id == course.id,
        )
        .first()
    )
    if not enrollment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not enrolled in this course")

    if request.status == "active":
        # Auto-pause any other active enrollment
        db.query(UserEnrollment).filter(
            UserEnrollment.user_id == current_user.id,
            UserEnrollment.status == "active",
            UserEnrollment.course_id != course.id,
        ).update({"status": "paused"})

    enrollment.status = request.status
    db.commit()
    return {"status": request.status, "course_slug": course_slug}


@router.patch("/{course_slug}/access")
async def update_course_access(course_slug: str, current_user: current_user_dependency, db: db_dependency) -> dict:
    course = db.query(Course).filter(Course.slug == course_slug).first()
    if not course:
        return {"status": "not_enrolled"}

    enrollment = (
        db.query(UserEnrollment)
        .filter(
            UserEnrollment.user_id == current_user.id,
            UserEnrollment.course_id == course.id,
        )
        .first()
    )
    if enrollment:
        enrollment.last_accessed_at = datetime.now(tz=timezone.utc)
        db.commit()
    return {"status": "updated"}


@router.get("/my")
async def get_my_courses(current_user: current_user_dependency, db: db_dependency) -> list[MyCourseItem]:
    enrollments = (
        db.query(UserEnrollment)
        .filter(
            UserEnrollment.user_id == current_user.id,
        )
        .order_by(UserEnrollment.last_accessed_at.desc())
        .all()
    )

    result = []
    for enrollment in enrollments:
        course = db.query(Course).filter(Course.id == enrollment.course_id).first()
        if not course:
            continue

        # Get all units for this course
        units = await LearningUnit.find(LearningUnit.course_id == course.id).to_list()
        total = len(units)

        # Count completed units
        completed = 0
        if total > 0:
            unit_ids = [u.id for u in units]
            progress_list = await UserProgress.find(
                UserProgress.user_id == current_user.id,
                In(UserProgress.unit_id, unit_ids),
                UserProgress.status == "completed",
            ).to_list()
            completed = len(progress_list)

        pct = round((completed / total * 100), 1) if total > 0 else 0.0

        result.append(
            MyCourseItem(
                course_id=course.id,
                course_slug=course.slug,
                course_name=course.name,
                course_description=course.description,
                status=enrollment.status,
                completion_pct=pct,
                completed_units=completed,
                total_units=total,
                enrolled_at=enrollment.enrolled_at,
                last_accessed_at=enrollment.last_accessed_at,
            )
        )

    return result
