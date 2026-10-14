import pino from 'pino';
import { env } from '../config/env.js';

export const logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : env.NODE_ENV === 'production' ? 'info' : 'debug',
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-internal-key"]',
      'password',
      'token',
      'accessToken',
      'refreshToken',
      'apiKey',
      'file',
      'rawFile',
      '*.password',
      '*.token',
      '*.secret',
    ],
    remove: true,
  },
});
