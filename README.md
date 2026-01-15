# KubePlayground - Development Plan (v2.1)

## Project Vision

An interactive, locally-deployable web platform similar to HackerRank/LeetCode for learning Kubernetes hands-on.

**What you can do:**

* Browse exercises from curated curriculum
* **Dual-Mode Learning**:
  * **Conceptual Modules**: Markdown lessons with interactive quizzes (multiple-choice)
  * **Coding Exercises**: Write YAML solutions in browser with Monaco Editor (VS Code-like experience)
* Validate against your local Kubernetes cluster (Minikube/MicroK8s)
* Save and track progress with auto-save (MongoDB-based)
* Get instant feedback via automated verification steps
* Secure grading via split-brain architecture (answer keys never exposed to frontend)

**Current Focus (v1.0)**: Dual-mode learning, split-brain security, progress tracking, MongoDB-based autosave.
**Future (v2.0)**: User authentication, Redis optimization, leaderboards, and social features.

---

## Architecture Overview

We utilize a **Modular Monolith** pattern for the core application logic, paired with an **Asynchronous Worker** for Kubernetes operations. Crucially, all database connectivity and access patterns are standardized via a shared SDK (`dbdaolib`), separating infrastructure concerns from business logic.

<img src="./docs/images/arch.png" alt="KubePlayground Modular Architecture with SDK" width="800" />

---

## Service Breakdown

### 0. SDK Layer (`dbdaolib`)

**Role**: The Foundation (Library)

* **Responsibilities**:
  * **Unified Connectivity**: Manages connection pooling for SQL (SQLAlchemy) and NoSQL (Motor/Beanie).
  * **Singleton Management**: Ensures single instances of database drivers across the application.
  * **SQL Data Access**: BaseSqlDao with @InjectConnection decorator for transaction management.
  * **NoSQL Data Access**: Direct Beanie Document models (Active Record pattern, no DAO layer).
  * **Structured Logging**: LogBuilder with LogEvent taxonomy for operational monitoring.
  * **Error Handling**: Two-tier for SQL (InfraErrorCode + DaoErrorCode), single-tier for NoSQL (InfraErrorCode).

* **Tech**: Python, Motor, Beanie, SQLAlchemy 2.0+.
* **Documentation**: [SDK Architecture Docs](./docs/SDK/)

### 1. Core Service (Port 8000)

**Role**: The "Brain" (Monolith)

* **Responsibilities**:
  * **API Gateway**: Single entry point for Frontend.
  * **Content Delivery**: Serves public learning content (exercises, lessons).
  * **Secure Grading**: Server-side quiz/code validation using split-brain architecture.
  * **Exercise Domain**: Manages public content (questions, instructions) and private solutions (answer keys, validation scripts).
  * **User Solution Domain**: Handles user code/quiz submissions, versioning, and auto-save.
  * **Progress Tracking**: Records user completion status and scores.
  * **Orchestration**: Dispatches validation jobs to background worker (future).
  * **WebSocket Manager**: Streams real-time validation logs (future).


* **Tech**: FastAPI, `dbdaolib` (NoSQL Driver).
* **Database**: MongoDB (via SDK).
  * **Collections**:
    * `learning_units` (Public): Questions, instructions, initial code templates
    * `unit_solutions` (Private): Answer keys, validation scripts (**never exposed to frontend**)
    * `user_solutions` (User Data): Code submissions, quiz answers, versioning, auto-save
    * `user_progress` (Permanent State): Completion tracking, scores, timestamps

### 2. Validation Service (Background Worker)

**Role**: The "Muscle" (Worker)

* **Responsibilities**:
* **Job Consumer**: Listens to Redis `validation_queue`.
* **K8s Interaction**: Applies manifests using official K8s Client.
* **Namespace Isolation**: Manages ephemeral test environments.


* **Tech**: Python (K8s Library).
* **Database**: Stateless (Uses K8s API).

### 3. Infrastructure

* **MongoDB**: Centralized storage with split-brain architecture:
  * Public collections: Safe for frontend (learning_units)
  * Private collections: Answer keys and validation scripts (unit_solutions)
  * User data: Submissions and progress tracking (user_solutions, user_progress)
* **Redis**: Message Broker (Jobs) & Event Bus (Logs) - **Deferred to Phase 6**
  * **Note**: Auto-save currently uses MongoDB (Redis optimization in v2.0)

---

## Directory Structure

