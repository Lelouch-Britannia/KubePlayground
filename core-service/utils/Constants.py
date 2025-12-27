import os

# -----------------------------------------------------------------------------
# 1. decide which .env to load (defaults to development)
ENVIRONMENT = os.getenv("ENVIRONMENT_FOR_RUN", "development")
# -----------------------------------------------------------------------------

class Constants:
    BASE_CONFIG_PATH = os.path.abspath(os.path.join("/core", "config", f"{ENVIRONMENT}.yml"))

    class DBConstants:
        # Keys in YAML
        nosql_creds = "nosql_creds"
        mongo_inst = "mongo_inst"
        username = "username"
        host = "host"
        port = "port"
        db_name = "db_name"
        min_pool_size = "min_pool_size"
        max_pool_size = "max_pool_size"
        
        # Passwords (Simulating your logic)
        mongo_password_dev = os.getenv("MONGO_PASSWORD_DEV")
        mongo_password_stage = os.getenv("MONGO_PASSWORD_STAGE")
        mongo_password_prod = os.getenv("MONGO_PASSWORD_PROD")