// API Base URL
// In production (Docker): Empty string means same-origin (nginx proxies /api/* to backend)
// In development: Falls back to localhost:8000 for direct backend access
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

// Token storage keys (must match AuthContext)
const ACCESS_TOKEN_KEY = 'kp_access_token';
const REFRESH_TOKEN_KEY = 'kp_refresh_token';

// Helper to get stored tokens
const getAccessToken = (): string | null => localStorage.getItem(ACCESS_TOKEN_KEY);
const getRefreshToken = (): string | null => localStorage.getItem(REFRESH_TOKEN_KEY);
const setAccessToken = (token: string): void => localStorage.setItem(ACCESS_TOKEN_KEY, token);
const clearTokens = (): void => {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem('kp_user');
};

// API Client
class ApiClient {
  private baseUrl: string;
  private isRefreshing: boolean = false;
  private refreshPromise: Promise<boolean> | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  /**
   * Attempt to refresh the access token using the refresh token
   */
  private async refreshAccessToken(): Promise<boolean> {
    const refreshToken = getRefreshToken();
    if (!refreshToken) {
      return false;
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      if (!response.ok) {
        clearTokens();
        return false;
      }

      const data = await response.json();
      setAccessToken(data.access_token);
      // Note: Backend may also return new refresh token
      if (data.refresh_token) {
        localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh_token);
      }
      return true;
    } catch {
      clearTokens();
      return false;
    }
  }

  /**
   * Handle token refresh with deduplication (multiple requests waiting for same refresh)
   */
  private async handleTokenRefresh(): Promise<boolean> {
    if (this.isRefreshing && this.refreshPromise) {
      return this.refreshPromise;
    }

    this.isRefreshing = true;
    this.refreshPromise = this.refreshAccessToken();

    try {
      const result = await this.refreshPromise;
      return result;
    } finally {
      this.isRefreshing = false;
      this.refreshPromise = null;
    }
  }

  /**
   * Main request method with automatic token handling
   */
  private async request<T>(
    endpoint: string,
    options?: RequestInit,
    skipAuth: boolean = false,
    retryOnUnauth: boolean = true
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const accessToken = getAccessToken();

    console.log(`API Request: ${endpoint}`);
    console.log('Access token from storage:', accessToken ? `${accessToken.substring(0, 20)}...` : 'null');

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options?.headers,
    };

    // Add Authorization header if we have a token and this isn't a skip-auth request
    if (!skipAuth && accessToken) {
      (headers as Record<string, string>)['Authorization'] = `Bearer ${accessToken}`;
      console.log('Authorization header added');
    } else {
      console.log('No auth header added. skipAuth:', skipAuth, 'hasToken:', !!accessToken);
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    // Handle 401 Unauthorized - try to refresh token
    if (response.status === 401 && retryOnUnauth && !skipAuth) {
      const refreshed = await this.handleTokenRefresh();
      if (refreshed) {
        // Retry the request with new token
        return this.request<T>(endpoint, options, skipAuth, false);
      } else {
        // Refresh failed, redirect to login
        clearTokens();
        window.location.href = '/auth';
        throw new Error('Session expired. Please log in again.');
      }
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
      throw new Error(error.detail || `HTTP ${response.status}`);
    }

    return response.json();
  }

  // ==================== Auth API (no auth header needed) ====================

  async login(email: string, password: string) {
    return this.request('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }, true); // skipAuth = true
  }

  async register(email: string, username: string, password: string) {
    return this.request('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, username, password }),
    }, true); // skipAuth = true
  }

  async logout(refreshToken: string) {
    return this.request('/api/v1/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
  }

  async refreshToken(refreshToken: string) {
    return this.request('/api/v1/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: refreshToken }),
    }, true); // skipAuth = true
  }

  async getCurrentUser() {
    return this.request('/api/v1/auth/me');
  }

  async changePassword(currentPassword: string, newPassword: string) {
    return this.request('/api/v1/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({
        current_password: currentPassword,
        new_password: newPassword,
      }),
    });
  }

  async logoutAllDevices() {
    return this.request('/api/v1/auth/logout-all-devices', {
      method: 'POST',
    });
  }

  // ==================== Activity API ====================

  async recordActivity(activityType: string, metadata?: Record<string, unknown>) {
    return this.request('/api/v1/auth/activity', {
      method: 'POST',
      body: JSON.stringify({
        activity_type: activityType,
        metadata,
      }),
    });
  }

  async getMyActivity(startDate?: string, endDate?: string) {
    const params = new URLSearchParams();
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    const query = params.toString();
    return this.request(`/api/v1/auth/me/activity${query ? `?${query}` : ''}`);
  }

  async getRecentActivity(limit: number = 20) {
    return this.request(`/api/v1/auth/me/activity/recent?limit=${limit}`);
  }

  async getActivityHeatmap(days: number = 365) {
    const query = days ? `?days=${days}` : '';
    return this.request(`/api/v1/auth/me/activity/heatmap${query}`);
  }

  async getMyStreak() {
    return this.request('/api/v1/auth/me/streak');
  }

  async getMyStats() {
    return this.request('/api/v1/auth/me/stats');
  }

  async getProfileSummary() {
    return this.request('/api/v1/auth/me/profile-summary');
  }

  // ==================== Dashboard API ====================

  async getDashboard() {
    return this.request('/api/v1/dashboard');
  }

  // ==================== Content API ====================

  async getSyllabus() {
    return this.request('/api/v1/units/syllabus');
  }

  async getUnitDetail(slug: string) {
    return this.request(`/api/v1/units/${slug}`);
  }

  // ==================== Progress API ====================

  async updateProgress(data: {
    unit_slug: string;
    status: 'started' | 'completed';
    score?: number;
    time_spent_seconds?: number;
  }) {
    return this.request('/api/v1/progress/update', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getMyProgress() {
    return this.request('/api/v1/progress/me');
  }

  // ==================== Grading API (validation endpoints) ====================

  // Quiz/solutions methods remain commented out (quiz/grading feature disabled)
  // async autosaveSolution(...) - see git history
  // async getSolutionHistory(...) - see git history
  // async submitQuiz(...) - see git history
  // async getLastQuizSubmission(...) - see git history

  runManifestWS(
    data: { unit_slug: string; code: string; language?: string },
    callbacks: {
      onMessage: (msg: import('../types/api').WSMessage) => void;
      onClose?: () => void;
      onError?: (err: Event) => void;
    }
  ): { close: () => void } {
    const token = getAccessToken();
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = this.baseUrl
      ? new URL(this.baseUrl).host
      : window.location.host;
    const wsUrl = `${protocol}//${host}/ws/grading/run?token=${encodeURIComponent(token || '')}`;
    const ws = new WebSocket(wsUrl);
    ws.onopen = () => { ws.send(JSON.stringify({ unit_slug: data.unit_slug, code: data.code, language: data.language || 'yaml' })); };
    ws.onmessage = (event) => { try { const msg = JSON.parse(event.data); callbacks.onMessage(msg); } catch { console.error('Failed to parse WS message:', event.data); } };
    ws.onclose = () => { callbacks.onClose?.(); };
    ws.onerror = (err) => { callbacks.onError?.(err); };
    return { close: () => ws.close() };
  }

  async validateOnly(data: { unit_slug: string; namespace: string; code?: string; language?: string }) {
    return this.request('/api/v1/grading/code/validate-only', { method: 'POST', body: JSON.stringify(data) });
  }

  async cleanupNamespace(namespace: string) {
    return this.request('/api/v1/grading/code/cleanup', { method: 'POST', body: JSON.stringify({ namespace }) });
  }

  // Draft autosave
  async saveDraft(unitSlug: string, code: string, language = 'yaml') {
    return this.request('/api/v1/grading/code/draft', {
      method: 'POST',
      body: JSON.stringify({ unit_slug: unitSlug, code, language }),
    });
  }

  async getDraft(unitSlug: string): Promise<{ unit_slug: string; code: string | null }> {
    return this.request(`/api/v1/grading/code/draft/${unitSlug}`);
  }

  async deleteDraft(unitSlug: string) {
    return this.request(`/api/v1/grading/code/draft/${unitSlug}`, { method: 'DELETE' });
  }

  // Namespace persistence
  async saveNamespace(unitSlug: string, namespace: string) {
    return this.request('/api/v1/grading/code/namespace', {
      method: 'POST',
      body: JSON.stringify({ unit_slug: unitSlug, namespace }),
    });
  }

  async getNamespace(unitSlug: string): Promise<{ unit_slug: string; namespace: string | null }> {
    return this.request(`/api/v1/grading/code/namespace/${unitSlug}`);
  }

  async deleteNamespace(unitSlug: string) {
    return this.request(`/api/v1/grading/code/namespace/${unitSlug}`, { method: 'DELETE' });
  }

  // ==================== Submissions API ====================

  async getSubmissions(unitSlug: string) {
    return this.request(`/api/v1/submissions/${unitSlug}`);
  }

  // ==================== Courses API ====================

  async getCourses() {
    return this.request('/api/v1/courses/');
  }

  async getCourseChapters(courseSlug: string) {
    return this.request(`/api/v1/courses/${courseSlug}/chapters`);
  }

  async getTopicUnits(topicId: number) {
    return this.request(`/api/v1/courses/topics/${topicId}/units`);
  }

  // ==================== Enrollment API ====================

  async enrollCourse(courseSlug: string) {
    return this.request(`/api/v1/courses/${courseSlug}/enroll`, { method: 'POST' });
  }

  async unenrollCourse(courseSlug: string) {
    return this.request(`/api/v1/courses/${courseSlug}/enroll`, { method: 'DELETE' });
  }

  async setCourseStatus(courseSlug: string, status: 'active' | 'paused') {
    return this.request(`/api/v1/courses/${courseSlug}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  }

  async updateCourseAccess(courseSlug: string) {
    return this.request(`/api/v1/courses/${courseSlug}/access`, { method: 'PATCH' }).catch(() => {});
  }

  async getMyCourses(): Promise<import('../types/api').MyCourseItem[]> {
    return this.request('/api/v1/courses/my');
  }
}

export const apiClient = new ApiClient(API_BASE_URL);
