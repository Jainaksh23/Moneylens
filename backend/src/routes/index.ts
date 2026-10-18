import { Router } from 'express';
import { healthRouter } from './health.routes.js';
import { authRouter } from './auth.routes.js';
import { transactionRouter } from './transaction.routes.js';
import { analyticsRouter } from './analytics.routes.js';
import { forecastRouter } from './forecast.routes.js';
import { goalsRouter } from './goals.routes.js';
import { insightsRouter } from './insights.routes.js';
import { remindersRouter } from './reminders.routes.js';
import chatRouter from './chat.routes';
import { meRouter } from './me.routes.js';

export const apiV1Router = Router();

apiV1Router.use('/', healthRouter);
apiV1Router.use('/auth', authRouter);
apiV1Router.use('/me', meRouter);
apiV1Router.use('/transactions', transactionRouter);
apiV1Router.use('/analytics', analyticsRouter);
apiV1Router.use('/forecast', forecastRouter);
apiV1Router.use('/goals', goalsRouter);
apiV1Router.use('/insights', insightsRouter);
apiV1Router.use('/reminders', remindersRouter);
apiV1Router.use('/chat', chatRouter);
