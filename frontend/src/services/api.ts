// API Base URL
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

// API Client
class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
      throw new Error(error.detail || `HTTP ${response.status}`);
    }

    return response.json();
  }

  // Dashboard API
  async getDashboard() {
    return this.request('/api/dashboard');
  }

  // Content API
  async getSyllabus() {
    return this.request('/api/units/syllabus');
  }

  async getUnitDetail(slug: string) {
    return this.request(`/api/units/${slug}`);
  }

  // Progress API
  async updateProgress(data: {
    user_id: string;
    unit_slug: string;
    status: 'not_started' | 'in_progress' | 'completed';
    score?: number;
    time_spent_seconds?: number;
  }) {
    return this.request('/api/progress/update', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getUserProgress(userId: string) {
    return this.request(`/api/progress/${userId}`);
  }

  // Solutions API
  async autosaveSolution(data: {
    unit_slug: string;
    user_id: string;
    code: string;
    language?: string;
  }) {
    return this.request('/api/solutions/autosave', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getSolutionHistory(unitSlug: string, userId: string) {
    return this.request(`/api/solutions/${unitSlug}/history?user_id=${userId}`);
  }

  async restoreSolution(unitSlug: string, data: {
    unit_slug: string;
    user_id: string;
    version: number;
  }) {
    return this.request(`/api/solutions/${unitSlug}/restore`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Grading API
  async submitQuiz(data: {
    unit_slug: string;
    user_id: string;
    answers: Record<string, string>;
  }) {
    return this.request('/api/grading/quiz/submit', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async verifyCode(data: {
    unit_slug: string;
    user_id: string;
    code: string;
    language?: string;
  }) {
    return this.request('/api/grading/code/verify', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
}

export const apiClient = new ApiClient(API_BASE_URL);
