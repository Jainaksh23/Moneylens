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
    expect(res.body).toEqual({
      status: 'ok',
      checks: {
        database: 'connected',
      },
    });
    // Ensure no internals leaked
    expect(res.body).not.toHaveProperty('uri');
    expect(res.body).not.toHaveProperty('host');
    expect(res.body).not.toHaveProperty('database');
  });

  it('GET /api/v1/health/ready should also return 200 when MongoDB is connected', async () => {
    const res = await request(app).get('/api/v1/health/ready');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.checks.database).toBe('connected');
  });

  it('should return 503 when database is disconnected', async () => {
    const readyStateSpy = jest.spyOn(dbHealth, 'isReady').mockReturnValue(false);

    const res = await request(app).get('/health/ready');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      status: 'unavailable',
      checks: {
        database: 'disconnected',
      },
    });

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
});
