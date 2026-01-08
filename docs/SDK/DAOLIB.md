# Database DAO Library - dbdaolib

**Version:** 2.0.0  
**Status:** Production-Ready  
**Last Updated:** January 2026

---

## Overview

`dbdaolib` is a unified database abstraction library providing standardized connectivity and access patterns for both **SQL** and **NoSQL** databases across microservices.

### Supported Databases

**SQL (Synchronous)**:
- PostgreSQL
- MySQL
- SQL Server
- SQLite

**NoSQL (Asynchronous)**:
- MongoDB (with replica sets and sharded clusters)

### Design Philosophy

- **Separation of Concerns**: Configuration → Driver → Connector → Application
- **Database Agnostic**: Consistent error codes and patterns across database types
- **Production Hardened**: Fail-fast validation, connection pooling, comprehensive error handling
- **Observability First**: Structured logging with event taxonomy
- **Framework Optimized**: Sync for traditional apps, async for FastAPI/modern frameworks

---

## Architecture Overview

### SQL Architecture

<img src="../images/sql_high_level_architecture.png" alt="SQL Architecture" width="700" />

**Key Components**:
- **Configuration Layer**: DbConnectionEntry with pool and SSL/TLS settings
- **Driver Layer**: SQLDriver with SQLQueryLogger (event-based query logging)
- **Connector Layer**: RdbmsConnector (singleton) with read/write engine support
- **DAO Layer**: BaseSqlDao with @InjectConnection decorator for transaction management
- **Error Handling**: Two-tier error codes (InfraErrorCode + DaoErrorCode)

> **📖 For detailed SQL architecture**: [SQL_ARCHITECTURE.md](./SQL_ARCHITECTURE.md)  
> **📖 For SQL API reference**: [SQL_API_REFERENCE.md](./SQL_API_REFERENCE.md)

### NoSQL Architecture

<img src="../images/nosql_high_level_architecture.png" alt="NoSQL Architecture" width="700" />

**Key Components**:
- **Configuration Layer**: NoSQLConnectionEntry with pool and replica set settings
- **Driver Layer**: MongoDriver with AsyncIOMotorClient
- **Connector Layer**: MongoConnector (singleton) with Beanie ODM initialization
- **ODM Layer**: Beanie Document models (no separate DAO layer)
- **Error Handling**: Single-tier error codes (InfraErrorCode only)

> **📖 For detailed NoSQL architecture**: [NOSQL_ARCHITECTURE.md](./NOSQL_ARCHITECTURE.md)  
> **📖 For NoSQL API reference**: [NOSQL_API_REFERENCE.md](./NOSQL_API_REFERENCE.md)

---

## Design Principles

### 1. Separation of Concerns

Each layer has a single responsibility:
- **Configuration**: Pure data objects with validation
- **Driver**: Engine/client creation and logging
- **Connector**: Singleton lifecycle management
- **SQL - DAO Layer**: Query execution and exception wrapping (BaseSqlDao)
- **NoSQL - ODM Layer**: Direct document operations via Beanie (no DAO wrapper)

### 2. Singleton Pattern

Connectors use class-level singleton state:
- Prevents duplicate engine/client creation
- Ensures connection pool reuse
- Simplifies application code (one connector instance)

### 3. Fail-Fast Validation

Connections validated on initialization:
- SQL: Ping query on engine creation
- NoSQL: Ping command on client creation
- Early failure prevents runtime errors

### 4. Exception Wrapping

Database-specific exceptions wrapped with stable error codes:
- **SQL**: SQLAlchemy exceptions → SqlDaoException(DaoErrorCode)
- **NoSQL**: PyMongo exceptions → MongoConnectionException(InfraErrorCode)
- Applications handle errors by code, not exception type

### 5. Automatic Logging

Infrastructure events logged automatically:
- **SQL**: Query logging via SQLAlchemy event system (before/after cursor execution)
- **NoSQL**: Connection lifecycle logging (init, ping, close)
- Structured logs with LogBuilder and LogEvent taxonomy

---

## Key Features by Database Type

### SQL Features

**Read/Write Splitting**:
- Dual engine support (primary for writes, replica for reads)
- Automatic connection selection via `@InjectConnection(is_write=True/False)`

**Transaction Management**:
- Decorator-based transaction lifecycle
- Auto begin/commit/rollback
- Manual injection support for testing

**Automatic Query Logging**:
- Event-based logging (no application code changes)
- Thread-safe timing with statement hashing
- Parameter count logging (security)

**Connection Pooling**:
- Configurable pool size and overflow
- Pool recycling and pre-ping health checks
- Per-database pool configuration

### NoSQL Features

**Async/Await Support**:
- Built on Motor (async MongoDB driver)
- Non-blocking I/O for high concurrency
- FastAPI optimized

