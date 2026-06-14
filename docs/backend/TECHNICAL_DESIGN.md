# Backend Technical Design Document

**Version:** 2.0
**Last Updated:** June 2026
**Document Type:** Technical Design Document

---

## 1. Project Overview

KubePlayground is a local-first, privacy-focused Kubernetes learning platform. Users generate course
content with AI, save it as JSON files, and seed it into the app. No cloud dependencies.

**Deployment model:** Single-user Docker Compose. No multi-tenancy. No cloud services.

**Core philosophy:**

- Split-brain architecture isolates public content from private answer keys
- Hybrid database: SQLite for structured/relational data, MongoDB for document content
- Redis for ephemeral state (drafts, active namespaces) — separate from permanent progress
- Enrollment-driven UX: users enroll in one active course at a time

---

## 2. Technology Stack

| Layer | Technology |
|-------|-----------|
| Framework | FastAPI (Python 3.10+) |
| Content DB | MongoDB 6+ via Beanie ODM (async) |
| Catalog/IAM DB | SQLite via SQLAlchemy (sync) |
| Ephemeral store | Redis |
| Validation service | Go microservice (Phase 2, partially implemented) |
| Content SDK | `dbdaolib` (internal Python package in `SDKs/DAO/`) |

---

## 3. Hybrid Database Architecture

### 3.1 Rationale

| Use Case | Database | Reason |
|----------|----------|--------|
| Course catalog browsing | SQLite | 20–25× faster for hierarchical queries |
| Authentication and sessions | SQLite | ACID transactions required for JWT tokens |
| Enrollment and access tracking | SQLite | Relational; requires atomic status transitions |
| Activity heatmap and streaks | SQLite | Aggregation 20–25× faster than MongoDB pipeline |
| Learning unit content | MongoDB | Document model fits nested steps/hints/config |
| User progress and submissions | MongoDB | Per-unit documents; no joins needed |
| Answer keys and validation scripts | MongoDB | Separate collection, never exposed to frontend |
| Draft autosave | Redis | Ephemeral; TTL-managed; no persistence needed |
| Active namespace tracking | Redis | Short-lived; cleared on pass or unenroll |

### 3.2 Cross-Database Referential Integrity

No database-level foreign keys exist between SQLite and MongoDB. Integrity is enforced at the
application layer:

- `database.validate_user_exists()` called before any MongoDB write that references a user
- `activity_log.unit_slug` references MongoDB `learning_units.slug` — validated before write
- MongoDB `user_progress.user_id` is an integer matching `users.id` — validated before write

---

## 4. Router Responsibilities

All routes prefixed `/api/v1`. Entry point: `core/main.py`.

### `auth/` — Identity and Access Management

- `POST /register`, `POST /login`: bcrypt verify, generate JWT pair, store refresh token hash
- `POST /refresh`: validate refresh token, issue new access token
- `GET /me`: current user profile from SQLite
- `POST /logout`, `POST /logout-all`: revoke refresh token(s) in SQLite
- `POST /change-password`: bcrypt update, revoke all sessions
- `GET /me/activity/heatmap`, `GET /me/activity/recent`: GitHub-style heatmap, per-event feed
- `GET /me/streak`, `GET /me/stats`, `GET /profile/summary`: gamification data
- `POST /activity`: internal — called by grading router on submission (not called by frontend directly)

### `routers/seed.py` — Content Seeder

Reads the `sample-resources/k8s/` directory hierarchy:

- `course.json` → upserts `courses` + `topics` in SQLite
- Per-unit JSON → splits into `learning_units` (public) and `unit_solutions` (private) in MongoDB

`_solution` key is stripped from the unit and routed to the `unit_solutions` collection. All other
fields go to `learning_units`. Idempotent — safe to re-run.

### `routers/courses.py` — Course Catalog

- `GET /`: list all courses with unit counts (SQLite)
- `GET /{slug}/detail`: full landing page data — tagline, prerequisites, what_you_learn, modules,
  author (SQLite `courses` table, JSON fields parsed from stored strings)
- `GET /{slug}/chapters`: chapter list with per-topic unit count and completion % (SQLite + MongoDB
  progress join at application layer)
- `GET /topics/{topic_id}/units`: all units for a topic (SQLite catalog + MongoDB unit detail)

### `routers/enrollment.py` — Course Enrollment

- `POST /{slug}/enroll`: create `user_enrollments` row with `status=active`; atomically set any
  existing active enrollment to `paused`
