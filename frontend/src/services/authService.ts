import { apiClient } from './apiClient';
import type { UserProfile } from './apiClient';

export interface RegisterPayload {
  name: string;
  email: string;
  password: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: UserProfile;
}

export const authService = {
  /**
   * Register a new user account.
   * Cookie is automatically set by the server (httpOnly).
   */
  register: async (payload: RegisterPayload): Promise<AuthResponse> => {
    return apiClient.post<AuthResponse>('/auth/register', payload);
  },

  /**
   * Log in an existing user.
   * Cookie is automatically set by the server (httpOnly).
   */
  login: async (payload: LoginPayload): Promise<AuthResponse> => {
    return apiClient.post<AuthResponse>('/auth/login', payload);
  },

  /**
   * Clear auth session cookie.
   */
  logout: async (): Promise<{ message: string }> => {
    return apiClient.post<{ message: string }>('/auth/logout');
  },

  /**
   * Get the current user profile from active session cookie.
   */
  getCurrentUser: async (): Promise<AuthResponse> => {
    return apiClient.get<AuthResponse>('/auth/me');
  },

  /**
   * Request password reset link (stub).
   */
  forgotPassword: async (email: string): Promise<{ message: string }> => {
    return apiClient.post<{ message: string }>('/auth/forgot-password', { email });
  },
};
