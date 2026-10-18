import { apiClient } from './apiClient';

export interface CategoryTotalItem {
  category: string;
  amount: number;
  count: number;
  percentage: number;
}

export interface MonthlyTrendItem {
  month: string;
  income: number;
  expense: number;
  net: number;
  savingsRate: number;
}

export interface AnalyticsSummary {
  income: number;
  expense: number;
  net: number;
  savingsRate: number;
  transactionCount: number;
  categoryTotals: CategoryTotalItem[];
  monthlyTrend: MonthlyTrendItem[];
  dateRange: {
    from: string | null;
    to: string | null;
  };
  currency: string;
}

export const analyticsService = {
  getSummary: async (from?: string, to?: string): Promise<AnalyticsSummary> => {
    const query = new URLSearchParams();
    if (from) query.set('from', from);
    if (to) query.set('to', to);

    const queryString = query.toString();
    const endpoint = `/analytics/summary${queryString ? `?${queryString}` : ''}`;
    return apiClient.get<AnalyticsSummary>(endpoint);
  },
};
