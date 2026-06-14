# Frontend Component Documentation

**Version:** 2.0
**Last Updated:** June 2026

---

## Route Map

| Path | Component | Auth |
|------|-----------|------|
| `/auth` | `AuthPage` | Public |
| `/logout` | `LogoutPage` | Public |
| `/` | `Dashboard` | Protected |
| `/dashboard` | `Dashboard` | Protected |
| `/courses` | `CoursesPage` | Protected |
| `/courses/:courseSlug/landing` | `CourseLandingPage` | Protected |
| `/courses/:courseSlug` | `CourseChaptersPage` | Protected |
| `/courses/:courseSlug/topics/:topicId` | `TopicUnitsPage` | Protected |
| `/my-courses` | `MyCourses` | Protected |
| `/unit/:slug` | `LearningUnit` | Protected |
| `/profile` | `ProfilePage` | Protected |
| `*` | Redirect to `/` | — |

`ProtectedRoute` wraps all authenticated pages. Unauthenticated users redirect to `/auth`.

---

## Component Architecture

```
App.tsx (React Router)
│
├── AuthPage
│
├── Dashboard
│   ├── NavHeader
│   ├── UserBanner (streak, username)
│   ├── Stats Cards (total / completed / in-progress)
│   └── CourseProgressSummary cards (paginated topics per course)
│       └── TopicCard (clickable → navigates to first unit in topic)
│
├── CoursesPage
│   └── CourseInfo cards (name, unit count, enrolled badge)
│       └── Click → CourseLandingPage
│
├── CourseLandingPage
│   ├── NavHeader
│   ├── Course hero (tagline, level, hours)
│   ├── What You'll Learn list
│   ├── Modules accordion
│   ├── Author bio
│   └── Enroll / Go to Course button
│
├── MyCourses
│   ├── NavHeader
│   └── MyCourseItem cards (status, completion %, Start/Pause/Unenroll)
│
├── CourseChaptersPage
│   ├── NavHeader
│   └── Topic chapter cards (unit count, completion %)
│
├── TopicUnitsPage
│   ├── NavHeader
│   └── Unit row list (type badge, difficulty, completion indicator)
│
├── LearningUnit
│   ├── Top bar (h-12)
│   │   ├── Logo icon → hamburger (toggles ProblemListPanel)
│   │   ├── Divider
│   │   ├── Prev / counter / Next navigation
│   │   ├── [centered] Run icon + Submit button
│   │   └── UserMenu (icon only)
│   ├── ProblemListPanel (fixed overlay, toggled by hamburger)
│   ├── Left pane (resizable, maximizable)
│   │   ├── Tab bar: Description | Submissions
│   │   │   └── Right side: difficulty badge + Mark as Read (theory) or difficulty only (coding)
│   │   ├── Description tab
│   │   │   ├── MarkdownRenderer (title + description)
│   │   │   ├── Steps (flat ordered list)
│   │   │   └── Hints (per-hint accordions, expand individually)
│   │   └── Submissions tab (past run results from user_submissions)
│   ├── Draggable gap (resize left/right panes)
│   └── Right pane (coding units only, maximizable)
│       ├── CodeEditor sub-pane (Monaco, Reset button)
│       └── Console sub-pane (minimizable, resizable drag handle)
│           └── Auto-expands on Run/Submit
│
└── ProfilePage
    ├── NavHeader
    ├── Profile summary (streak, stats)
    └── Activity heatmap (GitHub-style, year dropdown)
```

---

## Page Descriptions

### Dashboard

Fetches `/api/v1/dashboard` + `/api/v1/auth/profile/summary` in parallel on mount.

Renders three states:

- **Active course**: full `CourseProgressSummary` with topic-level progress cards, paginated 3 topics/page
- **Paused courses**: lightweight cards with last-accessed timestamp and resume button
- **No enrollment**: empty state directing user to `/courses`

Stats row (total/completed/in-progress) shown when any enrollment exists.

### CoursesPage

Fetches all courses and current enrollments in parallel. Shows enrolled badge on enrolled courses.
Clicking a course navigates to its landing page, not directly to chapters.

### CourseLandingPage

Fetches `GET /courses/{slug}/detail` and `GET /courses/my` in parallel. Displays Udemy-style
landing page: tagline, level, estimated hours, prerequisites, what_you_learn list, modules
accordion, author name and bio. Enroll button calls `POST /{slug}/enroll`; if already enrolled,
shows "Go to Course" → `/courses/{slug}`.

### MyCourses

Fetches `GET /courses/my`. Lists all enrollments with status badge, completion percentage,
and three actions: Start (set active), Pause (set paused), Unenroll (delete enrollment row,
keeps unit progress).

### CourseChaptersPage

