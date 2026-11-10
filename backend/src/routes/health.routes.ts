import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { env } from '../config/env.js';

export const healthRouter = Router();

export const dbHealth = {
  isReady: (): boolean => mongoose.connection.readyState === 1,
};

/**
 * Liveness probe: checks if the Node.js process is responsive.
 */
healthRouter.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

healthRouter.get('/live', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

/**
 * Readiness probe: checks if backing dependencies (MongoDB) are connected,
 * and reports whether required service integrations are configured (non-secret booleans only).
 * Does NOT leak connection strings, hostnames, credentials, or internal topology.
 */
const readinessHandler = (_req: Request, res: Response): void => {
  const isDbReady = dbHealth.isReady();

  const checks = {
    database: isDbReady ? 'connected' : 'disconnected',
    groqConfigured: Boolean(env.GROQ_API_KEY && env.GROQ_API_KEY.trim().length > 0),
    internalKeyConfigured: Boolean(env.INTERNAL_API_KEY && env.INTERNAL_API_KEY.trim().length > 0),
    mlServiceConfigured: Boolean(env.ML_SERVICE_URL && env.ML_SERVICE_URL.trim().length > 0),
  };

  if (isDbReady) {
    res.status(200).json({
      status: 'ok',
      checks,
    });
  } else {
    res.status(503).json({
      status: 'unavailable',
      checks,
    });
  }
};

healthRouter.get('/health/ready', readinessHandler);
healthRouter.get('/ready', readinessHandler);
