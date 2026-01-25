from contextlib import asynccontextmanager

from auth import router as auth_router
from database import Base, engine, init_db
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import content, dashboard, grading, progress, seed, solutions
from utils.logger import setup_logging


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Setup structured logging
    setup_logging()
    # Initialize MongoDB connection (async)
    await init_db()
    yield


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allow all methods (GET, POST, PUT, DELETE, etc.)
    allow_headers=["*"],  # Allow all headers
)

# Create all SQLAlchemy tables (IAM models) at module level
Base.metadata.create_all(bind=engine)


@app.get("/health")
async def health_check():
    """Health check endpoint for container orchestration."""
    return {"status": "healthy"}


app.include_router(auth_router.router)
app.include_router(seed.router)
app.include_router(dashboard.router)
app.include_router(content.router)
app.include_router(solutions.router)
app.include_router(grading.router)
app.include_router(progress.router)
