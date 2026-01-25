"""Security utilities for JWT and password management."""

import hashlib
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from jwt.exceptions import DecodeError, ExpiredSignatureError, InvalidTokenError, PyJWTError
from passlib.context import CryptContext


# Password hashing context
bcrypt_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# JWT Configuration
SECRET_KEY = os.getenv("JWT_SECRET", "dev-secret-key-change-in-production")
ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", "60"))


# ============================================================================
# Password Utilities
# ============================================================================


def hash_password(plain_password: str) -> str:
    """Hash a plain text password using bcrypt.

    Args:
        plain_password: The plain text password to hash

    Returns:
        str: The bcrypt hashed password
    """
    return bcrypt_context.hash(plain_password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain text password against a hashed password.

    Args:
        plain_password: The plain text password to verify
        hashed_password: The hashed password to compare against

    Returns:
        bool: True if password matches, False otherwise
    """
    return bcrypt_context.verify(plain_password, hashed_password)


# ============================================================================
# Token Hashing Utilities (for storing refresh tokens in DB)
# ============================================================================


def hash_token(token: str) -> str:
    """Hash a token using SHA256 for database storage.

    Note: Use SHA256 (fast) instead of bcrypt (slow) for tokens.
    Bcrypt is for passwords (user types), SHA256 is for tokens (system generates).

    Args:
        token: The token to hash

    Returns:
        str: Hex-encoded SHA256 hash
    """
    return hashlib.sha256(token.encode()).hexdigest()


def verify_token_hash(token: str, token_hash: str) -> bool:
    """Verify a token against its stored hash.

    Args:
        token: The plain token
        token_hash: The stored hash to compare against

    Returns:
        bool: True if token matches hash
    """
    return hash_token(token) == token_hash


# ============================================================================
# JWT Token Utilities
# ============================================================================


def create_access_token(
    data: dict,
    expires_delta: timedelta | None = None,
) -> str:
    """Create a JWT access token (short-lived, rich claims).

    Access tokens contain user identity + permissions and are used for API authorization.
    They should be short-lived (minutes) since they can't be revoked.

    Typical claims: sub (user_id), email, roles, permissions

    Args:
        data: The payload data (should include sub, email, etc.)
        expires_delta: Optional custom expiration time delta

    Returns:
        str: Encoded JWT access token
    """
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)

    payload = data.copy()
    payload.update(
        {
            "iat": datetime.now(timezone.utc),  # Issued at
            "exp": expire,  # Expiration
            "token_type": "access",  # Distinguish from refresh tokens
        }
    )

    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    """Decode and validate a JWT token.

    Args:
        token: The JWT token to decode

    Returns:
        dict: The decoded token payload containing user_id and email

    Raises:
        PyJWTError: If token is invalid or expired
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except PyJWTError as e:
        msg = f"Could not validate credentials: {e!s}"
        raise PyJWTError(msg) from e


# ============================================================================
# Refresh Token Utilities
# ============================================================================


def create_refresh_token(user_id: str, expires_days: int = 7) -> str:
    """Create a refresh token (long-lived, minimal claims).

    Refresh tokens contain ONLY user_id and are used to obtain new access tokens.
    They should be long-lived (days/weeks) and stored in database for revocation.

    Minimal claims: sub (user_id), type=refresh

    Args:
        user_id: The user's UUID
        expires_days: Number of days until token expires (default 7)

    Returns:
        str: Encoded refresh token
    """
    expire = datetime.now(timezone.utc) + timedelta(days=expires_days)

    payload = {
        "sub": user_id,
        "type": "refresh",  # CRITICAL: distinguishes from access tokens
        "iat": datetime.now(timezone.utc),
        "exp": expire,
    }

    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def verify_refresh_token(token: str) -> str | None:
    """Verify a refresh token and extract user ID.

    Args:
        token: The refresh token to verify

    Returns:
        Optional[str]: User ID if token is valid, None otherwise
    """
    try:
        payload = decode_token(token)
        # IMPORTANT: Check token type to prevent access token being used as refresh token
        if payload.get("type") != "refresh":
            return None
        return payload.get("sub")
    except PyJWTError:
        return None
