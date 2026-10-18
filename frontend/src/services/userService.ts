import { apiClient } from './apiClient';
import type { UserProfile } from './apiClient';

export interface UpdatePreferencesPayload {
  name?: string;
  preferences?: {
    currency?: string;
    dateFormat?: 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';
  };
}

export interface UserResponse {
  user: UserProfile;
}

export interface DeleteAccountResponse {
  message: string;
  recordsDeleted: {
    transactions: number;
    goals: number;
    insights: number;
    reminders: number;
    chatMessages: number;
    userDeleted: boolean;
  };
}

export const userService = {
  getProfile: async (): Promise<UserResponse> => {
    return apiClient.get<UserResponse>('/me');
  },

  updatePreferences: async (payload: UpdatePreferencesPayload): Promise<UserResponse> => {
    return apiClient.patch<UserResponse>('/me', payload);
  },

  exportDataCsvUrl: (): string => {
    const base = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api/v1';
    return `${base}/me/export?format=csv`;
  },

  exportDataJsonUrl: (): string => {
    const base = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api/v1';
    return `${base}/me/export?format=json`;
  },

  deleteAccount: async (): Promise<DeleteAccountResponse> => {
    return apiClient.delete<DeleteAccountResponse>('/me');
  },
};
