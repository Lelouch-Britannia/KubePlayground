# Frontend Component Documentation

## Component Architecture

```
App.tsx (React Router)
├── Dashboard (Route: /)
│   ├── UserBanner
│   │   ├── Avatar & User Info
│   │   └── Streak Counter
│   ├── Stats Cards
│   │   ├── Total Units
│   │   ├── Completed
│   │   ├── In Progress
│   │   └── Not Started
│   └── Topics Grid
│       └── TopicCard (clickable)
│           ├── Topic Name
│           ├── Progress Bar
│           ├── Completion %
│           └── Unit Counts
│
└── LearningUnit (Route: /unit/:slug)
    ├── Header
    │   ├── Home Button
    │   ├── Breadcrumb (Topic / Title)
    │   ├── Navigation (Prev/Next)
    │   └── Loading Indicator
    │
    ├── SplitPane (Resizable)
    │   ├── LeftPanel (40% width)
    │   │   ├── Description Section
    │   │   │   └── MarkdownRenderer
    │   │   ├── Steps Section
    │   │   └── Hints Section
    │   │
    │   ├── Resizer (Draggable divider)
    │   │
    │   └── RightPanel (60% width)
    │       ├── CodeEditor (Type: "coding")
    │       │   ├── Editor Header (Reset, Submit)
    │       │   └── Textarea with Syntax Highlighting
    │       │
    │       └── QuizPanel (Type: "conceptual")
    │           ├── Quiz Header (Submit)
    │           ├── Questions
    │           │   ├── Question Text
    │           │   └── Radio Options
    │           └── Submit Button
    │
    ├── Toast Notification (Conditional)
    │   ├── Success/Error Icon (Animated)
    │   ├── Message
    │   ├── Score Display (for quizzes)
    │   └── Progress Bar
    │
    └── Confetti (On quiz pass)
```

---

## Component Specifications

### App.tsx

**Purpose**: Root component with React Router setup.

**Props**: None (root component)

**Routes**:
- `/` → Dashboard
- `/unit/:slug` → LearningUnit

**Features**:
- BrowserRouter configuration
- Route-based navigation
- No global state (handled in page components)

---

### Dashboard Component

**Location**: `pages/Dashboard.tsx`

**Purpose**: Landing page with topic overview and progress tracking.

**State**:
```typescript
- dashboardData: DashboardData | null
- loading: boolean
- error: string | null
```

**Key Functions**:
- `fetchDashboard()` - Fetch from `/api/dashboard`
- `handleTopicClick(topic)` - Navigate to first unit in topic

**API Integration**:
- Fetches dashboard data on mount
- Shows loading state
- Error handling with retry option

**Layout**:
- UserBanner with streak counter
- 4 stats cards (Total, Completed, In Progress, Not Started)
- Topic cards grid (clickable to navigate)

---

### LearningUnit Component

**Location**: `pages/LearningUnit.tsx`

**Purpose**: Main learning interface with split-screen layout.

**State**:
```typescript
- unit: UnitDetail | null
- allUnits: SyllabusItem[] (for navigation)
- currentIndex: number
- loading: boolean (initial load only)
- isNavigating: boolean (subsequent navigation)
- error: string | null
- code: string (for coding exercises)
- selectedAnswers: Record<string, string> (for quizzes)
- leftWidth: number (resizable panel width)
- toast: ToastState | null
- showConfetti: boolean
```

**Key Functions**:
- `fetchSyllabus()` - Get all units for navigation
- `fetchUnit(slug)` - Get unit details
- `navigateToUnit(direction)` - Prev/next navigation
- `handleQuizSubmit()` - Submit quiz answers
- `handleCodeSubmit()` - Submit code for validation
- `handleDrag(e)` - Resize panels

**Performance Optimizations**:
- **No full-page loading** on navigation between units
- **Subtle loading indicator** (purple bar in header)
- **Opacity transitions** (200ms) during navigation
- **Disabled navigation buttons** during load
- **Optimistic UI** - keeps content visible

**API Integration**:
- Fetches syllabus once on mount
- Fetches unit details on slug change
- Submits quiz answers with grading
- Auto-saves code (future)
- Updates user progress

