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

  // 1. CORS error check
  if (err.message && err.message.includes('not allowed by CORS')) {
    const errorBody: StandardErrorResponse = {
      error: {
        code: 'FORBIDDEN',
        message: 'Origin not allowed by CORS policy',
      },
      requestId,
    };
    logger.warn({ origin: req.header('Origin'), requestId }, 'CORS request rejected');
    res.status(403).json(errorBody);
    return;
  }

  // 2. Handled Domain AppError
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

  // 4. Express Body Parser Payload Too Large (413)
  if (
    (err as any).type === 'entity.too.large' ||
    (err as any).status === 413 ||
    (err as any).statusCode === 413
  ) {
    const errorBody: StandardErrorResponse = {
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Request payload exceeds maximum allowed size limit',
      },
      requestId,
    };
    logger.warn({ requestId }, 'Request payload size limit exceeded (413)');
    res.status(413).json(errorBody);
    return;
  }

  // 5. Multer File Upload Size Limit (LIMIT_FILE_SIZE)
  if ((err as any).code === 'LIMIT_FILE_SIZE') {
    const errorBody: StandardErrorResponse = {
      error: {
        code: 'BAD_REQUEST',
        message: 'File upload exceeds maximum allowed size (5MB limit)',
      },
      requestId,
    };
    logger.warn({ requestId }, 'Multer file upload size limit exceeded (400)');
    res.status(400).json(errorBody);
    return;
  }

  // 4. Mongoose CastError / BSONError (invalid ObjectId or type casting)
  if (err.name === 'CastError' || err.name === 'BSONError') {
    const path = (err as any).path ? ` for ${(err as any).path}` : '';
    const errorBody: StandardErrorResponse = {
      error: {
        code: 'BAD_REQUEST',
        message: `Invalid identifier or parameter format${path}`,
      },
      requestId,
    };

    logger.warn({ err: err.message, requestId }, 'Mongoose cast error encountered');
    res.status(400).json(errorBody);
    return;
  }

  // 5. Mongoose Document Validation Error
  if (err.name === 'ValidationError' && (err as any).errors) {
    const details = Object.values((err as any).errors).map((e: any) => ({
      field: e.path,
      message: e.message,
    }));
    const errorBody: StandardErrorResponse = {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Database document validation failed',
        details,
      },
      requestId,
    };

    logger.warn({ details, requestId }, 'Mongoose validation error encountered');
    res.status(422).json(errorBody);
    return;
  }

  // 6. MongoDB Duplicate Key Conflict (E11000)
  if ((err as any).code === 11000) {
    const errorBody: StandardErrorResponse = {
      error: {
        code: 'CONFLICT',
        message: 'A record with duplicate unique fields already exists',
      },
      requestId,
    };

    logger.warn({ requestId }, 'Duplicate key conflict encountered');
    res.status(409).json(errorBody);
    return;
  }

  // 7. Generic HTTP error with statusCode / status
  const customStatus = (err as any).statusCode || (err as any).status;
  if (typeof customStatus === 'number' && customStatus >= 400 && customStatus < 600) {
    const code = (err as any).code || (customStatus === 422 ? 'VALIDATION_ERROR' : customStatus === 400 ? 'BAD_REQUEST' : 'INTERNAL_SERVER_ERROR');
    const errorBody: StandardErrorResponse = {
      error: {
        code,
        message: err.message,
        ...((err as any).details ? { details: (err as any).details } : {}),
      },
      requestId,
    };
    if (customStatus >= 500) {
      logger.error({ err, requestId }, `Handled server error [${code}]: ${err.message}`);
    } else {
      logger.warn({ err, requestId }, `Client application error [${code}]: ${err.message}`);
    }
    res.status(customStatus).json(errorBody);
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
