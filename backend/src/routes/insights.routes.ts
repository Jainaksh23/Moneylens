import { Router, Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { authMiddleware } from '../middlewares/auth.js';
import { insightService } from '../services/insightService.js';
import { InsightStatus } from '../models/Insight.js';
import { ValidationError } from '../utils/errors.js';

const updateInsightSchema = z.object({
  status: z.enum(['open', 'expected', 'incorrect', 'dismissed'], {
    errorMap: () => ({ message: 'Status must be one of: open, expected, incorrect, dismissed' }),
  }),
});

export const insightsRouter = Router();

insightsRouter.use(authMiddleware);

/**
 * GET /api/v1/insights/anomalies
 * List detected anomalies for the authenticated user.
 * Optional query: ?status=open|expected|incorrect|dismissed
 */
insightsRouter.get(
  '/anomalies',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const status = req.query.status as string | undefined;
      // If no status or status=open, run sync/detect or retrieve stored
      let anomalies;
      if (req.query.refresh === 'true' || !status) {
        anomalies = await insightService.detectAndSyncAnomalies(req.userId!);
      } else {
        anomalies = await insightService.getStoredAnomalies(req.userId!, status);
      }

      res.status(200).json({
        anomalies,
        disclaimer:
          'Unusual transactions compared to your history. Not flagged as fraud.',
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/insights/anomalies/detect
 * Explicitly trigger a fresh anomaly detection run.
 */
insightsRouter.post(
  '/anomalies/detect',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const anomalies = await insightService.detectAndSyncAnomalies(req.userId!);
      res.status(200).json({
        anomalies,
        disclaimer:
          'Unusual transactions compared to your history. Not flagged as fraud.',
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH /api/v1/insights/:id
 * Feedback status update on an insight (open, expected, incorrect, dismissed).
 */
insightsRouter.patch(
  ['/:id', '/anomalies/:id'],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        throw new ValidationError('Invalid insight ID format');
      }

      const parsed = updateInsightSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError(
          'Invalid insight update payload',
          parsed.error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        );
      }

      const updated = await insightService.updateInsightStatus(
        id,
        req.userId!,
        parsed.data.status as InsightStatus,
      );

      res.status(200).json({ insight: updated });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/insights/recommendations
 * Deterministic rule-based financial recommendations with optional LLM rephrase.
 */
insightsRouter.get(
  '/recommendations',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const recommendations = await insightService.getRecommendations(
        req.userId!,
      );
      res.status(200).json({ recommendations });
    } catch (err) {
      next(err);
    }
  },
);
