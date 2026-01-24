import logging

from fastapi import APIRouter, HTTPException
from models import LearningUnit, UnitSolution
from schema import (
    CodeVerificationRequest,
    CodeVerificationResponse,
    QuizResultItem,
    QuizSubmissionRequest,
    QuizSubmissionResponse,
)
from starlette import status


PASSING_SCORE_THRESHOLD = 70.0  # Minimum score percentage to pass

router = APIRouter(prefix="/api/grading", tags=["grading"])
logger = logging.getLogger(__name__)


@router.post("/quiz/submit")
async def submit_quiz(request: QuizSubmissionRequest) -> QuizSubmissionResponse:
    """Grade quiz submission by comparing against UnitSolution answer keys.

    Args:
        request: QuizSubmissionRequest with unit_slug, user_id, answers dict

    Returns:
        QuizSubmissionResponse: Detailed results with score and explanations

    Raises:
        HTTPException 404: Unit or solution not found
        HTTPException 400: Invalid quiz IDs in submission

    Security:
        - Retrieves answers from UnitSolution (NEVER exposed to frontend)
        - Returns only grading results, not raw answer keys
    """
    # Find unit by slug
    unit = await LearningUnit.find_one(LearningUnit.slug == request.unit_slug)
    if not unit:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"Learning unit not found: {request.unit_slug}"
        )

    # Find solution with answer keys
    solution = await UnitSolution.find_one(UnitSolution.unit_id == unit.id)
    if not solution or not solution.quiz_answers:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quiz answers not found for this unit")

    # Grade each answer
    results = []
    correct_count = 0

    for quiz_id, selected_answer in request.answers.items():
        correct_answer = solution.quiz_answers.get(quiz_id)
        if not correct_answer:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid quiz ID: {quiz_id}")

        is_correct = selected_answer == correct_answer
        if is_correct:
            correct_count += 1

        explanation = solution.quiz_explanations.get(quiz_id) if solution.quiz_explanations else None

        results.append(
            QuizResultItem(
                quiz_id=quiz_id,
                is_correct=is_correct,
                selected_answer=selected_answer,
                correct_answer=correct_answer,
                explanation=explanation,
            )
        )

    total_questions = len(request.answers)
    score_percentage = (correct_count / total_questions * 100) if total_questions > 0 else 0.0
    passed = score_percentage >= PASSING_SCORE_THRESHOLD

    return QuizSubmissionResponse(
        total_questions=total_questions,
        correct_answers=correct_count,
        score_percentage=round(score_percentage, 1),
        results=results,
        passed=passed,
    )


@router.post("/code/verify")
async def verify_code(_request: CodeVerificationRequest) -> CodeVerificationResponse:
    """Verify YAML code submission (STUB for Phase 2 - full implementation in Phase 6).

    Args:
        request: CodeVerificationRequest with unit_slug, user_id, code, language

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
