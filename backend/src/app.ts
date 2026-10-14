import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { requestIdMiddleware } from './middlewares/requestId.js';
import { requestLoggerMiddleware } from './middlewares/requestLogger.js';
import { errorHandlerMiddleware } from './middlewares/errorHandler.js';
import { apiV1Router } from './routes/index.js';
import { NotFoundError } from './utils/errors.js';

export const createApp = (): Express => {
  const app = express();

  // 1. Trust proxy in production if behind reverse proxy
  if (env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
  }

  // 2. Request Correlation ID
  app.use(requestIdMiddleware);

  // 3. Structured Request Logging
  app.use(requestLoggerMiddleware);

  // 4. CORS configuration (Strict origins + Credentials for httpOnly cookies)
  const allowedOrigins = env.ALLOWED_ORIGINS.split(',').map((o) => o.trim());
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps, curl, or server-to-server)
        if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
          callback(null, true);
        } else {
          callback(new Error(`Origin ${origin} not allowed by CORS`));
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'X-CSRF-Token'],
      exposedHeaders: ['X-Request-Id'],
    }),
  );

  // 5. Parsers
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());

  // 6. API v1 Routes
  app.use('/api/v1', apiV1Router);

  // 7. Catch-all 404 Route Handler
  app.use((_req: Request, _res: Response, next: NextFunction) => {
    next(new NotFoundError('The requested resource was not found on this server'));
  });

  // 8. Central Error Handling Middleware
  app.use(errorHandlerMiddleware);

  return app;
};
