import contextlib
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Annotated

import httpx
import websockets
from auth.dependencies import get_current_user  # db_dependency removed (quiz/grading feature commented out)
from auth.models import User  # ActivityLog, UserActivity removed (quiz/grading feature commented out)
from auth.security import decode_token
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from models import LearningUnit, UnitSolution, UserProgress
from schema import (
    CleanupRequest,
    CodeVerificationRequest,
    CodeVerificationResponse,
    # QuizResultItem,  # quiz/grading feature commented out
    # QuizSubmissionRequest,  # quiz/grading feature commented out
    # QuizSubmissionResponse,  # quiz/grading feature commented out
    # ValidationRequest,  # quiz/grading feature commented out (unused)
    ValidateOnlyRequest,
    ValidateOnlyResponse,
    ValidationResponse,
)
from starlette import status


router = APIRouter(prefix="/grading", tags=["grading"])
logger = logging.getLogger(__name__)

# Dependency injection for authenticated user
current_user_dependency = Annotated[User, Depends(get_current_user)]


# ============================================================================
# Quiz grading endpoints — commented out (quiz/grading feature disabled)
# ============================================================================
# @router.post("/quiz/submit")
# @limiter.limit("30/minute")
# async def submit_quiz(
#     request: Request,
#     submission: QuizSubmissionRequest,
#     current_user: current_user_dependency,
#     db: db_dependency,
# ) -> QuizSubmissionResponse:
#     """Grade quiz submission by comparing against UnitSolution answer keys."""
#     unit = await LearningUnit.find_one(LearningUnit.slug == submission.unit_slug)
#     if not unit:
#         raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, ...)
#     solution = await UnitSolution.find_one(UnitSolution.unit_id == unit.id)
#     if not solution or not solution.quiz_answers:
#         raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, ...)
#     ... (full implementation preserved in git history)
#
#
# @router.get("/quiz/{unit_slug}/last-submission")
# async def get_last_quiz_submission(...):
#     """Get the last quiz submission for a unit."""
#     ... (full implementation preserved in git history)


@router.post("/code/verify")
async def verify_code(
    _request: CodeVerificationRequest,
    _current_user: current_user_dependency,
) -> CodeVerificationResponse:
    """Verify YAML code submission (STUB for Phase 2 - full implementation in Phase 6).

    Requires:
        Authorization: Bearer <token> header

    Args:
        _request: CodeVerificationRequest with unit_slug, code, language (unused in stub)
        _current_user: Authenticated user (required for authorization)

    Returns:
        CodeVerificationResponse: Validation results (stubbed response)

    Note:
        Phase 6 will implement actual K8s YAML validation via validation-service.
        For now, returns mock success response.
    """
    # Stub implementation - always return success
    return CodeVerificationResponse(
        is_valid=True,
        message="Code validation deferred to Phase 6. Validation-service integration pending.",
        errors=None,
    )