- `DELETE /{slug}/enroll`: remove enrollment row; `user_progress` is preserved
- `PATCH /{slug}/status`: set `active` or `paused`; activating auto-pauses other active enrollment
- `PATCH /{slug}/access`: update `last_accessed_at`; called on every unit open
- `GET /my`: all enrollments with status, completion %, last accessed

Only one `active` enrollment per user is enforced by application logic (not a DB constraint).

### `routers/dashboard.py` — Enrollment-Filtered Dashboard

Single `GET /` endpoint. Returns:

- `active_course`: full `CourseProgressSummary` with per-topic completion data
- `paused_courses`: lightweight list of `PausedCourseSummary`
- Aggregate stats: `total_units`, `completed_count`, `in_progress_count`, `current_streak`

When no enrollment exists, both `active_course` and `paused_courses` are empty — frontend renders
the enrollment empty state.

### `routers/content.py` — Learning Unit Content

- `GET /syllabus`: flat ordered list of all units (from MongoDB `learning_units`)
- `GET /{slug}`: full unit detail — description, steps, hints, editor_config (from MongoDB)

Quiz fields and solutions are **never returned**. `unit_solutions` collection is accessed only by
`grading.py` and `solutions.py`.

### `routers/grading.py` — Validation and Submission

- `WS /ws/run`: WebSocket — applies manifest to K8s cluster, streams pod events, runs validation
  script, returns structured result. Stores namespace in Redis on success.
- `POST /code/validate`: HTTP apply-and-validate (non-streaming)
- `POST /code/validate-only`: validate against existing namespace (no re-apply)
- `POST /code/cleanup`: delete K8s namespace after passing run
- `POST /code/draft` / `GET /code/draft/{unit_slug}` / `DELETE /code/draft/{unit_slug}`:
  Redis-backed draft autosave (`draft:{user_id}:{unit_slug}`, TTL 7 days)
- `POST /code/namespace` / `GET /code/namespace/{unit_slug}` / `DELETE /code/namespace/{unit_slug}`:
  Redis namespace persistence (`ns:{user_id}:{unit_slug}`, TTL 24h)

On passing validation:

1. `_update_progress_on_pass()` upserts `user_progress` in MongoDB
2. `_record_submission()` writes to `user_submissions` in MongoDB
3. `_log_activity()` writes to `ActivityLog` in SQLite and fires `update_user_streak_background`

Quiz submission (`/quiz/submit`) is **commented out**.

### `routers/progress.py` — User Progress

- `POST /update`: upsert `user_progress` in MongoDB; on `status=completed`, writes `exercise_completed`
  to `ActivityLog` and fires `update_user_streak_background` as a background task
- `GET /me`: all unit progress for current user (MongoDB `user_progress`)

`user_id` extracted from JWT — not accepted in request body.

### `routers/solutions.py` — Private Answer Keys

Accesses `unit_solutions` collection. Never returns solution data to frontend.
Used internally for validation script lookup during grading.

### `routers/submissions.py` — Submission History

- `GET /{unit_slug}`: all submissions for current user + unit (MongoDB `user_submissions`)

---

## 5. Data Models

### 5.1 MongoDB Collections (Beanie Documents)

| Collection | Purpose |
|------------|---------|
| `learning_units` | Public content: title, slug, type, difficulty, description, steps, hints, editor_config. Safe for frontend. |
| `unit_solutions` | Private: code_solution, validation_script, quiz_answers. Never exposed to frontend. |
| `user_submissions` | Per-user submission records: code, language, passed, timestamp, output |
| `user_progress` | Permanent completion tracking: user_id (int), unit_slug, status, completed_at |

Quiz-related embedded fields in `LearningUnit` are **commented out**.

### 5.2 SQLite Tables (SQLAlchemy)

| Table | Purpose |
|-------|---------|
| `users` | Account: email (unique), username, bcrypt password_hash, is_active, last_login |
| `refresh_tokens` | Session management: SHA256 token_hash, expires_at, revoked_at |
| `courses` | Course catalog: slug (unique), name, description, tagline, level, estimated_hours, JSON fields (prerequisites, what_you_learn, author, modules) |
| `topics` | Chapter catalog: slug, name, order_position, icon, units_count (cached), FK → courses |
| `user_enrollments` | Enrollment state: user_id, course_id, status (active/paused), enrolled_at, last_accessed_at |
| `user_activity` | Daily activity aggregates for heatmap: user_id + activity_date (composite unique), total_points, exercise counts |
| `user_streaks` | 1:1 with users: current_streak, longest_streak, last_activity_date |
| `activity_log` | Append-only event log: activity_type, unit_slug, points_earned, metadata JSON |