**Beanie ODM Integration**:
- Type-safe document operations
- Automatic schema validation
- Global model binding

**Topology Awareness**:
- Replica set support
- Sharded cluster support
- Automatic failover

**Connection Pooling**:
- Configurable min/max pool sizes
- Server selection timeout
- Automatic reconnection

---

## Error Handling

### Error Code Taxonomy

MongoDB operations use InfraErrorCode (1000-9999) for infrastructure-level failures:

**Configuration Errors (1000-1999)**:
- `CONF_INVALID`: Invalid connection parameters
- `CONF_MISSING_CREDS`: Missing username/password
- `CONF_SSL_ERROR`: SSL/TLS configuration error

**Network Errors (2000-2999)**:
- `NET_UNREACHABLE`: MongoDB host unreachable
- `NET_TIMEOUT`: Connection or query timeout
- `NET_DNS_FAILURE`: DNS resolution failed

**Authentication Errors (3000-3999)**:
- `AUTH_FAILURE`: Invalid credentials
- `AUTH_FORBIDDEN`: User lacks database permissions

**ODM Errors (4000-4999)**:
- `ODM_INIT_FAIL`: Beanie model initialization failed
- `DATA_VALIDATION`: Document validation error

### Exception Classes

```python
from daolib.exceptions import MongoConnectionException, MongoODMException
from daolib.constants import InfraErrorCode

# Connection failures
raise MongoConnectionException(
    InfraErrorCode.NET_TIMEOUT, 
    "Connection to mongodb://localhost:27017 timed out",
    original_exc
)

# Authentication failures
raise MongoConnectionException(
    InfraErrorCode.AUTH_FAILURE,
    "Authentication failed for user 'app_user'",
    original_exc
)

# ODM initialization failures
raise MongoODMException(
    InfraErrorCode.ODM_INIT_FAIL,
    "Failed to initialize Beanie models",
    original_exc
)
```

### Application Error Handling

```python
from daolib.exceptions import MongoConnectionException, MongoODMException
from daolib.constants import InfraErrorCode
from fastapi import HTTPException

@app.on_event("startup")
async def startup_event():
    try:
        connector = AppMongoConnector()
        await connector.init(document_models=[Exercise, Solution])
    except MongoConnectionException as e:
        if e.err_code == InfraErrorCode.AUTH_FAILURE:
            logger.critical("MongoDB authentication failed - check credentials")
        elif e.err_code == InfraErrorCode.NET_TIMEOUT:
            logger.critical("MongoDB connection timeout - check network/host")
        elif e.err_code == InfraErrorCode.NET_UNREACHABLE:
            logger.critical("MongoDB host unreachable - check hostname/port")
        else:
            logger.critical(f"MongoDB connection error: {e.err_code.name}")
        raise
    except MongoODMException as e:
        logger.critical(f"Beanie ODM initialization failed: {e.err_code.name}")
        raise

# API endpoint error handling
@app.get("/exercises/{exercise_id}")
async def get_exercise(exercise_id: str):
    try:
        exercise = await Exercise.get(exercise_id)
        if not exercise:
            raise HTTPException(status_code=404, detail="Exercise not found")
        return exercise
    except Exception as e:
        logger.error(f"Failed to fetch exercise: {e}")
        raise HTTPException(status_code=500, detail="Database error")
```

