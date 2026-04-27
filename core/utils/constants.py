import os
import socket

from dotenv import find_dotenv, load_dotenv


load_dotenv(find_dotenv())


class Constants:
    class ServiceIdentity:
        """Service identity fields for structured logging (ECS compliance)."""

        name = "core-service"
        env = os.getenv("ENVIRONMENT", "development")
        version = os.getenv("VERSION", "dev")
        host = socket.gethostname()

    class AppConstants:
        """Application-related constants."""

        bearer = "bearer"
        MIN_PASSWORD_LENGTH = 8

        # Points System — commented out (quiz/grading feature disabled)
        # QUIZ_POINTS_PER_CORRECT = 1  # 1 point per correct answer
        # PASSING_SCORE_THRESHOLD = 70.0  # Minimum percentage to pass
        #
        # # Coding exercise points by difficulty
        # CODING_POINTS = {
        #     "beginner": 3,
        #     "intermediate": 5,
        #     "advanced": 10,
        # }

    class DBConstants:
        """Database-related constants."""

        # YAML structure keys
        nosql_creds = "nosql_creds"
        sqlite_creds = "sql_credentials"
        sqlite_path = "path"
        mongo_inst = "mongo_inst"
        username = "username"
        host = "host"
        port = "port"
        db_name = "db_name"
        min_pool_size = "min_pool_size"
        max_pool_size = "max_pool_size"
        max_overflow = "max_overflow"
        use_srv = "use_srv"
        use_ssl = "use_ssl"

        @staticmethod
        def get_mongo_password(env: str) -> str:
            """Get MongoDB password based on environment (not stored in YAML for security).

            Args:
                env: Environment name (development, production).

            Returns:
                Password string from environment variable.
            """
            if env == "development":
                return os.getenv("MONGO_PASSWORD_DEV", "password")
            return os.getenv("MONGO_PASSWORD_PROD", "")
