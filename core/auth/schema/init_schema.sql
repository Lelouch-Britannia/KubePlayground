-- ============================================================================
-- KubePlayground Combined Schema
-- Database: SQLite
-- Version: 1.0.0
-- Description: Single file containing all tables for initial setup
-- ============================================================================

-- ============================================================================
-- SECTION 1: AUTHENTICATION
-- ============================================================================

-- Users table for authentication
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,                    -- UUID v4
    email TEXT UNIQUE NOT NULL,             -- Unique email for login
    username TEXT NOT NULL,                 -- Display name (3-50 characters)
    password_hash TEXT NOT NULL,            -- bcrypt hashed password
    is_active BOOLEAN DEFAULT 1,            -- Soft delete support
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP                    -- Last successful login
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active) WHERE is_active = 1;


-- Refresh tokens for extended sessions
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    token_hash TEXT UNIQUE NOT NULL,        -- SHA256 hash
    device_info TEXT,
    expires_at TIMESTAMP NOT NULL,
    revoked_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash
    ON refresh_tokens(token_hash) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user
    ON refresh_tokens(user_id) WHERE revoked_at IS NULL;


-- ============================================================================
-- SECTION 2: USER ACTIVITY & GAMIFICATION
-- ============================================================================

-- Daily activity aggregation (heatmap)
CREATE TABLE IF NOT EXISTS user_activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    activity_date DATE NOT NULL,            -- YYYY-MM-DD
    total_points INTEGER DEFAULT 0,
    quiz_attempts INTEGER DEFAULT 0,
    quiz_passes INTEGER DEFAULT 0,
    exercises_started INTEGER DEFAULT 0,
    exercises_completed INTEGER DEFAULT 0,
    time_spent_seconds INTEGER DEFAULT 0,
    sessions_count INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, activity_date),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_activity_date_range
    ON user_activity(user_id, activity_date);
CREATE INDEX IF NOT EXISTS idx_user_activity_leaderboard
    ON user_activity(activity_date, total_points DESC);


-- Streak tracking (denormalized)
CREATE TABLE IF NOT EXISTS user_streaks (
    user_id TEXT PRIMARY KEY,
    current_streak INTEGER DEFAULT 0,
    longest_streak INTEGER DEFAULT 0,
    last_activity_date DATE,
    streak_start_date DATE,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);


-- Detailed activity log (audit trail)
CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    activity_type TEXT NOT NULL,            -- 'quiz_attempt', 'quiz_pass', 'exercise_start', etc.
    unit_slug TEXT,                         -- Reference to MongoDB learning_unit
    points_earned INTEGER DEFAULT 0,
    score_percentage REAL,
    metadata TEXT,                          -- JSON blob
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_activity_log_user_recent
    ON activity_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_unit
    ON activity_log(unit_slug, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_type
    ON activity_log(activity_type, created_at DESC);
