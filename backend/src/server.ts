import mongoose from 'mongoose';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';

async function startServer() {
  try {
    let mongoUri = env.MONGODB_URI;
    try {
      await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 2500 });
      logger.info('Connected to MongoDB database');
    } catch (connErr) {
      if (env.NODE_ENV === 'development') {
        logger.warn(
          'Configured MongoDB URI is unreachable. Launching embedded MongoDB for local development...',
        );
        const { MongoMemoryServer } = await import('mongodb-memory-server');
        const memoryServer = await MongoMemoryServer.create();
        mongoUri = memoryServer.getUri();
        await mongoose.connect(mongoUri);
        logger.info('Connected to embedded in-memory MongoDB database for development');
      } else {
        throw connErr;
      }
    }

    const app = createApp();

    const server = app.listen(env.PORT, () => {
      logger.info(
        {
          port: env.PORT,
          env: env.NODE_ENV,
          mlServiceUrl: env.ML_SERVICE_URL,
        },
        `🚀 MoneyLens Backend Gateway started on port ${env.PORT}`,
      );
    });

    // Graceful shutdown handling
    const shutdown = (signal: string) => {
      logger.info({ signal }, `Received ${signal}, initiating graceful shutdown...`);
      server.close(async () => {
        try {
          await mongoose.disconnect();
        } catch {
          // Ignore
        }
        logger.info('HTTP server and database connections closed. Exiting process.');
        process.exit(0);
      });

      // Force close after 10s timeout
      setTimeout(() => {
        logger.error('Forced shutdown timeout exceeded. Exiting immediately.');
        process.exit(1);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (err) {
    logger.fatal({ err }, 'Fatal error during server startup');
    process.exit(1);
  }
}

startServer();
