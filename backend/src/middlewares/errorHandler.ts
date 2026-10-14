import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';

export interface StandardErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  requestId: string;
}

export const errorHandlerMiddleware = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  const requestId = req.requestId || 'unknown';

  // 1. Handled Domain AppError
  if (err instanceof AppError) {
    const errorBody: StandardErrorResponse = {
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
      requestId,
    };

    if (err.statusCode >= 500) {
      logger.error({ err, requestId }, `Handled server error [${err.code}]: ${err.message}`);
    } else {
      logger.warn({ err, requestId }, `Client application error [${err.code}]: ${err.message}`);
    }

    res.status(err.statusCode).json(errorBody);
    return;
  }

  // 2. Zod Validation Errors
  if (err instanceof ZodError) {
    const formattedErrors = err.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
      rule: e.code,
    }));

    const errorBody: StandardErrorResponse = {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request parameters or payload',
        details: formattedErrors,
      },
      requestId,
    };

    logger.warn({ details: formattedErrors, requestId }, 'Validation error encountered');
    res.status(422).json(errorBody);
    return;
  }

  // 3. Express Body Parser Syntax Error (malformed JSON)
  if (err instanceof SyntaxError && 'status' in err && (err as { status: number }).status === 400) {
    const errorBody: StandardErrorResponse = {
      error: {
        code: 'BAD_REQUEST',
        message: 'Malformed JSON payload in request body',
      },
      requestId,
    };

    res.status(400).json(errorBody);
    return;
  }

  // 4. Uncaught / Internal Unexpected Error
  logger.error(
    {
      err: {
        name: err.name,
        message: err.message,
        stack: env.NODE_ENV === 'production' ? undefined : err.stack,
      },
      requestId,
    },
    'Unhandled server exception',
  );

  const errorBody: StandardErrorResponse = {
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message:
        env.NODE_ENV === 'production'
          ? 'An internal server error occurred'
          : err.message || 'An internal server error occurred',
    },
    requestId,
  };

  res.status(500).json(errorBody);
};
