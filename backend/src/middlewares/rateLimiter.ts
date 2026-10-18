import rateLimit from 'express-rate-limit';

/**
 * General API rate limiter: 100 requests per 15 minutes per IP.
 */
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
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
    } catch {
      // Ignore if key was not present
    }
  }
};
