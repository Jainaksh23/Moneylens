import { apiClient } from './apiClient';
import type { MonthlyTrendItem } from './analyticsService';

export interface ForecastDataPoint {
  month: string;
  value: number;
  lower: number;
  upper: number;
}

export interface ForecastResult {
  values: ForecastDataPoint[];
  horizon: number;
  dataCoverage: number;
  modelUsed: string;
  modelVersion: string;
  warnings: string[];
}

export interface ForecastResponse {
  available: boolean;
  reason?: string;
  forecast?: ForecastResult;
  monthlyTrend: MonthlyTrendItem[];
}

export const forecastService = {
  getForecast: async (horizon = 3): Promise<ForecastResponse> => {
    return apiClient.get<ForecastResponse>(`/forecast?horizon=${horizon}`);
  },
};
