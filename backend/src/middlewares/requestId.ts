import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      userId?: string;
      user?: {
        id: string;
        email: string;
      };
    }
  }
}

export const requestIdMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const existingId = req.header('x-request-id');
  const requestId = (typeof existingId === 'string' && existingId.trim().length > 0)
    ? existingId.trim()
    : uuidv4();

  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
};
