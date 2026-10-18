import { apiClient } from './apiClient';

export interface ChatEvidence {
  type: 'knowledge' | 'user_data';
  source: string;
  period?: string;
  details?: Record<string, any>;
}

export interface ChatResponseDto {
  answer: string;
  evidence: ChatEvidence[];
  limitations?: string;
  disclaimer?: string;
  toolsUsed: string[];
}

export interface ChatHistoryMessage {
  _id: string;
  role: 'user' | 'assistant';
  content: string;
  evidence: ChatEvidence[];
  limitations?: string;
  disclaimer?: string;
  toolsUsed?: string[];
  createdAt: string;
}

export interface ChatHistoryResponse {
  data: ChatHistoryMessage[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export const chatService = {
  /**
   * Sends a user query to the RAG financial assistant.
   */
  async sendMessage(message: string): Promise<ChatResponseDto> {
    const res = await apiClient.post<{ data: ChatResponseDto }>('/chat', { message });
    return res.data;
  },

  /**
   * Fetches paginated chat history.
   */
  async getHistory(page = 1, limit = 40): Promise<ChatHistoryResponse> {
    const res = await apiClient.get<ChatHistoryResponse>(`/chat/history?page=${page}&limit=${limit}`);
    return res;
  },

  /**
   * Deletes all chat messages for the current user.
   */
  async deleteHistory(): Promise<{ deletedCount: number }> {
    const res = await apiClient.delete<{ deletedCount: number }>('/chat/history');
    return res;
  },
};
