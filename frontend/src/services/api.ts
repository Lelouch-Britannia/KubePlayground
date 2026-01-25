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
      const response = await fetch(`${this.baseUrl}/api/auth/refresh`, {
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

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options?.headers,
    };

    // Add Authorization header if we have a token and this isn't a skip-auth request
    if (!skipAuth && accessToken) {
      (headers as Record<string, string>)['Authorization'] = `Bearer ${accessToken}`;
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
    return this.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }, true); // skipAuth = true
  }

  async register(email: string, username: string, password: string) {
    return this.request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, username, password }),
    }, true); // skipAuth = true
  }

  async logout(refreshToken: string) {
    return this.request('/api/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
  }

  async refreshToken(refreshToken: string) {
    return this.request('/api/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: refreshToken }),
    }, true); // skipAuth = true
  }

  async getCurrentUser() {
    return this.request('/api/auth/me');
  }

  async changePassword(currentPassword: string, newPassword: string) {
    return this.request('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({
        current_password: currentPassword,
        new_password: newPassword,
      }),
    });
  }

  async logoutAllDevices() {
    return this.request('/api/auth/logout-all-devices', {
      method: 'POST',
    });
  }

  // ==================== Activity API ====================

  async recordActivity(activityType: string, metadata?: Record<string, unknown>) {
    return this.request('/api/auth/activity', {
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
    return this.request(`/api/auth/me/activity${query ? `?${query}` : ''}`);
  }

  async getActivityHeatmap(year?: number) {
    const query = year ? `?year=${year}` : '';
    return this.request(`/api/auth/me/activity/heatmap${query}`);
  }

  async getMyStreak() {
    return this.request('/api/auth/me/streak');
  }

  async getMyStats() {
    return this.request('/api/auth/me/stats');
  }

  // ==================== Dashboard API ====================

  async getDashboard() {
    return this.request('/api/dashboard');
  }

  // ==================== Content API ====================

  async getSyllabus() {
    return this.request('/api/units/syllabus');
  }

  async getUnitDetail(slug: string) {
    return this.request(`/api/units/${slug}`);
  }

  // ==================== Progress API ====================

  async updateProgress(data: {
    unit_slug: string;
    status: 'started' | 'completed';
    score?: number;
    time_spent_seconds?: number;
  }) {
    return this.request('/api/progress/update', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getMyProgress() {
    return this.request('/api/progress/me');
  }

  // ==================== Solutions API ====================

  async autosaveSolution(data: {
    unit_slug: string;
    code: string;
    language?: string;
  }) {
    return this.request('/api/solutions/autosave', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getSolutionHistory(unitSlug: string) {
    return this.request(`/api/solutions/${unitSlug}/history`);
  }

  async restoreSolution(unitSlug: string, data: {
    unit_slug: string;
    version: number;
  }) {
    return this.request(`/api/solutions/${unitSlug}/restore`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // ==================== Grading API ====================

  async submitQuiz(data: {
    unit_slug: string;
    answers: Record<string, string>;
  }) {
    return this.request('/api/grading/quiz/submit', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async verifyCode(data: {
    unit_slug: string;
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
