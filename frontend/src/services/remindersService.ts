import { apiClient } from './apiClient';

export interface Reminder {
  _id: string;
  userId: string;
  title: string;
  amount: number;
  dueDay: number;
  category?: string;
  source: 'detected' | 'manual';
  status: 'active' | 'dismissed' | 'confirmed';
  lastPaidDate?: string | null;
  nextDueDate?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateReminderInput {
  title: string;
  amount: number;
  dueDay: number;
  category?: string;
}

export interface UpdateReminderInput {
  title?: string;
  amount?: number;
  dueDay?: number;
  category?: string;
  status?: 'active' | 'dismissed' | 'confirmed';
}

export const remindersService = {
  listReminders: async (): Promise<{ reminders: Reminder[] }> => {
    return apiClient.get<{ reminders: Reminder[] }>('/reminders');
  },

  createReminder: async (
    data: CreateReminderInput,
  ): Promise<{ reminder: Reminder }> => {
    return apiClient.post<{ reminder: Reminder }>('/reminders', data);
  },

  updateReminder: async (
    id: string,
    data: UpdateReminderInput,
  ): Promise<{ reminder: Reminder }> => {
    return apiClient.patch<{ reminder: Reminder }>(`/reminders/${id}`, data);
  },

  deleteReminder: async (id: string): Promise<{ message: string }> => {
    return apiClient.delete<{ message: string }>(`/reminders/${id}`);
  },

  detectReminders: async (): Promise<{
    message: string;
    reminders: Reminder[];
  }> => {
    return apiClient.post<{ message: string; reminders: Reminder[] }>(
      '/reminders/detect',
      {},
    );
  },
};
