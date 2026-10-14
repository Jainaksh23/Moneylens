import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';

export const requestLoggerMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const startTime = Date.now();
  const { method, originalUrl, ip } = req;

  res.on('finish', () => {
    const durationMs = Date.now() - startTime;
    const { statusCode } = res;
    const requestId = req.requestId || 'unknown';

    const logPayload = {
      requestId,
      method,
      route: originalUrl,
      status: statusCode,
      durationMs,
      ip: ip || req.socket.remoteAddress,
    };

    if (statusCode >= 500) {
      logger.error(logPayload, `Request failed: ${method} ${originalUrl} ${statusCode}`);
    } else if (statusCode >= 400) {
      logger.warn(logPayload, `Client error: ${method} ${originalUrl} ${statusCode}`);
    } else {
      logger.info(logPayload, `Request handled: ${method} ${originalUrl} ${statusCode}`);
    }
  });

  next();
};
