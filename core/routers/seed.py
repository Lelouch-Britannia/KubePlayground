import logging
from pathlib import Path
from typing import Any, Optional

from auth.dependencies import db_dependency
from auth.models import Course, Topic
from fastapi import APIRouter, Depends, HTTPException
from models import (  # Quiz, QuizOption removed (quiz/grading feature commented out)
    EditorConfig,
    LearningUnit,
    UnitSolution,
)
from sqlalchemy.orm import Session
from starlette import status
from utils.file_operator import FileReadEntry, YamlFileOperator


router = APIRouter(prefix="/seed", tags=["seed"])
logger = logging.getLogger(__name__)


def _ensure_course_exists(db: Session, slug: str, name: str, description: str | None = None) -> Course:
    """Ensure course exists in SQLite, create if missing (upsert).

    Args:
        db: SQLite database session
        slug: Course slug (unique identifier)
        name: Course display name
        description: Optional course description

    Returns:
        Course: Existing or newly created course
    """
    course = db.query(Course).filter(Course.slug == slug).first()

    if course:
        # Update name/description if changed
        if course.name != name or course.description != description:
            course.name = name
            course.description = description
            db.commit()
            db.refresh(course)
            logger.info("Updated course: %s", slug)
    else:
        # Create new course
        course = Course(slug=slug, name=name, description=description)
        db.add(course)
        db.commit()
        db.refresh(course)
        logger.info("Created course: %s", slug)

    return course


def _ensure_topic_exists(
    db: Session, course_id: int, slug: str, name: str, order: int, icon: str | None = None
) -> Topic:
    """Ensure topic exists in SQLite, create if missing (upsert).

    Args:
        db: SQLite database session
        course_id: Parent course ID
        slug: Topic slug (unique within course)
        name: Topic display name
        order: Topic order in learning path
        icon: Optional emoji/icon

    Returns:
        Topic: Existing or newly created topic
    """
    topic = db.query(Topic).filter(Topic.course_id == course_id, Topic.slug == slug).first()

    if topic:
        # Update fields if changed
        changed = False
        if topic.name != name:
            topic.name = name
            changed = True
        if topic.order_position != order:
            topic.order_position = order
            changed = True
        if icon and topic.icon != icon:
            topic.icon = icon
            changed = True

        if changed:
            db.commit()
            db.refresh(topic)
            logger.info("Updated topic: %s (order=%s)", slug, order)
    else:
        # Create new topic
        topic = Topic(course_id=course_id, slug=slug, name=name, order_position=order, icon=icon, units_count=0)
        db.add(topic)
        db.commit()
        db.refresh(topic)
        logger.info("Created topic: %s (order=%s)", slug, order)

    return topic


def _increment_topic_units_count(db: Session, topic_id: int) -> None:
    """Increment units_count for a topic (cached count).

    Args:
        db: SQLite database session
        topic_id: Topic ID to update
    """
    topic = db.query(Topic).filter(Topic.id == topic_id).first()
    if topic:
        topic.units_count += 1
        db.commit()


