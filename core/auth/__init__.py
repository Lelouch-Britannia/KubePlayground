"""Auth package for Identity and Access Management."""

from auth.dependencies import get_current_user, get_current_user_optional
from auth.models import ActivityLog, RefreshToken, User, UserActivity, UserStreak
from auth.router import router as auth_router
from auth.schemas import (
    ActivityLogCreate,
    HeatmapDataResponse,
    LoginRequest,
    PasswordChangeRequest,
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
    decode_token,
    hash_password,
    verify_password,
)


__all__ = [
    "ActivityLog",
    "ActivityLogCreate",
    "HeatmapDataResponse",
    "LeaderboardEntry",
    "LeaderboardResponse",
    "LoginRequest",
    "PasswordChangeRequest",
    "RefreshToken",
    "TokenResponse",
    "User",
    "UserActivity",
    "UserActivityResponse",
    "UserCreate",
    "UserResponse",
    "UserStatsResponse",
    "UserStreak",
    "UserStreakResponse",
    "UserUpdate",
    "auth_router",
    "create_access_token",
    "decode_token",
    "get_current_user",
    "get_current_user_optional",
    "get_db",
    "hash_password",
    "verify_password",
]