---

### Header Component

**Purpose**: Top navigation bar with exercise selector and action buttons.

**Props**:
```typescript
interface HeaderProps {
  currentExercise: Exercise;
  currentExerciseIdx: number;
  onExerciseChange: (idx: number) => void;
  topics: string[];
  currentTopic: string;
  onTopicChange: (topic: string) => void;
  theme: 'dark' | 'light';
  onThemeToggle: () => void;
  onRunValidation: () => void;
  onSubmit: () => void;
  isValidating: boolean;
}
```

**Features**:
- Logo with app name
- Topic dropdown (filtered)
- Exercise dropdown (by topic)
- Run/Submit buttons (only visible for code exercises)
- Theme toggle
- User avatar placeholder

---

### DescriptionPanel Component

**Purpose**: Displays exercise description, steps, and hints in tabbed interface.

**Location**: `components/LeftPanel/DescriptionPanel.tsx`

**Props**:
```typescript
interface DescriptionPanelProps {
  exercise: Exercise;
}
```

**Tabs**:

1. **Description Tab**
   - Exercise title
   - Difficulty & topic badges
   - Time estimate
   - Markdown-rendered description
   - Requirements list

2. **Steps Tab**
   - Renders `StepsPanel` component
   - Phase-based guidance
   - Checkbox tracking

3. **Hints Tab**
   - Placeholder for hints (future feature)

**Features**:
- Tab switching
- Markdown rendering for description
- Badge styling
- Smooth scrolling

---

### StepsPanel Component

**Location**: `components/LeftPanel/StepsPanel.tsx`

**Props**:
```typescript
interface StepsPanelProps {
  steps: Phase[];
}

interface Phase {
  phase: string; // e.g., "Phase 1: Diagnosis"
  tasks: Task[];
}

interface Task {
  id: string;
  text: string;
}
```

**Features**:
- Visual timeline (vertical line)
- Phase badges with numbers
- Task checkboxes
- Completed state styling (green, strikethrough)
- State management (tracking completed tasks)

**State**:
```typescript
- completed: Record<string, boolean> (task ID → completion status)
```

---

### CodeEditor Component

**Location**: `components/RightPanel/CodeEditor.tsx`

**Props**:
```typescript
interface CodeEditorProps {
  value: string;
  onChange: (code: string) => void;
}
```

**Features**:
- Line numbers
- Syntax highlighting (YAML)
- Real-time editing
- Copy-paste support
- Keyboard shortcuts (Ctrl+S to save)

**Implementation**:
- Custom textarea + div overlay for highlighting
- CSS classes for syntax colors
- `renderHighlightedCode()` function for YAML parsing

**Future Enhancements**:
- Integrate Monaco Editor for advanced features
- Multi-language support (JSON, Go, Python)
- Error squiggles for YAML validation

---

### Console Component

**Location**: `components/RightPanel/Console.tsx`

**Props**:
```typescript
interface ConsoleProps {
  isOpen: boolean;
  onToggle: (open: boolean) => void;
  validating: boolean;
  validationResults: ValidationResult[] | null;
}

interface ValidationResult {
  step: string;
  status: 'passed' | 'failed';
  message: string;
}
```

**Features**:
- Collapsible drawer (animated height)
- Loading spinner during validation
- Styled output (green for passed, red for failed)
- Copy button for output
- Live streaming (via WebSocket - future)

**States**:
- **Validating**: Shows spinner and "Running kubectl commands..."
- **Results Available**: Shows validation step results
- **Idle**: Shows placeholder message

---

### QuizPanel Component

**Location**: `components/RightPanel/QuizPanel.tsx`

**Props**:
```typescript
interface QuizPanelProps {
  quizData: QuizData;
}

interface QuizData {
  questions: Question[];
}

interface Question {
  id: number;
  text: string;
  options: Option[];
  correct: string;
  explanation: string;
}

interface Option {
  id: string;
  text: string;
}
```

**Features**:
- Question counter ("1 of 5")
- Single-select radio buttons
- Answer tracking
- Submit button
- Results view with explanations
- Score calculation

