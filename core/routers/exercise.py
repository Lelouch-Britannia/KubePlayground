from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from starlette import status


router = APIRouter(
    prefix="/exercise",
    tags=["exercise"]
)