@router.post("/populate")
async def populate_database(topic_dir: str, *, skip_existing: bool = True, db: db_dependency) -> dict[str, Any]:
    """Seed database from YAML files in specified directory.

    Supports course/topic hierarchy via embedded metadata:
    - course: {slug, name} - Auto-creates course if missing
    - topic: {slug, name, order, icon} - Auto-creates topic if missing
    - Dual-write: SQLite (catalog) + MongoDB (content)

    Args:
        topic_dir: Absolute path to directory containing YAML files
        skip_existing: If True, skip units with existing slugs
        db: SQLite database session

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

        # Parse course/topic metadata (optional for backward compatibility)
        topic_metadata = metadata.get("topic", {})

        # Handle both nested dict and legacy string formats
        if isinstance(topic_metadata, dict):
            course_info = metadata.get("course", {})
            topic_info = topic_metadata
            # Use topic name for legacy field
            legacy_topic_str = topic_info.get("name", "General")
        else:
            # Legacy format: topic is a string
            course_info = {}
            topic_info = {}
            legacy_topic_str = topic_metadata if isinstance(topic_metadata, str) else "General"

        # Ensure course and topic exist in SQLite (if metadata provided)
        course_id = None
        topic_id = None

        if course_info and topic_info:
            try:
                # Create/update course
                course = _ensure_course_exists(
                    db=db,
                    slug=course_info.get("slug", ""),
                    name=course_info.get("name", ""),
                    description=course_info.get("description"),
                )
                course_id = course.id

                # Create/update topic
                topic = _ensure_topic_exists(
                    db=db,
                    course_id=course_id,
                    slug=topic_info.get("slug", ""),
                    name=topic_info.get("name", ""),
                    order=topic_info.get("order", 999),
                    icon=topic_info.get("icon"),
                )
                topic_id = topic.id
            except Exception as e:
                stats["errors"].append(f"{yaml_file.name}: Failed to create course/topic - {e!s}")
                continue

        # Validate data integrity based on unit type
        solution_data = data.get("_solution", {})

        # Quiz integrity validation — commented out (quiz/grading feature disabled)
        # if unit_type == "conceptual":
        #     quizzes_data = data.get("quizzes", [])
        #     quiz_answers = solution_data.get("quiz_answers", {})
        #     validation_errors = _validate_quiz_integrity(quizzes_data, quiz_answers)
        #     if validation_errors:
        #         stats["errors"].append(f"{yaml_file.name}: {'; '.join(validation_errors)}")
        #         continue
        if unit_type == "coding" and (not data.get("editor_config") or not metadata.get("steps")):
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
                topic=legacy_topic_str,  # Backward compatibility
                order_index=metadata["order_index"],
                type=unit_type,
                difficulty=metadata.get("difficulty"),
                description=metadata["description"],
                steps=metadata.get("steps"),
                hints=metadata.get("hints"),
                # quizzes=_parse_quizzes(data.get("quizzes")) if unit_type == "conceptual" else None,  # quiz/grading feature commented out
                editor_config=_parse_editor_config(data.get("editor_config")) if unit_type == "coding" else None,
                # Course/Topic hierarchy
                course_id=course_id,
                topic_id=topic_id,
            )

            # Insert LearningUnit
            await learning_unit.insert()
            unit_id = learning_unit.id

            # Update topic units_count in SQLite (cached count)
            if topic_id:
                _increment_topic_units_count(db, topic_id)

            # Insert UnitSolution for coding units (validation_script needed by validate-only endpoint)
            # quiz_answers/quiz_explanations stay commented out (quiz/grading feature disabled)
            if unit_type == "coding" and solution_data.get("validation_script"):
                unit_solution = UnitSolution(
                    unit_id=unit_id,
                    # quiz_answers=solution_data.get("quiz_answers"),  # quiz/grading feature commented out
                    # quiz_explanations=solution_data.get("quiz_explanations"),  # quiz/grading feature commented out
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


# _parse_quizzes — commented out (quiz/grading feature disabled)
# def _parse_quizzes(quizzes_data: list[dict[str, Any]] | None) -> list[Quiz] | None:
#     """Convert YAML quiz data to Quiz BaseModel objects."""
#     if not quizzes_data:
#         return None
#
#     quiz_list = []
#     for quiz_dict in quizzes_data:
#         quiz_id = quiz_dict.get("id", "")
#         question = quiz_dict.get("question", "")
#         options_data = quiz_dict.get("options", [])
#
#         # Parse options into QuizOption objects
#         quiz_options = [QuizOption(id=opt.get("id", ""), text=opt.get("text", "")) for opt in options_data]
#
#         quiz_list.append(Quiz(id=quiz_id, question=question, options=quiz_options))
#
#     return quiz_list


def _parse_editor_config(config_data: dict[str, Any] | None) -> EditorConfig | None:
    """Convert YAML editor config to EditorConfig BaseModel."""
    if not config_data:
        return None

    return EditorConfig(initial_code=config_data.get("initial_code", ""), language=config_data.get("language", "yaml"))


# _validate_quiz_integrity — commented out (quiz/grading feature disabled)
# def _validate_quiz_integrity(quizzes_data: list[dict[str, Any]], quiz_answers: dict[str, str]) -> list[str]:
#     """Validate quiz answer keys match quiz/option IDs."""
#     errors = []
#     quiz_map: dict[str, set] = {}
#     for quiz_dict in quizzes_data:
#         quiz_id = quiz_dict.get("id")
#         if not quiz_id:
#             errors.append("Quiz missing 'id' field")
#             continue
#         options = quiz_dict.get("options", [])
#         option_ids = {opt.get("id") for opt in options if opt.get("id")}
#         quiz_map[quiz_id] = option_ids
#     for quiz_id, answer_option_id in quiz_answers.items():
#         if quiz_id not in quiz_map:
#             errors.append(f"Answer key references non-existent quiz '{quiz_id}'")
#             continue
#         if answer_option_id not in quiz_map[quiz_id]:
#             errors.append(f"Quiz '{quiz_id}' has invalid answer option '{answer_option_id}'")
#     return errors
