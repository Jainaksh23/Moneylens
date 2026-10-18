import { apiClient } from './apiClient';

export interface TransactionItem {
  id: string;
  date: string;
  amount: number;
  currency: string;
  direction: 'income' | 'expense';
  merchant: string;
  description: string;
  category: string;
  categorySource: 'model' | 'user' | 'rule' | 'unknown';
  categoryConfidence?: number | null;
  modelVersion?: string | null;
  needsReview?: boolean;
  source: 'manual' | 'csv';
  isDuplicate: boolean;
  createdAt: string;
}

export interface PaginatedTransactionsResponse {
  items: TransactionItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface QueryTransactionsParams {
  page?: number;
  pageSize?: number;
  from?: string;
  to?: string;
  category?: string;
  direction?: 'income' | 'expense';
  q?: string;
  sort?: string;
  needsReview?: boolean;
}

export interface CreateTransactionPayload {
  date: string;
  amount: number;
  direction: 'income' | 'expense';
  description: string;
  merchant?: string;
  category?: string;
  currency?: string;
}

export interface UpdateTransactionPayload {
  date?: string;
  amount?: number;
  direction?: 'income' | 'expense';
  description?: string;
  merchant?: string;
  category?: string;
}

export interface ImportCandidatePreview {
  date: string;
  amount: number;
  currency: string;
  direction: 'income' | 'expense';
  merchant: string;
  description: string;
  category: string;
  categorySource: string;
  source: string;
  fingerprint: string;
  isDuplicate: boolean;
}

export interface ImportErrorItem {
  row: number;
  message: string;
  raw?: string;
}

export interface CsvPreviewResponse {
  importJobId: string;
  filename: string;
  counts: {
    accepted: number;
    rejected: number;
    duplicates: number;
    totalRows: number;
  };
  errors: ImportErrorItem[];
  sampleAccepted: ImportCandidatePreview[];
  sampleDuplicates: ImportCandidatePreview[];
}

export const transactionService = {
  getTransactions: async (
    params: QueryTransactionsParams = {},
  ): Promise<PaginatedTransactionsResponse> => {
    const query = new URLSearchParams();
    if (params.page) query.set('page', String(params.page));
    if (params.pageSize) query.set('pageSize', String(params.pageSize));
    if (params.from) query.set('from', params.from);
    if (params.to) query.set('to', params.to);
    if (params.category && params.category !== 'all') query.set('category', params.category);
    if (params.direction) query.set('direction', params.direction);
    if (params.q) query.set('q', params.q);
    if (params.sort) query.set('sort', params.sort);
    if (params.needsReview !== undefined) query.set('needsReview', String(params.needsReview));

    const queryString = query.toString();
    const endpoint = `/transactions${queryString ? `?${queryString}` : ''}`;
    return apiClient.get<PaginatedTransactionsResponse>(endpoint);
  },

  createTransaction: async (
    payload: CreateTransactionPayload,
  ): Promise<{ transaction: TransactionItem }> => {
    return apiClient.post<{ transaction: TransactionItem }>('/transactions', payload);
  },

  updateTransaction: async (
    id: string,
    payload: UpdateTransactionPayload,
  ): Promise<{ transaction: TransactionItem }> => {
    return apiClient.patch<{ transaction: TransactionItem }>(`/transactions/${id}`, payload);
  },

  deleteTransaction: async (id: string): Promise<{ message: string }> => {
    return apiClient.delete<{ message: string }>(`/transactions/${id}`);
  },

  uploadCsvPreview: async (file: File): Promise<CsvPreviewResponse> => {
    const formData = new FormData();
    formData.append('file', file);

    const API_BASE_URL =
      import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api/v1';

    const response = await fetch(`${API_BASE_URL}/transactions/import`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'X-Requested-With': 'moneylens',
      },
      body: formData,
    });

    if (!response.ok) {
      let errJson: { error?: { message?: string } } | null = null;
      try {
        errJson = await response.json();
      } catch {
        // Fallback
      }
      throw new Error(errJson?.error?.message || response.statusText || 'CSV Upload failed');
    }

    return response.json();
  },

  confirmImport: async (
    importJobId: string,
    includeDuplicates = false,
  ): Promise<{ message: string; importedCount: number; importJobId: string }> => {
    return apiClient.post('/transactions/import/confirm', {
      importJobId,
      includeDuplicates,
    });
  },

  downloadTemplateUrl: (): string => {
    const API_BASE_URL =
      import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api/v1';
    return `${API_BASE_URL}/transactions/template`;
  },
};
