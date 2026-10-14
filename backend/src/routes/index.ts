import { Router } from 'express';
import { healthRouter } from './health.routes.js';

export const apiV1Router = Router();

apiV1Router.use('/', healthRouter);