**State**:
```typescript
- answers: Record<number, string> (question ID → selected option ID)
- showResults: boolean
```

---

### Badge Component

**Location**: `components/ui/Badge.tsx`

**Props**:
```typescript
interface BadgeProps {
  children: React.ReactNode;
  color?: 'blue' | 'green' | 'gray';
}
```

**Usage**:
```tsx
<Badge color="green">Basic</Badge>
<Badge color="blue">Intermediate</Badge>
<Badge color="gray">Deployment</Badge>
```

**Styling**: Tailwind CSS with dark mode support

---

### MarkdownRenderer Component

**Location**: `components/shared/MarkdownRenderer.tsx`

**Props**:
```typescript
interface MarkdownRendererProps {
  content: string;
}
```

**Features**:
- Parse markdown syntax:
  - `## Heading` → `<h2>` (pink)
  - `### Heading` → `<h3>` (green)
  - `` `code` `` → inline code (orange with background)
  - `**bold**` → strong text (purple)
  - ` ```yaml ... ``` ` → code blocks with language label
  - `- item` → list items with purple markers

**Helper Function**: `parseInline(text)` for inline styles

**Styling**: Dracula theme with larger text sizes (18px base)

---

### Toast Component

**Location**: `components/shared/Toast.tsx`

**Props**:
```typescript
interface ToastProps {
  type: 'success' | 'error';
  message: string;
  score?: number;
  total?: number;
  onClose: () => void;
  duration?: number; // default 5000ms
}
```

**Features**:
- **Slide-in animation** from right
- **Success state** (70%+ score):
  - Trophy icon with bounce animation
  - Green Dracula theme (`#50fa7b`)
  - Animated progress bar
- **Failure state** (<70% score):
  - X icon with shake animation
  - Red Dracula theme (`#ff5555`)
  - Score breakdown
- **Auto-dismiss** after 5 seconds
- **Manual close** button
- **Score display** with animated progress bar
- **Pass/fail indicator**

**Usage**:
```tsx
<Toast
  type="success"
  message="Excellent work! You passed the quiz!"
  score={8}
  total={10}
  onClose={() => setToast(null)}
/>
```

---

### Confetti Component

**Location**: `components/shared/Confetti.tsx`

**Props**:
```typescript
interface ConfettiProps {
  duration?: number; // default 3000ms
}
```

**Features**:
- **50 animated particles** falling from top
- **Dracula colors**: green, purple, pink, yellow, cyan, orange
- **Random sizes and shapes** (circles and squares)
- **Physics-based animation** (gravity + drift)
- **Auto-cleanup** after duration

**Usage**:
```tsx
{showConfetti && <Confetti />}
```

**Triggered**: When user passes a quiz (70%+ score)

---

## Data Flow

### Dashboard Loading Flow

```
Dashboard Mount
  ↓
useEffect(() => fetchDashboard())
  ↓
apiClient.getDashboard()
  ↓
GET /api/dashboard
  ↓
setDashboardData(response)
  ↓
Render topic cards with progress
```

### Unit Navigation Flow

```
User clicks topic card
  ↓
navigate(`/unit/${firstUnitSlug}`)
  ↓
LearningUnit component mounts
  ↓
fetchSyllabus() (once)
  ↓
fetchUnit(slug)
  ↓
GET /api/units/{slug}
  ↓
Render split-screen interface
```

### Quiz Submission Flow

```
User selects quiz answers
  ↓
setSelectedAnswers({ questionId: optionId })
  ↓
User clicks "Submit Quiz"
  ↓
handleQuizSubmit()
  ↓
POST /api/grading/quiz/submit
  ↓
Receive { score_percentage, passed }
  ↓
Show animated toast notification
  ↓
If passed: trigger confetti + update progress
  ↓
POST /api/progress/update
```

### Code Submission Flow

```
User types in CodeEditor
  ↓
setCode(newCode)
  ↓
User clicks "Submit"
  ↓
handleCodeSubmit()
  ↓
POST /api/solutions/autosave (save first)
  ↓
POST /api/grading/code/verify (validate)
  ↓
Show animated toast with result
  ↓
POST /api/progress/update (mark in progress)
```

