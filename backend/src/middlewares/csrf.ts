import { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '../utils/errors.js';
import { env } from '../config/env.js';

/**
 * CSRF defense for state-changing requests.
 *
 * Strategy (defense-in-depth, no token storage needed):
 * 1. Require custom header `X-Requested-With: moneylens` on all POST/PUT/PATCH/DELETE.
 *    Browsers block custom headers on cross-origin simple requests, so a forged form
 *    submission from another site cannot include this header.
 * 2. When an Origin header is present, verify it's in our allowed origins list.
 *
 * GET/HEAD/OPTIONS are safe methods and are exempted.
 */
export const csrfMiddleware = (req: Request, _res: Response, next: NextFunction): void => {
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (safeMethods.includes(req.method)) {
    next();
    return;
  }

  // Check custom header
  const xRequestedWith = req.header('X-Requested-With');
  if (xRequestedWith !== 'moneylens') {
    next(new ForbiddenError('Missing or invalid X-Requested-With header. CSRF check failed.'));
    return;
  }

  // Check Origin if present
  const origin = req.header('Origin');
  if (origin) {
    const allowedOrigins = env.ALLOWED_ORIGINS.split(',').map((o) => o.trim());
    if (!allowedOrigins.includes(origin)) {
      next(new ForbiddenError('Request origin not permitted. CSRF check failed.'));
      return;
    }
  }

  next();
};
