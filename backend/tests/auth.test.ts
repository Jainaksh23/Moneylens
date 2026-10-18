import request from 'supertest';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';

describe('Authentication, Authorization & Security Tests (Phase 2)', () => {
  const app = createApp();

  const validUser = {
    name: 'Aarav Patel',
    email: 'aarav.patel@example.com',
    password: 'SecurePassword123',
  };

  const csrfHeader = { 'X-Requested-With': 'moneylens' };

  // ==========================================
  // 1. REGISTER VALIDATION
  // ==========================================
  describe('POST /api/v1/auth/register - Validation', () => {
    it('should reject registration when name is missing or empty', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .set(csrfHeader)
        .send({
          email: 'valid@example.com',
          password: 'Password123',
        });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(Array.isArray(res.body.error.details)).toBe(true);
    });

    it('should reject registration with invalid email format', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .set(csrfHeader)
        .send({
          name: 'Test User',
          email: 'not-an-email',
          password: 'Password123',
        });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject registration when CSRF header is missing', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send(validUser);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  // ==========================================
  // 2. WEAK PASSWORD REJECTION
  // ==========================================
  describe('POST /api/v1/auth/register - Password Policy', () => {
    it('should reject password shorter than 8 characters', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .set(csrfHeader)
        .send({
          name: 'Test User',
          email: 'shortpass@example.com',
          password: 'Pass1',
        });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject password without numbers (letters only)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .set(csrfHeader)
        .send({
          name: 'Test User',
          email: 'nonum@example.com',
          password: 'OnlyLettersPassword',
        });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject password without letters (numbers only)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .set(csrfHeader)
        .send({
          name: 'Test User',
          email: 'noletter@example.com',
          password: '1234567890',
        });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // ==========================================
  // 3. DUPLICATE EMAIL REJECTION
  // ==========================================
  describe('POST /api/v1/auth/register - Duplicate Email', () => {
    it('should successfully register a valid user and return 201 without passwordHash', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .set(csrfHeader)
        .send(validUser);

      expect(res.status).toBe(201);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe(validUser.email.toLowerCase());
      expect(res.body.user.name).toBe(validUser.name);
      expect(res.body.user.preferences).toEqual({ currency: 'INR', dateFormat: 'DD/MM/YYYY' });
      // Critical security check: passwordHash MUST NOT be returned
      expect(res.body.user.passwordHash).toBeUndefined();
      expect(res.body.passwordHash).toBeUndefined();

      // Verify cookie is set
      const cookies = (res.headers['set-cookie'] as unknown as string[]) || [];
      expect(cookies.length).toBeGreaterThan(0);
      const authCookie = cookies.find((c) => c.startsWith(`${env.COOKIE_NAME}=`));
      expect(authCookie).toBeDefined();
      expect(authCookie).toMatch(/HttpOnly/i);
      expect(authCookie).toMatch(/SameSite=Lax/i);
    });

    it('should reject registration with duplicate email (case-insensitive) with 409 CONFLICT', async () => {
      // First ensure user exists in this isolated test
      await request(app)
        .post('/api/v1/auth/register')
        .set(csrfHeader)
        .send(validUser);

      const res = await request(app)
        .post('/api/v1/auth/register')
        .set(csrfHeader)
        .send({
          ...validUser,
          email: validUser.email.toUpperCase(), // Test case normalization
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CONFLICT');
      expect(res.body.error.message).toContain('already exists');
    });
  });

  // ==========================================
  // 4. LOGIN SUCCESS & HTTPONLY COOKIE
  // ==========================================
  describe('POST /api/v1/auth/login - Success', () => {
    it('should authenticate user and set httpOnly cookie, never returning passwordHash', async () => {
      // Register user first
      await request(app)
        .post('/api/v1/auth/register')
        .set(csrfHeader)
        .send(validUser);

      const res = await request(app)
        .post('/api/v1/auth/login')
        .set(csrfHeader)
        .send({
          email: validUser.email,
          password: validUser.password,
        });

      expect(res.status).toBe(200);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe(validUser.email);
      expect(res.body.user.preferences.currency).toBe('INR');
      // Never return passwordHash
      expect(res.body.user.passwordHash).toBeUndefined();
      expect(res.body.passwordHash).toBeUndefined();

      // Check cookie
      const cookies = (res.headers['set-cookie'] as unknown as string[]) || [];
      expect(cookies.length).toBeGreaterThan(0);
      const authCookie = cookies.find((c) => c.startsWith(`${env.COOKIE_NAME}=`));
      expect(authCookie).toBeDefined();
      expect(authCookie).toMatch(/HttpOnly/i);
      expect(authCookie).toMatch(/SameSite=Lax/i);
    });
  });

  // ==========================================
  // 5. LOGIN FAILURE GENERIC (NO EMAIL LEAK)
  // ==========================================
  describe('POST /api/v1/auth/login - Generic Failure Messages', () => {
    it('should return identical generic 401 for non-existent email and wrong password', async () => {
      // Register validUser first so one exists with wrong password
      await request(app)
        .post('/api/v1/auth/register')
        .set(csrfHeader)
        .send(validUser);

      // 1. Non-existent email
      const resNonExistent = await request(app)
        .post('/api/v1/auth/login')
        .set(csrfHeader)
        .send({
          email: 'nonexistent.user.999@example.com',
          password: 'AnyPassword123',
        });

      // 2. Existing user with wrong password
      const resWrongPassword = await request(app)
        .post('/api/v1/auth/login')
        .set(csrfHeader)
        .send({
          email: validUser.email,
          password: 'WrongPassword999',
        });

      expect(resNonExistent.status).toBe(401);
      expect(resWrongPassword.status).toBe(401);

      // Crucial: Exact same generic message to prevent email enumeration
      expect(resNonExistent.body.error.message).toBe('Invalid email or password');
      expect(resWrongPassword.body.error.message).toBe('Invalid email or password');
      expect(resNonExistent.body.error.code).toBe('UNAUTHORIZED');
      expect(resWrongPassword.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  // ==========================================
  // 6. PROTECTED ROUTE WITHOUT COOKIE = 401
  // ==========================================
  describe('GET /api/v1/auth/me - Protected Route', () => {
    it('should return 401 when request has no auth cookie', async () => {
      const res = await request(app).get('/api/v1/auth/me');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 401 when cookie token is invalid', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', [`${env.COOKIE_NAME}=invalid.garbage.jwt.token`]);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 200 with user profile when valid cookie is presented', async () => {
      // Register user first
      await request(app)
        .post('/api/v1/auth/register')
        .set(csrfHeader)
        .send(validUser);

      // Log in to get cookie
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .set(csrfHeader)
        .send({
          email: validUser.email,
          password: validUser.password,
        });

      const cookies = (loginRes.headers['set-cookie'] as unknown as string[]) || [];
      const authCookie = cookies.find((c) => c.startsWith(`${env.COOKIE_NAME}=`))!;

      // Call protected route
      const meRes = await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', [authCookie]);

      expect(meRes.status).toBe(200);
      expect(meRes.body.user).toBeDefined();
      expect(meRes.body.user.email).toBe(validUser.email);
      expect(meRes.body.user.passwordHash).toBeUndefined();
    });
  });

  // ==========================================
  // 7. LOGOUT CLEARS COOKIE
  // ==========================================
  describe('POST /api/v1/auth/logout', () => {
    it('should clear the httpOnly auth cookie on logout', async () => {
      const res = await request(app)
        .post('/api/v1/auth/logout')
        .set(csrfHeader);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Logged out successfully');

      const cookies = (res.headers['set-cookie'] as unknown as string[]) || [];
      expect(cookies.length).toBeGreaterThan(0);
      const clearedCookie = cookies.find((c) => c.startsWith(`${env.COOKIE_NAME}=`));
      expect(clearedCookie).toBeDefined();
      // Cleared cookie should expire in the past or have empty value
      expect(
        clearedCookie!.includes(`${env.COOKIE_NAME}=;`) ||
        clearedCookie!.includes('Expires=Thu, 01 Jan 1970') ||
        clearedCookie!.includes('Max-Age=0'),
      ).toBe(true);
    });
  });

  // ==========================================
  // 8. FORGOT PASSWORD (GENERIC RESPONSE)
  // ==========================================
  describe('POST /api/v1/auth/forgot-password', () => {
    it('should return identical response for existing and non-existing email', async () => {
      const res1 = await request(app)
        .post('/api/v1/auth/forgot-password')
        .set(csrfHeader)
        .send({ email: validUser.email });

      const res2 = await request(app)
        .post('/api/v1/auth/forgot-password')
        .set(csrfHeader)
        .send({ email: 'totally.unknown.email@example.com' });

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
      expect(res1.body.message).toBe(res2.body.message);
      expect(res1.body.message).toContain('If an account with that email exists');
    });
  });

  // ==========================================
  // 9. CORS REJECTS UNKNOWN ORIGIN
  // ==========================================
  describe('CORS Security Defense', () => {
    it('should reject request with unauthorized origin', async () => {
      const res = await request(app)
        .get('/api/v1/health')
        .set('Origin', 'http://malicious-website.com');

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('should allow request from permitted origin with credentials header', async () => {
      const res = await request(app)
        .get('/api/v1/health')
        .set('Origin', 'http://localhost:5173');

      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    });
  });

  // ==========================================
  // 10. RATE LIMITING ON LOGIN
  // ==========================================
  describe('Rate Limiting on /api/v1/auth/login', () => {
    it('should reject after 10 requests with 429 TOO_MANY_REQUESTS', async () => {
      // The authLimiter limit is 10 requests per 15 minutes
      // Send 10 requests (all will return 401 or similar, but are counted against the limit)
      for (let i = 0; i < 10; i++) {
        await request(app)
          .post('/api/v1/auth/login')
          .set(csrfHeader)
          .send({
            email: 'rate-limit-test@example.com',
            password: 'AnyPassword123',
          });
      }

      // The 11th request must be rejected with 429
      const rateLimitedRes = await request(app)
        .post('/api/v1/auth/login')
        .set(csrfHeader)
        .send({
          email: 'rate-limit-test@example.com',
          password: 'AnyPassword123',
        });

      expect(rateLimitedRes.status).toBe(429);
      expect(rateLimitedRes.body.error.code).toBe('TOO_MANY_REQUESTS');
    });
  });
});
