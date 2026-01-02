"""
Configuration module for NoSQL Database Connectivity.
Encapsulates credentials, connection parameters, and URI generation.
"""

from dataclasses import dataclass
from typing import Optional
from urllib.parse import quote_plus

@dataclass
class NoSQLConnectionEntry:
    """
    Data carrier for MongoDB connection parameters.
    Decouples configuration loading (YAML/Env) from Driver usage.
    """
    username: str
    password: str
    host: str
    database: str
    port: int = 27017
    
    # Pooling & Timeouts
    min_pool_size: int = 10
    max_pool_size: int = 50
    server_selection_timeout_ms: int = 5000
    
    # Advanced Options
    use_srv: bool = False  # Set True for MongoDB Atlas (mongodb+srv://)
    use_ssl: bool = False  # Set True for TLS/SSL connections

    @property
    def connection_string(self) -> str:
        """
        Builds a standard MongoDB connection string with safe URL encoding.
        Centralizes logic to avoid 'Double URI' anti-pattern.
        """
        scheme = "mongodb+srv" if self.use_srv else "mongodb"
        
        auth_part = ""
        if self.username and self.password:
            # SAFETY: Always URL-encode credentials to handle special chars (@, :, /)
            safe_user = quote_plus(self.username)
            safe_pass = quote_plus(self.password)
            auth_part = f"{safe_user}:{safe_pass}@"
        
        host_part = f"{self.host}"
        if not self.use_srv:
            host_part = f"{self.host}:{self.port}"
            
        return f"{scheme}://{auth_part}{host_part}"

    @property
    def safe_host_label(self) -> str:
        """
        Returns a log-safe host identifier (no credentials).
        Compliant with Logging Standard Section 9.2.
        """
        suffix = " (srv)" if self.use_srv else ""
        return f"{self.host}{suffix}"

    def __repr__(self):
        """
        SECURITY: Strict redaction of password in object representation.
        Prevents accidental leakage if config object is printed.
        """
        return (
            f"NoSQLConnectionEntry("
            f"host='{self.safe_host_label}', "
            f"db='{self.database}', "
            f"user='{self.username}', "
            f"ssl={self.use_ssl}, "
            f"pool={self.min_pool_size}-{self.max_pool_size})"
        )