"""Pydantic schemas for authentication and user management."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field, field_validator
from utils.constants import Constants


# ============================================================================
# User Registration & Authentication Schemas
# ============================================================================


class UserCreate(BaseModel):
    """Schema for user registration."""

    email: EmailStr = Field(..., description="User's email address")
    username: str = Field(..., min_length=3, max_length=50, description="Display username")
    password: str = Field(
        ...,
        min_length=Constants.AppConstants.MIN_PASSWORD_LENGTH,
        max_length=128,
        description="User's password",
    )

    @field_validator("username")
    @classmethod
    def validate_username(cls, v: str) -> str:
        """Validate username format."""
        if not v.replace("_", "").replace("-", "").isalnum():
            raise ValueError("Username can only contain letters, numbers, hyphens, and underscores")
        return v

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        """Validate password strength."""
        if len(v) < Constants.AppConstants.MIN_PASSWORD_LENGTH:
            msg = f"Password must be at least {Constants.AppConstants.MIN_PASSWORD_LENGTH} characters long"
            raise ValueError(msg)
        if not any(c.isupper() for c in v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not any(c.islower() for c in v):
            raise ValueError("Password must contain at least one lowercase letter")
        if not any(c.isdigit() for c in v):
            raise ValueError("Password must contain at least one digit")
        return v


class LoginRequest(BaseModel):
    """Schema for user login."""

    email: EmailStr = Field(..., description="User's email address")
    password: str = Field(..., description="User's password")


class TokenResponse(BaseModel):
    """Schema for JWT token response."""

    access_token: str = Field(..., description="JWT access token")
    token_type: str = Field(default="bearer", description="Token type")
    user: "UserResponse" = Field(..., description="User information")
    refresh_token: str | None = Field(None, description="Refresh token for extending session")


class RefreshTokenRequest(BaseModel):
    """Schema for refresh token request."""

    refresh_token: str = Field(..., description="Refresh token")


# ============================================================================
# User Profile Schemas
# ============================================================================


class UserResponse(BaseModel):
    """Schema for user response (public information)."""

    id: int = Field(..., description="User ID")
    email: str = Field(..., description="User's email address")
    username: str = Field(..., description="Display username")
    is_active: bool = Field(..., description="Account active status")
    created_at: datetime = Field(..., description="Account creation timestamp")
    last_login: datetime | None = Field(None, description="Last successful login timestamp")

    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    """Schema for user profile update."""

    username: str | None = Field(None, min_length=3, max_length=50, description="Display username")
    email: EmailStr | None = Field(None, description="User's email address")

    @field_validator("username")
    @classmethod
    def validate_username(cls, v: str | None) -> str | None:
        """Validate username format."""
        if v and not v.replace("_", "").replace("-", "").isalnum():
            raise ValueError("Username can only contain letters, numbers, hyphens, and underscores")
        return v


class PasswordChangeRequest(BaseModel):
    """Schema for password change."""

    current_password: str = Field(..., description="Current password")
    new_password: str = Field(
        ...,
        min_length=Constants.AppConstants.MIN_PASSWORD_LENGTH,
        max_length=128,
        description="New password",
    )

    @field_validator("new_password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        """Validate password strength."""
        if len(v) < Constants.AppConstants.MIN_PASSWORD_LENGTH:
            msg = f"Password must be at least {Constants.AppConstants.MIN_PASSWORD_LENGTH} characters long"
            raise ValueError(msg)
        if not any(c.isupper() for c in v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not any(c.islower() for c in v):
            raise ValueError("Password must contain at least one lowercase letter")
        if not any(c.isdigit() for c in v):
            raise ValueError("Password must contain at least one digit")
        return v


# ============================================================================
# User Activity Schemas
# ============================================================================


class ActivityLogCreate(BaseModel):
    """Schema for creating activity log entry."""

    activity_type: str = Field(
        ...,
        description="Type of activity (quiz_attempt, quiz_pass, exercise_start, etc.)",
    )
    unit_slug: str = Field(..., description="Learning unit slug")
    points_earned: int = Field(default=0, ge=0, description="Points earned")
    metadata: dict | None = Field(None, description="Additional metadata")

    @field_validator("activity_type")
    @classmethod
    def validate_activity_type(cls, v: str) -> str:
        """Validate activity type."""
        valid_types = {
            "quiz_attempt",
            "quiz_pass",
            "exercise_start",
            "exercise_complete",
            "login",
        }
        if v not in valid_types:
            msg = f"Activity type must be one of {valid_types}"
            raise ValueError(msg)
        return v


class UserActivityResponse(BaseModel):
    """Schema for daily user activity response."""

    activity_date: str = Field(..., description="Activity date (YYYY-MM-DD)")
    total_points: int = Field(..., description="Total points for the day")
    quiz_attempts: int = Field(..., description="Number of quiz attempts")
    quiz_passes: int = Field(..., description="Number of quizzes passed")
    exercises_started: int = Field(..., description="Exercises started")
    exercises_completed: int = Field(..., description="Exercises completed")
    time_spent_seconds: int = Field(..., description="Total time spent in seconds")

    model_config = {"from_attributes": True}


class UserStreakResponse(BaseModel):
    """Schema for user streak response."""

    current_streak: int = Field(..., description="Current consecutive days streak")
    longest_streak: int = Field(..., description="Longest streak ever achieved")
    last_activity_date: str | None = Field(None, description="Last activity date (YYYY-MM-DD)")
    streak_start_date: str | None = Field(None, description="Current streak start date (YYYY-MM-DD)")

    model_config = {"from_attributes": True}


class UserStatsResponse(BaseModel):
    """Schema for user statistics response."""

    total_points: int = Field(..., description="Total lifetime points")
    quizzes_completed: int = Field(..., description="Total quizzes completed")
    exercises_completed: int = Field(..., description="Total exercises completed")
    avg_quiz_score: float | None = Field(None, description="Average quiz score percentage")
    total_time_spent_hours: float = Field(..., description="Total time spent in hours")
    days_active: int = Field(..., description="Total number of active days")


class HeatmapDataResponse(BaseModel):
    """Schema for activity heatmap data."""

    date: str = Field(..., description="Date in YYYY-MM-DD format")
    points: int = Field(..., description="Total points for the day")
    level: int = Field(..., ge=0, le=4, description="Color intensity level (0-4)")


class ActivityQueryParams(BaseModel):
    """Schema for activity query parameters."""

    start_date: str | None = Field(None, description="Start date in YYYY-MM-DD format")
    end_date: str | None = Field(None, description="End date in YYYY-MM-DD format")
    limit: int | None = Field(365, ge=1, le=730, description="Maximum number of days to return")


# ============================================================================
# Admin Schemas
# ============================================================================


class UserListResponse(BaseModel):
    """Schema for user list response (admin)."""

    users: list[UserResponse] = Field(..., description="List of users")
    total: int = Field(..., description="Total number of users")
    page: int = Field(..., description="Current page")
    page_size: int = Field(..., description="Page size")


class UserDeactivateRequest(BaseModel):
    """Schema for user deactivation (admin)."""

    reason: str | None = Field(None, description="Reason for deactivation")


class ProfileSummaryResponse(BaseModel):
    """Combined profile data response for efficient frontend loading."""

    user: UserResponse = Field(..., description="User profile information")
    stats: UserStatsResponse = Field(..., description="User statistics")
    streak: UserStreakResponse = Field(..., description="User streak information")
