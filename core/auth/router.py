import uuid
from datetime import datetime, timedelta, timezone
from typing import Annotated

from auth.dependencies import db_dependency, get_current_user
from auth.models import ActivityLog, RefreshToken, User, UserActivity, UserStreak
from auth.schemas import (
    ActivityLogCreate,
    HeatmapDataResponse,
    LoginRequest,
    PasswordChangeRequest,
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
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import EmailStr, Field
from sqlalchemy.orm import Session
from utils.constants import Constants


# Create auth router with prefix
router = APIRouter(prefix="/api/auth", tags=["authentication"])

# Dependency injection pattern for current authenticated user
current_user_dependency = Annotated[User, Depends(get_current_user)]


@router.get("/health")
async def auth_health():
    """Auth module health check."""
    return {"status": "healthy", "module": "auth"}


@router.post("/register", response_model=TokenResponse, status_code=201)
async def register(user: UserCreate, db: db_dependency):
    """Register a new user."""
    # Check if email already exists
    existing_user = db.query(User).filter(User.email == user.email).first()

    if existing_user:
        if existing_user.is_active:
            raise HTTPException(status_code=409, detail="Email already registered")
        raise HTTPException(status_code=400, detail="Email registered but not active. Please contact support.")

    # Create new user with hashed password
    db_user = User(
        id=str(uuid.uuid4()),
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
        user_id=str(db_user.id),
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
async def login(login_req: LoginRequest, db: db_dependency):
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
        user_id=str(user.id),
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
        RefreshToken.user_id == str(current_user.id),
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
async def change_password(
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
            RefreshToken.user_id == str(current_user.id),
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


@router.post("/activity", status_code=201)
async def log_activity(
    activity: ActivityLogCreate,
    current_user: current_user_dependency,
    db: db_dependency,
):
    """Log a user activity (quiz attempt, exercise completion, etc.).

    This endpoint should be called when user:
    - Starts/completes a quiz
    - Starts/completes an exercise
    - Logs in (optional)

    Requires:
        Authorization: Bearer <token> header

    Returns:
        dict: Success message with activity details
    """
    # Step 1: Create activity log entry for audit trail
    # - Insert into activity_log table
    # - Include: user_id, activity_type, unit_slug, points_earned, metadata, created_at

    # Step 2: Get today's date (UTC, date only - no time)
    # - Use datetime.now(timezone.utc).date() for consistency
    # - This ensures all activities on same calendar day are grouped

    # Step 3: Upsert user_activity table (daily aggregation)
    # - Query for existing record: user_id + activity_date
    # - If exists: update counters (quiz_attempts++, total_points+=, etc.)
    # - If not exists: create new record with initial values
    # - Update appropriate fields based on activity_type:
    #   * quiz_attempt -> quiz_attempts++
    #   * quiz_pass -> quiz_passes++, total_points += points
    #   * exercise_start -> exercises_started++
    #   * exercise_complete -> exercises_completed++, total_points += points

    # Step 4: Update user streak
    # - Query user_streaks table for user_id
    # - Get last_activity_date
    # - Calculate days difference between today and last_activity_date
    # - If difference == 1: current_streak++, update longest_streak if needed
    # - If difference > 1: reset current_streak = 1, update streak_start_date
    # - If difference == 0: same day, don't update streak (already counted)
    # - Update last_activity_date to today
    # - If no streak record exists: create with current_streak=1, longest_streak=1

    # Step 5: Commit transaction and return response
    # - db.commit()
    # - Return success message with points earned and updated streak


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
    # Step 1: Parse and validate date parameters
    # - If start_date provided: parse string to datetime
    # - If end_date provided: parse string to datetime
    # - If not provided: default to last 365 days
    # - Validate: start_date <= end_date
    # - Validate: limit between 1 and 730

    # Step 2: Query user_activity table
    # - Filter by user_id = current_user.id
    # - Filter by activity_date >= start_date AND activity_date <= end_date
    # - Order by activity_date DESC
    # - Limit to specified limit
    # - Select: activity_date, total_points, quiz_attempts, quiz_passes,
    #           exercises_started, exercises_completed, time_spent_seconds

    # Step 3: Convert to response format
    # - Map each record to UserActivityResponse
    # - Format activity_date as YYYY-MM-DD string
    # - Return list of activity records


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
    # Step 1: Validate and calculate date range
    # - Validate: days between 1 and 730
    # - Calculate start_date = today - days
    # - Calculate end_date = today

    # Step 2: Query user_activity for date range
    # - Filter by user_id = current_user.id
    # - Filter by activity_date >= start_date
    # - Order by activity_date ASC
    # - Select: activity_date, total_points

    # Step 3: Calculate percentile thresholds for intensity levels
    # - Collect all non-zero points values
    # - Calculate quartiles (25th, 50th, 75th, 90th percentiles)
    # - Define thresholds:
    #   * Level 0: 0 points (no activity)
    #   * Level 1: > 0 to 25th percentile
    #   * Level 2: 25th to 50th percentile
    #   * Level 3: 50th to 75th percentile
    #   * Level 4: > 75th percentile

    # Step 4: Map activity to heatmap data
    # - For each day in range:
    #   * If activity exists: map to level based on points and thresholds
    #   * If no activity: create entry with 0 points, level 0
    # - Format date as YYYY-MM-DD
    # - Return list with all days (including zero-activity days for complete heatmap)


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
    # Step 1: Query user_streaks table
    # - Filter by user_id = current_user.id
    # - Select: current_streak, longest_streak, last_activity_date, streak_start_date

    # Step 2: Handle no streak record case
    # - If not found: return default values (all zeros, no dates)

    # Step 3: Verify streak is still valid
    # - Get today's date
    # - Calculate days since last_activity_date
    # - If days > 1: streak is broken, reset current_streak to 0
    # - If days == 1 or 0: streak is active

    # Step 4: Convert to response format
    # - Map to UserStreakResponse
    # - Format dates as YYYY-MM-DD strings
    # - Return streak data


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
    # Step 1: Query user_activity for lifetime aggregates
    # - Filter by user_id = current_user.id
    # - Aggregate using SUM():
    #   * total_points = SUM(total_points)
    #   * quizzes_completed = SUM(quiz_passes)
    #   * exercises_completed = SUM(exercises_completed)
    #   * total_time_spent_hours = SUM(time_spent_seconds) / 3600
    # - Count distinct activity_date for days_active

    # Step 2: Calculate average quiz score (optional, requires additional data)
    # - Query activity_log for quiz_pass activities
    # - If score_percentage is stored: AVG(score_percentage)
    # - If not available: return None

    # Step 3: Build response
    # - Map aggregated values to UserStatsResponse
    # - Convert time_spent_seconds to hours (divide by 3600)
    # - Round avg_quiz_score to 2 decimal places
    # - Return statistics summary
