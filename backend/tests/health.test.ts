import request from 'supertest';
import { createApp } from '../src/app.js';

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