@router.post("/code/validate")
async def validate_code(
    request: CodeVerificationRequest,
    current_user: current_user_dependency,
) -> ValidationResponse:
    """Validate K8s YAML code using validation-service.

    Args:
        request: CodeVerificationRequest with unit_slug, code, language
        current_user: Authenticated user

    Returns:
        ValidationResponse: Detailed validation results from validation-service

    Raises:
        HTTPException 404: Unit or solution not found
        HTTPException 503: Validation service unavailable
    """
    # Find unit and solution
    unit = await LearningUnit.find_one(LearningUnit.slug == request.unit_slug)
    if not unit:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"Learning unit not found: {request.unit_slug}"
        )

    solution = await UnitSolution.find_one(UnitSolution.unit_id == unit.id)
    if not solution or not solution.validation_script:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Validation script not found for this unit")

    # Generate request ID
    request_id = str(uuid.uuid4())

    # Call validation service
    validation_service_url = "http://validation-service:8080"
    logger.info(
        "Calling validation service - user_id: %s, unit_slug: %s, request_id: %s",
        current_user.id,
        request.unit_slug,
        request_id,
    )

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                f"{validation_service_url}/api/v1/validate",
                headers={
                    "Authorization": "Bearer dev-secret-change-in-production-please",  # TODO: Use proper JWT
                    "Content-Type": "application/json",
                },
                json={
                    "request_id": request_id,
                    "unit_slug": request.unit_slug,
                    "user_id": current_user.id,
                    "user_yaml": request.code,
                    "validation_script": solution.validation_script,
                    "language": request.language or "yaml",
                },
            )

            if response.status_code != status.HTTP_200_OK:
                logger.error(
                    "Validation service error - status: %s, body: %s",
                    response.status_code,
                    response.text,
                )
                raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Validation service error")

            validation_result = response.json()
            logger.info(
                "Validation complete - request_id: %s, passed: %s, duration_ms: %s, resources: %s, pod_logs: %s",
                request_id,
                validation_result.get("passed"),
                validation_result.get("duration_ms"),
                len(validation_result.get("resource_status") or []),
                len(validation_result.get("pod_logs") or []),
            )

            # Update progress if validation passed
            if validation_result.get("passed"):
                try:
                    # Update user progress to completed
                    existing_progress = await UserProgress.find_one(
                        UserProgress.user_id == current_user.id,
                        UserProgress.unit_id == unit.id,
                    )

                    now = datetime.now(tz=timezone.utc)
                    if existing_progress:
                        existing_progress.status = "completed"
                        existing_progress.score = 100
                        existing_progress.completed_at = now
                        await existing_progress.save()
                    else:
                        # Create new progress record
                        new_progress = UserProgress(
                            user_id=current_user.id,
                            unit_id=unit.id,
                            status="completed",
                            score=100,
                            completed_at=now,
                        )
                        await new_progress.insert()

                    logger.info(
                        "Progress updated for user %s, unit %s - validation passed",
                        current_user.id,
                        request.unit_slug,
                    )
                except Exception:
                    logger.exception("Failed to update progress")

            return ValidationResponse(**validation_result)

    except httpx.TimeoutException:
        logger.exception("Validation service timeout - request_id: %s", request_id)
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail="Validation service timeout")
    except httpx.RequestError:
        logger.exception("Validation service connection error")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Cannot connect to validation service"
        )


# ============================================================================
# WebSocket: Stream manifest execution in real-time
# ============================================================================

VALIDATION_SERVICE_URL = "http://validation-service:8080"
VALIDATION_SERVICE_WS = "ws://validation-service:8080"
VALIDATION_SERVICE_TOKEN = "dev-secret-change-in-production-please"  # noqa: S105  # TODO: Use proper JWT


@router.websocket("/ws/run")
async def ws_run_manifest(websocket: WebSocket):
    """WebSocket proxy: frontend ↔ core ↔ Go validation service.

    Protocol:
    1. Client connects and sends: {"unit_slug": "...", "code": "...", "language": "yaml"}
    2. Server authenticates from the token query param, resolves validation_script,
       then opens a WS to the Go service and relays all phase messages back.
    3. Final message is type=run_complete with the namespace and full run data.
    """
    await websocket.accept()

    try:
        # Authenticate via query param (WS can't use custom headers)
        token = websocket.query_params.get("token", "")
        if not token:
            await websocket.send_json({"type": "error", "message": "Missing token"})
            await websocket.close(code=4001, reason="Unauthorized")
            return

        # Validate token - decode JWT to get user
        try:
            user_data = decode_token(token)
        except Exception:
            user_data = None

        if not user_data:
            await websocket.send_json({"type": "error", "message": "Invalid token"})
            await websocket.close(code=4001, reason="Unauthorized")
            return

        user_id = user_data.get("sub") or user_data.get("id")
        if not user_id:
            await websocket.send_json({"type": "error", "message": "Invalid token payload"})
            await websocket.close(code=4001, reason="Unauthorized")
            return

        # Read the run request from the client
        client_msg = await websocket.receive_json()
        unit_slug = client_msg.get("unit_slug", "")
        user_yaml = client_msg.get("code", "")
        language = client_msg.get("language", "yaml")

        if not unit_slug or not user_yaml:
            await websocket.send_json({"type": "error", "message": "Missing unit_slug or code"})
            await websocket.close(code=4002, reason="Bad request")
            return

        # Generate request ID
        request_id = str(uuid.uuid4())

        logger.info(
            "WS run request - user_id: %s, unit_slug: %s, request_id: %s",
            user_id,
            unit_slug,
            request_id,
        )

        # Build the run request for the Go service
        run_request = {
            "request_id": request_id,
            "unit_slug": unit_slug,
            "user_id": int(user_id),
            "user_yaml": user_yaml,
            "language": language,
        }

        # Connect to Go validation service WebSocket and relay messages
        go_ws_url = f"{VALIDATION_SERVICE_WS}/ws/run?token={VALIDATION_SERVICE_TOKEN}"

        async with websockets.connect(go_ws_url) as go_ws:
            # Send the run request to Go service
            await go_ws.send(json.dumps(run_request))

            # Relay all messages from Go → frontend
            async for message in go_ws:
                try:
                    msg_data = json.loads(message)
                    await websocket.send_json(msg_data)

                    # If run_complete, we're done relaying
                    if msg_data.get("type") == "run_complete":
                        break
                except json.JSONDecodeError:
                    logger.exception("Invalid JSON from Go WS: %s", message[:200])

        logger.info("WS run completed - request_id: %s", request_id)

    except WebSocketDisconnect:
        logger.info("Client disconnected from WS run")
    except websockets.exceptions.ConnectionClosed:
        logger.exception("Go validation service WS connection closed unexpectedly")
        with contextlib.suppress(Exception):
            await websocket.send_json({"type": "error", "message": "Validation service connection lost"})
    except Exception as e:
        logger.exception("WS run error")
        with contextlib.suppress(Exception):
            await websocket.send_json({"type": "error", "message": str(e)})


