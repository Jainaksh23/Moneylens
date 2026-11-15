export interface DailyCashFlowItem {
  date: string; // YYYY-MM-DD
  income: number;
  expense: number;
  net: number;
}

export interface MonthlyCashFlowItem {
  month: string; // YYYY-MM
  net: number;
}

export type ForecastMode = 'short_history' | 'monthly_baseline' | 'monthly_standard';

export interface ForecastRequestPayload {
  mode: ForecastMode;
  horizon: number;
  dailySeries?: DailyCashFlowItem[];
  series?: MonthlyCashFlowItem[];
  horizonDays?: number;
}

/**
 * Determines the forecasting mode adaptively based on available history:
 * - < 2 months OR < 60 days of history -> 'short_history' (daily run-rate extrapolation)
 * - 2-5 months (< 180 days) -> 'monthly_baseline' (widened confidence bounds)
 * - >= 6 months (>= 180 days) -> 'monthly_standard' (Prophet vs baseline holdout)
 */
export function determineForecastMode(daysSpan: number, monthsCount: number): ForecastMode {
  if (monthsCount < 2 || daysSpan < 60) {
    return 'short_history';
  } else if (monthsCount < 6 || daysSpan < 180) {
    return 'monthly_baseline';
  } else {
    return 'monthly_standard';
  }
}

/**
 * Builds the exact JSON payload expected by the ML service Pydantic ForecastRequest schema.
 * Bounds horizon between 1 and 12, and horizonDays between 1 and 180 (preventing schema 422 errors).
 */
export function buildForecastPayload(
  mode: ForecastMode,
  horizon?: number,
  dailySeries?: DailyCashFlowItem[],
  monthlySeries?: { month: string; net: number }[],
): ForecastRequestPayload {
  const parsedHorizon = typeof horizon === 'number' && !isNaN(horizon) ? horizon : 3;
  const boundedHorizon = Math.min(Math.max(parsedHorizon, 1), 12);

  if (mode === 'short_history') {
    return {
      mode: 'short_history',
      dailySeries: (dailySeries || []).map((d) => ({
        date: d.date,
        income: Number(d.income.toFixed(2)),
        expense: Number(d.expense.toFixed(2)),
        net: Number(d.net.toFixed(2)),
      })),
      horizon: boundedHorizon,
      horizonDays: Math.min(boundedHorizon * 30, 180),
    };
  }

  return {
    mode,
    series: (monthlySeries || []).map((m) => ({
      month: m.month,
      net: Number(m.net.toFixed(2)),
    })),
    horizon: boundedHorizon,
  };
}
