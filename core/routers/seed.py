import logging
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from models import EditorConfig, LearningUnit, Quiz, QuizOption, UnitSolution
from starlette import status
from utils.file_operator import FileReadEntry, YamlFileOperator


router = APIRouter(prefix="/seed", tags=["seed"])
logger = logging.getLogger(__name__)


@router.post("/populate")
async def populate_database(topic_dir: str, *, skip_existing: bool = True) -> dict[str, Any]:
    """Seed database from YAML files in specified directory.

    Args:
        topic_dir: Absolute path to directory containing YAML files
        skip_existing: If True, skip units with existing slugs

    Returns:
        Summary statistics (created, skipped, errors, files_processed)
    """
    stats: dict[str, Any] = {"created": 0, "skipped": 0, "errors": [], "files_processed": []}

    # Validate directory exists
    directory = Path(topic_dir)
    if not directory.exists() or not directory.is_dir():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Directory {topic_dir} does not exist.")

    # Get all YAML files sorted by filename
    yaml_files = sorted(directory.rglob("*.yaml"))

    # Load existing slugs for duplicate detection (O(1) lookup)
    existing_slugs: set = set(await LearningUnit.get_motor_collection().distinct("slug"))

    # Process each YAML file
    for yaml_file in yaml_files:
        try:
            # Parse YAML file
            data = YamlFileOperator.read(FileReadEntry(read_path=yaml_file))
        except Exception as e:
            stats["errors"].append(f"Failed to read {yaml_file.name}: {e!s}")
            continue

        # Extract metadata
        metadata = data.get("metadata", {})
        slug = metadata.get("slug")
        unit_type = metadata.get("type")

        # Skip if unit already exists
        if skip_existing and slug in existing_slugs:
            stats["skipped"] += 1
            continue

        # Validate data integrity based on unit type
        solution_data = data.get("_solution", {})

        if unit_type == "conceptual":
            quizzes_data = data.get("quizzes", [])
            quiz_answers = solution_data.get("quiz_answers", {})
            validation_errors = _validate_quiz_integrity(quizzes_data, quiz_answers)
            if validation_errors:
                stats["errors"].append(f"{yaml_file.name}: {'; '.join(validation_errors)}")
                continue
        elif unit_type == "coding":
            if not data.get("editor_config") or not metadata.get("steps"):
                stats["errors"].append(f"{yaml_file.name}: Missing editor_config or steps")
                continue
            # if not solution_data.get('code_solution') or not solution_data.get('validation_script'):
            #     stats['errors'].append(f"{yaml_file.name}: Missing code_solution or validation_script")
            #     continue

        # Build LearningUnit (public data only)
        try:
            learning_unit = LearningUnit(
                slug=metadata["slug"],
                title=metadata["title"],
                topic=metadata["topic"],
                order_index=metadata["order_index"],
                type=unit_type,
                difficulty=metadata.get("difficulty"),
                description=metadata["description"],
                steps=metadata.get("steps"),
                hints=metadata.get("hints"),
                quizzes=_parse_quizzes(data.get("quizzes")) if unit_type == "conceptual" else None,
                editor_config=_parse_editor_config(data.get("editor_config")) if unit_type == "coding" else None,
            )

            # Insert LearningUnit and capture ID for foreign key
            await learning_unit.insert()
            unit_id = learning_unit.id

            # Build and insert UnitSolution (private data)
            unit_solution = UnitSolution(
                unit_id=unit_id,  # type: ignore
                quiz_answers=solution_data.get("quiz_answers"),
                quiz_explanations=solution_data.get("quiz_explanations"),
                code_solution=solution_data.get("code_solution"),
                validation_script=solution_data.get("validation_script"),
            )
            await unit_solution.insert()

            # Update stats
            stats["created"] += 1
            stats["files_processed"].append(yaml_file.name)

        except Exception as e:
            stats["errors"].append(f"{yaml_file.name}: Insert failed - {e!s}")
            continue

    return {
        "status": "success",
        "created": stats["created"],
        "skipped": stats["skipped"],
        "errors": stats["errors"],
        "files": stats["files_processed"],
    }


def _parse_quizzes(quizzes_data: list[dict[str, Any]] | None) -> list[Quiz] | None:
    """Convert YAML quiz data to Quiz BaseModel objects."""
    if not quizzes_data:
        return None

    quiz_list = []
    for quiz_dict in quizzes_data:
        quiz_id = quiz_dict.get("id", "")
        question = quiz_dict.get("question", "")
        options_data = quiz_dict.get("options", [])

        # Parse options into QuizOption objects
        quiz_options = [QuizOption(id=opt.get("id", ""), text=opt.get("text", "")) for opt in options_data]

        quiz_list.append(Quiz(id=quiz_id, question=question, options=quiz_options))

    return quiz_list


def _parse_editor_config(config_data: dict[str, Any] | None) -> EditorConfig | None:
    """Convert YAML editor config to EditorConfig BaseModel."""
    if not config_data:
        return None

    return EditorConfig(initial_code=config_data.get("initial_code", ""), language=config_data.get("language", "yaml"))


def _validate_quiz_integrity(quizzes_data: list[dict[str, Any]], quiz_answers: dict[str, str]) -> list[str]:
    """Validate quiz answer keys match quiz/option IDs.

    Args:
        quizzes_data: List of quiz dictionaries from YAML
        quiz_answers: Answer key mapping quiz_id -> option_id

    Returns:
        List of error messages (empty if valid)
    """
    errors = []

    # Build mapping of quiz_id -> set of option_ids
    quiz_map: dict[str, set] = {}
    for quiz_dict in quizzes_data:
        quiz_id = quiz_dict.get("id")
        if not quiz_id:
            errors.append("Quiz missing 'id' field")
            continue

        options = quiz_dict.get("options", [])
        option_ids = {opt.get("id") for opt in options if opt.get("id")}
        quiz_map[quiz_id] = option_ids

    # Validate each answer
    for quiz_id, answer_option_id in quiz_answers.items():
        # Check if quiz ID exists
        if quiz_id not in quiz_map:
            errors.append(f"Answer key references non-existent quiz '{quiz_id}'")
            continue

        # Check if answer option ID exists in that quiz
        if answer_option_id not in quiz_map[quiz_id]:
            errors.append(f"Quiz '{quiz_id}' has invalid answer option '{answer_option_id}'")

    return errors
