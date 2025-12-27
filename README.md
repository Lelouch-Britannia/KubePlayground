# KubePlayground - Development Plan (v2.0)

## Project Vision

An interactive, locally-deployable web platform similar to HackerRank/LeetCode for learning Kubernetes hands-on.

**What you can do:**

* Browse exercises from curated curriculum
* Write YAML solutions in browser with Monaco Editor (VS Code-like experience)
* Validate against your local Kubernetes cluster (Minikube/MicroK8s)
* Save and track progress locally with auto-save
* Get instant feedback via automated verification steps

**Current Focus (v1.0)**: Exercise display, solution editing/saving, decoupled deployment/validation workflow.

**Future (v2.0)**: User authentication, progress tracking, leaderboards, and social features.

---

## Architecture Overview

We utilize a **Modular Monolith** pattern for the core application logic to maintain simplicity and development speed, paired with an **Asynchronous Worker** pattern for Kubernetes operations to ensure UI responsiveness and security.

<img src=./docs/images/arch.jpg alt="KubePlayground Modular Monolith Architecture" width="800" />

---

## Service Breakdown

### 1. Core Service (Port 8000)

**Role**: The "Brain" (Monolith)

* **Responsibilities**:
* **API Gateway**: Serves as the single entry point for the Frontend.
* **Exercise Domain**: Manages static content, markdown instructions, and templates.
* **Solution Domain**: Handles auto-saving user code and version history.
* **Orchestration**: Dispatches deployment and validation jobs to the Redis Queue.
* **WebSocket Manager**: Streams real-time logs from Redis Pub/Sub to the user.


* **Tech**: FastAPI (Python), Motor (MongoDB Async Driver).
* **Database**: MongoDB (Stores Exercises, Solutions, Submissions).

### 2. Validation Service (Background Worker)

**Role**: The "Muscle" (Worker)

* **Responsibilities**:
* **Job Consumer**: Listens to the `validation_queue` in Redis.
* **K8s Interaction**: Uses the official Kubernetes Client to apply manifests and query resources.
* **Namespace Isolation**: Creates unique namespaces per session (`session-<id>`).
* **Log Producer**: Pushes real-time events ("Container Creating", "Error") to Redis Pub/Sub.


* **Tech**: Python (Kubernetes Library). *Future upgrade path: Go.*
* **Database**: None (Stateless).

### 3. Infrastructure

* **MongoDB**: Centralized storage for all application data.
* **Redis**: Acts as the message broker (Task Queue) and the real-time event bus (Pub/Sub).

---

## The Low-Latency Strategy: "Deploy vs. Verify"

To solve the inherent slowness of Kubernetes pod spin-up, we split the user workflow into two distinct actions.

### Action A: "Run" (Deployment)

* **Goal**: Spin up infrastructure.
* **Process**: Frontend sends YAML → Core Service pushes "Deploy Job" → Worker applies YAML to cluster → Worker streams "Pod Status" events.
* **UX**: User sees a terminal with "Pulling Image...", "Container Creating...".

### Action B: "Submit" (Verification)

* **Goal**: Check correctness (Instant Feedback).
* **Process**: Frontend requests validation → Core Service pushes "Verify Job" → Worker inspects **already running** resources.
* **UX**: Since the pods are already running from Action A, the checks (e.g., `is_ready?`, `logs_contain?`) complete in milliseconds.

---

## Directory Structure

The project structure is flattened to reduce boilerplate and context switching.

```text
kubeplayground/
├── core-service/                # THE MONOLITH
│   ├── main.py                  # App entry point & Route mounting
│   ├── models.py                # Unified MongoDB models (Exercise, Solution)
│   ├── schema.py                # Pydantic Schemas (Request/Response)
│   ├── requirements.txt
│   ├── routes/                  # Logic split by domain
│   │   ├── exercises.py
│   │   ├── solutions.py
│   │   └── deployments.py       # Handles /deploy and /verify
│   └── utils/
│       └── database.py          # DB connection logic
│
├── validation-service/          # THE WORKER
│   ├── main.py                  # Worker entry point
│   ├── requirements.txt
│   ├── executor.py              # Logic to run K8s checks
│   └── utils/
│       └── k8s_client.py        # Wrapper for official K8s client
│
├── frontend/                    # React App (Phase 3 Complete)
│   └── ...
│
├── helm/                        # K8s Deployment Charts (Future)
│   └── ...
│
├── docker-compose.yml           # Orchestration
└── README.md

```