### Optimized Navigation Flow

```
User clicks Next/Prev
  ↓
navigateToUnit(direction)
  ↓
navigate(`/unit/${newSlug}`)
  ↓
fetchUnit(newSlug)
  ↓
setIsNavigating(true) (not setLoading)
  ↓
Show purple progress bar + 50% opacity
  ↓
API returns (13ms backend response)
  ↓
setIsNavigating(false)
  ↓
Smooth opacity transition (200ms)
  ↓
Content updated - no page reload!
```

---

## Styling & Theming

### Dracula Theme

All components use the Dracula color scheme for consistent dark theme:

**Primary Colors**:
- Background: `#282a36` (Dracula background)
- Foreground: `#f8f8f2` (Dracula foreground)
- Current Line: `#44475a`
- Comment: `#6272a4`
- Purple: `#bd93f9` (links, highlights)
- Pink: `#ff79c6` (headings)
- Green: `#50fa7b` (success)
- Yellow: `#f1fa8c` (warning)
- Cyan: `#8be9fd` (info)
- Orange: `#ffb86c` (code)
- Red: `#ff5555` (error)

**Typography**:
- Base text: `text-lg` (18px) with `leading-relaxed`
- Headers: h2 = `text-3xl`, h3 = `text-2xl`
- Code blocks: `text-base` (16px) with `line-height: 1.6`
- Inline code: Orange (`#ffb86c`) with highlighted background

### Custom Scrollbar

```css
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #d1d5db;
  border-radius: 3px;
}

.dark .custom-scrollbar::-webkit-scrollbar-thumb {
  background: #4b5563;
}
```

---

## Performance Optimizations

1. **Code Splitting**:
   - Components lazy-loaded with `React.lazy()`
   - QuizPanel only loads when type === "quiz"

2. **Memoization**:
   - `React.memo()` for expensive components
   - `useMemo()` for derived data

3. **Debouncing**:
   - Auto-save debounced 2 seconds
   - Prevents excessive API calls

4. **Caching**:
   - Exercise list cached in localStorage
   - Manual refresh button for updates

---

## Accessibility

- Semantic HTML (`<header>`, `<main>`, `<footer>`)
- ARIA labels for interactive elements
- Keyboard navigation support
- Tab order management
- Color contrast ratios (WCAG AA)

---

## Testing

### Component Unit Tests

```typescript
describe('CodeEditor', () => {
  it('should render textarea', () => {
    render(<CodeEditor value="" onChange={jest.fn()} />);
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('should call onChange when code is typed', () => {
    const handleChange = jest.fn();
    render(<CodeEditor value="" onChange={handleChange} />);
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'new code' }
    });
    expect(handleChange).toHaveBeenCalledWith('new code');
  });
});
```

### Integration Tests

```typescript
describe('App Integration', () => {
  it('should load exercises on mount', async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText(/Debug Broken Deployment/i)).toBeInTheDocument();
    });
  });
});
```

---

## Component Props Summary

| Component | Props | State | Key Methods |
|-----------|-------|-------|-------------|
| App | None | 8 state vars | handleExerciseChange, runValidation |
| DescriptionPanel | exercise | activeTab | setActiveTab |
| StepsPanel | steps | completed | toggleTask |
| CodeEditor | value, onChange | None | renderHighlightedCode |
| Console | isOpen, onToggle, validating, results | None | (controlled) |
| QuizPanel | quizData | answers, showResults | toggleOption, submit |
| Badge | children, color | None | (none) |
| MarkdownRenderer | content | None | parseInline |

---

## Future Component Enhancements

- [ ] Replace custom CodeEditor with Monaco Editor
- [ ] Add breadcrumb navigation
- [ ] Implement Hints functionality
- [ ] Add file upload for YAML
- [ ] Support for multiple files in editor
- [ ] Keyboard shortcut help modal
- [ ] Submission history sidebar
- [ ] Code diff viewer (user vs solution)
- [ ] Collaborate in real-time (WebSocket)
- [ ] Comment system for discussions

