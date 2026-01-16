// Schema types matching backend Pydantic models

export interface QuizOption {
  id: string;
  text: string;
}

export interface Quiz {
  id: string;
  question: string;
  options: QuizOption[];
}

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
  quizzes?: Quiz[];
  editor_config?: EditorConfig;
}

// Dashboard API Types
export interface TopicProgress {
  topic: string;
  total_units: number;
  completed_units: number;
  in_progress_units: number;
  completion_percentage: number;
  units: SyllabusItem[];
}

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

// Progress API Types
export interface ProgressUpdateRequest {
  user_id: string;
  unit_slug: string;
  status: 'not_started' | 'in_progress' | 'completed';
  score?: number;
  time_spent_seconds?: number;
}

export interface ProgressUpdateResponse {
  updated_at: string;
  message: string;
}

export interface UnitProgressItem {
  unit_slug: string;
  status: 'not_started' | 'in_progress' | 'completed';
  last_accessed?: string;
  quiz_score?: number;
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

// Solutions API Types
export interface AutosaveRequest {
  unit_slug: string;
  user_id: string;
  code: string;
  language?: string;
}

export interface AutosaveResponse {
  saved_at: string;
  version: number;
  message: string;
}

export interface SolutionHistoryItem {
  version: number;
  saved_at: string;
  code_preview: string;
}

export interface SolutionHistoryResponse {
  unit_slug: string;
  saves: SolutionHistoryItem[];
  total_saves: number;
}

export interface RestoreSolutionResponse {
  code: string;
  language: string;
  saved_at: string;
  version: number;
}

// Grading API Types
export interface QuizSubmissionRequest {
  unit_slug: string;
  user_id: string;
  answers: Record<string, string>;
}

export interface QuizResultItem {
  quiz_id: string;
  is_correct: boolean;
  selected_answer: string;
  correct_answer: string;
  explanation?: string;
}

export interface QuizSubmissionResponse {
  total_questions: number;
  correct_answers: number;
  score_percentage: number;
  results: QuizResultItem[];
  passed: boolean;
}

export interface CodeVerificationResponse {
  is_valid: boolean;
  message: string;
  errors?: string[];
}
