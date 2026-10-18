import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';

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
 * Readiness probe: checks if backing dependencies (MongoDB) are connected.
 * Does NOT leak connection strings, hostnames, credentials, or internal topology.
 */
const readinessHandler = (_req: Request, res: Response): void => {
  const isDbReady = dbHealth.isReady();

  if (isDbReady) {
    res.status(200).json({
      status: 'ok',
      checks: {
        database: 'connected',
      },
    });
  } else {
    res.status(503).json({
      status: 'unavailable',
      checks: {
        database: 'disconnected',
      },
    });
  }
};

healthRouter.get('/health/ready', readinessHandler);
healthRouter.get('/ready', readinessHandler);
