# Frontend API Integration Guide

## Overview

The frontend React application integrates with a FastAPI backend using a centralized API client with JWT
authentication. All data is stored in MongoDB (content) and SQLite (users, activity) with a split-brain security
architecture where answer keys and validation scripts are never exposed to the frontend.

**Authentication:** JWT-based with access tokens (60min) and refresh tokens (7 days). Automatic token refresh on 401 responses.

---

## Architecture Overview

```
Frontend (React 18 + TypeScript + Vite)
    ↓ HTTP/REST + JWT Bearer Token
FastAPI Backend (Port 8000)
    ├─ SQLAlchemy ORM → SQLite (users, activity, streaks)
    └─ Beanie ODM → MongoDB (content, solutions, progress)
Databases:
    ├── SQLite (Authentication & Activity)
    │   ├── users (registration, login)
    │   ├── user_activity (daily aggregation for heatmap)
    │   ├── user_streaks (gamification)
    │   ├── activity_log (audit trail)
    │   └── refresh_tokens (session management)
    └── MongoDB (Learning Content)
        ├── learning_units (Public - safe for frontend)
        ├── unit_solutions (Private - NEVER exposed)
        ├── user_solutions (User submissions + autosave)
        └── user_progress (Completion tracking)
```

**Security:**

- Split-brain architecture ensures answer keys in `unit_solutions` collection are never accessible to frontend
- All grading happens server-side
- JWT tokens stored in localStorage with automatic refresh
- Protected routes require valid access token

---

## Implemented API Endpoints

### 1. Authentication API

**Base URL**: `http://localhost:8000/api/auth`

#### Register User

```
POST /register

Body:
{
  "email": "user@example.com",
  "username": "johndoe",
  "password": "SecurePass123!"
}

Response (201):
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "unique-refresh-token-string",
  "token_type": "bearer",
  "user": {
    "id": 1,
    "email": "user@example.com",
    "username": "johndoe",
    "created_at": "2025-01-31T10:00:00Z"
  }
}

Errors:
- 409: Email already registered
- 422: Validation error (weak password, invalid email)
```

#### Login

```
POST /login

Body:
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}

Response (200):
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "unique-refresh-token-string",
  "token_type": "bearer",
  "user": {
    "id": 1,
    "email": "user@example.com",
    "username": "johndoe",
    "last_login": "2025-01-31T10:30:00Z"
  }
}

Errors:
- 401: Invalid credentials
- 400: Email not verified (future feature)
```

#### Refresh Token

```
POST /refresh

Body:
{
  "refresh_token": "unique-refresh-token-string"
}

Response (200):
{
  "access_token": "new-access-token",
  "refresh_token": "new-refresh-token",  // Token rotation
  "token_type": "bearer"
}

Errors:
- 401: Invalid or expired refresh token
```

#### Get Current User

```
GET /me
Authorization: Bearer <access_token>

Response (200):
{
  "id": 1,
  "email": "user@example.com",
  "username": "johndoe",
  "created_at": "2025-01-31T10:00:00Z",
  "last_login": "2025-01-31T10:30:00Z"
}

Errors:
- 401: Invalid or expired token
```

#### Logout

```
POST /logout
Authorization: Bearer <access_token>

Body:
{
  "refresh_token": "current-refresh-token"
}

Response (200):
{
  "message": "Logged out successfully"
}
```

#### Change Password

```
POST /change-password
Authorization: Bearer <access_token>

Body:
{
  "old_password": "CurrentPass123!",
  "new_password": "NewSecurePass456!"
}

Response (200):
{
  "message": "Password changed successfully"
}

Errors:
- 401: Incorrect old password
- 422: Weak new password
```

---

### 2. User Activity API

**Base URL**: `http://localhost:8000/api/auth`

#### Get Activity Heatmap

```
GET /activity/heatmap?days=365
Authorization: Bearer <access_token>

Response:
[
  {
    "date": "2025-01-31",
    "points": 45,
    "level": 3  // 0-4 scale for color intensity
  },
  {
    "date": "2025-01-30",
    "points": 15,
    "level": 2
  }
]
```

**Level Calculation:**

- Level 0: 0 points (empty)
- Level 1: 1-10 points
- Level 2: 11-25 points
- Level 3: 26-50 points
- Level 4: 51+ points

