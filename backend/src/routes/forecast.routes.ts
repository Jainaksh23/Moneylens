import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../middlewares/auth.js';
import { analyticsService } from '../services/analyticsService.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export const forecastRouter = Router();

forecastRouter.use(authMiddleware);

// Reuse fetchWithRetry pattern from mlClient
const TIMEOUT_MS = 8000; // Forecast can take longer than categorization
const MAX_RETRIES = 1;

async function fetchMLForecast(
  series: { month: string; net: number }[],
  horizon: number,
): Promise<Record<string, unknown> | null> {
  const endpoint = `${env.ML_SERVICE_URL}/forecast`;
  const payload = { series, horizon };

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Key': env.INTERNAL_API_KEY,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        return (await res.json()) as Record<string, unknown>;
      }

      if (res.status >= 500 && attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 200 * Math.pow(2, attempt)));
        continue;
      }

      logger.warn(
        { status: res.status, url: endpoint },
        'ML forecast service returned non-200 status',
      );
      return null;
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 200 * Math.pow(2, attempt)));
        continue;
      }
      logger.warn({ error: err.message }, 'ML forecast service unreachable');
      return null;
    }
  }
  return null;
}

/**
 * GET /api/v1/forecast
 * Returns ML-powered cash-flow forecast or a clear unavailable state.
 * Never returns fabricated numbers — either real ML output or an error.
 */
forecastRouter.get(
  '/',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // 1. Get user's monthly trend data (all time) for the forecast
      const summary = await analyticsService.getSummary(req.userId!);

      if (!summary.monthlyTrend || summary.monthlyTrend.length === 0) {
        res.status(200).json({
          available: false,
          reason: 'No transaction data available for forecasting. Import transactions first.',
          monthlyTrend: [],
        });
        return;
      }

      // 2. Build series from backend aggregation
      const series = summary.monthlyTrend.map((item) => ({
        month: item.month,
        net: item.net,
      }));

      const horizon = Math.min(
        Math.max(parseInt(req.query.horizon as string) || 3, 1),
        12,
      );

      // 3. Call ML service
      const mlResult = await fetchMLForecast(series, horizon);

      if (!mlResult) {
        res.status(200).json({
          available: false,
          reason:
            'Forecasting service is temporarily unavailable. Please try again later.',
          monthlyTrend: summary.monthlyTrend,
        });
        return;
      }

      // 4. Return ML result with historical data for charting
      res.status(200).json({
        available: true,
        forecast: mlResult,
        monthlyTrend: summary.monthlyTrend,
      });
    } catch (err) {
      next(err);
    }
  },
);
