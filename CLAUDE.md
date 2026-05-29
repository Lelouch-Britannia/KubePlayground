# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

KubePlayground is a local-first, privacy-focused Kubernetes learning platform. Users generate course
content with AI (ChatGPT/Claude), save it as YAML files, and seed it into the app. No cloud dependencies.

## Commands

### Docker (primary workflow)

```bash
docker compose up -d          # Start all services
docker compose down           # Stop
docker compose down -v        # Stop + wipe volumes (clean slate)
docker compose logs -f backend
docker compose up seed        # Re-run content seeder manually
```

### Backend (FastAPI)

```bash
# From repo root — Python managed by uv
uv pip install -r pyproject.toml
cd SDKs/DAO && uv pip install -e . && cd ../..

cd core
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Python linting/formatting

```bash
ruff check .                  # Lint
ruff check . --fix            # Auto-fix
ruff format .                 # Format
```

### Tests

```bash
pytest                        # All tests (core + integration)
pytest path/to/test_file.py   # Single file
pytest -k "test_name"         # Single test by name

# DAO SDK has its own pytest root
cd SDKs/DAO && pytest                     # All DAO unit tests
cd SDKs/DAO && pytest -k "test_name"      # Single DAO test
```

### Pre-commit

```bash
pre-commit run --all-files    # Run all hooks
pre-commit install            # Install hooks
```

### Frontend (React + Vite)

```bash
cd frontend
npm install
npm run dev          # Dev server → http://localhost:5173
npm run build        # Production build (tsc + vite)
npm run lint         # ESLint
```

### Validation Service (Go)

```bash
cd validation-service
make build           # Compile binary
make run             # Run locally
make test            # Unit tests
make test-integration  # Requires live K8s cluster
make lint            # golangci-lint
make check           # fmt + lint + test
```

## Architecture

```
Browser → Nginx :8080 → FastAPI :8000 → SQLite (IAM/catalog)
                                      → MongoDB :27017 (content/progress)
                                      → Redis :6379 (draft autosave)
                     → Static assets (React SPA)
