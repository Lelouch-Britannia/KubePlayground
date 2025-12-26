# Frontend Component Documentation

## Component Architecture

```
App.tsx (State Management & Layout)
├── Header
│   ├── Logo & Title
│   ├── Topic Selector (Dropdown)
│   ├── Exercise Selector (Dropdown)
│   ├── Action Buttons (Run, Submit)
│   └── Theme Toggle & Profile
│
├── SplitPane
│   ├── LeftPanel (40% width, resizable)
│   │   └── DescriptionPanel
│   │       ├── Description Tab
│   │       │   ├── Exercise Title & Badges
│   │       │   ├── MarkdownRenderer (Description)
│   │       │   └── Requirements List
│   │       ├── Steps Tab
│   │       │   └── StepsPanel
│   │       │       └── Phase Checklist
│   │       └── Hints Tab
│   │           └── Hints Placeholder
│   │
│   ├── Resizer (Draggable divider)
│   │
│   └── RightPanel (60% width, resizable)
│       ├── CodeEditor (Type: "code")
│       │   ├── Editor Tabs (Code / Solution)
│       │   ├── CodeEditor
│       │   │   ├── Monaco Editor
│       │   │   └── Line Numbers & Syntax Highlighting
│       │   └── Console
│       │       ├── Header (collapsible)
│       │       └── Output Display
│       │
│       └── QuizPanel (Type: "quiz")
│           ├── Question Counter
│           ├── Question Title
│           ├── Options (Radio Buttons)
│           └── Explanation (on submit)
```

---

## Component Specifications

### App.tsx

**Purpose**: Main application component. Manages global state, handles routing, and orchestrates child components.

**Props**: None (root component)

**State**:
```typescript
- currentExerciseIdx: number (0-based index)
- leftWidth: number (percentage 25-75)
- code: string (user's YAML code)
- consoleOpen: boolean (console drawer state)
- activeRightTab: 'code' | 'solution'
- theme: 'dark' | 'light'
- validating: boolean (validation in progress)
- validationResults: ValidationResult[] | null
```

**Key Functions**:
- `handleExerciseChange(e)` - Switch exercise
- `handleTopicChange(e)` - Filter by topic
- `handleDrag(e)` - Resize panels
- `runValidation()` - Trigger validation
- `setTheme(t)` - Toggle theme

**Integration Points**:
- Fetch exercises on mount
- Auto-save code to backend
- Fetch validation results
- Store theme preference in localStorage

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
  - `### Heading` → `<h3>`
  - `` `code` `` → syntax-highlighted inline code
  - `**bold**` → strong text
  - ` ```bash ... ``` ` → code blocks with language label
  - `- item` → list items

**Helper Function**: `parseInline(text)` for inline styles

**Styling**: Tailwind CSS with dark mode support

---

## Data Flow

### Exercise Loading Flow

```
App Mount
  ↓
useEffect(() => fetchExercises())
  ↓
apiClient.get('/exercises')
  ↓
setExercises(data.exercises)
  ↓
Render DescriptionPanel with currentExercise
```

### Code Editing & Saving Flow

```
User types in CodeEditor
  ↓
onChange(newCode)
  ↓
setCode(newCode)
  ↓
debounce(2000ms)
  ↓
apiClient.post('/solutions/{exerciseId}/auto-save', { code })
  ↓
Update UI: show "Saved" indicator
```

### Validation Flow

```
User clicks "Run Code" button
  ↓
runValidation()
  ↓
setValidating(true)
  ↓
apiClient.post('/validate', { exerciseId, yamlContent: code })
  ↓
setValidationResults(response.results)
  ↓
Render Console with results
  ↓
User sees green (passed) or red (failed) indicators
```

### Quiz Flow

```
User selects answer
  ↓
toggleOption(questionId, optionId)
  ↓
setAnswers({ ...answers, [questionId]: optionId })
  ↓
User clicks "Submit Answers"
  ↓
setShowResults(true)
  ↓
Render correct answers & explanations
```

---

## Styling & Theming

### Dark Mode

All components support dark mode via Tailwind CSS:
```tsx
<div className="bg-white dark:bg-[#1e1e1e]">
  <p className="text-gray-900 dark:text-white">Content</p>
</div>
```

### Color Scheme

**Light Mode**:
- Background: `#ffffff` (white)
- Text: `#1f2937` (gray-900)
- Borders: `#e5e7eb` (gray-200)
- Accent: `#3b82f6` (blue-500)

**Dark Mode**:
- Background: `#1e1e1e` (VS Code dark)
- Text: `#d1d5db` (gray-300)
- Borders: `#374151` (gray-700)
- Accent: `#3b82f6` (blue-500)

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

