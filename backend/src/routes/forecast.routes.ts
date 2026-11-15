import { Router, Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { authMiddleware } from '../middlewares/auth.js';
import { analyticsService } from '../services/analyticsService.js';
import { Transaction } from '../models/Transaction.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export const forecastRouter = Router();

forecastRouter.use(authMiddleware);

// Render free-tier ML service sleeps after 15 min and takes ~60s to wake.
// Use 70s timeout to survive a cold start, with 1 retry (2 total attempts).
const TIMEOUT_MS = process.env.NODE_ENV === 'test' ? 300 : 70_000;
const MAX_RETRIES = 1;

interface MLForecastSuccess {
  success: true;
  data: Record<string, unknown>;
}

interface MLForecastUnavailable {
  success: false;
  kind: 'unreachable';
  statusCode?: number;
  reason: string;
  retryable: true;
}

interface MLForecastClientError {
  success: false;
  kind: 'client_error';
  statusCode: number;
  reason: string;
  retryable: false;
}

type MLForecastResponse = MLForecastSuccess | MLForecastUnavailable | MLForecastClientError;

async function fetchMLForecast(
  payload: Record<string, unknown>,
  requestId: string,
): Promise<MLForecastResponse> {
  const endpoint = `${env.ML_SERVICE_URL}/forecast`;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Key': env.INTERNAL_API_KEY,
          'X-Request-Id': requestId,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = (await res.json()) as Record<string, unknown>;
        return { success: true, data };
      }

      // Check for 4xx client errors (do not retry)
      if (res.status >= 400 && res.status < 500) {
        let sanitizedReason = 'Invalid forecast request parameters';
        try {
          const body = (await res.json()) as any;
          if (body && typeof body.detail === 'string') {
            sanitizedReason = body.detail.slice(0, 150);
          } else if (body && typeof body.message === 'string') {
            sanitizedReason = body.message.slice(0, 150);
          }
        } catch {
          // Ignore json parse error
        }

        logger.warn(
          { requestId, statusCode: res.status, route: '/forecast' },
          `ML forecast service returned 4xx client error: ${res.status} (${sanitizedReason})`,
        );

        return {
          success: false,
          kind: 'client_error',
          statusCode: res.status,
          reason: 'Could not generate forecast',
          retryable: false,
        };
      }

      // 5xx server errors: retry if attempts remain
      if (res.status >= 500 && attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 200 * Math.pow(2, attempt)));
        continue;
      }

      logger.warn(
        { requestId, statusCode: res.status, route: '/forecast' },
        `ML forecast service returned 5xx status code ${res.status}`,
      );
      return {
        success: false,
        kind: 'unreachable',
        statusCode: res.status,
        reason: 'Forecast service is waking up, please retry in a minute',
        retryable: true,
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 200 * Math.pow(2, attempt)));
        continue;
      }
      logger.warn(
        { requestId, error: err?.message, route: '/forecast' },
        'ML forecast service unreachable or timed out',
      );
      return {
        success: false,
        kind: 'unreachable',
        reason: 'Forecast service is waking up, please retry in a minute',
        retryable: true,
      };
    }
  }

  return {
    success: false,
    kind: 'unreachable',
    reason: 'Forecast service is waking up, please retry in a minute',
    retryable: true,
  };
}

function computeWeeklyTrend(
  daily: { date: string; income: number; expense: number; net: number }[],
) {
  const weekMap = new Map<string, { week: string; income: number; expense: number; net: number }>();
  for (const item of daily) {
    const d = new Date(item.date);
    const day = d.getUTCDay();
    const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d);
    monday.setUTCDate(diff);
    const weekKey = monday.toISOString().slice(0, 10);
    if (!weekMap.has(weekKey)) {
      weekMap.set(weekKey, { week: weekKey, income: 0, expense: 0, net: 0 });
    }
    const w = weekMap.get(weekKey)!;
    w.income = Number((w.income + item.income).toFixed(2));
    w.expense = Number((w.expense + item.expense).toFixed(2));
    w.net = Number((w.income - w.expense).toFixed(2));
  }
  return Array.from(weekMap.values()).sort((a, b) => a.week.localeCompare(b.week));
}

/**
 * GET /api/v1/forecast
 * Returns ML-powered cash-flow forecast or a distinct classified error state.
 * Never returns fabricated numbers — either real ML output or a classified status.
 */