```

### Split-Brain Database Design

SQLite and MongoDB serve different domains with **no DB-level foreign keys** — referential integrity
is enforced in application code.

| Database | Stores | Access |
|----------|--------|--------|
| SQLite | Users, auth tokens, course/topic catalog, activity logs | Synchronous via SQLAlchemy |
| MongoDB | Learning content, user progress, submissions, answer keys | Async via Beanie ODM |
| Redis | Draft autosave, session cache | Direct Redis client |

Cross-database FK validation is done manually: `database.validate_user_exists()` before creating MongoDB user records.

### MongoDB Collection Split-Brain Security

Content is split across collections to prevent answer key exposure:

- `learning_units` — public content (questions, instructions, editor template). Safe to send to frontend.
- `unit_solutions` — private answer keys and validation scripts. **Never exposed to frontend.**
- `user_submissions` — per-user code submissions with pass/fail status.
- `user_progress` — permanent completion tracking.

### Backend (`core/`)

FastAPI monolith. Entrypoint: `core/main.py`. All routes prefixed `/api/v1`.

Router responsibilities:

- `auth/` — JWT access tokens (60min) + refresh tokens (7 days), bcrypt, activity tracking
- `routers/seed.py` — YAML file ingestion into MongoDB; called once per topic
- `routers/courses.py` — SQLite course/topic catalog queries
- `routers/content.py` — MongoDB `learning_units` queries
- `routers/solutions.py` — Private answer key retrieval; never returns solution data to frontend directly
- `routers/grading.py` — Code submission validation; runs via WebSocket (`/ws/grading/run`)
  which proxies to the validation service
- `routers/submissions.py` — Submission history queries
- `routers/progress.py` — `user_progress` upserts and queries
- `routers/dashboard.py` — Aggregated dashboard view (joins SQLite catalog + MongoDB progress)

`database.py` wires both DB connections. `models.py` has all Beanie Documents.
`schema.py` has all Pydantic request/response schemas.

### Environment Config

`ENVIRONMENT` env var (`development` | `production`, default `development`) controls which YAML is loaded
from `core/utils/config/{env}.yaml`. This drives both SQLite path and MongoDB connection settings.
In Docker, set via `docker-compose.yml`; locally, export before running `uvicorn`.

### SDK (`SDKs/DAO/daolib/`)

Installable Python library (`dbdaolib`) providing unified SQL + NoSQL drivers. Used by `core/` for
connection pooling and structured logging. Install with `uv pip install -e SDKs/DAO`.

### Frontend (`frontend/src/`)

React 18 + TypeScript SPA. Route structure mirrors the course hierarchy:

```
/              → Dashboard (topic cards + progress)
/courses       → Course list
/courses/:slug → CourseChaptersPage (topic list)
/topics/:slug  → TopicUnitsPage (unit list)
/unit/:slug    → LearningUnit (Monaco editor or conceptual)
```

`AuthContext` manages JWT storage (localStorage keys: `kp_access_token`, `kp_refresh_token`).
`services/api.ts` handles auto-refresh on 401. In Docker, `VITE_API_BASE_URL` is empty —
Nginx proxies `/api/*` to the backend.

#### LearningUnit layout (`pages/LearningUnit.tsx`)

LeetCode-style 3-pane layout:

- **Top bar (h-12)**: logo icon → hamburger (opens `ProblemListPanel`) → divider →
  prev/counter/next → [centered: Run icon + Submit] → UserMenu (icon only, no username)
- **Left pane**: description tab (title, markdown, Exercise steps flat list, per-hint accordions)
  - Tab bar right side: difficulty badge + Mark as Read button (theory) or difficulty badge (coding)
  - Mark as Read calls `POST /progress/update` with `status=completed`; updates ProblemListPanel and heatmap
  - Submissions tab. Maximize button top-right.
- **Right pane** (coding units): editor sub-pane + draggable dark gap + console sub-pane.
  Editor has Maximize + Reset. Console is minimizable (click header) and resizable (drag handle);
  auto-expands on Run/Submit.
- `ProblemListPanel` (`components/shared/ProblemListPanel.tsx`) — fixed overlay,
  Course→Topics→Units nested list with search and completion indicators.
- `MarkdownRenderer` (`components/shared/MarkdownRenderer.tsx`) — custom parser, all text at
  `text-sm` density. Do not add `text-lg` — intentionally reduced to match LeetCode.
- Docker rebuild: `docker compose build frontend && TAG=<tag> docker compose up -d --force-recreate frontend`.
  Nginx serves assets with `Cache-Control: immutable` — hard refresh won't show changes; must rebuild.

### Validation Service (`validation-service/`)

Go service (Phase 2, partially implemented). Applies K8s manifests against a real cluster, runs
validation scripts, returns structured results. Called by `grading.py` via HTTP.
Config in `validation-service/config/config.yaml`.

## Key Constraints

- **Quiz/grading feature is commented out** throughout. Relevant code is preserved with
  `# quiz/grading feature commented out` markers and in git history.
  Do not re-enable without confirming it's intentional.
- **Scoring system is commented out** throughout (backend + frontend). Preserved with
  `# scoring feature commented out` markers. Points fields exist in models but are zeroed.
- **CORS is intentionally permissive** (`allow_origins=["*"]`) — this is a local-only app.
- `ruff` excludes `sample-resources/`, `*.ipynb`, and `validation-service/` — don't add those to lint scope.
- `sample-resources/` is a git submodule (separate repo of Kubernetes YAML exercise files).
- Commit messages follow Conventional Commits (`commitlint.config.js`).

## Activity & Streak Tracking

Two paths write to SQLite `ActivityLog` + `UserActivity` + `UserStreak`:

1. **Coding units** — `routers/grading.py` `validate-only` endpoint calls `_log_activity()` on every
   submission (pass or fail) and triggers `update_user_streak_background` on pass.
2. **Theory units** — `POST /progress/update` with `status=completed` (Mark as Read button) writes
   `exercise_completed` to ActivityLog and updates streak via the same background task.

Recent activity feed: `GET /api/v1/auth/me/activity/recent` — queries `ActivityLog` directly,
filtered to `exercise_completed` / `exercise_attempted`. Returns per-event log (not daily aggregates).

## Validation Service

Terminal pod states (ImagePullBackOff, CrashLoopBackOff, OOMKilled, etc.) return an error immediately
instead of showing as "deployed". `WaitForResources` in `pkg/k8s/client.go` covers:

- Terminal container waiting reasons (11 states)
- Pod phase `Failed` / `Unknown`
- `Unschedulable` pod condition
- Timeout with pending pod count

Failed runs leave the namespace alive for user inspection. Only passing runs trigger namespace cleanup.