```text
kubeplayground/
├── SDKs/
│   ├── dbdaolib-1.0.0/          # SHARED LIBRARY
│   │   ├── daolib/
│   │   │   ├── drivers/         # SQL & NoSQL Drivers
│   │   │   │   ├── sql/         # SQLDriver, RdbmsConnector
│   │   │   │   └── nosql/       # MongoDriver, MongoConnector
│   │   │   ├── dao/sql/         # BaseSqlDao, @InjectConnection
│   │   │   ├── constants.py     # LogEvent, InfraErrorCode, DaoErrorCode
│   │   │   ├── exceptions.py    # SqlDaoException, MongoConnectionException
│   │   │   └── log_builder.py   # Structured logging
│   │   └── setup.py
│   └── docs/SDK/                # Architecture & API docs
│
├── core-service/                # THE MONOLITH
│   ├── main.py                  # App entry point
│   ├── models.py                # Beanie Documents (LearningUnit, UnitSolution, UserSolution, UserProgress)
│   ├── schema.py                # Pydantic Schemas
│   ├── routes/                  # API endpoints
│   └── utils/
│       ├── mongo_helper.py      # Implements MongoConnector for config loading
│       ├── logger.py            # ECS-compliant structured logging
│       └── constants.py         # Service identity and DB constants
│
├── validation-service/          # THE WORKER
│   └── ...
│
├── frontend/                    # REACT UI
│   └── ...
│
├── docker-compose.yml
└── README.md

```

---

## Development Phases (Revised)

### Phase 0: SDK Implementation (✅ Completed)

**Goal**: Build the shared Data Access Library.

**Status**: **Completed** (v2.0.0)

**SQL Layer** (Synchronous):
- ✅ `SQLDriver` with automatic query logging via event system
- ✅ `RdbmsConnector` with singleton pattern and read/write engine support
- ✅ `BaseSqlDao` for raw SQL execution with exception wrapping
- ✅ `@InjectConnection` decorator for transaction management
- ✅ Two-tier error codes (InfraErrorCode + DaoErrorCode)
- ✅ Supports: PostgreSQL, MySQL, SQL Server, SQLite

**NoSQL Layer** (Asynchronous):
- ✅ `MongoDriver` with AsyncIOMotorClient
- ✅ `MongoConnector` with singleton pattern and Beanie ODM initialization
- ✅ Direct Beanie Document models (no DAO layer - Active Record pattern)
- ✅ Single-tier error codes (InfraErrorCode only)
- ✅ Supports: MongoDB with replica sets and sharded clusters

**Infrastructure**:
- ✅ LogBuilder with LogEvent taxonomy for structured logging
- ✅ Exception hierarchy (SqlDaoException, MongoConnectionException, MongoODMException)
- ✅ Complete architecture documentation (SQL_ARCHITECTURE.md, NOSQL_ARCHITECTURE.md)
- ✅ Complete API reference documentation (SQL_API_REFERENCE.md)
- ✅ Packaged as installable Wheel



### Phase 1: Frontend Implementation (✅ Completed)

**Goal**: Build the interactive React UI.

**Status**: **Completed**

**Completed Components**:
- ✅ Component architecture (modular design)
- ✅ DescriptionPanel with markdown rendering
- ✅ StepsPanel with phase-based task tracking
- ✅ CodeEditor with YAML syntax highlighting
- ✅ Console component for validation output
- ✅ QuizPanel for quiz-type exercises
- ✅ Dark mode support
- ✅ Responsive layout with resizable panels
- ✅ Mock data integration

**Documentation**:
- ✅ [Component Architecture](./docs/frontend/COMPONENTS.md)
- ✅ [API Integration Contracts](./docs/frontend/API_INTEGRATION.md)

**Pending**: Backend API integration (Phase 3)

---

### Phase 2: Backend Core Service Implementation (🚧 Current)

**Goal**: Build the FastAPI backend using `dbdaolib` SDK.

**Completed**:
- ✅ Scaffolded FastAPI application structure
- ✅ Installed `dbdaolib` SDK (v2.0.0)
- ✅ Implemented `MongoHelper` (extends `MongoConnector`) for YAML config loading
- ✅ Implemented ECS-compliant structured logging system

**In Progress**:
1. **Beanie Document Models** (split-brain architecture):
   - [ ] `LearningUnit` (Public Collection):
     - [ ] Fields: slug, title, topic, type (conceptual/coding), description_md, steps, quizzes (no answers), editor_config
     - [ ] Class methods: `find_by_topic()`, `find_by_type()`, `search()`
   - [ ] `UnitSolution` (Private Collection - **NEVER exposed to API**):
     - [ ] Fields: unit_id (FK), quiz_answers (answer key), code_solution, validation_script
     - [ ] Used only for server-side grading
   - [ ] `UserSolution` (User Submissions):
     - [ ] Fields: user_id, unit_id, content (code/quiz answers), version, auto_save timestamp
     - [ ] Class methods: `get_latest()`, `get_history()`, auto-versioning logic
   - [ ] `UserProgress` (Permanent State):
     - [ ] Fields: user_id, unit_id, status (started/completed), score, completed_at
     - [ ] Class methods: `mark_started()`, `mark_completed()`

