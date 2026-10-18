import { Router, Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { authMiddleware } from '../middlewares/auth.js';
import { Goal } from '../models/Goal.js';
import {
  createGoalSchema,
  updateGoalSchema,
  directGoalScoreSchema,
} from '../validators/goal.validators.js';
import { ValidationError, NotFoundError } from '../utils/errors.js';
import { analyticsService } from '../services/analyticsService.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export const goalsRouter = Router();

goalsRouter.use(authMiddleware);

const TIMEOUT_MS = 5000;

async function fetchMLGoalScore(
  payload: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  const endpoint = `${env.ML_SERVICE_URL}/goals/score`;

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

    logger.warn(
      { status: res.status },
      'ML goal scoring service returned non-200',
    );
    return null;
  } catch (err: any) {
    clearTimeout(timeoutId);
    logger.warn({ error: err.message }, 'ML goal scoring service unreachable');
    return null;
  }
}

/**
 * GET /api/v1/goals
 * List all goals for the authenticated user.
 */
goalsRouter.get(
  '/',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const goals = await Goal.find({ userId: req.userId })
        .sort({ createdAt: -1 })
        .lean();

      res.status(200).json({ goals });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/goals
 * Create a new goal.
 */
goalsRouter.post(
  '/',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = createGoalSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError(
          'Invalid goal data',
          parsed.error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        );
      }

      const goal = await Goal.create({
        userId: req.userId,
        name: parsed.data.name,
        targetAmount: parsed.data.targetAmount,
        currentAmount: parsed.data.currentAmount,
        targetDate: new Date(parsed.data.targetDate),
        priority: parsed.data.priority,
        monthlyContribution: parsed.data.monthlyContribution ?? null,
        expectedReturnRate: parsed.data.expectedReturnRate ?? null,
      });

      res.status(201).json({ goal });
    } catch (err) {
      next(err);
    }
  },
);

const updateGoalHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id!)) {
      throw new ValidationError('Invalid goal ID format');
    }

    const parsed = updateGoalSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(
        'Invalid update data',
        parsed.error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        })),
      );
    }

    // Exact-ID match + user ownership check
    const goal = await Goal.findOneAndUpdate(
      { _id: id, userId: req.userId },
      {
        ...parsed.data,
        ...(parsed.data.targetDate
          ? { targetDate: new Date(parsed.data.targetDate) }
          : {}),
      },
      { new: true, runValidators: true },
    );

    if (!goal) {
      throw new NotFoundError(
        'Goal not found or you do not have permission to update it',
      );
    }

    res.status(200).json({ goal });
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/v1/goals/:id
 * PUT /api/v1/goals/:id
 * Update a goal by exact ID. Never fuzzy name match.
 */
goalsRouter.patch('/:id', updateGoalHandler);
goalsRouter.put('/:id', updateGoalHandler);

/**
 * DELETE /api/v1/goals/:id
 * Delete a goal by exact ID.
 */
goalsRouter.delete(
  '/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id!)) {
        throw new ValidationError('Invalid goal ID format');
      }

      // Exact-ID match + user ownership check
      const goal = await Goal.findOneAndDelete({
        _id: id,
        userId: req.userId,
      });

      if (!goal) {
        throw new NotFoundError(
          'Goal not found or you do not have permission to delete it',
        );
      }

      res.status(200).json({ message: 'Goal deleted successfully' });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * Helper to handle goal scoring logic
 */
