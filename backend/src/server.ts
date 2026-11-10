import { createApp } from './app.js';
import { env } from './config/env.js';
import { connectDB, setupGracefulShutdown } from './config/db.js';
import { logger } from './utils/logger.js';

async function startServer() {
  try {
    // 1. Connect once to MongoDB at startup (serverSelectionTimeoutMS: 10000)
    await connectDB();

    // 2. Initialize Express application
    const app = createApp();

    // 3. Start HTTP server binding explicitly to 0.0.0.0
    const server = app.listen(env.PORT, '0.0.0.0', () => {
      logger.info(
        {
          port: env.PORT,
          env: env.NODE_ENV,
          groqConfigured: Boolean(env.GROQ_API_KEY && env.GROQ_API_KEY.trim().length > 0),
          internalKeyConfigured: Boolean(env.INTERNAL_API_KEY && env.INTERNAL_API_KEY.trim().length > 0),
          mlServiceConfigured: Boolean(env.ML_SERVICE_URL && env.ML_SERVICE_URL.trim().length > 0),
        },
        `🚀 MoneyLens Backend Gateway started on port ${env.PORT}`,
      );
    });

    // 4. Register graceful shutdown on SIGINT / SIGTERM
    setupGracefulShutdown(server);
  } catch (err) {
    logger.fatal(
      { err: err instanceof Error ? err.message : String(err) },
      'Fatal error during server startup',
    );
    process.exit(1);
  }
}

startServer();
