# Frontend API Integration Guide

**Version:** 2.0
**Last Updated:** June 2026

---

## Overview

The frontend React 18 + TypeScript SPA communicates with the FastAPI backend via a centralized
`ApiClient` singleton (`src/services/api.ts`). All requests carry a JWT Bearer token; on `401`
the client transparently refreshes the access token and retries. In Docker, `VITE_API_BASE_URL`
is empty and Nginx proxies `/api/*` to the backend.

---

## Architecture

```
Frontend (React 18 + TypeScript + Vite)
    ↓ HTTP/REST + JWT Bearer Token (auto-refresh on 401)
FastAPI Backend :8000  (all routes under /api/v1)
    ├─ SQLAlchemy ORM → SQLite
    │    users, refresh_tokens, user_activity, user_streaks,
    │    activity_log, courses, topics, user_enrollments
    └─ Beanie ODM → MongoDB
         learning_units, unit_solutions, user_submissions, user_progress
```

Token storage: `kp_access_token` and `kp_refresh_token` in `localStorage`.

---

## Authentication API  (`/api/v1/auth`)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/register` | Create account → returns token pair + user |
| POST | `/login` | Authenticate → returns token pair + user |
| POST | `/refresh` | Exchange refresh token → new access token |
| GET  | `/me` | Current user profile |
| POST | `/logout` | Revoke refresh token |
| POST | `/change-password` | Update password, revokes all sessions |
| POST | `/logout-all` | Revoke all refresh tokens for user |

### Token lifecycle

- **Access token**: 60-minute JWT, signed HS256, carries `sub/email/username/token_type=access`
- **Refresh token**: 7-day JWT, stored hashed (SHA256) in SQLite, enables revocation
- Client stores access token in memory and refresh token in `localStorage`
- `ApiClient.request()` intercepts `401`, calls `/refresh`, and retries original request once

---

## Activity API  (`/api/v1/auth`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/me/activity/heatmap?days=365` | GitHub-style heatmap data (date + intensity level 0–4) |
| GET | `/me/activity/recent?limit=20` | Per-event activity log (exercise_completed / exercise_attempted) |
| GET | `/me/activity/my?start_date=&end_date=` | Daily aggregates for date range |
| GET | `/me/streak` | Current and longest streak |
| GET | `/me/stats` | Aggregate unit/exercise counts |
| GET | `/profile/summary` | Full profile: streak, units completed, last activity |
| POST | `/activity` | Internal — called by grading router on submission |

Activity is written by two paths: coding unit submissions via `grading.py` and theory unit
"Mark as Read" via `progress.py`. Both write to `ActivityLog` and update `UserStreak`.

---

## Course Catalog API  (`/api/v1/courses`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/` | All courses with unit counts |
| GET | `/{slug}/detail` | Full landing page data: tagline, prerequisites, what_you_learn, modules, author |
| GET | `/{slug}/chapters` | Course chapter list with per-topic unit counts and completion % |
| GET | `/topics/{topic_id}/units` | All units for a topic |

---

## Enrollment API  (`/api/v1/courses`)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/{slug}/enroll` | Enroll — auto-sets active, auto-pauses any current active course |
| DELETE | `/{slug}/enroll` | Unenroll — removes enrollment row, keeps UserProgress |
| PATCH | `/{slug}/status` | Set status: `active` or `paused` — activating auto-pauses others |
| PATCH | `/{slug}/access` | Update `last_accessed_at` — called on every unit open |
| GET | `/my` | All enrollments with status, completion %, last accessed |

Only one course can be `active` per user at a time. The backend enforces this atomically.

---

## Content API  (`/api/v1/units`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/syllabus` | Flat ordered list of all units (used by ProblemListPanel) |
| GET | `/{slug}` | Full unit detail: description, steps, hints, editor_config |

Quiz and solution fields are **not returned** to the frontend. `unit_solutions` collection is
server-side only.

---

## Progress API  (`/api/v1/progress`)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/update` | Upsert unit progress: `started` or `completed`; triggers streak update on complete |
| GET | `/me` | All unit progress for current user |

`user_id` is extracted from the JWT — not accepted in the request body.

---

## Grading & Validation API  (`/api/v1/grading`)

| Method | Path | Purpose |
|--------|------|---------|
| WS | `/ws/run` | WebSocket: apply manifest, stream pod events, run validation script |
| POST | `/code/validate` | HTTP apply-and-validate (non-streaming) |
| POST | `/code/validate-only` | Validate against existing namespace (no apply) |
| POST | `/code/cleanup` | Delete namespace after passing run |
| POST | `/code/verify` | Stub endpoint — Phase 2 |

Quiz submission (`/quiz/submit`) is **commented out**. Scoring and points are **commented out**.
All grading logic for coding exercises runs against a live Kubernetes cluster via the validation
service.

---

## Draft Autosave & Namespace API  (`/api/v1/grading`)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/code/draft` | Save editor code to Redis (`draft:{user_id}:{unit_slug}`, TTL 7 days) |
| GET | `/code/draft/{unit_slug}` | Restore draft on unit load |
| DELETE | `/code/draft/{unit_slug}` | Clear draft (on reset or unenroll) |
| POST | `/code/namespace` | Persist active K8s namespace to Redis (`ns:{user_id}:{unit_slug}`, TTL 24h) |
| GET | `/code/namespace/{unit_slug}` | Restore namespace on unit load |
| DELETE | `/code/namespace/{unit_slug}` | Clear namespace (on cleanup or unenroll) |

Both draft and namespace are restored on unit load so users can refresh without losing work
or re-deploying.

---

## Submissions API  (`/api/v1/submissions`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/{unit_slug}` | All submissions for current user + unit (stored in MongoDB `user_submissions`) |

---

## Dashboard API  (`/api/v1/dashboard`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `` | Enrollment-filtered dashboard |

Response shape depends on enrollment state:

| State | Response |
|-------|---------|
| Active enrollment | `active_course` with full `CourseProgressSummary` (topics, completion per topic) |
| Paused only | `paused_courses[]` with lightweight `PausedCourseSummary` |
| No enrollment | Both null/empty; frontend renders enrollment empty state |

---

## API Client (`src/services/api.ts`)

Single `ApiClient` class exported as `apiClient` singleton. Key design:

- `request<T>()` — base method: attaches Bearer token, handles `401 → refresh → retry`
- Commented-out methods (`autosaveSolution`, `submitQuiz`, etc.) preserved in source with comments
  pointing to git history
- WebSocket connection for `/ws/run` managed separately in `LearningUnit.tsx`

Environment variable `VITE_API_BASE_URL` controls base URL. Empty in Docker (Nginx proxy).

---

## Commented-Out Features

These APIs exist in git history but are currently disabled:

| Feature | Status |
|---------|--------|
| Quiz submission (`/grading/quiz/submit`) | Commented out — backend + frontend |
| Solution autosave versioning | Commented out — replaced by Redis draft |
| Solution history & restore | Commented out |
| Points/scoring system | Commented out — fields zeroed in models |
| Code verification stub (`/grading/code/verify`) | Endpoint exists, returns stub |

Do not re-enable without explicit confirmation.
