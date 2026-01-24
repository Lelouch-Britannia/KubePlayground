"""Configuration module for SQL Database Connectivity.

Encapsulates credentials, connection parameters, pooling settings, and URI generation.
Supports PostgreSQL, MySQL, SQLite, and SQL Server with industry-standard SSL/TLS handling.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from urllib.parse import quote_plus

from daolib.constants import DatabaseSchema, DatabaseType


@dataclass
class DbConnectionEntry:
    """Data carrier for SQL database connection parameters.

    Decouples configuration loading (YAML/Env) from Driver usage.

    Enforces validation rules:
    - Driver type must be supported (PostgreSQL, MySQL, SQLite, SQL Server)
    - Pool parameters must be valid (size > 0, overflow >= 0)
    - SSL/TLS parameters must be non-conflicting
    - Credentials required except for SQLite
    - Special handling for each driver type

    Provides safe connection string generation with:
    - URL-encoded credentials (handles special chars: @, :, /)
    - Driver-specific URI schemes
    - Optional SSL/TLS query parameter building
    - Password redaction in logs/repr
    """

    system: str
    username: str
    password: str
    host: str
    database: str
    port: int

    # Pooling & Timeouts (SQLAlchemy engine parameters)
    pool_size: int  # Max connections to keep in pool
    path: str = ""  # SQLite file path (absolute path, e.g., /var/lib/app/data.db)
    max_overflow: int = 10  # Extra connections allowed when pool is exhausted
    pool_recycle: int = 3600  # Recycle connections after this seconds (1 hour default)
    pool_timeout: int = 30  # Timeout in seconds when getting connection from pool
    server_selection_timeout_ms: int = 5000  # Initial connection attempt timeout (ms)

    # SQLAlchemy feature
    pool_pre_ping: bool = True  # Verify connection health before reusing from pool

    # Advanced Options
    odbc_driver: dict[str, str] = field(default_factory=dict)  # SQL Server ODBC driver config

    # SSL/TLS Configuration (for secure connections)
    # - use_ssl: Enable SSL/TLS encryption
    # - ssl_verify: Validate server certificate against CA
    # - ssl_ca_path: Path to CA certificate file (for custom/self-signed certs)
    # - trust_cert: Skip certificate validation (SQL Server only, not recommended)
    #
    # Common patterns:
    # Production:     use_ssl=True, ssl_verify=True, ssl_ca_path="" (uses system CA)
    # Custom CA:      use_ssl=True, ssl_verify=True, ssl_ca_path="/path/to/ca.pem"
    # Self-signed:    use_ssl=True, ssl_verify=False, trust_cert=True (SQL Server)
    # Plaintext dev:  use_ssl=False (not secure, development only)

    # use_ssl=True → SSL is ON
    #    ├─ ssl_verify=True → VALIDATE the certificate
    #    │   └─ ssl_ca_path="/path/to/ca.pem" → Against THIS CA (or system default if "")
    #    │
    #    └─ ssl_verify=False → DON'T VALIDATE
    #        └─ trust_cert=True → Accept it anyway (SQL Server)

    use_ssl: bool = False
    ssl_verify: bool = False
    ssl_ca_path: str = ""

    # SQL server specific
    trust_cert: bool = False

    def __post_init__(self):
        """Validate configuration parameters for consistency and correctness.

        Raises ValueError on validation failures.
        """
        # Validate system
        normalized_drive = self.system.lower()
        valid_types = [dt.value for dt in DatabaseType]
        if normalized_drive not in valid_types:
            msg = f"Unsupported database type: {self.system}. Supported types: {', '.join(valid_types)}"
            raise ValueError(msg)

        # Pool validation
        if self.pool_size <= 0:
            msg = f"pool_size must be > 0, got {self.pool_size}"
            raise ValueError(msg)
        if self.max_overflow < 0:
            msg = f"max_overflow must be >= 0, got {self.max_overflow}"
            raise ValueError(msg)
        if self.pool_recycle < 0:
            msg = f"pool_recycle must be >= 0, got {self.pool_recycle}"
            raise ValueError(msg)
        if self.pool_timeout <= 0:
            msg = f"pool_timeout must be > 0, got {self.pool_timeout}"
            raise ValueError(msg)
        if self.server_selection_timeout_ms <= 0:
            msg = f"server_selection_timeout_ms must be > 0, got {self.server_selection_timeout_ms}"
            raise ValueError(msg)

        # SSL/TLS validation
        if self.use_ssl and self.ssl_verify and self.ssl_ca_path and not Path(self.ssl_ca_path).exists():
            msg = f"SSL CA certificate path does not exist: {self.ssl_ca_path}"
            raise ValueError(msg)

        # Conflict check: trust_cert and ssl_verify cannot both be True
        if self.trust_cert and self.ssl_verify:
            raise ValueError(
                "Conflicting options: trust_cert (skip verification) and "
                "ssl_verify (enforce verification) cannot both be True"
            )

        # SQLite special handling
        if normalized_drive == DatabaseType.SQLITE.value:
            if self.port != 0:
                msg = f"SQLite does not use port numbers. Got: {self.port}. Set port=0."
                raise ValueError(msg)
            if self.username or self.password:
                raise ValueError("SQLite does not support authentication. username and password must be empty.")
            if not self.path:
                raise ValueError(
                    "SQLite requires a 'path' parameter pointing to the database file. Example: '/var/lib/app/data.db'"
                )
        # Non-SQLite databases require credentials
        elif not self.username or not self.password:
            msg = f"{self.system} requires username and password credentials"
            raise ValueError(msg)

        # SQL Server ODBC driver default
        if not self.odbc_driver:
            self.odbc_driver = {"driver": "ODBC Driver 17 for SQL Server"}

    @property
    def connection_string(self) -> str:
        """Build a SQL connection string with safe URL encoding.

        Centralizes logic to avoid 'Double URI' anti-pattern.

        Process:
        1. URL-encodes credentials to handle special characters (@, :, /, %)
        2. Selects driver-specific URI schema (PostgreSQL+psycopg2, mysql+pymysql, etc.)
        3. Combines: schema + auth + host:port + database

        SSL/TLS parameters are NOT included here (use build_ssl_query_params() separately).

        Examples:
            PostgreSQL: postgresql+psycopg2://user%40domain:pass%40123@localhost:5432/mydb
            MySQL: mysql+pymysql://admin:secret@db.example.com:3306/production
            SQLite: sqlite:////var/lib/app/data.db

        Returns:
            str: Complete connection string without SSL query parameters

        Raises:
            ValueError: If system is not supported
        """
        auth_path = ""
        if self.username and self.password:
            # SAFETY: Always URL-encode credentials to handle special chars (@, :, /)
            safe_user = quote_plus(self.username)
            safe_pass = quote_plus(self.password)
            auth_path = f"{safe_user}:{safe_pass}@"

        host_part = f"{self.host}:{self.port}"

        normalized_drive = self.system.lower()

        # Determine URI schema based on system
        if normalized_drive == DatabaseType.POSTGRESQL.value:
            schema = DatabaseSchema.POSTGRESQL.value
        elif normalized_drive == DatabaseType.MYSQL.value:
            schema = DatabaseSchema.MYSQL.value
        elif normalized_drive == DatabaseType.SQL_SERVER.value:
            schema = DatabaseSchema.MSSQL_ODBC.value
        elif normalized_drive == DatabaseType.SQLITE.value:
            # SQLite uses file paths, not host:port/database format
            schema = DatabaseSchema.SQLITE.value
            return f"{schema}{self.path}"
        else:
            msg = f"Unsupported database type: {normalized_drive}"
            raise ValueError(msg)

        # Build connection string by combining schema with auth_path and host_part
        return f"{schema}{auth_path}{host_part}/{self.database}"

    def build_ssl_query_params(self) -> str:
        """Build optional SSL/TLS query parameters for the connection string.

        Returns empty string if SSL is not enabled.

        Driver-specific SSL/TLS parameter mapping:

        PostgreSQL (psycopg2):
            - sslmode=require: Require SSL connection
            - sslrootcert=/path/to/ca.pem: Path to CA certificate
            - sslcertmode=verify-full: Full certificate validation

        MySQL (pymysql):
            - ssl_ca=/path/to/ca.pem: CA certificate path
            - ssl_verify_cert=True/False: Enable/disable cert verification

        SQL Server (pyodbc):
            - TrustServerCertificate=yes/no: Trust or validate cert

        Usage Pattern:
            # Production with system CA
            config = DbConnectionEntry(..., use_ssl=True, ssl_verify=True)
            full_uri = config.connection_string + config.build_ssl_query_params()

            # Custom CA certificate
            config = DbConnectionEntry(..., use_ssl=True, ssl_verify=True,
                                       ssl_ca_path="/etc/ssl/certs/company-ca.pem")
            full_uri = config.connection_string + config.build_ssl_query_params()

        Returns:
            str: Query parameter string (e.g., "?sslmode=require&sslrootcert=...")
                 or empty string "" if SSL not configured
        """
        if not self.use_ssl:
            return ""

        normalized_drive = self.system.lower()
        params = []

        if normalized_drive == DatabaseType.POSTGRESQL.value:
            params.append("sslmode=require")
            if self.ssl_ca_path:
                params.append(f"sslrootcert={self.ssl_ca_path}")
            if self.ssl_verify:
                params.append("sslcertmode=verify-full")

        elif normalized_drive == DatabaseType.MYSQL.value:
            if self.ssl_ca_path:
                params.append(f"ssl_ca={self.ssl_ca_path}")
            if self.ssl_verify:
                params.append("ssl_verify_cert=True")
            if self.trust_cert:
                params.append("ssl_verify_cert=False")

        elif normalized_drive == DatabaseType.SQL_SERVER.value:
            if self.trust_cert:
                params.append("TrustServerCertificate=yes")
            else:
                params.append("TrustServerCertificate=no")

        if params:
            return "?" + "&".join(params)
        return ""

    def safe_host_label(self) -> str:
        """Return a log-safe host identifier (no credentials).

        Compliant with Logging Standard Section 9.2.

        Use in log messages instead of connection_string to avoid leaking passwords.

        Example:
            logger.info(f"Connected to {config.safe_host_label()}")
            # Network DB Output: Connected to db.example.com:5432
            # SQLite Output: Connected to /var/lib/app/data.db
        """
        normalized_drive = self.system.lower()
        if normalized_drive == DatabaseType.SQLITE.value:
            return self.path
        return f"{self.host}:{self.port}"

    def __repr__(self) -> str:
        """SECURITY: Strict redaction of password in object representation.

        Prevents accidental leakage if config object is printed.

        Safe to use in logs and debug output - password is never included.
        Includes connection safety info: host, database, SSL status, pool size.

        Example:
            print(config)
            # Output: DbConnectionEntry(host='db.prod.com:5432',db='sales',
            #                           user='app_service',ssl=enabled,
            #                           pool=10-20)
        """
        ssl_status = "ssl=enabled" if self.use_ssl else "ssl=disabled"
        return (
            f"DbConnectionEntry("
            f"host='{self.safe_host_label()}',"
            f"db='{self.database}',"
            f"user='{self.username}',"
            f"{ssl_status},"
            f"pool={self.pool_size}-{self.max_overflow})"
        )


class AbstractDBDriver(ABC):
    @abstractmethod
    def connect(self) -> tuple[Any, Any]: ...

    @abstractmethod
    def disconnect(self) -> None: ...