> **📖 For SQL exception handling, see [SQL_ARCHITECTURE.md](./SQL_ARCHITECTURE.md#4-error-handling--exception-taxonomy)**

---

## Logging Architecture

### LogEvent Taxonomy

Structured logs emitted using LogEvent enum for operational monitoring:

**SQL Events**:
- `SQL_INIT`: Connector initialization
- `SQL_PING`: Connection health check
- `SQL_POOL_READY`: Connection pool created
- `SQL_QUERY`: Query execution (automatic via event system)
- `SQL_CLOSE`: Engine disposal

**NoSQL Events**:
- `MONGO_INIT`: Client initialization
- `MONGO_PING`: Connection health check
- `MONGO_ODM_INIT`: Beanie model binding
- `MONGO_CLOSE`: Client disconnection

### LogBuilder Fluent API

Structured logging with fields and error codes:

```python
LogBuilder(logger)
    .event(LogEvent.SQL_QUERY)
    .success()
    .field("db.operation", "INSERT")
    .field("duration_ms", 42.5)
    .msg("Query executed")
    .emit()
```

### Logging Security

**Statement Hashing** (SQL):
- SQL statements hashed (SHA-256) before logging
- Prevents sensitive data in WHERE clauses from appearing in logs

**Parameter Safety**:
- Only parameter count logged, never values
- Prevents PII, credentials leakage

**Credential Redaction**:
- Use `safe_host_label()` instead of connection strings
- Never log passwords or sensitive configuration

---

## Best Practices

### Connection Management

✅ **DO**:
- Initialize MongoConnector in FastAPI startup event
- Use singleton pattern (one connector per application)
- Close connection in shutdown event
- Configure appropriate pool sizes based on load

❌ **DON'T**:
- Create multiple connector instances
- Initialize outside async context
- Forget to close connections on shutdown
- Use blocking I/O in async context

### Beanie Model Design

✅ **DO**:
```python
from beanie import Document
from pydantic import Field
from typing import Optional
from datetime import datetime

class Exercise(Document):
    title: str
    description: str
    difficulty: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = None
    
    class Settings:
        name = "exercises"  # Explicit collection name
        indexes = [
            "difficulty",
            [("title", 1), ("difficulty", 1)]  # Compound index
        ]
    
    # Custom query methods for document-specific operations
    @classmethod
    async def find_by_difficulty(cls, difficulty: str) -> List["Exercise"]:
        return await cls.find(cls.difficulty == difficulty).to_list()
```

❌ **DON'T**:
```python
# Missing Settings class
class BadExercise(Document):
    title: str
    # Collection name will be "badexercise" (auto-generated)

# Blocking I/O in model methods
class BadExercise(Document):
    def send_email(self):  # ❌ Blocking
        smtp.send(...)
```

> **Note**: NoSQL does NOT use a separate DAO layer. Extend Document models with custom class methods for document-specific queries instead of creating DAO classes.

---

## Comparison: SQL vs NoSQL

| Aspect | SQL | NoSQL |
|--------|-----|-------|
| **Execution Model** | Synchronous | Asynchronous |
| **Driver** | SQLAlchemy | Motor (AsyncIOMotorClient) |
| **Data Layer** | BaseSqlDao + @InjectConnection | Beanie Document Models |
| **Transaction Mgmt** | Decorator-based (auto begin/commit) | Session-based (manual) |
| **Query Logging** | Automatic (event system) | Manual (infrastructure only) |
| **Error Codes** | Two-tier (Infra + DAO) | Single-tier (Infra only) |
| **Connection Type** | Read/Write splitting | Single client (replica-aware) |
| **Framework** | Traditional + FastAPI | FastAPI optimized |
| **DAO Layer** | Required (BaseSqlDao wraps queries) | Not needed (Beanie provides active record pattern) |

### When to Use SQL

- Relational data with complex joins
- ACID transactions required
- Mature schema with referential integrity
- Traditional synchronous applications

### When to Use NoSQL

- Document-based data models
- High write throughput required
- Flexible schema needed
- Async/FastAPI applications

### Key Architectural Difference

**SQL**: Requires DAO layer because SQLAlchemy Core/ORM is low-level. BaseSqlDao provides:
- Transaction management via @InjectConnection decorator
- Exception wrapping (SQLAlchemy → SqlDaoException)
- Query execution standardization

**NoSQL**: No DAO layer needed because Beanie provides:
- Active Record pattern (model = data + operations)
- Rich query API built-in (find, aggregate, etc.)
- Type-safe operations with Pydantic validation
- Well-designed exceptions (no wrapping needed for queries)

For document-specific logic, extend Document models with custom class methods instead of creating separate DAO classes.

---

## Documentation Structure

### Architecture Documents

| Document | Description |
|----------|-------------|
| [SQL_ARCHITECTURE.md](./SQL_ARCHITECTURE.md) | SQL layer design, logging, error handling, transactions |
| [NOSQL_ARCHITECTURE.md](./NOSQL_ARCHITECTURE.md) | NoSQL layer design, ODM integration, async patterns |

### API References

| Document | Description |
|----------|-------------|
| [SQL_API_REFERENCE.md](./SQL_API_REFERENCE.md) | Complete SQL API: Configuration, Driver, Connector, DAO, Decorator |
| [NOSQL_API_REFERENCE.md](./NOSQL_API_REFERENCE.md) | Complete NoSQL API: Configuration, Driver, Connector, ODM |

### Quick Reference

**Error Codes**:
- InfraErrorCode: 1000-9999 (infrastructure errors)
- DaoErrorCode: 50000-50999 (SQL query errors)

**Supported Databases**:
- SQL: PostgreSQL, MySQL, SQL Server, SQLite
- NoSQL: MongoDB (with replica sets and sharded clusters)

**External Dependencies**:
- SQL: SQLAlchemy 2.0+, psycopg2/pymysql/pyodbc
- NoSQL: Motor, Beanie, PyMongo

**Architecture Layers**:
- SQL: Configuration → Driver → Connector → DAO → Application (5 layers)
- NoSQL: Configuration → Driver → Connector → ODM/Application (3 layers, no DAO)

---

**Document Version**: 2.0.0  
**Last Updated**: January 2026  
**Maintainer**: Platform Team