2. **MongoDB Initialization**:
   - [ ] Update `main.py` startup event to call `MongoHelper.init()` with all document models
   - [ ] Test MongoDB connection and Beanie ODM binding
   - [ ] Handle connection failures with proper error logging
   - [ ] Setup structured logging with `setup_logging()`

3. **API Routes Implementation** (split-brain security):
   - [ ] Content Routes (`routes/content.py`):
     - [ ] `GET /api/units/syllabus` - List all units (projection: id, slug, title, topic, type, order_index only)
     - [ ] `GET /api/units/{slug}` - Get single unit (public fields only, **NO answer keys**)
     - [ ] `GET /api/units/topics` - List unique topics
   - [ ] User Solution Routes (`routes/solutions.py`):
     - [ ] `POST /api/solutions/{unit_id}/auto-save` - Auto-save user code/quiz (MongoDB-based)
     - [ ] `GET /api/solutions/{unit_id}` - Get latest user solution
     - [ ] `GET /api/solutions/{unit_id}/history` - Get version history
     - [ ] `POST /api/solutions/{unit_id}/restore/{version}` - Restore previous version
   - [ ] Grading Routes (`routes/grading.py`):
     - [ ] `POST /api/units/{id}/submit` - Submit quiz (server-side grading, returns score only)
     - [ ] `POST /api/units/{id}/verify` - Submit code (dispatches to validation worker)
   - [ ] Progress Routes (`routes/progress.py`):
     - [ ] `GET /api/progress` - Get user's overall progress
     - [ ] `GET /api/progress/{unit_id}` - Get progress for specific unit

4. **Security Implementation**:
   - [ ] Ensure `UnitSolution` collection is NEVER queried by frontend-facing endpoints
   - [ ] Server-side quiz grading (compare user answers with private answer key)
   - [ ] Validation script bundling (send to worker, never to frontend)
   - [ ] Rate limiting on submit/verify endpoints (5 requests/minute)

5. **Error Handling & Validation**:
   - [ ] Catch `MongoConnectionException` in startup
   - [ ] Handle Beanie exceptions (DuplicateKeyError, ValidationError)
   - [ ] Return proper HTTP status codes (400, 404, 500)
   - [ ] Implement request validation with Pydantic schemas

