"""SQLAlchemy ORM models for IAM (Identity and Access Management).

These models inherit from Base defined in database.py and will be automatically
created when Base.metadata.create_all() is called in main.py.

All tables, indexes, and constraints are defined here - no separate SQL files needed.
"""

from datetime import datetime

from database import Base
from sqlalchemy import Boolean, Column, DateTime, Index, Integer, String, Text


class User(Base):
    """User model for authentication and profile."""

    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    email = Column(String, unique=True, nullable=False, index=True)
    username = Column(String, nullable=False)
    password_hash = Column(String, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    last_login = Column(DateTime, nullable=True)

    def __repr__(self) -> str:
        return f"<User(id={self.id}, email={self.email}, username={self.username})>"


class RefreshToken(Base):
    """Refresh token model for extended sessions."""

    __tablename__ = "refresh_tokens"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, nullable=False, index=True)
    token_hash = Column(String, unique=True, nullable=False, index=True)
    device_info = Column(String, nullable=True)
    expires_at = Column(DateTime, nullable=False, index=True)
    revoked_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (
        Index("idx_refresh_tokens_active", "user_id", "revoked_at", sqlite_where=Column("revoked_at").is_(None)),
    )

    def __repr__(self) -> str:
        status = "revoked" if self.revoked_at else "active"
        return f"<RefreshToken(id={self.id}, user_id={self.user_id}, status={status})>"


class UserActivity(Base):
    """Daily activity aggregation for heatmap."""

    __tablename__ = "user_activity"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, nullable=False, index=True)
    activity_date = Column(DateTime, nullable=False)
    total_points = Column(Integer, default=0, nullable=False)
    # quiz_attempts = Column(Integer, default=0, nullable=False)  # quiz/grading feature commented out
    # quiz_passes = Column(Integer, default=0, nullable=False)  # quiz/grading feature commented out
    exercises_started = Column(Integer, default=0, nullable=False)
    exercises_completed = Column(Integer, default=0, nullable=False)
    time_spent_seconds = Column(Integer, default=0, nullable=False)
    sessions_count = Column(Integer, default=1, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    __table_args__ = (
        Index("idx_user_activity_date_range", "user_id", "activity_date"),
        Index("idx_user_activity_leaderboard", "activity_date", "total_points"),
        {"sqlite_autoincrement": True},
    )

    def __repr__(self) -> str:
        return f"<UserActivity(user_id={self.user_id}, date={self.activity_date}, points={self.total_points})>"


class UserStreak(Base):
    """User streak tracking."""

    __tablename__ = "user_streaks"

    user_id = Column(Integer, primary_key=True)
    current_streak = Column(Integer, default=0, nullable=False)
    longest_streak = Column(Integer, default=0, nullable=False)
    last_activity_date = Column(DateTime, nullable=True)
    streak_start_date = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    def __repr__(self) -> str:
        return f"<UserStreak(user_id={self.user_id}, current={self.current_streak}, longest={self.longest_streak})>"


class ActivityLog(Base):
    """Detailed activity audit trail."""

    __tablename__ = "activity_log"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, nullable=False, index=True)
    activity_type = Column(String, nullable=False, index=True)
    unit_slug = Column(String, nullable=True, index=True)
    points_earned = Column(Integer, default=0, nullable=False)
    score_percentage = Column(Integer, nullable=True)
    activity_metadata = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    __table_args__ = (
        Index("idx_activity_log_user_recent", "user_id", "created_at"),
        Index("idx_activity_log_points", "user_id", "points_earned", sqlite_where=Column("points_earned") > 0),
    )

    def __repr__(self) -> str:
        return f"<ActivityLog(id={self.id}, user_id={self.user_id}, type={self.activity_type}, points={self.points_earned})>"


class Course(Base):
    """Course catalog for organizing learning content."""

    __tablename__ = "courses"

    id = Column(Integer, primary_key=True, autoincrement=True)
    slug = Column(String, unique=True, nullable=False, index=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    def __repr__(self) -> str:
        return f"<Course(id={self.id}, slug={self.slug}, name={self.name})>"


class UserEnrollment(Base):
    """Course enrollment tracking per user."""

    __tablename__ = "user_enrollments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, nullable=False, index=True)
    course_id = Column(Integer, nullable=False)
    status = Column(String, nullable=False, default="active")  # "active" | "paused"
    enrolled_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    last_accessed_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (
        Index("idx_enrollment_user_course", "user_id", "course_id", unique=True),
        Index("idx_enrollment_user_status", "user_id", "status"),
    )

    def __repr__(self) -> str:
        return f"<UserEnrollment(user_id={self.user_id}, course_id={self.course_id}, status={self.status})>"


class Topic(Base):
    """Topics within courses (chapters) with learning path ordering."""

    __tablename__ = "topics"

    id = Column(Integer, primary_key=True, autoincrement=True)
    course_id = Column(Integer, nullable=False, index=True)
    slug = Column(String, nullable=False)
    name = Column(String, nullable=False)
    order_position = Column(Integer, nullable=False)  # Learning path order (1, 2, 3...)
    icon = Column(String(10), nullable=True)  # Optional emoji/icon
    units_count = Column(Integer, default=0, nullable=False)  # Cached count
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    __table_args__ = (
        Index("idx_topics_course", "course_id"),
        Index("idx_topics_order", "course_id", "order_position"),
        Index("idx_topics_course_slug", "course_id", "slug", unique=True),
    )

    def __repr__(self) -> str:
        return f"<Topic(id={self.id}, course={self.course_id}, slug={self.slug}, order={self.order_position})>"
