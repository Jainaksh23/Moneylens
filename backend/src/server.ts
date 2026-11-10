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
          groqModel: env.GROQ_MODEL,
          groqBaseUrlHost: 'api.groq.com',
          internalKeyConfigured: Boolean(env.INTERNAL_API_KEY && env.INTERNAL_API_KEY.trim().length > 0),
          mlServiceConfigured: Boolean(env.ML_SERVICE_URL && env.ML_SERVICE_URL.trim().length > 0),
        },
        `🚀 MoneyLens Backend Gateway started on port ${env.PORT}`,
      );

      // Non-blocking background probe of Groq model availability (logs boolean status, never keys)
      if (env.GROQ_API_KEY) {
        import('./services/groqService.js')
          .then(({ groqService }) => {
            groqService.verifyModelAvailability('startup-check').catch(() => {});
          })
          .catch(() => {});
      }

      // Non-blocking background probe of ML RAG status (logged in debug log)
      if (env.ML_SERVICE_URL && env.INTERNAL_API_KEY) {
        import('./services/chatService.js')
          .then(({ chatService }) => {
            chatService.checkRagStatus('startup-probe').catch(() => {});
          })
          .catch(() => {});
      }
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