6. **CORS & Middleware**:
   - [ ] Configure CORS for frontend (http://localhost:3000)
   - [ ] Add request logging middleware with structured logs
   - [ ] Add session ID extraction middleware (placeholder, no persistence)

7. **Content Management**:
   - [ ] Create `seed.py` script to populate MongoDB from master YAML/JSON files
   - [ ] Split content into public (learning_units) and private (unit_solutions) collections
   - [ ] Initial dataset: 5-10 sample exercises (mix of conceptual and coding)

8. **Testing**:
   - [ ] Unit tests for Document model methods
   - [ ] Integration tests for API endpoints
   - [ ] Security tests (verify private data never exposed)
   - [ ] Test MongoDB connection failure scenarios
   - [ ] API contract validation against frontend specs

### Phase 3: Frontend-Backend Integration (Upcoming)

**Goal**: Connect React frontend to FastAPI backend.

**Prerequisites**:
- ✅ Phase 1 (Frontend) completed
- ⏳ Phase 2 (Backend Core Service) must be completed

**Tasks**:
1. **API Client Setup**:
   - [ ] Configure environment variables (REACT_APP_API_BASE_URL)
   - [ ] Implement axios client with session ID injection
   - [ ] Create API service layer (`services/contentService.ts`, `services/solutionService.ts`, `services/progressService.ts`)
   - [ ] Add error handling for 400/404/500 responses

2. **Content Integration**:
   - [ ] Replace mock data with API calls to `/api/units/syllabus`
   - [ ] Implement unit loading from `/api/units/{slug}`
   - [ ] Support dual-mode rendering (conceptual vs coding)
   - [ ] Add error handling for failed API requests
   - [ ] Test topic filtering

3. **Quiz Integration** (Conceptual Modules):
   - [ ] Connect QuizPanel to submit endpoint (`POST /api/units/{id}/submit`)
   - [ ] Display score and correct answers after submission
   - [ ] Handle server-side grading (frontend never sees answer keys)
   - [ ] Update UserProgress on completion

4. **Solution Auto-Save Integration** (Coding Exercises):
   - [ ] Implement debounced auto-save (2s delay) to MongoDB endpoint
   - [ ] Add "Saving..." / "Saved" indicator
   - [ ] Handle auto-save failures gracefully
   - [ ] Test version history and restore functionality

5. **Progress Tracking Integration**:
   - [ ] Display completion status per unit
   - [ ] Show scores for completed quizzes
   - [ ] Add progress indicator in syllabus view

6. **Testing Integration**:
   - [ ] End-to-end tests with real backend
   - [ ] Test CORS configuration
   - [ ] Verify session management (placeholder)
   - [ ] Security test: Verify answer keys never appear in network tab
   - [ ] Load testing for concurrent users

7. **Documentation**:
   - [ ] Update API documentation with actual endpoints
   - [ ] Document dual-mode learning workflows
   - [ ] Document known issues and workarounds
   - [ ] Create integration troubleshooting guide

---

### Phase 4: Containerization (Upcoming)

**Goal**: Dockerize frontend and backend services.

**Prerequisites**:
- ✅ Phase 3 (Integration) must be completed

**Tasks**:
1. **Frontend Dockerfile**:
   - [ ] Multi-stage build (Node.js build + Nginx serve)
   - [ ] Optimize image size (Alpine Linux)
   - [ ] Configure Nginx for SPA routing
   - [ ] Add health check endpoint

2. **Backend Dockerfile**:
   - [ ] Python 3.11+ base image
   - [ ] Install `dbdaolib` SDK
   - [ ] Copy application code
   - [ ] Configure Gunicorn/Uvicorn for production
   - [ ] Add health check endpoint

3. **Docker Compose**:
   - [ ] Define services (frontend, backend, mongodb)
   - [ ] Configure networking (bridge network)
   - [ ] Set up volumes for MongoDB persistence
   - [ ] Configure environment variables
   - [ ] Add depends_on for service orchestration
   - [ ] **Note**: Redis deferred to Phase 6
   - [ ] Document startup commands

4. **Testing**:
   - [ ] Test docker-compose up/down
   - [ ] Verify service connectivity
   - [ ] Test data persistence across restarts
   - [ ] Performance benchmarking

---

### Phase 5: Kubernetes Deployment (Helm) - Feasibility Evaluation (Future)

**Goal**: Evaluate and implement Helm charts for Kubernetes deployment.

**Prerequisites**:
- ✅ Phase 4 (Containerization) must be completed

**Feasibility Checks**:
1. **Complexity vs Benefit**:
   - [ ] Evaluate if Helm adds value for local deployment
   - [ ] Consider simpler k8s manifests vs Helm complexity
   - [ ] Assess team's Helm expertise

2. **If Helm is Justified**:
   - [ ] Create Helm chart structure (`helm/kubeplayground/`)
   - [ ] Define values.yaml with configurable parameters
   - [ ] Create templates for:
     - [ ] Frontend deployment & service
     - [ ] Backend deployment & service
     - [ ] MongoDB StatefulSet & PVC
     - [ ] Redis deployment
     - [ ] Ingress (optional)
   - [ ] Document installation steps
   - [ ] Test on Minikube/MicroK8s

3. **Alternative**: Plain Kubernetes Manifests
   - [ ] If Helm is overkill, use simple k8s YAML files
   - [ ] kubectl apply -f k8s/ approach
   - [ ] Document deployment process

---

### Phase 6: Validation Worker & Redis Integration (Future)

**Goal**: Build the background K8s processor and optimize with Redis caching.

**Tasks**:
1. **Redis Infrastructure**:
   - [ ] Set up Redis Docker container
   - [ ] Migrate auto-save from MongoDB to Redis (draft storage)
   - [ ] Implement TTL-based draft expiration (30 days)
   - [ ] Message queue for validation jobs

2. **Validation Worker**:
   - [ ] Redis Producer/Consumer logic
   - [ ] Kubernetes Client implementation
   - [ ] Log streaming pipeline (Worker -> Redis -> WebSocket)
   - [ ] Integration with Core Service

3. **Performance Optimization**:
   - [ ] Benchmark MongoDB vs Redis autosave performance
   - [ ] Implement Redis-based session caching
   - [ ] Monitor memory usage and eviction policies

---

## Resource Requirements

| Service | CPU Limit | Memory Limit | Status | Notes |
| --- | --- | --- | --- | --- |
| **Frontend** | 0.2 cores | 128MB | ✅ Completed | Nginx Static (React SPA) |
| **Core Service** | 0.5 cores | 512MB | 🚧 In Progress | FastAPI + dbdaolib SDK + Split-Brain Security |
| **MongoDB** | 1.0 cores | 1GB | ⏳ Pending | Primary Data Store (4 collections) |
| **Redis** | 0.2 cores | 256MB | ⏳ Phase 6 | Message Broker + Draft Cache (optimization) |
| **Validation Worker** | 0.5 cores | 512MB | ⏳ Phase 6 | Background K8s Validation |

**Current Phase Estimate**: Frontend (0.2 cores, 128MB)  
**Phase 2 Estimate**: Frontend + Backend + MongoDB (~2 cores, 1.5GB RAM)  
**Phase 6 Estimate (Full System)**: ~2.5-3 Cores, 3GB RAM