#### Get Activity by Date Range

```
GET /activity/my?start_date=2025-01-01&end_date=2025-12-31
Authorization: Bearer <access_token>

Response:
[
  {
    "activity_date": "2025-01-31",
    "total_points": 45,
    "quiz_attempts": 3,
    "quiz_passes": 2,
    "exercises_started": 1,
    "exercises_completed": 1,
    "time_spent_seconds": 1800
  }
]
```

#### Get Profile Summary

```
GET /profile/summary
Authorization: Bearer <access_token>

Response:
{
  "total_points": 450,
  "quizzes_completed": 15,
  "exercises_completed": 8,
  "current_streak": 7,
  "longest_streak": 14,
  "units_completed": 23,
  "average_score": 87.5,
  "last_activity": "2025-01-31T15:30:00Z"
}
```

#### Get User Stats

```
GET /stats
Authorization: Bearer <access_token>

Response:
{
  "total_points": 450,
  "quizzes_completed": 15,
  "exercises_completed": 8,
  "units_completed": 23,
  "time_spent_hours": 12.5
}
```

#### Log Activity (Internal - called by grading router)

```
POST /activity
Authorization: Bearer <access_token>

Body:
{
  "activity_type": "quiz_pass",
  "unit_slug": "k8s-pods-101-what-is-pod",
  "points_earned": 25,
  "score_percentage": 90,
  "metadata": {"answers": {"q1": "b", "q2": "a"}}
}

Response (201):
{
  "activity_id": 123,
  "points_awarded": 25,
  "is_first_pass": true,
  "streak_updated": true,
  "current_streak": 8
}
```

**Activity Types:**

- `quiz_attempt` - User submitted quiz (no points)
- `quiz_pass` - User passed quiz (points awarded on first pass only)
- `exercise_start` - User opened coding exercise
- `exercise_complete` - User completed coding exercise
- `login` - User logged in (daily login bonus)

**Points System:**

- Quiz attempt: 0 points (encourages practice)
- Quiz pass (first time): 10 base + score bonus (max 25 points)
- Exercise complete (first time): 20-30 points
- Daily login: 5 points

---

### 3. Dashboard API

**Base URL**: `http://localhost:8000/api`

#### Get Dashboard Overview

```
GET /dashboard

Response:
{
  "user_id": "guest-user-001",
  "greeting": "Welcome back, User!",
  "topics": [
    {
      "topic": "Kubernetes Pods",
      "total_units": 11,
      "completed_units": 0,
      "in_progress_units": 0,
      "completion_percentage": 0.0,
      "units": [
        {
          "slug": "k8s-pods-101-what-is-pod",
          "title": "What is a Kubernetes Pod?",
          "topic": "Kubernetes Pods",
          "order_index": 1,
          "type": "conceptual"
        }
      ]
    }
  ],
  "overall_completion": 0.0,
  "total_units": 11,
  "completed_count": 0,
  "in_progress_count": 0,
  "current_streak": 0
}
```

---

### 2. Content API

#### Get All Units (Syllabus)

```
GET /units/syllabus

Response:
{
  "units": [
    {
      "slug": "k8s-pods-101-what-is-pod",
      "title": "What is a Kubernetes Pod?",
      "topic": "Kubernetes Pods",
      "order_index": 1,
      "type": "conceptual",
      "difficulty": "beginner"
    }
  ],
  "total": 11
}
```

#### Get Unit Details

```
GET /units/{slug}

Response:
{
  "slug": "k8s-pods-101-what-is-pod",
  "title": "What is a Kubernetes Pod?",
  "topic": "Kubernetes Pods",
  "order_index": 1,
  "type": "conceptual",
  "difficulty": "beginner",
  "description": "Learn the fundamental concepts...",
  "steps": [
    "Understand what a Pod is",
    "Learn why Kubernetes uses Pods"
  ],
  "hints": [
    "Think of a Pod as a wrapper around containers"
  ],
  "quizzes": [
    {
      "id": "q1",
      "question": "What is a Kubernetes Pod?",
      "options": [
        { "id": "a", "text": "A single Docker container" },
        { "id": "b", "text": "The smallest deployable unit" }
      ]
    }
  ],
  "editor_config": null  // or { "initial_code": "...", "language": "yaml" }
}
```