const handleGoalScore = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id!)) {
      throw new ValidationError('Invalid goal ID format');
    }

    const goal = await Goal.findOne({ _id: id, userId: req.userId });
    if (!goal) {
      throw new NotFoundError('Goal not found');
    }

    // Calculate months left
    const now = new Date();
    const targetDate = new Date(goal.targetDate);
    const monthsLeft = Math.max(
      1,
      (targetDate.getFullYear() - now.getFullYear()) * 12 +
        (targetDate.getMonth() - now.getMonth()),
    );

    // Get historical monthly surplus from analytics
    const summary = await analyticsService.getSummary(req.userId!);
    const historicalSurplus = summary.monthlyTrend.map((m) => m.net);

    // Read what-if parameters from query or body
    const reqBody = req.body || {};
    const contributionOverride =
      req.query.contribution ??
      req.query.monthlyContribution ??
      reqBody.contribution ??
      reqBody.monthlyContribution;

    const returnOverride =
      req.query.annualReturn ??
      req.query.expectedAnnualReturn ??
      req.query.expectedReturnRate ??
      reqBody.annualReturn ??
      reqBody.expectedAnnualReturn ??
      reqBody.expectedReturnRate;

    const monthlyContribution =
      contributionOverride !== undefined
        ? parseFloat(String(contributionOverride))
        : (goal.monthlyContribution ?? undefined);

    const expectedAnnualReturn =
      returnOverride !== undefined
        ? parseFloat(String(returnOverride))
        : (goal.expectedReturnRate ?? undefined);

    // Build ML request
    const mlPayload: Record<string, unknown> = {
      target: goal.targetAmount,
      current: goal.currentAmount,
      monthsLeft,
      monthlyContribution:
        monthlyContribution !== undefined && !isNaN(monthlyContribution)
          ? monthlyContribution
          : undefined,
      expectedAnnualReturn:
        expectedAnnualReturn !== undefined && !isNaN(expectedAnnualReturn)
          ? expectedAnnualReturn
          : undefined,
      historicalMonthlySurplus:
        historicalSurplus.length >= 3 ? historicalSurplus : undefined,
    };

    const mlResult = await fetchMLGoalScore(mlPayload);

    if (!mlResult) {
      res.status(200).json({
        available: false,
        reason: 'Goal scoring service is temporarily unavailable.',
        goal,
        monthsLeft,
      });
      return;
    }

    res.status(200).json({
      available: true,
      goal,
      monthsLeft,
      score: mlResult,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/v1/goals/:id/score
 * POST /api/v1/goals/:id/score
 * Get ML-powered achievability score for a specific goal with what-if support.
 */
goalsRouter.get('/:id/score', handleGoalScore);
goalsRouter.post('/:id/score', handleGoalScore);

/**
 * POST /api/v1/goals/score
 * Direct scoring endpoint without saving a goal first.
 */
goalsRouter.post(
  '/score',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = directGoalScoreSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError(
          'Invalid goal scoring payload',
          parsed.error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        );
      }

      const {
        target,
        current,
        monthsLeft: inputMonthsLeft,
        targetDate,
        monthlyContribution,
        expectedAnnualReturn,
      } = parsed.data;

      let monthsLeft = inputMonthsLeft;
      if (!monthsLeft && targetDate) {
        const now = new Date();
        const td = new Date(targetDate);
        if (!isNaN(td.getTime())) {
          monthsLeft = Math.max(
            1,
            (td.getFullYear() - now.getFullYear()) * 12 +
              (td.getMonth() - now.getMonth()),
          );
        }
      }
      monthsLeft = Math.max(1, monthsLeft || 12);

      // Get user's surplus data
      const summary = await analyticsService.getSummary(req.userId!);
      const historicalSurplus = summary.monthlyTrend.map((m) => m.net);

      const mlPayload: Record<string, unknown> = {
        target,
        current: Number(current) || 0,
        monthsLeft,
        monthlyContribution:
          monthlyContribution !== undefined
            ? Number(monthlyContribution)
            : undefined,
        expectedAnnualReturn:
          expectedAnnualReturn !== undefined
            ? Number(expectedAnnualReturn)
            : undefined,
        historicalMonthlySurplus:
          historicalSurplus.length >= 3 ? historicalSurplus : undefined,
      };

      const mlResult = await fetchMLGoalScore(mlPayload);
      if (!mlResult) {
        res.status(200).json({
          available: false,
          reason: 'Goal scoring service is temporarily unavailable.',
          monthsLeft,
        });
        return;
      }

      res.status(200).json({
        available: true,
        monthsLeft,
        score: mlResult,
      });
    } catch (err) {
      next(err);
    }
  },
);