forecastRouter.get(
  '/',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userObjectId = new mongoose.Types.ObjectId(req.userId!);

      // 1. Daily Aggregation for robust history length calculation
      const dailyAgg = await Transaction.aggregate<{
        _id: string; // YYYY-MM-DD
        income: number;
        expense: number;
      }>([
        { $match: { userId: userObjectId } },
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$date',
                timezone: 'Asia/Kolkata',
              },
            },
            income: {
              $sum: {
                $cond: [{ $eq: ['$direction', 'income'] }, '$amount', 0],
              },
            },
            expense: {
              $sum: {
                $cond: [{ $eq: ['$direction', 'expense'] }, '$amount', 0],
              },
            },
          },
        },
        { $sort: { _id: 1 } },
      ]);

      if (!dailyAgg || dailyAgg.length === 0) {
        res.status(200).json({
          available: false,
          status: 'insufficient_data',
          reason: 'No transaction data available for forecasting. Import transactions first.',
          monthlyTrend: [],
          weeklyTrend: [],
          dailyHistory: [],
        });
        return;
      }

      const dailySeries = dailyAgg.map((item) => ({
        date: item._id,
        income: Number(item.income.toFixed(2)),
        expense: Number(item.expense.toFixed(2)),
        net: Number((item.income - item.expense).toFixed(2)),
      }));

      const weeklyTrend = computeWeeklyTrend(dailySeries);

      // Calculate calendar days span
      const firstDate = dailyAgg[0]!._id;
      const lastDate = dailyAgg[dailyAgg.length - 1]!._id;
      const d1 = new Date(firstDate);
      const d2 = new Date(lastDate);
      const diffTime = Math.abs(d2.getTime() - d1.getTime());
      const daysSpan = Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1;

      // 2. Get user's monthly trend data
      const summary = await analyticsService.getSummary(req.userId!);
      const monthlyTrend = summary.monthlyTrend || [];
      const monthsCount = monthlyTrend.length;

      // Check minimum required history for short-history mode (at least 14 days)
      if (daysSpan < 14) {
        res.status(200).json({
          available: false,
          status: 'insufficient_data',
          reason: `Need at least 14 days of transaction history (currently have ${daysSpan} day${daysSpan === 1 ? '' : 's'}).`,
          dataCoverage: {
            firstDate,
            lastDate,
            days: daysSpan,
            minDaysRequired: 14,
          },
          monthlyTrend,
          weeklyTrend,
          dailyHistory: dailySeries,
        });
        return;
      }

      // 3. Mode selection by history length:
      // >= 6 months -> existing monthly models (baseline vs Prophet, keep time-based evaluation)
      // 2-5 months -> monthly baseline with wide ranges
      // < 2 months (including 1 month) -> short-history mode
      let selectedMode: 'short_history' | 'monthly_baseline' | 'monthly_standard';
      if (monthsCount < 2 || daysSpan < 60) {
        selectedMode = 'short_history';
      } else if (monthsCount < 6 || daysSpan < 180) {
        selectedMode = 'monthly_baseline';
      } else {
        selectedMode = 'monthly_standard';
      }

      const horizon = Math.min(
        Math.max(parseInt(req.query.horizon as string) || 3, 1),
        12,
      );

      // 4. Build payload based on selected mode
      let payload: Record<string, unknown>;
      if (selectedMode === 'short_history') {
        payload = {
          mode: 'short_history',
          dailySeries,
          horizon,
          horizonDays: horizon * 30,
        };
      } else {
        const series = monthlyTrend.map((item) => ({
          month: item.month,
          net: item.net,
        }));
        payload = {
          mode: selectedMode,
          series,
          horizon,
        };
      }

      // 5. Call ML service
      const mlResult = await fetchMLForecast(payload, req.requestId);

      if (!mlResult.success) {
        if (mlResult.kind === 'unreachable') {
          res.status(200).json({
            available: false,
            status: 'ml_unavailable',
            reason: mlResult.reason,
            retryable: true,
            monthlyTrend,
            weeklyTrend,
            dailyHistory: dailySeries,
          });
          return;
        }

        // 4xx client error
        res.status(200).json({
          available: false,
          status: 'generation_failed',
          reason: mlResult.reason,
          retryable: false,
          monthlyTrend,
          weeklyTrend,
          dailyHistory: dailySeries,
        });
        return;
      }

      // 6. Handle ML service returned payload
      if (mlResult.data.available === false) {
        res.status(200).json({
          available: false,
          status: (mlResult.data.status as string) || 'insufficient_data',
          reason: (mlResult.data.reason as string) || 'Insufficient data to generate forecast.',
          dataCoverage: mlResult.data.dataCoverage,
          monthlyTrend,
          weeklyTrend,
          dailyHistory: dailySeries,
        });
        return;
      }

      res.status(200).json({
        available: true,
        status: 'ok',
        forecast: mlResult.data,
        monthlyTrend,
        weeklyTrend,
        dailyHistory: dailySeries,
      });
    } catch (err) {
      next(err);
    }
  },
);
