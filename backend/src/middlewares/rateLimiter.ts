import rateLimit from 'express-rate-limit';

/**
 * Checks if a path is a container health or readiness probe.
 * Exempt from all rate limiters to guarantee orchestrator uptime checks (e.g. Render 5s pings).
 */
export const isHealthPath = (reqPath?: string, originalUrl?: string): boolean => {
  const check = (p?: string): boolean => {
    if (!p) return false;
    const firstSegment = p.toLowerCase().split('?')[0] || '';
    const normalized = firstSegment.replace(/\/+$/, '');
    return (
      normalized === '/health' ||
      normalized.startsWith('/health/') ||
      normalized === '/ready' ||
      normalized.startsWith('/ready/') ||
      normalized === '/live' ||
      normalized.startsWith('/live/') ||
      normalized === '/api/v1/health' ||
      normalized.startsWith('/api/v1/health/') ||
      normalized === '/api/v1/ready' ||
      normalized.startsWith('/api/v1/ready/') ||
      normalized === '/api/v1/live' ||
      normalized.startsWith('/api/v1/live/')
    );
  };
  return check(reqPath) || check(originalUrl);
};

/**
 * General API rate limiter: 100 requests per 15 minutes per IP.
 * Exempts all health and readiness probes.
 */
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => isHealthPath(req.path, req.originalUrl),
  message: {
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many requests. Please try again later.',
    },
  },
});

/**
 * Login-specific rate limiter: 10 requests per 15 minutes per IP.
 * Protects against credential stuffing and brute-force attacks.
 */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => isHealthPath(req.path, req.originalUrl),
  message: {
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many authentication attempts. Please try again after 15 minutes.',
    },
  },
});

/**
 * Register-specific rate limiter: 10 requests per 15 minutes per IP.
 * Protects against mass account creation attacks.
 */
export const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => isHealthPath(req.path, req.originalUrl),
  message: {
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many registration attempts. Please try again after 15 minutes.',
    },
  },
});

/**
 * Backwards-compatible alias for auth routes.
 */
export const authLimiter = loginLimiter;

/**
 * Strict limiter placeholder for expensive endpoints (/chat, /transactions/import).
 * 5 requests per minute per IP.
 */
export const strictLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => isHealthPath(req.path, req.originalUrl) || process.env.NODE_ENV === 'test',
  message: {
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'Rate limit exceeded for this resource. Please wait before retrying.',
    },
  },
});

/**
 * Reset helper for testing environments.
 */
export const resetAuthLimiters = (): void => {
  const keys = ['127.0.0.1', '::ffff:127.0.0.1', '::1'];
  for (const k of keys) {
    try {
      loginLimiter.resetKey(k);
      registerLimiter.resetKey(k);
      strictLimiter.resetKey(k);
    } catch {
      // Ignore if key was not present
    }
  }
};
