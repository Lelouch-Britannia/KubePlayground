import os
import socket
from dotenv import find_dotenv, load_dotenv

load_dotenv(find_dotenv())

class Constants:
    
    class ServiceIdentity:
        """Service identity fields for structured logging (ECS compliance)"""
        name = "core-service"
        env = os.getenv("ENVIRONMENT", "development")
        version = os.getenv("VERSION", "dev")
        host = socket.gethostname()
    
    class DBConstants:
        """Database-related constants"""
        
        # YAML structure keys
        nosql_creds = "nosql_creds"
        mongo_inst = "mongo_inst"
        username = "username"
        host = "host"
        port = "port"
        db_name = "db_name"
        min_pool_size = "min_pool_size"
        max_pool_size = "max_pool_size"
        use_srv = "use_srv"
        use_ssl = "use_ssl"
        
        @staticmethod
        def get_mongo_password(env: str) -> str:
            """Get MongoDB password based on environment (not stored in YAML for security)"""
            if env == "development":
                return os.getenv("MONGO_PASSWORD_DEV", "password")
            else:
                return os.getenv("MONGO_PASSWORD_PROD", "")

