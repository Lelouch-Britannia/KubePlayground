# KubePlayground

> An interactive, locally-deployable web platform for learning Kubernetes hands-on — similar to HackerRank/LeetCode.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Python 3.10+](https://img.shields.io/badge/python-3.10+-blue.svg)](https://www.python.org/downloads/)
[![Node.js 20+](https://img.shields.io/badge/node.js-20+-green.svg)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/docker-compose-blue.svg)](https://docs.docker.com/compose/)

## Features

- 📚 **Dual-Mode Learning**: Conceptual modules (quizzes) + Coding exercises (YAML editor)
- 🎨 **Dracula Theme**: LeetCode-style readability with large fonts and high contrast
- 🎉 **Animated Feedback**: Toast notifications with confetti on quiz pass
- 🔒 **Split-Brain Security**: Answer keys never exposed to frontend
- 💾 **Auto-Save**: MongoDB-based solution storage with version history
- 🐳 **Containerized**: Docker Compose with MongoDB, FastAPI backend, React frontend

## Quick Start

```bash
# Clone repository
git clone https://github.com/Lelouch-Britannia/KubePlayground.git
cd KubePlayground

# Start all services
docker compose up -d

# Seed database with sample content
docker compose up seed

# Access application
open http://localhost:8080
```

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│    Frontend     │────▶│    Backend      │────▶│    MongoDB      │
│  (React + Nginx)│     │   (FastAPI)     │     │                 │
│    :8080        │     │    :8000        │     │    :27017       │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

**Current Status**: Phase 4 completed - Full-stack containerized deployment
**Current Focus**: Testing and validation before Phase 6 (K8s validation worker)

<img src="./docs/images/arch.png" alt="KubePlayground Architecture" width="800" />

---

## Project Vision

**What you can do:**

* Browse exercises from curated curriculum
* **Dual-Mode Learning**:
  * **Conceptual Modules**: Markdown lessons with interactive quizzes (multiple-choice)
  * **Coding Exercises**: Write YAML solutions in browser with Monaco Editor (VS Code-like experience)
* Validate against your local Kubernetes cluster (Minikube/MicroK8s)
* Save and track progress with auto-save (MongoDB-based)
* Get instant feedback via automated verification steps
* Secure grading via split-brain architecture (answer keys never exposed to frontend)

---

## Service Breakdown

| Service | Port | Technology | Description |
|---------|------|------------|-------------|
| **Frontend** | 8080 | React + Nginx | SPA with Dracula theme, Monaco editor |
| **Backend** | 8000 | FastAPI + Beanie | REST API with split-brain security |
| **MongoDB** | 27017 | MongoDB 6.0 | Document storage for content & progress |
| **Seed** | - | curl | One-time database population |

### SDK Layer (`dbdaolib` v2.0.0)

**Role**: The Foundation (Library)

* **Responsibilities**:
  * **Unified Connectivity**: Manages connection pooling for SQL (SQLAlchemy) and NoSQL (Motor/Beanie).
  * **Singleton Management**: Ensures single instances of database drivers across the application.
  * **SQL Data Access**: BaseSqlDao with @InjectConnection decorator for transaction management.
  * **NoSQL Data Access**: Direct Beanie Document models (Active Record pattern, no DAO layer).
  * **Structured Logging**: LogBuilder with LogEvent taxonomy for operational monitoring.
  * **Error Handling**: Two-tier for SQL (InfraErrorCode + DaoErrorCode), single-tier for NoSQL
    (InfraErrorCode).

* **Tech**: Python, Motor, Beanie, SQLAlchemy 2.0+.
* **Documentation**: [SDK Architecture Docs](./docs/SDK/)

### 1. Core Service (Port 8000)

**Role**: The "Brain" (Monolith)

* **Responsibilities**:
  * **API Gateway**: Single entry point for Frontend.
  * **Content Delivery**: Serves public learning content (exercises, lessons).
  * **Secure Grading**: Server-side quiz/code validation using split-brain architecture.
  * **Exercise Domain**: Manages public content (questions, instructions) and private solutions (answer
    keys, validation scripts).
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
KubePlayground/
├── SDKs/DAO/                    # Database Access Object Library (v2.0.0)
│   └── daolib/
│       ├── drivers/sql/         # SQLAlchemy drivers (PostgreSQL, MySQL, SQLite)
│       └── drivers/nosql/       # Motor/Beanie drivers (MongoDB)
├── core/                        # FastAPI Backend Service
│   ├── main.py                  # Application entry point
│   ├── models.py                # Beanie Document models
│   ├── schema.py                # Pydantic request/response schemas
│   ├── routers/                 # API route handlers
│   ├── utils/                   # Helpers, logging, constants
│   └── Dockerfile               # Backend container image
├── frontend/                    # React SPA
│   ├── src/
│   │   ├── pages/               # Dashboard, LearningUnit
│   │   ├── components/          # Reusable UI components
│   │   └── services/            # API client
│   ├── Dockerfile               # Frontend container image
│   ├── nginx.conf               # Nginx configuration
│   └── kubeplayground.conf      # Site-specific nginx config
├── sample-resources/            # Learning content (YAML files)
│   └── k8s/
│       ├── pods101/             # Kubernetes Pods exercises
│       ├── deployment101/       # Deployment exercises
│       └── replicaset101/       # ReplicaSet exercises
├── docs/                        # Documentation
│   ├── SDK/                     # SDK architecture docs
│   ├── frontend/                # Frontend component docs
│   └── backend/                 # Backend design docs
├── docker-compose.yml           # Container orchestration
└── pyproject.toml               # Python dependencies
```

---

## Development Phases

### Phase 0: SDK Implementation ✅

Built the shared Database Access Object Library (`dbdaolib` v2.0.0).

| Layer | Features |
|-------|----------|
| **SQL** | SQLDriver, RdbmsConnector (singleton), BaseSqlDao, @InjectConnection decorator |
| **NoSQL** | MongoDriver, MongoConnector (singleton), Beanie ODM integration |
| **Supported DBs** | PostgreSQL, MySQL, SQL Server, SQLite, MongoDB |
| **Infrastructure** | LogBuilder, structured logging, exception hierarchy |

### Phase 1: Frontend Foundation ✅

Built the interactive React UI with modern tooling.

| Component | Technology |
|-----------|------------|
| **Framework** | React 18 + TypeScript + Vite |
| **Routing** | React Router DOM |
| **Code Editor** | Monaco Editor (VS Code engine) |
| **Styling** | Tailwind CSS + Dracula theme |
| **Markdown** | react-markdown with syntax highlighting |

### Phase 2: Backend Core Service ✅

Built the FastAPI backend with split-brain security architecture.

| Feature | Implementation |
|---------|----------------|
| **Framework** | FastAPI + Beanie ODM |
| **Collections** | `learning_units` (public), `unit_solutions` (private), `user_solutions`, `user_progress` |
| **Security** | Answer keys never exposed to frontend, server-side grading |
| **Performance** | ~13ms response time |
| **API Routes** | 10 endpoints (dashboard, units, progress, grading, solutions, seed) |

### Phase 2A: Frontend-Backend Integration ✅

Connected React frontend to FastAPI backend with production-quality UX.

| Feature | Details |
|---------|---------|
| **Dashboard** | Topic-grouped progress cards, completion stats, filtering |
| **Learning Unit** | Split-screen layout, quiz/code submission, prev/next navigation |
| **Theme** | Dracula color palette, LeetCode-style readability |
| **Feedback** | Toast notifications, confetti animation, score breakdown |
| **Performance** | Smooth transitions, no full-page reloads |

### Phase 4: Containerization ✅

Dockerized the full stack with Docker Compose orchestration.

| Component | Implementation |
|-----------|----------------|
| **Frontend** | Multi-stage build (Node.js → Nginx Alpine), SPA routing, API reverse proxy |
| **Backend** | Python 3.10-slim, `uv` package manager, health checks |
| **Database** | MongoDB 6.0 with persistent volumes |
| **Orchestration** | Docker Compose with health checks, auto-seed service |
| **Networking** | Bridge network, nginx upstream to backend |

---

### Phase 5: Identity Management & User Association (Planned)

User authentication with SQLite and linking to MongoDB collections.

| Component | Implementation |
|-----------|----------------|
| **User Storage** | SQLite (file-based, persistent) |
| **Schema** | `users` table with id, email, username, password_hash |
| **Auth Flow** | Registration → Login → JWT token → Protected routes |
| **Frontend** | Login/Register pages, auth context, protected routes |
| **Backend** | `/auth/register`, `/auth/login`, `/auth/me` endpoints |
| **Data Migration** | Replace `guest-user-001` with real user_id in MongoDB |

### Phase 6: K8s Validation Worker (Planned)

Real Kubernetes cluster validation for coding exercises.

| Component | Implementation |
|-----------|----------------|
| **Worker Service** | Python with Kubernetes client library |
| **Job Queue** | MongoDB-based (no Redis) |
| **Validation Flow** | Apply manifest → Run checks → Return results |
| **Namespace** | Ephemeral namespace per validation |
| **Cleanup** | Auto-delete resources after validation |

### Phase 7: Helm Deployment (Planned)

Package application for Kubernetes deployment.

| Component | Implementation |
|-----------|----------------|
| **Charts** | Frontend, Backend, MongoDB, SQLite (PVC) |
| **Configuration** | values.yaml for environment-specific settings |
| **Ingress** | External access with TLS |
| **Testing** | Minikube/MicroK8s validation |

---

## Resource Requirements

| Service | CPU Limit | Memory Limit | Status | Notes |
|---------|-----------|--------------|--------|-------|
| **Frontend** | 0.2 cores | 128MB | ✅ Containerized | Nginx + React build |
| **Backend** | 0.5 cores | 512MB | ✅ Containerized | FastAPI + Beanie ODM (~13ms response) |
| **MongoDB** | 1.0 cores | 1GB | ✅ Running | Persistent volumes configured |
| **Redis** | 0.2 cores | 256MB | ⏳ Phase 6 | Message Broker (deferred) |
| **Validation Worker** | 0.5 cores | 512MB | ⏳ Phase 6 | Background K8s Validation |

**Current Deployment (Phase 4)**: Frontend + Backend + MongoDB (~2 cores, 1.5GB RAM)

---

## Getting Started

### Option 1: Docker Compose (Recommended)

```bash
# Prerequisites: Docker and Docker Compose

# Clone repository
git clone https://github.com/Lelouch-Britannia/KubePlayground.git
cd KubePlayground

# Start all services
docker compose up -d

# Seed database with sample content (runs once)
# The seed service automatically populates pods101 content

# Access application
open http://localhost:8080

# View logs
docker compose logs -f backend

# Stop services
docker compose down

# Stop and remove volumes (clean slate)
docker compose down -v
```

### Option 2: Local Development

#### Prerequisites

* Python 3.10+
* Node.js 20+
* MongoDB 6.0+ (running on localhost:27017)
* uv (Python package manager)

#### Backend Setup

```bash
# Install uv
curl -LsSf https://astral.sh/uv/install.sh | sh

# Install SDK
cd SDKs/DAO
uv pip install -e .
cd ../..

# Install backend dependencies
uv pip install -r pyproject.toml

# Configure MongoDB connection
# Edit core/utils/config/development.yaml

# Start backend
cd core
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

#### Frontend Setup

```bash
cd frontend
npm install
npm run dev
# Frontend runs on http://localhost:5173
```

### Verify Installation

1. Open http://localhost:8080 (Docker) or http://localhost:5173 (local)
2. Dashboard should load with "Kubernetes Pods" topic
3. Click topic card → navigate to learning unit
4. Test quiz submission → see animated toast + confetti (on pass)
5. Test code submission → see toast notification

### Troubleshooting

| Issue | Solution |
|-------|----------|
| Port 8080 in use | Change port in `docker-compose.yml` or stop conflicting service |
| MongoDB connection refused | Check `docker compose ps` - ensure mongodb is healthy |
| Frontend shows 502 | Backend may still be starting - wait for health check |
| CORS errors (local dev) | Ensure backend runs on port 8000, frontend on 5173 |
| Seed not running | Run `docker compose up seed` manually |

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/dashboard` | GET | Topic-grouped progress overview |
| `/api/units/syllabus` | GET | List all units (public fields) |
| `/api/units/{slug}` | GET | Single unit details |
| `/api/progress/update` | POST | Update completion status |
| `/api/grading/quiz/submit` | POST | Server-side quiz grading |
| `/api/grading/code/verify` | POST | Code verification (stub) |
| `/api/solutions/autosave` | POST | Save user code |
| `/api/seed/populate` | POST | Seed database from YAML |
| `/health` | GET | Health check |

---

## Documentation

- [SDK Architecture](./docs/SDK/DAOLIB.md) - Database access library design
- [SQL Architecture](./docs/SDK/SQL_ARCHITECTURE.md) - SQLAlchemy driver details
- [NoSQL Architecture](./docs/SDK/NOSQL_ARCHITECTURE.md) - MongoDB/Beanie driver details
- [Frontend Components](./docs/frontend/COMPONENTS.md) - React component architecture
- [API Integration](./docs/frontend/API_INTEGRATION.md) - Frontend-backend contracts
- [Backend Design](./docs/backend/TECHNICAL_DESIGN.md) - FastAPI service design

---

## Future Roadmap

### Phase 5: Identity Management & User Association
See [Issue 1](https://github.com/Lelouch-Britannia/KubePlayground/issues/1) for details.

### Phase 6: K8s Validation Worker  
See [Issue 2](https://github.com/Lelouch-Britannia/KubePlayground/issues/2) for details.

### Phase 7: Helm Deployment
See [Issue 3](https://github.com/Lelouch-Britannia/KubePlayground/issues/3) for details.

### v2.0 Features (Long-Term)
- Leaderboards and social features
- More learning tracks (Deployments, Services, ConfigMaps)
- Code hints and AI-powered suggestions
- Admin panel for content management

---

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## License

This project is licensed under the MIT License - see [LICENSE](./LICENSE) file for details.