**Note**: `quizzes` field does NOT include correct answers - those are server-side only.

---

### 4. Progress API

**Base URL**: `http://localhost:8000/api`

#### Update User Progress

```
POST /progress/update
Authorization: Bearer <access_token>

Body:
{
  "unit_slug": "k8s-pods-101-what-is-pod",
  "status": "completed",  // "started" | "completed"
  "score": 85.0,
  "time_spent_seconds": 120
}

Response:
{
  "updated_at": "2025-01-31T20:30:00Z",
  "message": "Progress updated successfully"
}

Note: user_id is extracted from JWT token (no longer in request body)
```

#### Get User Progress

```
GET /progress/me
Authorization: Bearer <access_token>

Response:
{
  "user_id": 1,
  "units_completed": 5,
  "units_in_progress": 2,
  "overall_completion": 45.5,
  "progress": [
    {
      "unit_slug": "k8s-pods-101-what-is-pod",
      "status": "completed",
      "score": 85.0,
      "completed_at": "2025-01-31T20:30:00Z"
    }
  ]
}

Note: Endpoint changed from /progress/{user_id} to /progress/me (uses JWT user)
```

---

### 5. Solutions API (Auto-save)

#### Auto-save User Solution

```
POST /solutions/autosave
Authorization: Bearer <access_token>

Body:
{
  "unit_slug": "k8s-deploy-101-fix-broken",
  "code": "apiVersion: apps/v1\nkind: Deployment\n...",
  "language": "yaml"
}

Response:
{
  "version": 3,
  "auto_saved_at": "2025-01-31T20:35:00Z",
  "message": "Solution auto-saved successfully"
}

Note: user_id extracted from JWT token
```

#### Get Solution History

```
GET /solutions/{unit_slug}/history?limit=10
Authorization: Bearer <access_token>

Response:
{
  "unit_slug": "k8s-deploy-101-fix-broken",
  "versions": [
    {
      "version": 3,
      "code_preview": "apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: nginx-deployment...",
      "auto_saved_at": "2025-01-31T20:35:00Z"
    },
    {
      "version": 2,
      "code_preview": "apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: nginx...",
      "auto_saved_at": "2025-01-31T20:30:00Z"
    }
  ],
  "total_versions": 3
}

Note: user_id extracted from JWT token
```

#### Restore Previous Version

```
POST /solutions/{unit_slug}/restore
Authorization: Bearer <access_token>

Body:
{
  "version": 2
}

Response:
{
  "restored_code": "apiVersion: apps/v1\nkind: Deployment\n...",
  "restored_from_version": 2,
  "message": "Version 2 restored successfully"
}

Note: user_id extracted from JWT token
```

---

### 6. Grading API

#### Submit Quiz

```
POST /grading/quiz/submit
Authorization: Bearer <access_token>

Body:
{
  "unit_slug": "k8s-pods-101-what-is-pod",
  "answers": {
    "q1": "b",
    "q2": "a",
    "q3": "c"
  }
}

Response:
{
  "score_percentage": 66.67,
  "passed": false,  // 70% threshold
  "results": [
    {
      "question_id": "q1",
      "correct": true,
      "selected_answer": "b",
      "correct_answer": "b"
    },
    {
      "question_id": "q2",
      "correct": true,
      "selected_answer": "a",
      "correct_answer": "a"
    },
    {
      "question_id": "q3",
      "correct": false,
      "selected_answer": "c",
      "correct_answer": "b"
    }
  ],
  "message": "You scored 66.67%. Keep trying!",
  "points_awarded": 0,  // 0 if not first pass or below 70%
  "is_first_pass": false
}

Note: user_id extracted from JWT token
```

**Security**: Correct answers are retrieved from `unit_solutions` collection (server-side only).

**Points Logic:**

- Only first passing attempt (≥70%) awards points
- Base: 10 points
- Bonus: (score_percentage / 10) rounded
- Max: 25 points (for 100% score)

#### Verify Code (Stub)

```
POST /grading/code/verify
Authorization: Bearer <access_token>

Body:
{
  "unit_slug": "k8s-deploy-101-fix-broken",
  "code": "apiVersion: apps/v1\nkind: Deployment\n...",
  "language": "yaml"
}

Response:
{
  "success": true,
  "message": "Code verification successful (stubbed)"
}

Note: user_id extracted from JWT token
```

