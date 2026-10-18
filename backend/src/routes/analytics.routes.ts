import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../middlewares/auth.js';
import { analyticsService } from '../services/analyticsService.js';
import { analyticsQuerySchema } from '../validators/transaction.validators.js';
import { ValidationError } from '../utils/errors.js';

export const analyticsRouter = Router();

analyticsRouter.use(authMiddleware);

/**
 * GET /api/v1/analytics/summary?from&to
 * Computes financial metrics: income, expense, net, savings rate, category breakdown, monthly trends.
 */
analyticsRouter.get(
  '/summary',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = analyticsQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        throw new ValidationError(
          'Invalid query parameters for analytics',
          parsed.error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        );
      }

      const summary = await analyticsService.getSummary(
        req.userId!,
        parsed.data.from,
        parsed.data.to,
      );

      res.status(200).json(summary);
    } catch (err) {
      next(err);
    }
  },
);
