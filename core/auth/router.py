import json
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Annotated

import numpy as np
from auth.dependencies import db_dependency, get_current_user
from auth.models import ActivityLog, RefreshToken, User, UserActivity, UserStreak
from auth.schemas import (
    ActivityLogCreate,
    HeatmapDataResponse,
    LoginRequest,
    PasswordChangeRequest,
    ProfileSummaryResponse,
    RefreshTokenRequest,
    TokenResponse,
    UserActivityResponse,
    UserCreate,
    UserResponse,
    UserStatsResponse,
    UserStreakResponse,
    UserUpdate,
)
from auth.security import (
    create_access_token,
    create_refresh_token,
    hash_password,
    hash_token,
    verify_password,
    verify_refresh_token,
    verify_token_hash,
)
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import EmailStr, Field
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import func
from sqlalchemy.orm import Session
from utils.constants import Constants


# Constants for activity tracking
MAX_ACTIVITY_DAYS = 730

# Rate limiter instance
limiter = Limiter(key_func=get_remote_address)

# Create auth router with prefix
router = APIRouter(prefix="/auth", tags=["authentication"])
logger = logging.getLogger(__name__)

# Dependency injection pattern for current authenticated user
current_user_dependency = Annotated[User, Depends(get_current_user)]


@router.get("/health")
async def auth_health():
    """Auth module health check."""
    return {"status": "healthy", "module": "auth"}


@router.post("/register", response_model=TokenResponse, status_code=201)
@limiter.limit("5/hour")  # Prevent spam registrations
async def register(request: Request, user: UserCreate, db: db_dependency):  # noqa: ARG001
    """Register a new user."""
    # Check if email already exists
    existing_user = db.query(User).filter(User.email == user.email).first()

    if existing_user:
        if existing_user.is_active:
            raise HTTPException(status_code=409, detail="Email already registered")
        raise HTTPException(status_code=400, detail="Email registered but not active. Please contact support.")

    # Create new user with hashed password
    db_user = User(
        email=user.email,
        username=user.username,
        password_hash=hash_password(user.password),
    )

    db.add(db_user)
    db.commit()
    db.refresh(db_user)

    # Generate access token (short-lived, contains user claims)
    access_token = create_access_token(
        data={
            "sub": str(db_user.id),
            "email": db_user.email,
            "username": db_user.username,
        },
        expires_delta=timedelta(minutes=60),
    )

    # Generate refresh token (long-lived, minimal claims)
    refresh_token = create_refresh_token(
        user_id=str(db_user.id),
        expires_days=7,
    )

    # Store refresh token hash in database
    db_refresh_token = RefreshToken(
        user_id=db_user.id,
        token_hash=hash_token(refresh_token),
        expires_at=datetime.now(timezone.utc) + timedelta(days=7),
    )
    db.add(db_refresh_token)
    db.commit()

    return TokenResponse(
        access_token=access_token,
        token_type=Constants.AppConstants.bearer,
        user=UserResponse.model_validate(db_user),
        refresh_token=refresh_token,  # Auto-login: return refresh token too
    )


