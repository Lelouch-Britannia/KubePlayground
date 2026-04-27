// Schema types matching backend Pydantic models

// quiz/grading feature commented out
// export interface QuizOption {
//   id: string;
//   text: string;
// }
//
// export interface Quiz {
//   id: string;
//   question: string;
//   options: QuizOption[];
// }

export interface EditorConfig {
  initial_code: string;
  language: string;
}

// Content API Types
export interface SyllabusItem {
  slug: string;
  title: string;
  topic: string;
  order_index: number;
  type: 'conceptual' | 'coding';
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
  status?: 'not_started' | 'in_progress' | 'completed';
}

export interface SyllabusResponse {
  units: SyllabusItem[];
  total: number;
}

export interface UnitDetail {
  slug: string;
  title: string;
  topic: string;
  order_index: number;
  type: 'conceptual' | 'coding';
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
  description: string;
  steps?: string[];
  hints?: string[];
  // quizzes?: Quiz[];  // quiz/grading feature commented out
  editor_config?: EditorConfig;
}

// Dashboard API Types
export interface TopicProgress {
  topic: string;
  topic_slug?: string;
  topic_icon?: string;
  topic_order?: number;
  total_units: number;
  completed_units: number;
  in_progress_units: number;
  completion_percentage: number;
  units: SyllabusItem[];
}

export interface CourseProgress {
  course_name: string;
  course_slug: string;
  course_description?: string;
  topics: TopicProgress[];
}

export interface DashboardData {
  user_id?: string;
  greeting?: string;
  courses: CourseProgress[];
  overall_completion?: number;
  total_units: number;
  completed_count: number;
  in_progress_count: number;
  current_streak: number;
}

// Course Hierarchy API Types
export interface CourseInfo {
  id: number;
  slug: string;
  name: string;
  description?: string;
  topics_count: number;
  total_units: number;
}

export interface TopicSummary {
  id: number;
  slug: string;
  name: string;
  order_position: number;
  icon?: string;
  units_count: number;
  completed_units: number;
  in_progress_units: number;
  completion_percentage: number;
}

export interface CourseChaptersResponse {
  course: CourseInfo;
  chapters: TopicSummary[];
}

export interface LearningUnitSummary {
  slug: string;
  title: string;
  order_index: number;
  type: 'conceptual' | 'coding';
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
  status?: 'not_started' | 'in_progress' | 'completed';
  score?: number;
}

export interface TopicUnitsResponse {
  topic: TopicSummary;
  units: LearningUnitSummary[];
}

// Progress API Types
export interface ProgressUpdateRequest {
  unit_slug: string;
  status: 'started' | 'completed';  // Matches backend UserProgress model
  score?: number;
  time_spent_seconds?: number;
}

export interface ProgressUpdateResponse {
  updated_at: string;
  message: string;
}

export interface UnitProgressItem {
  unit_slug: string;
  status: 'started' | 'completed';  // Matches backend UserProgress model
  last_accessed?: string;
  // quiz_score?: number;  // quiz/grading feature commented out
  attempts: number;
  time_spent_seconds: number;
}

export interface UserProgressResponse {
  user_id: string;
  units: UnitProgressItem[];
  total_completed: number;
  total_units: number;
  overall_completion_percentage: number;
}

// Solutions API Types — commented out (quiz/grading feature disabled)
// export interface AutosaveRequest {
//   unit_slug: string;
//   code: string;
//   language?: string;
// }
//
// export interface AutosaveResponse {
//   saved_at: string;
//   version: number;
//   message: string;
// }
//
// export interface SolutionHistoryItem {
//   version: number;
//   saved_at: string;
//   code_preview: string;
//   content: string;
// }
//
// export interface SolutionHistoryResponse {
//   unit_slug: string;
//   saves: SolutionHistoryItem[];
//   total_saves: number;
// }
//
// export interface RestoreSolutionResponse {
//   code: string;
//   language: string;
//   saved_at: string;
//   version: number;
// }

// Grading API Types — commented out (quiz/grading feature disabled)
// export interface QuizSubmissionRequest {
//   unit_slug: string;
//   answers: Record<string, string>;
// }
//
// export interface QuizResultItem {
//   quiz_id: string;
//   is_correct: boolean;
//   selected_answer: string;
//   correct_answer: string;
//   explanation?: string;
// }
//
// export interface QuizSubmissionResponse {
//   total_questions: number;
//   correct_answers: number;
//   score_percentage: number;
//   results: QuizResultItem[];
//   passed: boolean;
// }
//
// export interface CodeVerificationResponse {
//   is_valid: boolean;
//   message: string;
//   errors?: string[];
// }

// Validation Service Types — kept for Console.tsx component typing (API methods are commented out)
export interface ValidationTestResult {
  name: string;
  passed: boolean;
  output: string;
  error_output?: string;
  duration_ms: number;
}

export interface ValidationResourceInfo {
  kind: string;
  name: string;
  namespace: string;
  status: string;
  ready: boolean;
  message?: string;
  age?: string;
}

export interface PodLogEntry {
  pod_name: string;
  container_name: string;
  logs: string;
  phase: string;
  ready: boolean;
}

export interface KubeEvent {
  type: string;
  reason: string;
  message: string;
  object: string;
  age: string;
  count: number;
}

export interface ExecutionPhase {
  name: string;
  status: string;
  duration_ms: number;
  output?: string;
  error?: string;
}

export interface ValidationError {
  type?: string;
  code?: string;
  message: string;
  details?: string;
}

export interface ValidationResponse {
  request_id: string;
  is_valid: boolean;
  passed: boolean;
  message: string;
  apply_output?: string;
  resource_status?: ValidationResourceInfo[];
  pod_logs?: PodLogEntry[];
  events?: KubeEvent[];
  test_results?: ValidationTestResult[];
  validation_error?: ValidationError;
  duration_ms: number;
  namespace?: string;
  phases?: ExecutionPhase[];
}

// --- WebSocket / Split API types ---

export interface WSMessage {
  type: 'phase_start' | 'phase_complete' | 'phase_progress' | 'run_complete' | 'error';
  phase?: string;
  status?: string;
  message?: string;
  data?: Record<string, unknown>;
}

export interface RunCompleteData {
  namespace: string;
  apply_output?: string;
  resource_status?: ValidationResourceInfo[];
  pod_logs?: PodLogEntry[];
  events?: KubeEvent[];
  phases?: ExecutionPhase[];
  duration_ms: number;
}

export interface ValidateOnlyRequest {
  unit_slug: string;
  namespace: string;
}

export interface ValidateOnlyResponse {
  request_id: string;
  namespace: string;
  passed: boolean;
  message: string;
  test_results?: ValidationTestResult[];
  duration_ms: number;
}