---

## 6. Content Format and Seeding

Content lives in `sample-resources/k8s/` (git submodule). Files are JSON.

```
k8s/kubernetes-fundamentals/
  course.json            ← course metadata + landing page fields
  pods101/
    topic.json           ← topic metadata (slug, name, order, icon, course_slug)
    01-pods-fundamentals.json
    04-first-nginx-pod.json
```

Unit JSON top-level keys: `slug, title, order_index, type, difficulty, description, steps[],
hints[], editor_config{language, initial_code}, quizzes[], _solution{...}`

The seeder:

1. Reads `course.json` → upserts `courses` in SQLite
2. Reads each `topic.json` → upserts `topics` in SQLite
3. For each unit JSON:
   - Strips `_solution` → writes to `unit_solutions` in MongoDB
   - Writes remainder → upserts `learning_units` in MongoDB

---

## 7. Activity and Streak Tracking

Two write paths converge on the same SQLite tables:

**Path 1 — Coding unit submission** (`grading.py`):

- Every submission (pass or fail) calls `_log_activity()` → writes `exercise_attempted` to `ActivityLog`
- On pass: fires `update_user_streak_background` background task

**Path 2 — Theory unit Mark as Read** (`progress.py`):

- `POST /progress/update` with `status=completed` writes `exercise_completed` to `ActivityLog`
- Fires same `update_user_streak_background` background task

**Streak algorithm** (`update_user_streak_background`):

- `days_diff == 0`: same day, no change
- `days_diff == 1`: increment `current_streak`, update `longest_streak` if exceeded
- `days_diff > 1`: reset `current_streak = 1`

**Heatmap** (`GET /me/activity/heatmap`):

- Queries `user_activity` (single indexed table scan)
- Calculates percentile-based intensity thresholds (levels 1–4) from user's own distribution
- Returns complete 365-day date range with level 0 for inactive days

---

## 8. Enrollment Flow

`UserEnrollment` table: `user_id, course_id, status, enrolled_at, last_accessed_at`

Status transitions:

- **Enroll** → insert row with `status=active`; any existing `active` row is set to `paused`
- **Start** (from paused) → same auto-pause logic
- **Pause** → set current enrollment to `paused`
- **Unenroll** → delete row; `UserProgress` (unit completions) is preserved

`last_accessed_at` updated on every unit open via `PATCH /{slug}/access`. Dashboard uses this
to show "last accessed" timestamps.

---

## 9. Redis Usage

| Key pattern | TTL | Contents |
|-------------|-----|---------|
| `draft:{user_id}:{unit_slug}` | 7 days | Editor code (autosaved every 2s) |
| `ns:{user_id}:{unit_slug}` | 24h | Active K8s namespace name |

Both are restored on unit load. Cleared on:

- Passing validation run (namespace cleared; draft cleared on explicit reset)
- Explicit Reset button in editor
- Unenroll

---

## 10. Environment Configuration

`ENVIRONMENT` env var (`development` | `production`, default `development`) selects
`core/utils/config/{env}.yaml`. Controls SQLite path, MongoDB connection, Redis host.

In Docker: set via `docker-compose.yml`. Locally: export before running `uvicorn`.

---

## 11. Key Constraints

- **Quiz/grading commented out**: markers `# quiz/grading feature commented out` throughout.
  Do not re-enable without confirmation.
- **Scoring commented out**: markers `# scoring feature commented out` throughout. Points
  fields exist in models but are zeroed.
- **CORS intentionally permissive** (`allow_origins=["*"]`): local-only app.
- **No email features**: no email verification, no password reset — intentional for local hosting.
- `ruff` excludes `sample-resources/`, `*.ipynb`, `validation-service/`.

---

## 12. Validation Service (`validation-service/`)

Go microservice (Phase 2, partially implemented). Called by `grading.py` via HTTP and WebSocket.

Applies K8s manifests, waits for pod readiness, runs validation scripts, returns structured results.

Terminal pod states trigger immediate error (no waiting): `ImagePullBackOff`, `CrashLoopBackOff`,
`OOMKilled`, `ErrImagePull`, and 7 others. `WaitForResources` in `pkg/k8s/client.go` handles all
terminal states.

Failed runs leave the namespace alive for user inspection. Only passing runs trigger cleanup.
Config: `validation-service/config/config.yaml`.
