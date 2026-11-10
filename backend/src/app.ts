import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { env } from './config/env.js';
import { requestIdMiddleware } from './middlewares/requestId.js';
import { requestLoggerMiddleware } from './middlewares/requestLogger.js';
import { errorHandlerMiddleware } from './middlewares/errorHandler.js';
import { csrfMiddleware } from './middlewares/csrf.js';
import { generalLimiter } from './middlewares/rateLimiter.js';
import { apiV1Router } from './routes/index.js';
import { healthRouter } from './routes/health.routes.js';
import { NotFoundError } from './utils/errors.js';

export const createApp = (): Express => {
  const app = express();

  // 1. Trust proxy in production if behind reverse proxy
  if (env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
  }

  // 2. Request Correlation ID (before everything else for traceability)
  app.use(requestIdMiddleware);

  // 3. Structured Request Logging
  app.use(requestLoggerMiddleware);

  // 4. Security hardening headers via helmet
  app.use(helmet());

  // 5. CORS configuration — STRICT: no wildcard allowed, credentials required
  const allowedOrigins = env.ALLOWED_ORIGINS.split(',').map((o) => o.trim());
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (curl, server-to-server, Supertest in tests)
        if (!origin) {
          callback(null, true);
          return;
        }
        if (allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error(`Origin ${origin} not allowed by CORS`));
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Request-Id',
        'X-Requested-With',
      ],
      exposedHeaders: ['X-Request-Id'],
    }),
  );

  // 6. Health & Readiness Probes (mounted before rate limiters & body parsing so container probes never 429)
  app.use('/', healthRouter);
  app.use('/api/v1', healthRouter);

  // 7. General rate limiter (skip in test environment so test suites don't hit limits)
  if (env.NODE_ENV !== 'test') {
    app.use(generalLimiter);
  }

  // 7. Parsers (body size limited to 1mb to prevent payload-based DoS)
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());

  // 8. CSRF protection for state-changing methods
  app.use(csrfMiddleware);

  // 9. Health & Readiness Probes (direct container orchestrator / probe support)
  app.use('/', healthRouter);

  // 10. API v1 Routes
  app.use('/api/v1', apiV1Router);

  // 10. Catch-all 404 Route Handler
  app.use((_req: Request, _res: Response, next: NextFunction) => {
    next(new NotFoundError('The requested resource was not found on this server'));
  });

  // 11. Central Error Handling Middleware
  app.use(errorHandlerMiddleware);

  return app;
};
