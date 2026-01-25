# IAM & User Activity Implementation Plan

## Table of Contents

1. [Analysis Summary](#1-analysis-summary)
2. [IAM Implementation Plan](#2-iam-implementation-plan)
3. [User Activity & Streak Plan](#3-user-activity--streak-plan)
4. [SQL Schema](#4-sql-schema)
5. [MongoDB Schema Updates](#5-mongodb-schema-updates)
6. [Quick Win Features](#6-quick-win-features)

---

## 1. Analysis Summary

### 1.1 SDK Architecture Analysis

The `dbdaolib` SDK provides a robust multi-database abstraction:

| Layer | Component | Purpose |
|-------|-----------|---------|
| **Config** | `DbConnectionEntry` | Connection parameters, pooling, SSL/TLS |
| **Driver** | `SQLDriver` | Engine creation, query logging, fail-fast validation |
| **Connector** | `RdbmsConnector` | Abstract connection factory with read/write separation |
| **DAO** | `BaseHelperSqlDao` | CRUD operations with exception wrapping |
| **Decorator** | `@InjectConnection` | Transaction management, connection injection |

**SQLite Support**: ✅ Fully supported via `DatabaseType.sqlite` with path-based connection.

### 1.2 Core Backend Analysis

| Aspect | Current State | Gap |
|--------|---------------|-----|
| **Authentication** | None | No JWT, no user validation |
| **User Identity** | Hardcoded `guest-user-001` or frontend-generated session ID | Not persistent across sessions |
| **MongoDB Collections** | `UserSolution`, `UserProgress` use string `user_id` | Ready for real user_id linkage |
| **Protected Routes** | None | All endpoints publicly accessible |

### 1.3 Integration Strategy

```
┌─────────────────────────────────────────────────────────────────────┐
│                          FastAPI Backend                            │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐             │
│  │ Auth Router │    │Content Router│   │Progress Router│            │
│  │  (SQLite)   │    │  (MongoDB)   │   │  (MongoDB)    │            │
│  └──────┬──────┘    └──────────────┘   └───────┬───────┘            │
│         │                                       │                    │
│         ▼                                       ▼                    │
│  ┌─────────────┐                       ┌─────────────┐              │
│  │SQLAlchemy   │                       │  Beanie ODM │              │
│  │ORM + get_db()│                      │  (MongoDB)  │              │
│  └──────┬──────┘                       └──────┬──────┘              │
│         │                                      │                     │
│         ▼                                      ▼                     │
│  ┌─────────────┐                       ┌─────────────┐              │
│  │   SQLite    │ ←─── user_id FK ────→ │   MongoDB   │              │
│  │  (users)    │                       │(user_progress)│             │
│  └─────────────┘                       └─────────────┘              │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. IAM Implementation Plan

### 2.1 Phase 1: Infrastructure Setup

#### 2.1.1 Dependencies

Add to `pyproject.toml`:

- `pyjwt[crypto]>=2.8.0` - JWT encoding/decoding with RS256 support
- `python-jose[cryptography]>=3.3.0` - Alternative JWT library (choose one)
- `bcrypt>=4.0.1` - Already present ✅
- `passlib[bcrypt]>=1.7.4` - Already present ✅

#### 2.1.2 Docker Compose Updates

| Change | Details |
|--------|---------|
| Add SQLite volume | `sqlite_data:/app/data` for persistence |
| Environment variables | `JWT_SECRET`, `JWT_ALGORITHM`, `JWT_EXPIRE_MINUTES` |
| Backend volume mount | Mount SQLite file location |

#### 2.1.3 Configuration Files

| File | Purpose |
|------|---------|
| `core/utils/config/development.yaml` | Add `sql_credentials.sqlite` section |
| `core/utils/config/production.yaml` | Add `sql_credentials.sqlite` section |

**SQLite Config Structure**:

```yaml
sql_credentials:
  sqlite:
    path: "/app/data/kubeplayground.db"
    pool_size: 5
    max_overflow: 10
```

### 2.2 Phase 2: ORM Layer (SQLAlchemy)

#### 2.2.1 Files Structure

```
core/
├── auth/
│   ├── __init__.py
│   ├── models.py         # ✅ Already created - SQLAlchemy ORM models
│   ├── schemas.py        # Pydantic Request/Response schemas
│   ├── security.py       # JWT + password utilities
│   ├── dependencies.py   # FastAPI dependencies (get_db, get_current_user)
│   └── router.py         # ✅ Already created - Auth endpoints
├── database.py           # ✅ Already configured - SQLite + MongoDB init
├── utils/
│   └── sqlite_helper.py  # ✅ Already created - SqliteHelper
└── main.py               # ✅ Already updated - Includes auth router
```

#### 2.2.2 ORM Usage Pattern

**Use SQLAlchemy ORM directly with `get_db()` dependency** - No DAO layer needed.

**Common Operations**:

| Operation | ORM Code |
|-----------|----------|
| Create user | `db.add(user); db.commit(); db.refresh(user)` |
| Get by email | `db.query(User).filter_by(email=email).first()` |
| Get by ID | `db.query(User).filter_by(id=user_id).first()` |
| Update | `user.last_login = datetime.utcnow(); db.commit()` |
| Check exists | `db.query(User).filter_by(email=email).first() is not None` |
| Soft delete | `user.is_active = False; db.commit()` |

**Example Router Pattern**:

```python
@router.post("/register")
def register(user_data: UserCreate, db: Session = Depends(get_db)):
    # Check if email exists
    if db.query(User).filter_by(email=user_data.email).first():
        raise HTTPException(409, "Email already exists")

    # Create user
    user = User(
        id=str(uuid.uuid4()),
        email=user_data.email,
        username=user_data.username,
        password_hash=hash_password(user_data.password)
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    return {"access_token": create_access_token(user.id, user.email)}
```

### 2.3 Phase 3: Security Layer

#### 2.3.1 Password Security

| Function | Implementation |
|----------|----------------|
| `hash_password(plain)` | `passlib.context.CryptContext(schemes=["bcrypt"])` |
| `verify_password(plain, hashed)` | Context verify method |

#### 2.3.2 JWT Security

| Function | Implementation |
|----------|----------------|
| `create_access_token(user_id, email)` | Encode with `pyjwt`, include `exp`, `sub`, `email` |
| `decode_token(token)` | Decode and validate expiration |

**Token Payload**:

```json
{
  "sub": "user_uuid_here",
  "email": "user@example.com",
  "iat": 1706140800,
  "exp": 1706144400
}
```

**Configuration**:

- Algorithm: `HS256` (symmetric) or `RS256` (asymmetric for production)
- Expiration: 60 minutes (configurable)
- Secret: Environment variable `JWT_SECRET`

#### 2.3.3 FastAPI Dependencies

| Dependency | Purpose |
|------------|---------|
| `get_current_user(token: str = Depends(oauth2_scheme))` | Extract and validate JWT, return User |
| `get_current_user_optional()` | Return User or None (for mixed endpoints) |
| `oauth2_scheme` | `OAuth2PasswordBearer(tokenUrl="/api/auth/login")` |

### 2.4 Phase 4: Auth Router

#### 2.4.1 Endpoint Specifications

##### POST /api/auth/register

| Aspect | Details |
|--------|---------|
| **Request Body** | `{ "email": str, "username": str, "password": str }` |
| **Validations** | Email format, password min length 8, username 3-50 chars |
| **Business Logic** | Check email uniqueness → Hash password → Insert user → Generate JWT |
| **Response 201** | `{ "access_token": str, "token_type": "bearer", "user": {...} }` |
| **Response 409** | Email already exists |
| **Response 422** | Validation errors |

##### POST /api/auth/login

| Aspect | Details |
|--------|---------|
| **Request Body** | `{ "email": str, "password": str }` |
| **Business Logic** | Find by email → Verify password → Update last_login → Generate JWT |
| **Response 200** | `{ "access_token": str, "token_type": "bearer", "user": {...} }` |
| **Response 401** | Invalid credentials |

##### GET /api/auth/me

| Aspect | Details |
|--------|---------|
| **Headers** | `Authorization: Bearer <token>` |
| **Dependency** | `current_user = Depends(get_current_user)` |
| **Response 200** | `{ "id": str, "email": str, "username": str, "created_at": datetime }` |
| **Response 401** | Invalid or expired token |

##### POST /api/auth/logout (Optional)

| Aspect | Details |
|--------|---------|
| **Strategy** | Client-side token deletion (stateless) |
| **Alternative** | Token blacklist in Redis (stateful) |
| **Recommendation** | Start with stateless, add blacklist later if needed |

### 2.5 Phase 5: Protected Routes Migration

#### 2.5.1 Middleware Approach

Add JWT validation middleware that:

1. Extracts `Authorization` header
2. Validates token
3. Attaches `request.state.user` for downstream access
4. Allows `/api/auth/*` and `/health` to pass through

#### 2.5.2 Endpoint Migration Table

| Router | Endpoint | Current `user_id` Source | Migration |
|--------|----------|--------------------------|-----------|
| `progress.py` | POST `/update` | Request body | Use `current_user.id` |
| `progress.py` | GET `/{user_id}` | Path param | Validate `user_id == current_user.id` |
| `solutions.py` | POST `/autosave` | Request body | Use `current_user.id` |
| `solutions.py` | GET `/{unit_slug}/history` | Query param | Use `current_user.id` |
| `solutions.py` | POST `/restore` | Request body | Use `current_user.id` |
| `grading.py` | POST `/quiz/submit` | Request body | Use `current_user.id` |
| `grading.py` | POST `/code/verify` | Request body | Use `current_user.id` |

#### 2.5.3 Schema Updates

Remove `user_id` field from request schemas:

- `ProgressUpdateRequest`
- `AutosaveRequest`
- `RestoreSolutionRequest`
- `QuizSubmissionRequest`
- `CodeVerificationRequest`

### 2.6 Phase 6: CORS & Security Headers

#### 2.6.1 CORS Update

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8001", "https://kubeplayground.com"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
    expose_headers=["X-Request-Id"],
)
```

#### 2.6.2 Security Headers Middleware

Add headers:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Strict-Transport-Security: max-age=31536000` (production)

### 2.7 Database Initialization Flow

```
Application Startup (lifespan)
        │
        ├──→ setup_logging()
        │
        ├──→ init_sqlite_db()
        │       │
        │       ├──→ Create SQLiteConnector
        │       ├──→ Execute schema migrations (if needed)
        │       └──→ Store connector in app state
        │
        └──→ init_mongodb()
                │
                └──→ Initialize Beanie with document models
```

---

## 3. User Activity & Streak Plan

### 3.1 Feature Overview

| Feature | Description |
|---------|-------------|
| **Daily Streak** | Consecutive days of activity |
| **Activity Heatmap** | GitHub-style calendar showing activity intensity |
| **Points System** | Weighted scoring for quizzes vs exercises |

### 3.2 Activity Tracking Flow

```
User Completes Quiz/Exercise
        │
        ├──→ Update UserProgress (MongoDB)
        │
        ├──→ Calculate Points
        │       │
        │       ├── Quiz: 10 points base + bonus for score
        │       └── Exercise: 20 points base + completion bonus
        │
        ├──→ Upsert UserActivity (SQLite)
        │       │
        │       └── Aggregate daily points
        │
        └──→ Update UserStreak (SQLite)
                │
                ├── Check if last_activity_date is yesterday → increment
                ├── Check if last_activity_date is today → no change
                └── Otherwise → reset to 1
```

### 3.3 Points System Design

| Activity Type | Base Points | Bonus Calculation |
|---------------|-------------|-------------------|
| Quiz Attempt | 10 | `+ (score_percentage / 10)` |
| Quiz Pass (≥70%) | 10 | `+ 15` |
| Exercise Start | 5 | - |
| Exercise Complete | 20 | `+ 10` (first completion) |
| Daily Login | 5 | - |

### 3.4 Heatmap Color Scale

| Points Range | Color Intensity | Hex Code |
|--------------|-----------------|----------|
| 0 | Empty | `#ebedf0` |
| 1-10 | Level 1 | `#9be9a8` |
| 11-25 | Level 2 | `#40c463` |
| 26-50 | Level 3 | `#30a14e` |
| 51+ | Level 4 | `#216e39` |

### 3.5 API Endpoints

#### GET /api/users/me/activity

| Aspect | Details |
|--------|---------|
| **Query Params** | `start_date`, `end_date` (defaults to last 365 days) |
| **Response** | Array of `{ date: str, points: int, activities: int }` |
| **Use Case** | Heatmap rendering |

#### GET /api/users/me/streak

| Aspect | Details |
|--------|---------|
| **Response** | `{ current_streak: int, longest_streak: int, last_activity: datetime }` |
| **Use Case** | Dashboard streak display |

#### GET /api/users/me/stats

| Aspect | Details |
|--------|---------|
| **Response** | `{ total_points: int, quizzes_completed: int, exercises_completed: int, avg_score: float }` |
| **Use Case** | Profile statistics |

---

## 4. SQL Schema

### 4.1 Schema File Location

`core/auth/schema.sql`

### 4.2 Users Table

```sql
-- Users table for authentication
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,                    -- UUID v4
    email TEXT UNIQUE NOT NULL,             -- Unique email for login
    username TEXT NOT NULL,                 -- Display name
    password_hash TEXT NOT NULL,            -- bcrypt hashed password
    is_active BOOLEAN DEFAULT 1,            -- Soft delete support
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP                    -- Last successful login
);

-- Index for email lookups (login flow)
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Index for active users
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active) WHERE is_active = 1;
```

### 4.3 User Activity Table

```sql
-- Daily activity aggregation for heatmap
CREATE TABLE IF NOT EXISTS user_activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,                  -- FK to users.id
    activity_date DATE NOT NULL,            -- Date of activity (no time)
    total_points INTEGER DEFAULT 0,         -- Aggregated points for the day
    quiz_attempts INTEGER DEFAULT 0,        -- Number of quiz attempts
    quiz_passes INTEGER DEFAULT 0,          -- Number of quizzes passed
    exercises_started INTEGER DEFAULT 0,    -- Exercises started
    exercises_completed INTEGER DEFAULT 0,  -- Exercises completed
    time_spent_seconds INTEGER DEFAULT 0,   -- Total time spent (optional)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Composite unique constraint
    UNIQUE(user_id, activity_date),

    -- Foreign key constraint
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Index for date range queries (heatmap)
CREATE INDEX IF NOT EXISTS idx_user_activity_date
    ON user_activity(user_id, activity_date);

-- Index for leaderboard queries
CREATE INDEX IF NOT EXISTS idx_user_activity_points
    ON user_activity(activity_date, total_points DESC);
```

### 4.4 User Streak Table

```sql
-- Streak tracking (denormalized for performance)
CREATE TABLE IF NOT EXISTS user_streaks (
    user_id TEXT PRIMARY KEY,               -- FK to users.id (1:1)
    current_streak INTEGER DEFAULT 0,       -- Current consecutive days
    longest_streak INTEGER DEFAULT 0,       -- All-time best streak
    last_activity_date DATE,                -- Last recorded activity date
    streak_start_date DATE,                 -- When current streak began
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Foreign key constraint
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

### 4.5 Activity Log Table (Optional - Detailed Tracking)

```sql
-- Detailed activity log for audit/analytics
CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,                  -- FK to users.id
    activity_type TEXT NOT NULL,            -- 'quiz_attempt', 'quiz_pass', 'exercise_start', etc.
    unit_slug TEXT NOT NULL,                -- Reference to MongoDB learning_unit
    points_earned INTEGER DEFAULT 0,        -- Points for this specific activity
    metadata TEXT,                          -- JSON blob for extra data
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Foreign key constraint
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Index for user activity queries
CREATE INDEX IF NOT EXISTS idx_activity_log_user
    ON activity_log(user_id, created_at DESC);

-- Index for unit-specific queries
CREATE INDEX IF NOT EXISTS idx_activity_log_unit
    ON activity_log(unit_slug, created_at DESC);
```

### 4.6 Refresh Tokens Table (Optional - Token Rotation)

```sql
-- Refresh tokens for token rotation strategy
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,                  -- FK to users.id
    token_hash TEXT UNIQUE NOT NULL,        -- SHA256 of refresh token
    expires_at TIMESTAMP NOT NULL,          -- Token expiration
    revoked_at TIMESTAMP,                   -- Null if active
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Foreign key constraint
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Index for token lookup
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash
    ON refresh_tokens(token_hash) WHERE revoked_at IS NULL;

-- Index for cleanup of expired tokens
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires
    ON refresh_tokens(expires_at);
```

---

## 5. MongoDB Schema Updates

### 5.1 UserProgress Collection

No schema change required - `user_id` field already exists as string. Will now store actual UUID from SQLite users table.

### 5.2 UserSolution Collection

No schema change required - `user_id` field already exists as string. Will now store actual UUID from SQLite users table.

### 5.3 Index Validation

Ensure indexes support new query patterns:

```python
class UserProgress(Document):
    class Settings:
        indexes = [
            IndexModel([("user_id", ASCENDING), ("unit_id", ASCENDING)], unique=True),
            IndexModel([("user_id", ASCENDING), ("status", ASCENDING)]),  # NEW: Filter by status
            IndexModel([("user_id", ASCENDING), ("completed_at", DESCENDING)]),  # NEW: Recent completions
        ]

class UserSolution(Document):
    class Settings:
        indexes = [
            IndexModel([("user_id", ASCENDING), ("unit_id", ASCENDING), ("version", ASCENDING)]),
            IndexModel([("user_id", ASCENDING), ("auto_saved_at", DESCENDING)]),  # NEW: Recent saves
        ]
```

---

## 6. Quick Win Features

### 6.1 Easy to Implement (1-2 hours each)

| Feature | Complexity | Description |
|---------|------------|-------------|
| **Password Reset Request** | Low | Add `password_reset_token` column, email endpoint stub |
| **Remember Me** | Low | Extend JWT expiration to 30 days if checkbox selected |
| **Username Update** | Low | PUT `/api/users/me` endpoint |
| **Account Deactivation** | Low | Set `is_active = 0`, reject login |
| **Session Count** | Low | Track active sessions in Redis |

### 6.2 Medium Effort (4-8 hours each)

| Feature | Complexity | Description |
|---------|------------|-------------|
| **Email Verification** | Medium | Add `email_verified` column, verification token flow |
| **OAuth2 (Google)** | Medium | Add `oauth_provider`, `oauth_id` columns |
| **Rate Limiting (Auth)** | Medium | Redis-based rate limiting on login attempts |
| **Leaderboard** | Medium | Aggregate points from `user_activity`, rank users |
| **Weekly Summary Email** | Medium | Cron job to email streak/progress summary |

### 6.3 Suggested Implementation Order

1. ✅ IAM Core (Phases 1-4)
2. ✅ Protected Routes Migration (Phase 5)
3. 🔜 User Activity Tracking
4. 🔜 Streak Calculation
5. 🔜 Heatmap API
6. 🔜 Leaderboard
7. 🔜 OAuth2 Integration

---

## Summary

- **IAM adds SQLite via dbdaolib SDK** with 4 new tables (users, activity, streaks, logs)
- **JWT-based stateless auth** with protected route middleware
- **Activity tracking normalizes** user vs daily aggregates for efficient heatmap queries
