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

const ML_CHECK_TIMEOUT_MS = 1500;

async function checkMLReachable(): Promise<boolean> {
  if (!env.ML_SERVICE_URL) return false;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ML_CHECK_TIMEOUT_MS);
  try {
    const res = await fetch(`${env.ML_SERVICE_URL}/health`, {
      method: 'GET',
      signal: controller.signal,
    });
    return res.status === 200;
  } catch {
    return false;
  } finally {
    clearTimeout(id);
  }
}

async function checkMLAuthOk(): Promise<boolean> {
  if (!env.ML_SERVICE_URL || !env.INTERNAL_API_KEY) return false;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ML_CHECK_TIMEOUT_MS);
  try {
    const res = await fetch(`${env.ML_SERVICE_URL}/internal/ping`, {
      method: 'GET',
      headers: {
        'X-Internal-Key': env.INTERNAL_API_KEY,
      },
      signal: controller.signal,
    });
    return res.status === 200;
  } catch {
    return false;
  } finally {
    clearTimeout(id);
  }
}

/**
 * Readiness probe: checks if backing dependencies (MongoDB) are connected,
 * and reports whether required service integrations are configured (non-secret booleans only).
 * Probes ML service liveness (mlReachable) and internal auth (mlAuthOk) non-blockingly.
 * Does NOT leak connection strings, hostnames, credentials, or internal topology.
 */
const readinessHandler = async (_req: Request, res: Response): Promise<void> => {
  const isDbReady = dbHealth.isReady();

  // Run lightweight non-blocking ML probes in parallel with short timeout
  const [mlReachableRes, mlAuthOkRes] = await Promise.allSettled([
    checkMLReachable(),
    checkMLAuthOk(),
  ]);

  const mlReachable = mlReachableRes.status === 'fulfilled' ? mlReachableRes.value : false;
  const mlAuthOk = mlAuthOkRes.status === 'fulfilled' ? mlAuthOkRes.value : false;

  const checks = {
    database: isDbReady ? 'connected' : 'disconnected',
    groqConfigured: Boolean(env.GROQ_API_KEY && env.GROQ_API_KEY.trim().length > 0),
    internalKeyConfigured: Boolean(env.INTERNAL_API_KEY && env.INTERNAL_API_KEY.trim().length > 0),
    mlServiceConfigured: Boolean(env.ML_SERVICE_URL && env.ML_SERVICE_URL.trim().length > 0),
    mlReachable,
    mlAuthOk,
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
