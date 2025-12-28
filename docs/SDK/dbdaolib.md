# Database Connectivity Layer Documentation

**Version:** 1.0.0
**Status:** Stable

## 1. Overview

`dbdaolib` is a unified database abstraction library designed to standardize database connectivity and access patterns across an ecosystem of microservices. It provides a consistent interface for managing connections, pooling, and configuration for both **Relational (SQL)** and **Non-Relational (NoSQL)** databases.

### Key Features

* **Unified Abstraction**: Similar setup patterns for SQL (SQLAlchemy) and NoSQL (Motor/Beanie).
* **Singleton Architecture**: Prevents connection leaks by enforcing singleton instances for connection managers.
* **Dual-Stack Support**:
* **SQL**: Synchronous, supports Read/Write splitting (Primary/Replica).
* **NoSQL**: Asynchronous, optimized for FastAPI event loops.


* **Config Agnostic**: Decouples configuration (YAML/Env) from the core driver logic.

---

## 2. Architecture & Design

The library follows a strict **Connector-Driver-Helper** pattern to separate concerns.

### 2.1 The Components

1. **Config Entry (Data Class)**: Pure data objects holding credentials and pooling parameters (e.g., `DbConnectionEntry`, `NoSQLConnectionEntry`).
2. **Driver (The Mechanic)**: Low-level wrappers around third-party libraries (`SQLAlchemy Engine`, `MotorClient`). They handle the raw "handshake".
3. **Connector (The Manager)**: Singleton classes that maintain the global state of the application's database connection. They ensure `init` happens exactly once.
4. **Helper (The Injector)**: Concrete implementations that bridge the application's specific configuration source (YAML, Env Vars, K8s Secrets) to the generic Connector.

### 2.2 UML Class Diagram

<img src=../images/dao-uml.png alt="UML" width="800" />

---
## 3. SQL Connectivity (RDBMS)

The SQL layer is built on **SQLAlchemy**. It is designed for synchronous, thread-safe operations.

### 3.1 Capabilities

* **Read/Write Splitting**: Natively supports two connection pools—one for the Primary (Write) instance and one for Secondary (Read) replicas.
* **Pool Management**: Configurable `pool_size`, `max_overflow`, and `pool_recycle` to handle high-load environments and prevent stale connections.

### 3.2 Implementation Details

**Configuration (`DbConnectionEntry`)**
Holds the "ConnectionString" parts (User, Pass, Host, DB) and SQLAlchemy pooling options.

**The Driver (`SQLDriver`)**
Responsible for creating the `sqlalchemy.engine.Engine`. It is instantiated only once by the Connector.

**The Connector (`RdbmsConnector`)**

* **Initialization**: Lazily initializes on the first instantiation.
* **Usage**: call `RdbmsConnector().get_write_connection()` to get a thread-local connection object.

### 3.3 Usage Example

```python
from utils.rdbms_helper import RdbmsHelper

# 1. Initialize (usually in main.py)
# This reads config and sets up the Singleton Engines
db_helper = RdbmsHelper() 

# 2. Use in Service Layer
def get_user(user_id: int):
    connector = RdbmsHelper() # Returns existing singleton
    
    # Get a connection context
    with connector.get_read_connection() as conn:
        result = conn.execute("SELECT * FROM users WHERE id = :id", {"id": user_id})
        return result.fetchone()

```

---

## 4. NoSQL Connectivity (MongoDB)

The NoSQL layer is built on **Motor** (Async Driver) and **Beanie** (ODM). It is designed for asynchronous, non-blocking operations suitable for FastAPI.

### 4.1 Capabilities

* **AsyncIO**: Fully non-blocking connection initialization and querying.
* **ODM Integration**: Tightly coupled with `Beanie` to allow Model-based access immediately after connection.
* **Topology Awareness**: Supports MongoDB Replica Sets and Sharded Clusters via standard connection strings.

### 4.2 Implementation Details

**Configuration (`NoSQLConnectionEntry`)**
Stores MongoDB specific parameters like `min_pool_size`, `max_pool_size`, and `server_selection_timeout_ms`.

**The Driver (`MongoDriver`)**
Wraps `AsyncIOMotorClient`. It handles the raw connection to the MongoDB server.

**The Connector (`MongoConnector`)**

* **Initialization**: Must be explicitly awaited via `await MongoConnector().init()`.
* **Global State**: Unlike SQL, it does not hand out "Connection" objects for every query. Instead, it binds the client to the Beanie Models globally.

### 4.3 Usage Example

```python
from utils.mongo_helper import MongoHelper

# 1. Initialize (MUST be in Startup Event)
@app.on_event("startup")
async def startup_event():
    # Pass models here to bind them to the DB
    mongo_helper = MongoHelper(document_models=[Exercise, Solution])
    await mongo_helper.init()

# 2. Use in Service Layer
# No need to instantiate helper again. Models are already bound.
async def get_exercise(id: str):
    # Beanie uses the global client initialized above
    return await Exercise.get(id)

```

---

## 5. Configuration Strategy

The library uses a `Helper` pattern to inject configuration. This allows the core `Connector` logic to remain pure, while the `Helper` deals with file I/O and Environment variables.

### YAML Structure

The library expects a configuration structure similar to this:

```yaml
nosql_creds:
  mongo_inst:
    host: "mongodb"
    port: 27017
    db_name: "kubeplayground"
    min_pool_size: 10
    max_pool_size: 50
    # Username/Password are injected via ENV, not YAML

```

### Extending for New Environments

To support a new config source (e.g., AWS Secrets Manager), you simply create a new Helper class inheriting from the Connector:

```python
class AwsSecretMongoHelper(MongoConnector):
    def read_and_load_config(self) -> NoSQLConnectionEntry:
        # Custom logic to fetch from AWS
        creds = aws_client.get_secret("mongo_creds")
        return NoSQLConnectionEntry(...)

```

---

## 6. Exception Handling

All connectivity errors are wrapped in standard exceptions defined in `dbdaolib.exception`.

* **`SqlDaoException`**: Raised for SQLAlchemy connection failures or query errors.
* **`ConnectionError`**: Raised for MongoDB timeout or authentication failures.