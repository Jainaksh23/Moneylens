import { apiClient } from './apiClient';
import type { MonthlyTrendItem } from './analyticsService';

export interface ForecastDataPoint {
  month?: string;
  date?: string;
  value: number;
  lower: number;
  upper: number;
}

export interface DataCoverageDetails {
  firstDate?: string;
  lastDate?: string;
  days: number;
  monthsSpan?: number;
  minDaysRequired?: number;
}

export interface ForecastResult {
  values: ForecastDataPoint[];
  dailyValues?: ForecastDataPoint[];
  horizon: number;
  dataCoverage: number | DataCoverageDetails;
  modelUsed: string;
  modelVersion: string;
  mode?: 'monthly' | 'short_history' | 'monthly_baseline' | 'monthly_standard';
  confidence?: 'low' | 'medium' | 'high';
  assumptions?: string[];
  limitations?: string[];
  warnings: string[];
  evaluation?: string;
  runRateDaily?: {
    avgDailyIncome: number;
    avgDailyExpense: number;
    avgDailyNet: number;
  };
}

export interface DailyTrendItem {
  date: string;
  income: number;
  expense: number;
  net: number;
}

export interface WeeklyTrendItem {
  week: string;
  income: number;
  expense: number;
  net: number;
}

export interface ForecastResponse {
  available: boolean;
  status?: 'ok' | 'ml_unavailable' | 'generation_failed' | 'insufficient_data';
  reason?: string;
  retryable?: boolean;
  dataCoverage?: DataCoverageDetails;
  forecast?: ForecastResult;
  monthlyTrend: MonthlyTrendItem[];
  weeklyTrend?: WeeklyTrendItem[];
  dailyHistory?: DailyTrendItem[];
}

export const forecastService = {
  getForecast: async (horizon = 3): Promise<ForecastResponse> => {
    return apiClient.get<ForecastResponse>(`/forecast?horizon=${horizon}`);
  },
};
