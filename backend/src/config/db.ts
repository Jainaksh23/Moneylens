import mongoose from 'mongoose';
import type { Server } from 'http';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

let listenersRegistered = false;

/**
 * Sanitize database error messages so no connection strings, passwords, or
 * sensitive internal topology are leaked in logs, metrics, or error output.
 */
export function sanitizeMongoError(err: unknown): string {
  if (!err) return 'Unknown database error';
  const raw = err instanceof Error ? err.message : String(err);

  // Redact any URI formats and credentials
  const sanitized = raw
    .replace(/mongodb(\+srv)?:\/\/[^@]+@/gi, 'mongodb$1://***:***@')
    .replace(/mongodb(\+srv)?:\/\/[^\s"'`]+/gi, 'mongodb$1://[REDACTED]');

  // Provide actionable hints for common MongoDB Atlas failure modes
  if (
    raw.includes('Authentication failed') ||
    raw.includes('bad auth') ||
    (err as { code?: number })?.code === 8000
  ) {
    return 'MongoDB authentication failed. Verify database username and password in MONGODB_URI (check special character URL-encoding).';
  }
  if (
    raw.includes('Server selection timed out') ||
    raw.includes('ETIMEDOUT') ||
    raw.includes('buffering timed out') ||
    raw.includes('ECONNREFUSED')
  ) {
    return 'MongoDB connection timed out. Ensure your IP address is in Atlas Network Access IP allowlist and the cluster is active.';
  }
  if (
    raw.includes('queryTxt ETIMEOUT') ||
    raw.includes('querySrv ETIMEOUT') ||
    raw.includes('ENOTFOUND')
  ) {
    return 'MongoDB DNS/SRV lookup failed. Verify cluster hostname in MONGODB_URI.';
  }
  if (
    raw.includes('not authorized') ||
    raw.includes('command ping requires authentication') ||
    (err as { code?: number })?.code === 13
  ) {
    return 'MongoDB authorization failed. Ensure Atlas user has readWrite permissions on the target database.';
  }

  return sanitized;
}

/**
 * Register Mongoose connection event listeners once.
 */
function registerConnectionEvents(): void {
  if (listenersRegistered) return;
  listenersRegistered = true;

  mongoose.connection.on('error', (err) => {
    logger.error({ err: sanitizeMongoError(err) }, 'MongoDB connection error');
  });

  mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB disconnected');
  });

  mongoose.connection.on('reconnected', () => {
    const dbName = mongoose.connection.name || 'moneylens';
    logger.info({ database: dbName }, 'MongoDB reconnected');
  });
}

/**
 * Connect to MongoDB once at startup with a 10-second server selection timeout.
 * Logs only "MongoDB connected" with the database name (never the URI or credentials).
 */
export async function connectDB(): Promise<typeof mongoose> {
  // If already connected or connecting, return immediately
  if (mongoose.connection.readyState === 1) {
    return mongoose;
  }
  if (mongoose.connection.readyState === 2) {
    return mongoose;
  }

  registerConnectionEvents();

  try {
    await mongoose.connect(env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
    });

    const dbName = mongoose.connection.name || 'moneylens';
    logger.info({ database: dbName }, 'MongoDB connected');
    return mongoose;
  } catch (err) {
    const sanitizedMsg = sanitizeMongoError(err);
    logger.error({ err: sanitizedMsg }, 'Failed to connect to MongoDB');
    throw new Error(sanitizedMsg);
  }
}

/**
 * Cleanly disconnect from MongoDB.
 */
export async function disconnectDB(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    try {
      await mongoose.disconnect();
      logger.info('MongoDB disconnected cleanly');
    } catch (err) {
      logger.error({ err: sanitizeMongoError(err) }, 'Error during MongoDB disconnect');
    }
  }
}

/**
 * Attach graceful shutdown handlers for SIGINT and SIGTERM.
 */
export function setupGracefulShutdown(server?: Server): void {
  const shutdown = async (signal: string) => {
    logger.info({ signal }, `Received ${signal}, initiating graceful shutdown...`);

    const forceTimer = setTimeout(() => {
      logger.error('Forced shutdown timeout (10s) exceeded. Exiting immediately.');
      process.exit(1);
    }, 10000);
    forceTimer.unref();

    if (server) {
      server.close(async () => {
        await disconnectDB();
        logger.info('HTTP server and database connections closed. Exiting process.');
        process.exit(0);
      });
    } else {
      await disconnectDB();
      logger.info('Database connection closed. Exiting process.');
      process.exit(0);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