---

## Development Phases (Revised)

### Phase 1: Core Service Implementation (Week 1-2)

**Goal**: Build the Unified API for Exercises and Solutions.

**Tasks**:

1. **Scaffold Core Service**: Setup FastAPI with the simplified directory structure.
2. **Database Integration**: Implement `utils/database.py` with Beanie/Motor for MongoDB.
3. **Unified Models**: Create `models.py` defining `Exercise` and `Solution` documents.
4. **Exercise Routes**: Implement endpoints to list/filter exercises and retrieve markdown.
5. **Solution Routes**: Implement endpoints for auto-save (debounce logic) and history.
6. **Git Sync**: Implement the logic to parse the `Deployment101` repo and populate MongoDB.

**Deliverable**: Core API running on Port 8000, serving content and saving data to Mongo.

---

### Phase 2: Validation Worker & K8s Integration (Week 3)

**Goal**: Build the background worker to handle the "Deploy" and "Verify" split.

**Tasks**:

1. **Redis Setup**: Configure Redis container in Docker Compose.
2. **Job Producer**: Update Core Service to push JSON jobs to Redis lists.
3. **Worker Scaffold**: Create the python worker loop in `validation-service/main.py`.
4. **Kubernetes Client**: Implement `k8s_client.py` using the official python library (avoiding subprocess/shell).
5. **Deploy Logic**: Implement the logic to accept YAML, create a Namespace, and Apply resources.
6. **Verify Logic**: Implement the logic to query existing resources against a checklist.
7. **Pub/Sub Streaming**: Implement the mechanism to push logs from Worker -> Redis -> Core Service -> WebSocket.

**Deliverable**: A functional "Run" button that spins up pods in Minikube and streams logs to the console.

---

### Phase 3: Frontend Development (Week 4-5) ✅ COMPLETED

**Goal**: Build LeetCode-style React UI.

**Status**: **Done**. The UI is built, including:

* Resizable Split-Panel Layout.
* Monaco YAML Editor.
* Console Drawer for logs.
* Markdown Description Renderer.

---

### Phase 4: API Integration (Week 6)

**Goal**: Connect the "Brainless" Frontend to the new Core Service.

**Tasks**:

1. **API Client**: Update `frontend/src/services/apiClient.ts` to point to the Core Service URL.
2. **Data Fetching**: Hook up `useExercises` to load real data from MongoDB.
3. **Auto-Save**: Connect the Editor to the `/solutions` endpoint.
4. **Run Integration**: Connect the "Run" button to `/deploy` and listen to the WebSocket for "Container Creating" logs.
5. **Submit Integration**: Connect the "Submit" button to `/verify` for instant feedback.

**Deliverable**: Fully functional application where users can load exercises, write code, run it against Minikube, and validate results.

---

### Phase 5: CLI Tool (Week 8) - Optional

**Goal**: Build a CLI alternative for terminal-first users.

**Tasks**:

1. **CLI Framework**: Use `typer` to create commands (`list`, `start`, `submit`).
2. **API Consumption**: CLI acts as a client to the running Core Service.
3. **Editor Integration**: Open system editor ($EDITOR) for YAML files.

---

### Phase 6: Helm & Deployment (Week 9)

**Goal**: Package the platform for easy distribution.

**Tasks**:

1. **Optimization**: Create production Dockerfiles (multi-stage builds).
2. **Helm Chart**: Create a simplified Chart deploying only:
* Deployment: Core Service
* Deployment: Validation Worker
* StatefulSet: MongoDB
* Deployment: Redis
* Service: Frontend


3. **Install Script**: A simple bash script to check for Minikube and install the Chart.

---

## Resource Requirements (Optimized)

By consolidating services, we drastically reduce overhead.

| Service | CPU Limit | Memory Limit | Notes |
| --- | --- | --- | --- |
| **Core Service** | 0.5 cores | 512MB | Unified API |
| **Validation Worker** | 0.5 cores | 512MB | Background tasks |
| **MongoDB** | 1.0 cores | 1GB | Primary Data |
| **Redis** | 0.2 cores | 256MB | Message Broker |
| **Frontend** | 0.2 cores | 128MB | Nginx Static |

**Total Estimate**: ~2-3 Cores, 3GB RAM (excluding Minikube itself).