**Note**: Phase 6 will implement actual Kubernetes validation.

---

## Frontend TypeScript Interfaces

### Authentication Types

```typescript
export interface User {
  id: number;
  email: string;
  username: string;
  created_at: string;
  last_login?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  username: string;
  password: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: User;
}

export interface RefreshTokenRequest {
  refresh_token: string;
}
```

### Activity Types

```typescript
export interface HeatmapDay {
  date: string;  // ISO date "2025-01-31"
  points: number;
  level: number;  // 0-4 scale
}

export interface UserActivity {
  activity_date: string;
  total_points: number;
  quiz_attempts: number;
  quiz_passes: number;
  exercises_started: number;
  exercises_completed: number;
  time_spent_seconds: number;
}

export interface ProfileSummary {
  total_points: number;
  quizzes_completed: number;
  exercises_completed: number;
  current_streak: number;
  longest_streak: number;
  units_completed: number;
  average_score: number;
  last_activity: string;
}

export interface UserStats {
  total_points: number;
  quizzes_completed: number;
  exercises_completed: number;
  units_completed: number;
  time_spent_hours: number;
}
```

### Content Types

```typescript
export interface SyllabusItem {
  slug: string;
  title: string;
  topic: string;
  order_index: number;
  type: 'conceptual' | 'coding';
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
}

export interface UnitDetail extends SyllabusItem {
  description: string;
  steps?: string[];
  hints?: string[];
  quizzes?: Quiz[];  // No correct answers included
  editor_config?: EditorConfig;
}

export interface Quiz {
  id: string;
  question: string;
  options: QuizOption[];
  // Note: correct_answer is NOT sent to frontend
}

export interface QuizOption {
  id: string;
  text: string;
}

export interface EditorConfig {
  initial_code: string;
  language: string;
}
```

### Dashboard Types

```typescript
export interface DashboardData {
  user_id: string;
  greeting: string;
  topics: TopicProgress[];
  overall_completion: number;
  total_units: number;
  completed_count: number;
  in_progress_count: number;
  current_streak: number;
}

export interface TopicProgress {
  topic: string;
  total_units: number;
  completed_units: number;
  in_progress_units: number;
  completion_percentage: number;
  units: SyllabusItem[];
}
```

### Progress Types

```typescript
export interface ProgressUpdateRequest {
  user_id: string;
  unit_slug: string;
  status: 'not_started' | 'in_progress' | 'completed';
  score?: number;
  time_spent_seconds?: number;
}
```

### Grading Types

```typescript
export interface QuizSubmissionRequest {
  unit_slug: string;
  user_id: string;
  answers: Record<string, string>;  // { question_id: option_id }
}

export interface QuizSubmissionResponse {
  score_percentage: number;
  passed: boolean;
  results: QuizResultItem[];
  message: string;
}

export interface QuizResultItem {
  question_id: string;
  correct: boolean;
  selected_answer: string;
  correct_answer: string;
}
```

### Solution Types

```typescript
export interface AutosaveRequest {
  unit_slug: string;
  user_id: string;
  code: string;
  language: string;
}

export interface SolutionHistoryResponse {
  unit_slug: string;
  versions: SolutionVersion[];
  total_versions: number;
}

export interface SolutionVersion {
  version: number;
  code_preview: string;
  auto_saved_at: string;
}
```

---

## API Client Implementation

### Environment Variables

Create `.env` file in frontend root:

```bash
VITE_API_BASE_URL=http://localhost:8000
```

### API Client

**Location**: `src/services/api.ts`

