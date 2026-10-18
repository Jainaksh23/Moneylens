import { apiClient } from './apiClient';

export interface AnomalyInsight {
  _id: string;
  userId: string;
  type: 'anomaly';
  period: string;
  severity: 'low' | 'medium' | 'high';
  explanation: string;
  evidence: {
    transactionId: string;
    date: string;
    amount: number;
    category: string;
    merchant: string;
    anomalyScore: number;
    robustZScore: number;
    reasonCode: 'AMOUNT_ABOVE_USUAL' | 'CATEGORY_SPIKE' | 'NEW_MERCHANT_LARGE';
    supportingValues: Record<string, any>;
  };
  status: 'open' | 'expected' | 'incorrect' | 'dismissed';
  modelVersion: string;
  createdAt: string;
  updatedAt: string;
}

export interface Recommendation {
  id: string;
  type: string;
  title: string;
  rationale: string;
  evidenceValues: Record<string, any>;
  evidencePeriod: string;
  rule: string;
  threshold: string;
  estimatedEffect: string;
  actionableNextStep: string;
  status: 'open' | 'dismissed' | 'done';
  rank: number;
}

export const insightsService = {
  listAnomalies: async (
    status?: string,
    refresh?: boolean,
  ): Promise<{ anomalies: AnomalyInsight[]; disclaimer: string }> => {
    const params = new URLSearchParams();
    if (status && status !== 'all') params.set('status', status);
    if (refresh) params.set('refresh', 'true');
    const qs = params.toString();
    return apiClient.get<{ anomalies: AnomalyInsight[]; disclaimer: string }>(
      `/insights/anomalies${qs ? `?${qs}` : ''}`,
    );
  },

  updateAnomalyStatus: async (
    id: string,
    status: 'open' | 'expected' | 'incorrect' | 'dismissed',
  ): Promise<{ insight: AnomalyInsight }> => {
    return apiClient.patch<{ insight: AnomalyInsight }>(`/insights/${id}`, {
      status,
    });
  },

  listRecommendations: async (): Promise<{
    recommendations: Recommendation[];
  }> => {
    return apiClient.get<{ recommendations: Recommendation[] }>(
      '/insights/recommendations',
    );
  },
};
