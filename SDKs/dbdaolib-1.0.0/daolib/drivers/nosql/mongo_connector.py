"""
Singleton Connector for MongoDB.
Orchestrates the connection lifecycle, ODM initialization, and centralized logging.
"""

import asyncio
import logging
import os
import threading
import time
from typing import Optional, List, Any

from pymongo.errors import (
    ConnectionFailure,
    ConfigurationError,
    ServerSelectionTimeoutError,
    OperationFailure,
)
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

# --- Library Imports ---
from daolib.drivers.nosql.connector import AbstractNoSQLConnector
from daolib.drivers.nosql.mongo_driver import MongoDriver
from daolib.drivers.nosql.config import NoSQLConnectionEntry
from daolib.log_builder import LogBuilder

# --- Taxonomy Imports ---
from daolib.constants import (
    LogEvent,
    LogOutcome,
    DAOErrorCode,
)
from daolib.exceptions import (
    DaoException,
    MongoConnectionException,
    MongoODMException,
)

# --- Optional ODM Import ---
try:
    from beanie import init_beanie
    BEANIE_INSTALLED = True
except ImportError:
    BEANIE_INSTALLED = False

# Logger setup per Section 2.2 (Passive)
logger = logging.getLogger(__name__)


class MongoConnector(AbstractNoSQLConnector):
    """
    The Brain: Manages global database state.
    Enforces 'Fail-Fast' startup and 'Structured Logging' standards.
    """

    _instance: Optional["MongoConnector"] = None
    _instance_lock = threading.Lock()

    def __new__(cls, *args, **kwargs):
        with cls._instance_lock:
            if cls._instance is None:
                cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self, document_models: Optional[List[Any]] = None):
        # Singleton Protection: Only initialize once
        if not hasattr(self, "_bootstrapped"):
            self._client: Optional[AsyncIOMotorClient] = None
            self._driver: Optional[MongoDriver] = None
            self._config: Optional[NoSQLConnectionEntry] = None
            self._document_models: List[Any] = document_models or []
            
            # Concurrency Control
            self._init_lock = asyncio.Lock()
            self._beanie_bound = False
            self._bootstrapped = True

    async def init(self) -> None:
        """
        Idempotent async initialization.
        MEASURES duration. LOGS structured events. RAISES specific errors.
        """
        async with self._init_lock:
            # 1. Idempotency Check
            if self._client is not None and (not self._document_models or self._beanie_bound):
                return

            start_time = time.perf_counter()
            
            # Temp state holders
            config: Optional[NoSQLConnectionEntry] = None
            client: Optional[AsyncIOMotorClient] = None
            driver: Optional[MongoDriver] = None

            try:
                # ---------------------------------------------------------
                # PHASE 1: CONFIGURATION & CONNECTIVITY
                # ---------------------------------------------------------
                
                # Load Config (Abstract method implemented by Helper)
                config = self.read_and_load_config()
                self._config = config  # Stored early for context usage in exception handlers

                # Instantiate Driver & Client
                driver = MongoDriver(config)
                client = driver.connect()

                # FAIL-FAST: Force network I/O to verify connection
                ping_start = time.perf_counter()
                await client.admin.command("ping")
                ping_duration = (time.perf_counter() - ping_start) * 1000

                # Log MONGO_PING event (Section 7.2)
                LogBuilder(logger).event(LogEvent.MONGO_PING).success() \
                    .msg("MongoDB ping successful") \
                    .duration_ms(ping_duration) \
                    .db_context(
                        system="mongodb",
                        database=config.database,
                        host=config.safe_host_label,
                        **{
                            "db.srv": config.use_srv,
                            "db.tls": config.use_ssl,
                            "db.pool.min": config.min_pool_size,
                            "db.pool.max": config.max_pool_size,
                            "db.timeout.ms": config.server_selection_timeout_ms,
                        }
                    ).emit()

                # Connection Verified -> Commit State
                self._driver = driver
                self._client = client

                # Log MONGO_INIT Success (Section 14.1)
                duration = (time.perf_counter() - start_time) * 1000
                LogBuilder(logger).event(LogEvent.MONGO_INIT).success() \
                    .msg("MongoDB connected successfully") \
                    .duration_ms(duration) \
                    .db_context(
                        system="mongodb",
                        database=config.database,
                        host=config.safe_host_label,
                        **{
                            "db.srv": config.use_srv,
                            "db.tls": config.use_ssl,
                            "db.pool.min": config.min_pool_size,
                            "db.pool.max": config.max_pool_size,
                            "db.timeout.ms": config.server_selection_timeout_ms,
                        }
                    ).emit()

                # ---------------------------------------------------------
                # PHASE 2: ODM INITIALIZATION (Beanie)
                # ---------------------------------------------------------
                if self._document_models:
                    if not BEANIE_INSTALLED:
                        LogBuilder(logger).event(LogEvent.MONGO_ODM_INIT) \
                            .msg("Models provided but 'beanie' not installed. Skipping ODM init.") \
                            .level(logging.WARNING) \
                            .field("models_count", len(self._document_models)) \
                            .emit()
                        return
                    
                    try:
                        odm_start = time.perf_counter()
                        await init_beanie( database=self.get_database(),  # type: ignore
                            document_models=self._document_models,
                        )
                        self._beanie_bound = True
                        
                        LogBuilder(logger).event(LogEvent.MONGO_ODM_INIT).success() \
                            .msg("Beanie ODM initialized") \
                            .duration_ms((time.perf_counter() - odm_start) * 1000) \
                            .db_context(
                                system="mongodb",
                                database=config.database,
                                host=config.safe_host_label,
                                **{
                                    "db.srv": config.use_srv,
                                    "db.tls": config.use_ssl,
                                }
                            ) \
                            .field("models_count", len(self._document_models)) \
                            .emit()

                    except Exception as e:
                        # CRITICAL FAILURE: ODM definition is likely invalid.
                        # We must rollback the connection to prevent 'zombie' state.
                        self._handle_critical_failure(
                            client, 
                            e, 
                            code=DAOErrorCode.ODM_INIT_FAIL, 
                            msg="Beanie ODM initialization failed",
                            exc_type=MongoODMException
                        )

            # ---------------------------------------------------------
            # ERROR HANDLING MAPPING (Connectivity Phase)
            # ---------------------------------------------------------
            except ConfigurationError as e:
                self._handle_critical_failure(client, e, DAOErrorCode.CONF_INVALID, "Configuration Error", MongoConnectionException)
            except ServerSelectionTimeoutError as e:
                self._handle_critical_failure(client, e, DAOErrorCode.NET_TIMEOUT, "Connection Timeout", MongoConnectionException)
            except OperationFailure as e:
                self._handle_critical_failure(client, e, DAOErrorCode.AUTH_FAILURE, "Authentication/Operation Failed", MongoConnectionException)
            except ConnectionFailure as e:
                self._handle_critical_failure(client, e, DAOErrorCode.NET_UNREACHABLE, "Network Unreachable", MongoConnectionException)
            except Exception as e:
                if isinstance(e, DaoException):
                    raise # Re-raise if it's already our custom type
                self._handle_critical_failure(client, e, DAOErrorCode.UNKNOWN_FATAL, "Unexpected Initialization Error", MongoConnectionException)

    def _handle_critical_failure(self, client: Any, exc: Exception, code: DAOErrorCode, msg: str, exc_type: type):
        """
        Helper to centralize cleanup, logging, and raising strict exceptions.
        """
        # 1. Log with Error Schema (Section 5) using LogBuilder
        builder = LogBuilder(logger).event(LogEvent.MONGO_INIT).failure(code, exc).msg(msg)
        
        # Add DB context if available
        if self._config:
            builder.db_context(
                system="mongodb",
                database=self._config.database,
                host=self._config.safe_host_label,
                **{
                    "db.srv": self._config.use_srv,
                    "db.tls": self._config.use_ssl,
                    "db.pool.min": self._config.min_pool_size,
                    "db.pool.max": self._config.max_pool_size,
                    "db.timeout.ms": self._config.server_selection_timeout_ms,
                }
            )
        
        builder.emit()

        # 2. Cleanup (Rollback)
        if client:
            try:
                client.close()
            except Exception:
                pass # Swallow close errors during failure handling
        
        self._reset_state()

        # 3. Hard Stop
        raise exc_type(err_code=code, msg=msg, original_exception=exc) from exc

    def _reset_state(self) -> None:
        self._client = None
        self._driver = None
        self._config = None
        self._beanie_bound = False

    async def register_models(self, additional_models: List[Any], env_restriction: bool = True) -> None:
        """
        Dynamically register additional Beanie models and reinitialize ODM.
        
        Args:
            additional_models: List of new Document classes to register
            env_restriction: If True, only allows registration in dev/test environments
        
        Raises:
            MongoConnectionException: If called before init() or in restricted environment
            MongoODMException: If model registration fails
        
        Note:
            This is primarily for development and testing workflows.
            Production environments should register all models at startup.
        """
        # 1. Validate preconditions
        if not self._client:
            raise MongoConnectionException(
                DAOErrorCode.NET_UNREACHABLE,
                "Cannot register models before connector initialization. Call await init() first."
            )
        
        if not BEANIE_INSTALLED:
            raise MongoODMException(
                DAOErrorCode.ODM_INIT_FAIL,
                "Beanie not installed. Cannot register models."
            )
        
        # 2. Environment restriction check
        if env_restriction:
            env = getattr(self, '_env', None) or os.getenv('ENVIRONMENT', 'development')
            if env.lower() not in ['development', 'dev', 'test', 'testing']:
                raise MongoODMException(
                    DAOErrorCode.CONF_INVALID,
                    f"Dynamic model registration is disabled in '{env}' environment. "
                    f"Register all models at startup or set env_restriction=False."
                )
        
        # 3. Filter out duplicates (models already registered)
        existing_model_names = {model.__name__ for model in self._document_models}
        new_models = [
            model for model in additional_models 
            if model.__name__ not in existing_model_names
        ]
        
        if not new_models:
            logger.info("No new models to register. All provided models already registered.")
            return
        
        # 4. Add to internal list
        self._document_models.extend(new_models)
        
        # 5. Reinitialize Beanie with full model list
        try:
            odm_start = time.perf_counter()
            await init_beanie( database=self.get_database(),  # type: ignore
                document_models=self._document_models,
            )
            
            LogBuilder(logger).event(LogEvent.MONGO_ODM_INIT).success() \
                .msg("Additional Beanie models registered") \
                .duration_ms((time.perf_counter() - odm_start) * 1000) \
                .db_context(
                    system="mongodb",
                    database=self._config.database if self._config else "unknown",
                    host=self._config.safe_host_label if self._config else "unknown"
                ) \
                .field("new_models_count", len(new_models)) \
                .field("total_models_count", len(self._document_models)) \
                .field("new_model_names", [m.__name__ for m in new_models]) \
                .emit()
                
        except Exception as e:
            # Rollback: remove failed models from list
            for model in new_models:
                self._document_models.remove(model)
            
            LogBuilder(logger).event(LogEvent.MONGO_ODM_INIT) \
                .failure(DAOErrorCode.ODM_INIT_FAIL, e) \
                .msg("Failed to register additional models") \
                .field("attempted_models", [m.__name__ for m in new_models]) \
                .emit()
            
            raise MongoODMException(
                err_code=DAOErrorCode.ODM_INIT_FAIL,
                msg=f"Failed to register models: {[m.__name__ for m in new_models]}",
                original_exception=e
            ) from e

    def get_client(self) -> AsyncIOMotorClient:
        if not self._client:
            raise MongoConnectionException(
                DAOErrorCode.NET_UNREACHABLE, 
                "Client not initialized. Call await connector.init() first."
            )
        return self._client

    @property
    def database_name(self) -> str:
        if not self._config or not self._config.database:
            raise MongoConnectionException(DAOErrorCode.CONF_INVALID, "Database name missing from config.")
        return self._config.database

    def get_database(self) -> AsyncIOMotorDatabase:
        return self.get_client()[self.database_name]

    def close(self) -> None:
        """
        Graceful shutdown.
        """
        if self._client:
            try:
                self._client.close()
                LogBuilder(logger).event(LogEvent.MONGO_CLOSE).success() \
                    .msg("MongoDB connection closed") \
                    .field("db.host", getattr(self._config, "safe_host_label", "unknown")) \
                    .emit()
            except Exception as e:
                LogBuilder(logger).event(LogEvent.MONGO_CLOSE) \
                    .failure(DAOErrorCode.UNKNOWN_FATAL, e) \
                    .msg("Error closing MongoDB") \
                    .emit()
        
        # Cleanup Driver if specific logic exists
        if self._driver:
            self._driver.disconnect()
            
        self._reset_state()