```typescript
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

class ApiClient {
  private async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.statusText}`);
    }

    return response.json();
  }

  // Dashboard
  async getDashboard() {
    return this.request('/api/dashboard');
  }

  // Content
  async getSyllabus() {
    return this.request('/api/units/syllabus');
  }

  async getUnitDetail(slug: string) {
    return this.request(`/api/units/${slug}`);
  }

  // Progress
  async updateProgress(data: ProgressUpdateRequest) {
    return this.request('/api/progress/update', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Solutions
  async autosaveSolution(data: AutosaveRequest) {
    return this.request('/api/solutions/autosave', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getSolutionHistory(unitSlug: string, userId: string) {
    return this.request(`/api/solutions/${unitSlug}/history?user_id=${userId}`);
  }

  async restoreSolution(unitSlug: string, userId: string, version: number) {
    return this.request(`/api/solutions/${unitSlug}/restore`, {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, version }),
    });
  }

  // Grading
  async submitQuiz(data: QuizSubmissionRequest) {
    return this.request('/api/grading/quiz/submit', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async verifyCode(data: CodeVerificationRequest) {
    return this.request('/api/grading/code/verify', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
}

export const apiClient = new ApiClient();
```

---

## Integration Status

### Completed ✅

**Backend APIs:**

- [x] Authentication (`/api/auth/register`, `/api/auth/login`, `/api/auth/refresh`)
- [x] User profile (`/api/auth/me`)
- [x] Activity logging (`/api/auth/activity`)
- [x] Activity heatmap (`/api/auth/activity/heatmap`)
- [x] Activity date range (`/api/auth/activity/my`)
- [x] Profile summary (`/api/auth/profile/summary`)
- [x] User stats (`/api/auth/stats`)
- [x] Dashboard API (`/api/dashboard`) - Topic-grouped progress overview
- [x] Content API (`/api/units/syllabus`, `/api/units/{slug}`) - Unit listing and details
- [x] Progress API (`/api/progress/update`, `/api/progress/me`) - Completion tracking with JWT auth
- [x] Solutions API (`/api/solutions/autosave`, `/api/solutions/{slug}/history`,
      `/api/solutions/{slug}/restore`) - Auto-save with versioning
- [x] Grading API (`/api/grading/quiz/submit`, `/api/grading/code/verify`) - Quiz grading with
      first-pass-only points

**Frontend Implementation:**

- [x] API client (`src/services/api.ts`) with automatic token refresh
- [x] AuthContext with login/register/logout state management
- [x] Protected routes with authentication checks
- [x] Login/Register page with form validation
- [x] Token storage in localStorage
- [x] Dashboard page with topic cards
- [x] LearningUnit page with split-screen layout
- [x] Quiz submission with animated toast notifications
- [x] Code editor with submit functionality
- [x] Profile page with GitHub-style activity heatmap
- [x] Heatmap with year dropdown selector
- [x] NavHeader component with logo and user menu
- [x] React Router navigation
- [x] Dracula theme implementation
- [x] Optimized loading experience
- [x] Confetti animation on quiz pass
- [x] Error handling and loading states
- [x] First-pass-only scoring display

### Pending for Future Phases ⏳

**Backend:**

- [ ] OAuth2 (Google) integration
- [ ] Rate limiting on auth endpoints
- [ ] Multi-device session management
- [ ] Remember me functionality (extended tokens)
- [ ] Export user data (JSON/CSV)
- [ ] Phase 6: WebSocket validation streaming
- [ ] Phase 6: Real Kubernetes cluster validation
- [ ] Redis caching for performance optimization

**Frontend:**

- [ ] Code autosave with debouncing (currently manual submit)
- [ ] Solution history UI (API exists, UI not implemented)
- [ ] Restore previous version UI
- [ ] OAuth2 social login buttons
- [ ] Multi-device session viewer
- [ ] Real-time activity notifications
- [ ] Data export UI

**Note:** This is a locally-hosted application. Email-based features (verification, password reset) and
leaderboards are not planned.

---

## Development Setup

### Backend

```bash
cd core-service
source ../.venv/bin/activate
uvicorn main:app --reload
# Runs on http://localhost:8000
```

### Frontend

```bash
cd frontend
npm run dev
# Runs on http://localhost:3000 (or 5173 if 3000 is occupied)
```

### Testing

1. Start backend first
2. Start frontend
3. Open <http://localhost:3000> in browser
4. Dashboard should load with topics
5. Click topic card → navigate to learning unit
6. Test quiz submission → see animated toast + confetti
7. Test code submission → see toast notification

---

## API Response Times

**Current Performance** (localhost testing):

- Dashboard API: ~15ms
- Unit detail API: ~13ms
- Quiz submit API: ~20ms
- Progress update API: ~10ms

**Backend is very fast** - any lag is from React state updates, not the API.