Fetches `GET /courses/{slug}/chapters`. Displays topics as chapter cards with unit count and
completion percentage. Clicking navigates to `TopicUnitsPage`.

### TopicUnitsPage

Fetches `GET /courses/topics/{topic_id}/units`. Lists units with type badge (conceptual/coding),
difficulty, and green check if completed. Clicking navigates to `/unit/{slug}`.

### LearningUnit

Main learning interface. On mount:

1. Fetches syllabus (all units, once) — populates prev/next navigation
2. Fetches unit detail for current slug
3. Restores Redis draft (code editor content) and Redis namespace (active K8s namespace)
4. Checks user progress for completion status

On slug change: fetches new unit with `isNavigating` state (subtle opacity + progress bar, no full
reload). Content stays visible during navigation.

**Run flow**: Opens WebSocket to `/ws/grading/run`, streams pod events to Console, stores namespace
in Redis on success.

**Submit (validate-only) flow**: Calls `POST /grading/code/validate-only` against existing namespace.
On pass: clears namespace, marks progress completed, updates ProblemListPanel via `refreshKey`.

**Mark as Read** (theory units): Calls `POST /progress/update` with `status=completed`. Updates
ProblemListPanel and triggers streak update.

**Draft autosave**: 2-second debounce after typing, calls `POST /grading/code/draft`.

### ProfilePage

Fetches profile summary and heatmap data. Heatmap shows 365 days with GitHub-style intensity
(level 0–4 based on percentile of user's own activity distribution). Year dropdown changes
heatmap date range.

---

## Shared Component Descriptions

### NavHeader

Global top navigation. Contains KubePlayground logo, main nav links (Dashboard, Courses,
My Courses), theme toggle (dark/light), and `UserMenu`.

### UserMenu

Icon-only button that opens a dropdown: profile link, logout. Displays no username text
in the top bar to keep it compact.

### ProblemListPanel

Fixed overlay (not in layout flow). Toggled by hamburger in LearningUnit top bar.
Fetches dashboard data to build Course → Topics → Units tree. Shows completion indicators
(green check) per unit. Search filters across all unit titles. Clicking a unit navigates
to `/unit/{slug}` and closes the panel. `refreshKey` prop triggers re-fetch after completion.

### MarkdownRenderer

Custom parser (no external markdown library). Renders: `##`/`###` headings, `` `inline code` ``,
`**bold**`, fenced code blocks with language label, and `- list items`. All text at `text-sm`
density — intentionally compact, matches LeetCode style. Do not increase base size.

### ProtectedRoute

Wraps protected pages. Redirects to `/auth` if no valid access token in `AuthContext`.

### Toast

Slide-in notification from bottom-right. `success` type: green, trophy icon. `error` type: red,
X icon. Auto-dismisses after 5 seconds. Shows score and pass/fail status for submission results.

### Confetti

50 particles falling from top in Dracula theme colors. Auto-cleans up after duration.
Triggered on passing submission.

### CourseNavigation / UnitNavigation

Thin wrappers providing breadcrumb-style navigation between courses and units.

---

## Shared Types (`src/types/api.ts`)

Key interfaces used across pages:

| Interface | Used by |
|-----------|---------|
| `DashboardData` | Dashboard |
| `CourseProgressSummary` | Dashboard, ProblemListPanel |
| `MyCourseItem` | MyCourses |
| `CourseInfo` | CoursesPage |
| `CourseDetail` | CourseLandingPage |
| `SyllabusItem` | LearningUnit, ProblemListPanel |
| `UnitDetail` | LearningUnit |
| `UserSubmission` | LearningUnit Submissions tab |
| `ValidationResponse` | LearningUnit Console |

---

## Styling

Dracula dark theme throughout. Key color roles:

| Color | Hex | Used for |
|-------|-----|---------|
| Background | `#282a36` | Page background |
| Current Line | `#44475a` | Cards, panels |
| Purple | `#bd93f9` | Links, active states, progress bars |
| Pink | `#ff79c6` | H2 headings |
| Green | `#50fa7b` | Success, completion indicators |
| Red | `#ff5555` | Errors, failures |
| Orange | `#ffb86c` | Inline code |
| Cyan | `#8be9fd` | Info accents |

Light theme support is toggled via `ThemeContext`; Tailwind dark classes handle the switch.

---

## Commented-Out Components

Code preserved in source but non-functional:

| Component | Status |
|-----------|--------|
| `QuizPanel` | Exists in `components/RightPanel/QuizPanel.tsx` but not rendered — quiz feature commented out |
| Quiz answer state in `LearningUnit` | Commented out with `// quiz/grading feature commented out` markers |
| Solution history state | Commented out — replaced by Redis draft autosave |
| Autosave status indicator (old versioned approach) | Commented out |
