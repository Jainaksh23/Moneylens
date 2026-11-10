import request from 'supertest';
import { createApp } from '../src/app.js';
import { dbHealth } from '../src/routes/health.routes.js';

describe('Backend Health & Core Middleware Tests', () => {
  const app = createApp();

  it('GET /api/v1/health should return 200 with status ok and X-Request-Id header', async () => {
    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
    const requestId = res.headers['x-request-id'];
    expect(requestId).toBeDefined();
    expect(typeof requestId).toBe('string');
    expect((requestId as string).length).toBeGreaterThan(0);
  });

  it('GET /health (root liveness) should return 200 with status ok', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('GET /health/ready should return 200 when MongoDB is connected without leaking internals', async () => {
    const res = await request(app).get('/health/ready');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.checks.database).toBe('connected');
    expect(typeof res.body.checks.groqConfigured).toBe('boolean');
    expect(typeof res.body.checks.internalKeyConfigured).toBe('boolean');
    expect(typeof res.body.checks.mlServiceConfigured).toBe('boolean');
    // Ensure no internals leaked
    expect(res.body).not.toHaveProperty('uri');
    expect(res.body).not.toHaveProperty('host');
  });

  it('GET /api/v1/health/ready should also return 200 when MongoDB is connected', async () => {
    const res = await request(app).get('/api/v1/health/ready');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.checks.database).toBe('connected');
    expect(typeof res.body.checks.groqConfigured).toBe('boolean');
  });

  it('GET /api/v1/ready should return 200 when MongoDB is connected without leaking internals', async () => {
    const res = await request(app).get('/api/v1/ready');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.checks.database).toBe('connected');
    expect(typeof res.body.checks.groqConfigured).toBe('boolean');
    expect(typeof res.body.checks.internalKeyConfigured).toBe('boolean');
    expect(typeof res.body.checks.mlServiceConfigured).toBe('boolean');
    expect(res.body).not.toHaveProperty('uri');
    expect(res.body).not.toHaveProperty('host');
  });

  it('GET /api/v1/ready should return 503 when database is disconnected', async () => {
    const readyStateSpy = jest.spyOn(dbHealth, 'isReady').mockReturnValue(false);

    const res = await request(app).get('/api/v1/ready');
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('unavailable');
    expect(res.body.checks.database).toBe('disconnected');
    expect(typeof res.body.checks.groqConfigured).toBe('boolean');

    readyStateSpy.mockRestore();
  });

  it('should return 503 when database is disconnected', async () => {
    const readyStateSpy = jest.spyOn(dbHealth, 'isReady').mockReturnValue(false);

    const res = await request(app).get('/health/ready');
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('unavailable');
    expect(res.body.checks.database).toBe('disconnected');
    expect(typeof res.body.checks.groqConfigured).toBe('boolean');

    readyStateSpy.mockRestore();
  });

  it('should propagate incoming X-Request-Id header', async () => {
    const customId = 'test-trace-id-12345';
    const res = await request(app)
      .get('/api/v1/health')
      .set('x-request-id', customId);

    expect(res.status).toBe(200);
    expect(res.headers['x-request-id']).toBe(customId);
  });

  it('GET /api/v1/non-existent-route should return standard 404 JSON format', async () => {
    const res = await request(app).get('/api/v1/non-existent-route');

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.error.message).toBeDefined();
    expect(res.body.requestId).toBeDefined();
  });

  it('should never rate-limit /api/v1/health even after 500 requests while route limiters remain active', async () => {
    const express = (await import('express')).default;
    const { generalLimiter, loginLimiter } = await import('../src/middlewares/rateLimiter.js');
    const { healthRouter } = await import('../src/routes/health.routes.js');

    const testApp = express();
    // Mount health probes before limiter, and apply generalLimiter to general routes
    testApp.use('/api/v1', healthRouter);
    testApp.use(generalLimiter);
    testApp.post('/api/v1/auth/login', loginLimiter, (_req, res) => {
      res.status(200).json({ ok: true });
    });

    // Send 500 requests to /api/v1/health in concurrent batches from simulated orchestrator
    const batchSize = 50;
    for (let i = 0; i < 500; i += batchSize) {
      const results = await Promise.all(
        Array.from({ length: batchSize }, () => request(testApp).get('/api/v1/health')),
      );
      for (const res of results) {
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ status: 'ok' });
      }
    }

    // Verify login rate limiter triggers 429 when its limit (10) is exceeded
    let loginHit429 = false;
    for (let i = 0; i < 15; i++) {
      const res = await request(testApp).post('/api/v1/auth/login');
      if (res.status === 429) {
        loginHit429 = true;
        break;
      }
    }
    expect(loginHit429).toBe(true);

    // And /api/v1/health STILL returns 200 without ever hitting 429
    const resAfter = await request(testApp).get('/api/v1/health');
    expect(resAfter.status).toBe(200);
    expect(resAfter.body).toEqual({ status: 'ok' });
  }, 30000);
});
