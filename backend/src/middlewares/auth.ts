import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { UnauthorizedError } from '../utils/errors.js';

export interface JwtPayload {
  userId: string;
  email: string;
}

export const authMiddleware = (req: Request, _res: Response, next: NextFunction): void => {
  const token: string | undefined = req.cookies[env.COOKIE_NAME] as string | undefined;

  if (!token) {
    next(new UnauthorizedError('Authentication required. Please log in.'));
    return;
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    req.userId = decoded.userId;
    req.user = {
      id: decoded.userId,
      email: decoded.email,
    };
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      next(new UnauthorizedError('Session expired. Please log in again.'));
    } else {
      next(new UnauthorizedError('Invalid authentication token.'));
    }
  }
};