@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/minute")  # Prevent brute force password attacks
async def login(request: Request, login_req: LoginRequest, db: db_dependency):  # noqa: ARG001
    """Authenticate user and return JWT token."""
    user = db.query(User).filter(User.email == login_req.email).first()

    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not user.is_active:
        raise HTTPException(status_code=403, detail="User account is deactivated")

    # Verify password
    if not verify_password(login_req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    # Update last login timestamp
    user.last_login = datetime.now(timezone.utc)
    db.commit()

    # Generate access token (short-lived, contains user claims)
    access_token = create_access_token(
        data={
            "sub": str(user.id),
            "email": user.email,
            "username": user.username,  # Additional claim for access token
        },
        expires_delta=timedelta(minutes=60),
    )

    # Generate refresh token (long-lived, minimal claims)
    refresh_token = create_refresh_token(
        user_id=str(user.id),
        expires_days=7,
    )

    # Store refresh token hash in database (not plaintext!)
    db_refresh_token = RefreshToken(
        user_id=user.id,
        token_hash=hash_token(refresh_token),  # Use SHA256, not bcrypt
        expires_at=datetime.now(timezone.utc) + timedelta(days=7),
    )
    db.add(db_refresh_token)
    db.commit()

    return TokenResponse(
        access_token=access_token,
        token_type=Constants.AppConstants.bearer,
        user=UserResponse.model_validate(user),
        refresh_token=refresh_token,  # Add to response schema
    )


@router.get("/me", response_model=UserResponse)
async def get_current_user_profile(current_user: current_user_dependency):
    """Get current authenticated user profile.

    Requires:
        Authorization: Bearer <token> header

    Returns:
        UserResponse: Current user profile information
    """
    return UserResponse.model_validate(current_user)


@router.post("/logout")
async def logout(
    refresh_request: RefreshTokenRequest,
    current_user: current_user_dependency,
    db: db_dependency,
):
    """Logout from current device (revoke current refresh token).

    Industry standard: Single-device logout revokes only the current session's
    refresh token, allowing other devices to remain logged in.

    Requires:
        Authorization: Bearer <token> header
        Refresh token in request body

    Returns:
        dict: Success message
    """
    # Revoke only the provided refresh token
    token_hash = hash_token(refresh_request.refresh_token)
    db.query(RefreshToken).filter(
        RefreshToken.user_id == current_user.id,
        RefreshToken.token_hash == token_hash,
        RefreshToken.revoked_at.is_(None),
    ).update({"revoked_at": datetime.now(timezone.utc)})
    db.commit()

    return {
        "message": "Logged out successfully",
        "note": "Client should delete access and refresh tokens from storage",
    }


# ============================================================================
# User Profile Management Endpoints
# ============================================================================


@router.put("/me", response_model=UserResponse)
async def update_user_profile(
    user_update: UserUpdate,
    current_user: current_user_dependency,
    db: db_dependency,
):
    """Update current user's profile (username, email).

    Requires:
        Authorization: Bearer <token> header

    Returns:
        UserResponse: Updated user profile
    """
    # Update username if provided
    if user_update.username:
        current_user.username = user_update.username

    # Update email if provided (check uniqueness)
    if user_update.email and user_update.email != current_user.email:
        existing = db.query(User).filter(User.email == user_update.email).first()
        if existing:
            raise HTTPException(status_code=409, detail="Email already in use")
        current_user.email = user_update.email

    current_user.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(current_user)

    return UserResponse.model_validate(current_user)


@router.post("/change-password")
@limiter.limit("5/hour")  # Prevent password change abuse
async def change_password(
    request: Request,  # noqa: ARG001
    password_change: PasswordChangeRequest,
    current_user: current_user_dependency,
    db: db_dependency,
):
    """Change current user's password.

    Requires:
        Authorization: Bearer <token> header
        Current password for verification

    Returns:
        dict: Success message
    """
    # Verify current password
    if not verify_password(password_change.current_password, current_user.password_hash):
        raise HTTPException(status_code=401, detail="Current password is incorrect")

    # Update to new password
    current_user.password_hash = hash_password(password_change.new_password)
    current_user.updated_at = datetime.now(timezone.utc)
    db.commit()

    return {"message": "Password changed successfully"}


# ============================================================================
# Refresh Token (Recommended for Multi-User Local Deployment)
# ============================================================================
# Refresh tokens stored in database provide:
# 1. Token revocation on password change
# 2. Session management (logout from all devices)
# 3. Minimal overhead for local deployment
# 4. Better security than stateless-only approach


@router.post("/refresh", response_model=TokenResponse)
async def refresh_access_token(
    refresh_request: RefreshTokenRequest,
    db: db_dependency,
):
    """Exchange refresh token for new access token.

    Args:
        refresh_request: Contains refresh token
        db: Database session

    Returns:
        TokenResponse: New access token (and optionally new refresh token)
    """
    # Verify and decode refresh token
    user_id = verify_refresh_token(refresh_request.refresh_token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")

    # Convert user_id to integer (JWT stores as string)
    try:
        user_id = int(user_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=401, detail="Invalid user ID in refresh token")

    # Verify token exists in database and not revoked
    token_hash = hash_token(refresh_request.refresh_token)
    db_token = (
        db.query(RefreshToken)
        .filter(
            RefreshToken.user_id == user_id,
            RefreshToken.token_hash == token_hash,
            RefreshToken.revoked_at.is_(None),
            RefreshToken.expires_at > datetime.now(timezone.utc),
        )
        .first()
    )

    if not db_token:
        raise HTTPException(status_code=401, detail="Refresh token not found or revoked")

    # Get user
    user = db.query(User).filter_by(id=user_id).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")

    # Generate new access token with full user claims
    new_access_token = create_access_token(
        data={
            "sub": str(user.id),
            "email": user.email,
            "username": user.username,
        },
        expires_delta=timedelta(minutes=60),
    )

    # Optional: Rotate refresh token (more secure but requires client update)
    # For simplicity, reuse existing refresh token

    return TokenResponse(
        access_token=new_access_token,
        token_type=Constants.AppConstants.bearer,
        user=UserResponse.model_validate(user),
        refresh_token=refresh_request.refresh_token,  # Return same refresh token
    )


@router.post("/logout-all-devices")
async def logout_all_devices(
    current_user: current_user_dependency,
    db: db_dependency,
):
    """Revoke all refresh tokens for current user (logout from all devices).

    Requires:
        Authorization: Bearer <token> header

    Returns:
        dict: Success message with count of revoked tokens
    """
    # Revoke all active refresh tokens
    revoked_count = (
        db.query(RefreshToken)
        .filter(
            RefreshToken.user_id == current_user.id,
            RefreshToken.revoked_at.is_(None),
        )
        .update({"revoked_at": datetime.now(timezone.utc)})
    )
    db.commit()

    return {
        "message": "Logged out from all devices",
        "revoked_sessions": revoked_count,
    }


# ============================================================================
# User Activity Tracking Endpoints
# ============================================================================
# Note: Activity logging (POST) is handled automatically by grading/progress routers.
# These endpoints provide read-only access to activity data for analytics/dashboards.


@router.get("/me/activity", response_model=list[UserActivityResponse])
async def get_user_activity(
    current_user: current_user_dependency,
    db: db_dependency,
    start_date: str | None = None,
    end_date: str | None = None,
    limit: int = 365,
):
    """Get user's daily activity data for heatmap visualization.

    Query params:
        start_date: Optional start date (YYYY-MM-DD)
        end_date: Optional end date (YYYY-MM-DD)
        limit: Maximum number of days to return (default 365, max 730)

    Requires:
        Authorization: Bearer <token> header

    Returns:
        List[UserActivityResponse]: Daily activity records
    """
    # Validate limit
    if limit < 1 or limit > MAX_ACTIVITY_DAYS:
        raise HTTPException(status_code=400, detail=f"Limit must be between 1 and {MAX_ACTIVITY_DAYS}")

    # Parse dates or use defaults
    if start_date:
        try:
            start_dt = datetime.strptime(start_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid start_date format. Use YYYY-MM-DD")
    else:
        start_dt = datetime.now(timezone.utc) - timedelta(days=limit)

    if end_date:
        try:
            end_dt = datetime.strptime(end_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid end_date format. Use YYYY-MM-DD")
    else:
        end_dt = datetime.now(timezone.utc)

    if start_dt > end_dt:
        raise HTTPException(status_code=400, detail="start_date must be before end_date")

    # Query activities
    activities = (
        db.query(UserActivity)
        .filter(
            UserActivity.user_id == current_user.id,
            UserActivity.activity_date >= start_dt,
            UserActivity.activity_date <= end_dt,
        )
        .order_by(UserActivity.activity_date.desc())
        .limit(limit)
        .all()
    )

    logger.info("Activity query for user %s: found %s records", current_user.id, len(activities))
    if activities:
        logger.info("Sample: date=%s, points=%s", activities[0].activity_date, activities[0].total_points)

    # Convert to response
    return [
        UserActivityResponse(
            activity_date=activity.activity_date.strftime("%Y-%m-%d"),
            total_points=activity.total_points,
            # quiz_attempts=activity.quiz_attempts,  # quiz/grading feature commented out
            # quiz_passes=activity.quiz_passes,  # quiz/grading feature commented out
            exercises_started=activity.exercises_started,
            exercises_completed=activity.exercises_completed,
            time_spent_seconds=activity.time_spent_seconds,
        )
        for activity in activities
    ]


@router.get("/me/activity/heatmap", response_model=list[HeatmapDataResponse])
async def get_activity_heatmap(
    current_user: current_user_dependency,
    db: db_dependency,
    days: int = 365,
):
    """Get activity heatmap data with color intensity levels (GitHub-style).

    Calculates intensity level (0-4) based on points distribution.

    Query params:
        days: Number of days to include (default 365, max 730)

    Requires:
        Authorization: Bearer <token> header

    Returns:
        List[HeatmapDataResponse]: Heatmap data with date, points, and level
    """
    # Validate days
    if days < 1 or days > MAX_ACTIVITY_DAYS:
        raise HTTPException(status_code=400, detail=f"Days must be between 1 and {MAX_ACTIVITY_DAYS}")

    # Calculate date range
    end_date = datetime.now(timezone.utc).date()
    start_date = end_date - timedelta(days=days - 1)

    # Query activities
    activities = (
        db.query(UserActivity)
        .filter(
            UserActivity.user_id == current_user.id,
            UserActivity.activity_date
            >= datetime.combine(start_date, datetime.min.time()).replace(tzinfo=timezone.utc),
        )
        .order_by(UserActivity.activity_date.asc())
        .all()
    )

    logger.info("Heatmap query for user %s: found %s activity records", current_user.id, len(activities))
    if activities:
        logger.info("Sample activity: %s", activities[0])

    # Create lookup dict
    activity_map = {activity.activity_date.date(): activity.total_points for activity in activities}

    # Get all non-zero points for percentile calculation
    non_zero_points = [p for p in activity_map.values() if p > 0]

    # Calculate thresholds
    if non_zero_points:
        thresholds = {
            1: np.percentile(non_zero_points, 25),
            2: np.percentile(non_zero_points, 50),
            3: np.percentile(non_zero_points, 75),
            4: np.percentile(non_zero_points, 90),
        }
    else:
        thresholds = {1: 1, 2: 25, 3: 50, 4: 75}

    # Build complete heatmap data
    heatmap_data = []
    current_date = start_date

    while current_date <= end_date:
        points = activity_map.get(current_date, 0)

        # Calculate level
        if points == 0:
            level = 0
        elif points <= thresholds[1]:
            level = 1
        elif points <= thresholds[2]:
            level = 2
        elif points <= thresholds[3]:
            level = 3
        else:
            level = 4

        heatmap_data.append(
            HeatmapDataResponse(
                date=current_date.strftime("%Y-%m-%d"),
                points=points,
                level=level,
            )
        )

        current_date += timedelta(days=1)

    return heatmap_data


@router.get("/me/streak", response_model=UserStreakResponse)
async def get_user_streak(
    current_user: current_user_dependency,
    db: db_dependency,
):
    """Get user's current and longest streak.

    Requires:
        Authorization: Bearer <token> header

    Returns:
        UserStreakResponse: Streak information
    """
    user_streak = db.query(UserStreak).filter(UserStreak.user_id == current_user.id).first()

    if not user_streak:
        return UserStreakResponse(
            current_streak=0,
            longest_streak=0,
            last_activity_date=None,
            streak_start_date=None,
        )

    # Verify streak is still valid
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    if user_streak.last_activity_date:
        last_activity = user_streak.last_activity_date
        if last_activity.tzinfo is None:
            last_activity = last_activity.replace(tzinfo=timezone.utc)
        last_activity = last_activity.replace(hour=0, minute=0, second=0, microsecond=0)
        days_diff = (today - last_activity).days

        # If more than 1 day since last activity, streak is broken
        if days_diff > 1:
            user_streak.current_streak = 0
            db.commit()

    return UserStreakResponse(
        current_streak=user_streak.current_streak,
        longest_streak=user_streak.longest_streak,
        last_activity_date=user_streak.last_activity_date.strftime("%Y-%m-%d")
        if user_streak.last_activity_date
        else None,
        streak_start_date=user_streak.streak_start_date.strftime("%Y-%m-%d") if user_streak.streak_start_date else None,
    )


@router.get("/me/stats", response_model=UserStatsResponse)
async def get_user_stats(
    current_user: current_user_dependency,
    db: db_dependency,
):
    """Get user's overall statistics summary.

    Aggregates lifetime statistics across all activities.

    Requires:
        Authorization: Bearer <token> header

    Returns:
        UserStatsResponse: Overall statistics
    """
    # Aggregate from user_activity
    aggregates = (
        db.query(
            func.sum(UserActivity.total_points).label("total_points"),
            # func.sum(UserActivity.quiz_passes).label("quizzes_completed"),  # quiz/grading feature commented out
            func.sum(UserActivity.exercises_completed).label("exercises_completed"),
            func.sum(UserActivity.time_spent_seconds).label("total_time_spent_seconds"),
            func.count(UserActivity.activity_date).label("days_active"),
        )
        .filter(UserActivity.user_id == current_user.id)
        .first()
    )

    # Average quiz score — commented out (quiz/grading feature disabled)
    # avg_score_query = (
    #     db.query(func.avg(ActivityLog.score_percentage).label("avg_score"))
    #     .filter(
    #         ActivityLog.user_id == current_user.id,
    #         ActivityLog.activity_type == "quiz_submission",
    #         ActivityLog.score_percentage.isnot(None),
    #     )
    #     .first()
    # )
    # avg_quiz_score = round(avg_score_query.avg_score, 2) if avg_score_query.avg_score else None

    return UserStatsResponse(
        total_points=aggregates.total_points or 0,
        # quizzes_completed=aggregates.quizzes_completed or 0,  # quiz/grading feature commented out
        exercises_completed=aggregates.exercises_completed or 0,
        # avg_quiz_score=avg_quiz_score,  # quiz/grading feature commented out
        total_time_spent_hours=round((aggregates.total_time_spent_seconds or 0) / 3600, 2),
        days_active=aggregates.days_active or 0,
    )


@router.get("/me/profile-summary", response_model=ProfileSummaryResponse)
async def get_profile_summary(
    current_user: current_user_dependency,
    db: db_dependency,
):
    """Get combined profile data (user info, stats, streak) in single request.

    Optimized endpoint for profile page - reduces frontend API calls.

    Requires:
        Authorization: Bearer <token> header

    Returns:
        ProfileSummaryResponse: Combined user data
    """
    # Get user info
    user_data = UserResponse.model_validate(current_user)

    # Get stats
    aggregates = (
        db.query(
            func.sum(UserActivity.total_points).label("total_points"),
            # func.sum(UserActivity.quiz_passes).label("quizzes_completed"),  # quiz/grading feature commented out
            func.sum(UserActivity.exercises_completed).label("exercises_completed"),
            func.sum(UserActivity.time_spent_seconds).label("total_time_spent_seconds"),
            func.count(UserActivity.activity_date).label("days_active"),
        )
        .filter(UserActivity.user_id == current_user.id)
        .first()
    )

    # Average quiz score — commented out (quiz/grading feature disabled)
    # avg_score_query = (
    #     db.query(func.avg(ActivityLog.score_percentage).label("avg_score"))
    #     .filter(
    #         ActivityLog.user_id == current_user.id,
    #         ActivityLog.activity_type == "quiz_submission",
    #         ActivityLog.score_percentage.isnot(None),
    #     )
    #     .first()
    # )
    # avg_quiz_score = round(avg_score_query.avg_score, 2) if avg_score_query.avg_score else None

    stats_data = UserStatsResponse(
        total_points=aggregates.total_points or 0,
        # quizzes_completed=aggregates.quizzes_completed or 0,  # quiz/grading feature commented out
        exercises_completed=aggregates.exercises_completed or 0,
        # avg_quiz_score=avg_quiz_score,  # quiz/grading feature commented out
        total_time_spent_hours=round((aggregates.total_time_spent_seconds or 0) / 3600, 2),
        days_active=aggregates.days_active or 0,
    )

    # Get streak
    user_streak = db.query(UserStreak).filter(UserStreak.user_id == current_user.id).first()

    if user_streak:
        # Verify streak is still valid
        today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        if user_streak.last_activity_date:
            last_activity = user_streak.last_activity_date
            if last_activity.tzinfo is None:
                last_activity = last_activity.replace(tzinfo=timezone.utc)
            last_activity = last_activity.replace(hour=0, minute=0, second=0, microsecond=0)
            days_diff = (today - last_activity).days

            if days_diff > 1:
                user_streak.current_streak = 0
                db.commit()

        streak_data = UserStreakResponse(
            current_streak=user_streak.current_streak,
            longest_streak=user_streak.longest_streak,
            last_activity_date=user_streak.last_activity_date.strftime("%Y-%m-%d")
            if user_streak.last_activity_date
            else None,
            streak_start_date=user_streak.streak_start_date.strftime("%Y-%m-%d")
            if user_streak.streak_start_date
            else None,
        )
    else:
        streak_data = UserStreakResponse(
            current_streak=0,
            longest_streak=0,
            last_activity_date=None,
            streak_start_date=None,
        )

    return ProfileSummaryResponse(
        user=user_data,
        stats=stats_data,
        streak=streak_data,
    )
