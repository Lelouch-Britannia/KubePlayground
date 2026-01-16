from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from utils.logger import setup_logging
from routers import seed, dashboard, content, solutions, grading, progress
from database import init_db

@asynccontextmanager
async def lifespan(app: FastAPI):
    
    # Setup structured logging
    setup_logging()
    # Initialize database connection
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

app.include_router(seed.router)
app.include_router(dashboard.router)
app.include_router(content.router)
app.include_router(solutions.router)
app.include_router(grading.router)
app.include_router(progress.router)