# ============================================================================
# REST: Validate-only on existing namespace
# ============================================================================


@router.post("/code/validate-only")
async def validate_only(
    request: ValidateOnlyRequest,
    current_user: current_user_dependency,
) -> ValidateOnlyResponse:
    """Run validation tests on an existing namespace (after WebSocket run).

    Expects the namespace to already exist from a prior /ws/run call.
    The validation_script is resolved server-side from the unit_slug.
    """
    unit = await LearningUnit.find_one(LearningUnit.slug == request.unit_slug)
    if not unit:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Unit not found: {request.unit_slug}")

    solution = await UnitSolution.find_one(UnitSolution.unit_id == unit.id)
    if not solution or not solution.validation_script:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Validation script not found")

    body = {
        "request_id": str(uuid.uuid4()),
        "namespace": request.namespace,
        "validation_script": solution.validation_script,
    }

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{VALIDATION_SERVICE_URL}/api/v1/validate-only",
                headers={
                    "Authorization": f"Bearer {VALIDATION_SERVICE_TOKEN}",
                    "Content-Type": "application/json",
                },
                json=body,
            )

            if response.status_code != status.HTTP_200_OK:
                logger.error("Validate-only error - status: %s, body: %s", response.status_code, response.text)
                raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Validation service error")

            result = response.json()
            logger.info(
                "Validate-only complete - request_id: %s, passed: %s",
                result.get("request_id"),
                result.get("passed"),
            )

            # Update progress if validation passed
            if result.get("passed"):
                await _update_progress_on_pass(request.unit_slug, current_user)

            return ValidateOnlyResponse(**result)

    except httpx.TimeoutException:
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail="Validation service timeout")
    except httpx.RequestError:
        logger.exception("Validate-only connection error")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Cannot connect to validation service"
        )


@router.post("/code/cleanup")
async def cleanup_namespace(
    request: CleanupRequest,
    current_user: current_user_dependency,  # noqa: ARG001
):
    """Clean up a namespace after run + validation."""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{VALIDATION_SERVICE_URL}/api/v1/cleanup",
                headers={
                    "Authorization": f"Bearer {VALIDATION_SERVICE_TOKEN}",
                    "Content-Type": "application/json",
                },
                json={"namespace": request.namespace},
            )
            if response.status_code != status.HTTP_200_OK:
                logger.error("Cleanup error - status: %s", response.status_code)
                raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Cleanup failed")
            return response.json()
    except httpx.RequestError:
        logger.exception("Cleanup connection error")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Cannot connect to validation service"
        )


# ============================================================================
# Helpers
# ============================================================================


async def _update_progress_on_pass(unit_slug: str, current_user):
    """Update user progress to completed when validation passes."""
    try:
        unit = await LearningUnit.find_one(LearningUnit.slug == unit_slug)
        if not unit:
            return

        existing_progress = await UserProgress.find_one(
            UserProgress.user_id == current_user.id,
            UserProgress.unit_id == unit.id,
        )

        now = datetime.now(tz=timezone.utc)
        if existing_progress:
            existing_progress.status = "completed"
            existing_progress.score = 100
            existing_progress.completed_at = now
            await existing_progress.save()
        else:
            new_progress = UserProgress(
                user_id=current_user.id,
                unit_id=unit.id,
                status="completed",
                score=100,
                completed_at=now,
            )
            await new_progress.insert()

        logger.info("Progress updated for user %s, unit %s", current_user.id, unit_slug)
    except Exception:
        logger.exception("Failed to update progress")
