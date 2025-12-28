import os
from daolib.drivers.nosql.mongo_connector import MongoConnector
from daolib.drivers.nosql.config import NoSQLConnectionEntry
from utils.constants import Constants
from utils.file_operator import YamlFileOperator, FileReadEntry

class MongoHelper(MongoConnector):
    """
    Concrete implementation of MongoConnector.
    Responsible for reading the YAML config and providing the Connection Entry
    so the parent class can initialize the Driver.
    """
    
    def read_and_load_config(self) -> NoSQLConnectionEntry:
        environment = os.getenv('ENVIRONMENT_FOR_RUN', 'development')
        print(f"Loading Mongo Config for: {environment} from {Constants.BASE_CONFIG_PATH}")

        # 1. Read YAML using your FileOperator
        try:
            configs_data = YamlFileOperator().read(FileReadEntry(read_path=Constants.BASE_CONFIG_PATH))[0]
        except Exception as e:
             # Fallback or re-raise with custom exception code
             print(f"Error reading config: {e}")
             raise e
        
        # 2. Extract Mongo Config Section (Safe get)
        # Structure: nosql_creds -> mongo_inst
        nosql_section = configs_data.get(Constants.DBConstants.nosql_creds, {})
        mongo_data = nosql_section.get(Constants.DBConstants.mongo_inst, {})

        # 3. Determine Password based on Env (Passwords are NOT in YAML)
        if environment == "development":
            password = Constants.DBConstants.mongo_password_dev
        elif environment == "staging":
            password = Constants.DBConstants.mongo_password_stage
        else:
            password = Constants.DBConstants.mongo_password_prod

        # 4. Return Config Object (Used by Parent init() to build the connection)
        return NoSQLConnectionEntry(
            username=mongo_data.get(Constants.DBConstants.username, ""),
            password=password,
            host=mongo_data.get(Constants.DBConstants.host, "localhost"),
            port=int(mongo_data.get(Constants.DBConstants.port, 27017)),
            database=mongo_data.get(Constants.DBConstants.db_name, "kubeplayground"),
            min_pool_size=int(mongo_data.get(Constants.DBConstants.min_pool_size, 10)),
            max_pool_size=int(mongo_data.get(Constants.DBConstants.max_pool_size, 50))
        )