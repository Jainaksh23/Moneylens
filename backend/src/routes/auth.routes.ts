import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { authMiddleware, JwtPayload } from '../middlewares/auth.js';
import { loginLimiter, registerLimiter, authLimiter } from '../middlewares/rateLimiter.js';
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
} from '../validators/auth.validators.js';
import {
  AppError,
  UnauthorizedError,
  ValidationError,
} from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export const authRouter = Router();

const BCRYPT_SALT_ROUNDS = 12;
const JWT_EXPIRY = '7d';

// Cookie options builder
const buildCookieOptions = () => ({
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
  path: '/',
});

/**
 * POST /api/v1/auth/register
 * Creates a new user account.
 */
authRouter.post(
  '/register',
  registerLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = registerSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Registration validation failed', 
          parsed.error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        );
      }

      const { email, password, name } = parsed.data;

      // Check for existing user
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        throw new AppError('An account with this email already exists', 409, 'CONFLICT');
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

      // Create user
      const user = await User.create({
        email,
        passwordHash,
        name,
        preferences: { currency: 'INR', dateFormat: 'DD/MM/YYYY' },
      });

      // Issue JWT token in cookie
      const payload: JwtPayload = {
        userId: user._id.toString(),
        email: user.email,
      };
      const token = jwt.sign(payload, env.JWT_SECRET, { expiresIn: JWT_EXPIRY });

      res.cookie(env.COOKIE_NAME, token, buildCookieOptions());

      logger.info({ userId: user._id.toString(), requestId: req.requestId }, 'User registered');

      res.status(201).json({
        user: {
          id: user._id.toString(),
          email: user.email,
          name: user.name,
          preferences: user.preferences,
          createdAt: user.createdAt,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/auth/login
 * Authenticates a user and sets JWT cookie.
 * Error messages are generic to prevent email enumeration.
 */
authRouter.post(
  '/login',
  loginLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Login validation failed',
          parsed.error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        );
      }

      const { email, password } = parsed.data;

      // Find user with passwordHash (+select since it's excluded by default)
      const user = await User.findOne({ email }).select('+passwordHash');

      if (!user) {
        // Generic error - do NOT reveal that email was not found
        throw new UnauthorizedError('Invalid email or password');
      }

      const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
      if (!isPasswordValid) {
        // Same generic error
        throw new UnauthorizedError('Invalid email or password');
      }

      // Issue JWT
      const payload: JwtPayload = {
        userId: user._id.toString(),
        email: user.email,
      };
      const token = jwt.sign(payload, env.JWT_SECRET, { expiresIn: JWT_EXPIRY });

      res.cookie(env.COOKIE_NAME, token, buildCookieOptions());

      logger.info({ userId: user._id.toString(), requestId: req.requestId }, 'User logged in');

      res.status(200).json({
        user: {
          id: user._id.toString(),
          email: user.email,
          name: user.name,
          preferences: user.preferences,
          createdAt: user.createdAt,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/auth/logout
 * Clears the auth cookie.
 */
authRouter.post('/logout', (_req: Request, res: Response) => {
  res.clearCookie(env.COOKIE_NAME, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
  });

  res.status(200).json({ message: 'Logged out successfully' });
});

/**
 * GET /api/v1/auth/me
 * Returns the current authenticated user's profile.
 */
authRouter.get(
  '/me',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await User.findById(req.userId);
      if (!user) {
        throw new UnauthorizedError('User account not found');
      }

      res.status(200).json({
        user: {
          id: user._id.toString(),
          email: user.email,
          name: user.name,
          preferences: user.preferences,
          createdAt: user.createdAt,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/auth/forgot-password
 * ALWAYS returns the same generic response regardless of whether the email exists.
 * Actual email delivery is stubbed - only logs a safe message.
 */
authRouter.post(
  '/forgot-password',
  authLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = forgotPasswordSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Validation failed',
          parsed.error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        );
      }

      // Stub: log that a password reset was requested (never log the email in production)
      logger.info(
        { requestId: req.requestId },
        'Password reset requested (stub - no email sent)',
      );

      // Always return the same response to prevent email enumeration
      res.status(200).json({
        message:
          'If an account with that email exists, a password reset link has been sent. Please check your inbox.',
      });
    } catch (err) {
      next(err);
    }
  },
);
