from contextlib import asynccontextmanager

from auth import router as auth_router
from auth.models import User
from database import Base, SessionLocal, engine, get_mongo_helper, init_db
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from routers import (
    content,
    courses,
    dashboard,
    grading,
    progress,
    seed,
)  # solutions removed (quiz/grading feature commented out)
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from utils.logger import setup_logging


# Rate Limiting Configuration
# ============================
# SlowAPI provides decorator-based rate limiting for API endpoints.
# Uses remote address (IP) as the key for tracking request counts.
# For local deployment, this prevents accidental API abuse during development.
limiter = Limiter(key_func=get_remote_address)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Setup structured logging
    setup_logging()
    # Initialize MongoDB connection (async)
    await init_db()
    yield


app = FastAPI(lifespan=lifespan)

# Register rate limiter
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS Configuration - Local Deployment Only
# ===========================================
# This application is designed for LOCAL, SINGLE-USER deployment scenarios.
# The permissive CORS policy (* wildcards) is intentional for ease of development
# and local usage where the frontend may be served from various localhost ports
# (e.g., :3000 for dev, :8080 for prod build, :8001 for docker).
#
# ⚠️ SECURITY WARNING: This configuration is NOT suitable for public/production deployment.
# For internet-facing deployments, replace with:
#   allow_origins=[os.getenv("ALLOWED_ORIGINS", "http://localhost:8080").split(",")]
#   allow_methods=["GET", "POST", "PUT", "DELETE"]
#   allow_headers=["Authorization", "Content-Type"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Permissive for local development/deployment
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create all SQLAlchemy tables (IAM models) at module level
Base.metadata.create_all(bind=engine)


@app.get("/health")
async def health_check():
    """Enhanced health check endpoint for container orchestration and monitoring.

    Performs comprehensive health checks across all database connections:
    - API service status (always healthy if responding)
    - SQLite connectivity and query test
    - MongoDB connectivity and ping test

    Returns:
        dict: Health status for each component
            {
                "status": "healthy" | "degraded" | "unhealthy",
                "api": "healthy",
                "sqlite": "healthy" | "unhealthy",
                "mongodb": "healthy" | "unhealthy",
                "timestamp": "2026-02-01T12:00:00Z"
            }

    Status Codes:
        200: All systems healthy
        503: One or more systems unhealthy (Service Unavailable)

    Note:
        Container orchestrators (Docker, Kubernetes) use this endpoint to
        determine if the service should receive traffic. Failing health checks
        trigger container restarts.
    """
    from datetime import datetime, timezone

    health_status = {
        "api": "healthy",
        "sqlite": "unknown",
        "mongodb": "unknown",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    # Test SQLite connectivity
    try:
        db = SessionLocal()
        # Simple query to test connection
        db.query(User).first()
        db.close()
        health_status["sqlite"] = "healthy"
    except Exception as e:
        health_status["sqlite"] = f"unhealthy: {str(e)[:100]}"

    # Test MongoDB connectivity
    try:
        mongo_helper = get_mongo_helper()
        if mongo_helper:
            # Ping MongoDB to verify connection
            await mongo_helper.ping()
            health_status["mongodb"] = "healthy"
        else:
            health_status["mongodb"] = "unhealthy: not initialized"
    except Exception as e:
        health_status["mongodb"] = f"unhealthy: {str(e)[:100]}"

    # Determine overall status
    if health_status["sqlite"] == "healthy" and health_status["mongodb"] == "healthy":
        health_status["status"] = "healthy"
        return health_status
    if "unhealthy" in health_status["sqlite"] or "unhealthy" in health_status["mongodb"]:
        health_status["status"] = "unhealthy"
        return JSONResponse(content=health_status, status_code=503)
    health_status["status"] = "degraded"
    return JSONResponse(content=health_status, status_code=200)


# ============================================================================
# API Versioning Strategy
# ============================================================================
# All routes are prefixed with /api/v1 for versioning.
# This allows future breaking changes to be introduced under /api/v2 while
# maintaining backward compatibility with existing clients.
#
# Versioning Benefits:
#   - Non-breaking changes: Add new endpoints/fields without version bump
#   - Breaking changes: Introduce v2 while keeping v1 active
#   - Gradual migration: Clients can upgrade at their own pace
#   - Sunset policy: Deprecate old versions with advance notice
#
# Example migration path:
#   1. Introduce /api/v2 with new auth flow
#   2. Mark /api/v1 as deprecated (add warning headers)
#   3. Run both versions for 6 months
#   4. Remove /api/v1 support
app.include_router(auth_router.router, prefix="/api/v1")
app.include_router(seed.router, prefix="/api/v1")
app.include_router(courses.router, prefix="/api/v1")
app.include_router(dashboard.router, prefix="/api/v1")
app.include_router(content.router, prefix="/api/v1")
# app.include_router(solutions.router, prefix="/api/v1")  # quiz/grading feature commented out
app.include_router(grading.router, prefix="/api/v1")
app.include_router(progress.router, prefix="/api/v1")

# WebSocket route for manifest execution (used by Run button in coding exercises)
app.add_api_websocket_route("/ws/grading/run", grading.ws_run_manifest)
