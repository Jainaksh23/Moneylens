import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';

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
  server.close(() => {
    logger.info('HTTP server closed. Exiting process.');
    process.exit(0);
  });

  // Force close after 10s timeout
  setTimeout(() => {
    logger.error('Forced shutdown timeout exceeded. Exiting immediately.');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
