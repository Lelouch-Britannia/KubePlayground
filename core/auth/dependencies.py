"""FastAPI dependencies for authentication."""

from typing import Annotated

from auth.models import User
from auth.security import decode_token
from database import get_db
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jwt.exceptions import PyJWTError
from sqlalchemy.orm import Session


# Dependency injection pattern: Annotated type with Depends
db_dependency = Annotated[Session, Depends(get_db)]
# OAuth2 scheme for JWT token extraction
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def get_current_user(db: db_dependency, token: str = Depends(oauth2_scheme)) -> User:
    """Dependency to get current authenticated user from JWT token.

    Args:
        token: JWT token from Authorization header
        db: Database session

    Returns:
        User: The authenticated user

    Raises:
        HTTPException: 401 if token is invalid or user not found
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = decode_token(token)
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except PyJWTError as exc:
        raise credentials_exception from exc

    # Query user from database
    user = db.query(User).filter_by(id=user_id).first()
    if user is None:
        raise credentials_exception

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is deactivated",
        )

    return user


def get_current_user_optional(db: db_dependency, token: str = Depends(oauth2_scheme)) -> User | None:
    """Dependency to get current user if token is provided, otherwise None.

    Useful for endpoints that work for both authenticated and anonymous users.

    Args:
        token: JWT token from Authorization header
        db: Database session

    Returns:
        User | None: The authenticated user or None
    """
    try:
        return get_current_user(token, db)
    except HTTPException:
        return None
