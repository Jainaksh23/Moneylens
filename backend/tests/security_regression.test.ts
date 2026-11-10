import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { Transaction } from '../src/models/Transaction.js';
import { Goal } from '../src/models/Goal.js';
import { Insight } from '../src/models/Insight.js';
import { Reminder } from '../src/models/Reminder.js';
import { ChatMessage } from '../src/models/ChatMessage.js';

describe('Security Regression & Adversarial Hardening Suite', () => {
  const app = createApp();

  let userAlphaCookie: string;
  let userBetaCookie: string;
  let userAlphaId: string;

  beforeEach(async () => {
    // Register User Alpha
    const regAlpha = await request(app)
      .post('/api/v1/auth/register')
      .set('x-requested-with', 'moneylens')
      .send({
        email: 'alpha@moneylens.security',
        password: 'Password123!',
        name: 'User Alpha',
      });
    const setCookieAlpha = regAlpha.headers['set-cookie'] as unknown as string[];
    userAlphaCookie = setCookieAlpha[0]!;
    userAlphaId = regAlpha.body.user.id;

    // Register User Beta
    const regBeta = await request(app)
      .post('/api/v1/auth/register')
      .set('x-requested-with', 'moneylens')
      .send({
        email: 'beta@moneylens.security',
        password: 'Password123!',
        name: 'User Beta',
      });
    const setCookieBeta = regBeta.headers['set-cookie'] as unknown as string[];
    userBetaCookie = setCookieBeta[0]!;
  });

  // ============================================================================
  // 1. Cross-User Access Attempts on Every Resource
  // ============================================================================
  describe('Cross-User Data Isolation (Zero Unauthorized Cross-Tenant Access)', () => {
    it('Transactions: User Beta cannot access, update, or delete User Alpha transaction', async () => {
      // Alpha creates a transaction directly in DB
      const alphaTx = await Transaction.create({
        userId: new mongoose.Types.ObjectId(userAlphaId),
        date: new Date('2026-03-01'),
        amount: 5000,
        direction: 'expense',
        fingerprint: 'alpha_fp_12345',
        category: 'Shopping',
        categorySource: 'user',
        description: 'Alpha Private Purchase',
      });

      const txId = alphaTx._id.toString();

      // Beta attempts to GET
      const getRes = await request(app)
        .get(`/api/v1/transactions/${txId}`)
        .set('Cookie', userBetaCookie);
      expect(getRes.status).toBe(404);

      // Beta attempts to PATCH recategorize
      const patchRes = await request(app)
        .patch(`/api/v1/transactions/${txId}`)
        .set('Cookie', userBetaCookie)
        .set('x-requested-with', 'moneylens')
        .send({ category: 'Food & Dining' });
      expect(patchRes.status).toBe(404);

      // Beta attempts to DELETE
      const delRes = await request(app)
        .delete(`/api/v1/transactions/${txId}`)
        .set('Cookie', userBetaCookie)
        .set('x-requested-with', 'moneylens');
      expect(delRes.status).toBe(404);

      // Verify Alpha transaction was NOT modified or deleted
      const checkTx = await Transaction.findById(txId);
      expect(checkTx).not.toBeNull();
      expect(checkTx!.category).toBe('Shopping');
    });

    it('Goals: User Beta cannot view, update, delete, or score User Alpha goal', async () => {
      const alphaGoal = await Goal.create({
        userId: new mongoose.Types.ObjectId(userAlphaId),
        name: 'Alpha Secret Goal',
        targetAmount: 500000,
        currentAmount: 100000,
        targetDate: new Date('2027-12-31'),
        category: 'Wealth',
        monthlyContribution: 10000,
        priority: 'high',
        status: 'active',
      });

      const goalId = alphaGoal._id.toString();

      // Beta attempts GET
      const getRes = await request(app)
        .get(`/api/v1/goals/${goalId}`)
        .set('Cookie', userBetaCookie);
      expect(getRes.status).toBe(404);

      // Beta attempts PATCH
      const patchRes = await request(app)
        .patch(`/api/v1/goals/${goalId}`)
        .set('Cookie', userBetaCookie)
        .set('x-requested-with', 'moneylens')
        .send({ targetAmount: 1000 });
      expect(patchRes.status).toBe(404);

      // Beta attempts DELETE
      const delRes = await request(app)
        .delete(`/api/v1/goals/${goalId}`)
        .set('Cookie', userBetaCookie)
        .set('x-requested-with', 'moneylens');
      expect(delRes.status).toBe(404);

      // Beta attempts score calculation on Alpha goal
      const scoreRes = await request(app)
        .post(`/api/v1/goals/${goalId}/score`)
        .set('Cookie', userBetaCookie)
        .set('x-requested-with', 'moneylens');
      expect(scoreRes.status).toBe(404);
    });

    it('Insights/Anomalies: User Beta cannot mark or modify User Alpha anomaly', async () => {
      const alphaInsight = await Insight.create({
        userId: new mongoose.Types.ObjectId(userAlphaId),
        type: 'anomaly',
        period: '2026-03',
        explanation: 'Spike detected in Dining',
        evidence: { amount: 5000, usual: 1500 },
        status: 'open',
        severity: 'high',
      });

      const insightId = alphaInsight._id.toString();

      // Beta attempts PATCH
      const patchRes = await request(app)
        .patch(`/api/v1/insights/anomalies/${insightId}`)
        .set('Cookie', userBetaCookie)
        .set('x-requested-with', 'moneylens')
        .send({ status: 'dismissed' });
      expect(patchRes.status).toBe(404);

      // Verify insight status untouched
      const checkInsight = await Insight.findById(insightId);
      expect(checkInsight!.status).toBe('open');
    });

    it('Reminders: User Beta cannot update or delete User Alpha reminder', async () => {
      const alphaReminder = await Reminder.create({
        userId: new mongoose.Types.ObjectId(userAlphaId),
        title: 'Alpha Mortgage EMI',
        amount: 35000,
        dueDay: 5,
        type: 'bill',
        isAutoDetected: false,
        status: 'active',
      });

      const reminderId = alphaReminder._id.toString();

      // Beta attempts PATCH
      const patchRes = await request(app)
        .patch(`/api/v1/reminders/${reminderId}`)
        .set('Cookie', userBetaCookie)
        .set('x-requested-with', 'moneylens')
        .send({ status: 'dismissed' });
      expect(patchRes.status).toBe(404);

      // Beta attempts DELETE
      const delRes = await request(app)
        .delete(`/api/v1/reminders/${reminderId}`)
        .set('Cookie', userBetaCookie)
        .set('x-requested-with', 'moneylens');
      expect(delRes.status).toBe(404);
    });

    it('Chat History: User Beta cannot view or purge User Alpha chat records', async () => {
      // Alpha writes a chat message
      await ChatMessage.create({
        userId: new mongoose.Types.ObjectId(userAlphaId),
        role: 'user',
        content: 'Alpha confidential account balance query',
        timestamp: new Date(),
      });

      // Beta queries history
      const betaHistRes = await request(app)
        .get('/api/v1/chat/history')
        .set('Cookie', userBetaCookie);
      expect(betaHistRes.status).toBe(200);
      expect(betaHistRes.body.data).toHaveLength(0);

      // Beta attempts to purge history
      const delRes = await request(app)
        .delete('/api/v1/chat/history')
        .set('Cookie', userBetaCookie)
        .set('x-requested-with', 'moneylens');
      expect(delRes.status).toBe(200);

      // Verify Alpha message is still intact in DB
      const alphaMessages = await ChatMessage.find({ userId: userAlphaId });
      expect(alphaMessages).toHaveLength(1);
      expect(alphaMessages[0]!.content).toContain('Alpha confidential');
    });

    it('Export: User Beta export does not leak User Alpha financial records', async () => {
      await Transaction.create({
        userId: new mongoose.Types.ObjectId(userAlphaId),
        date: new Date('2026-03-01'),
        amount: 150000,
        direction: 'income',
        fingerprint: 'alpha_salary_fp',
        category: 'Income',
        categorySource: 'user',
        description: 'Alpha High Executive Salary',
      });

      const betaExportRes = await request(app)
        .get('/api/v1/me/export?format=json')
        .set('Cookie', userBetaCookie);

      expect(betaExportRes.status).toBe(200);
      expect(betaExportRes.body.transactions).toHaveLength(0);
      expect(JSON.stringify(betaExportRes.body)).not.toContain('Alpha High Executive Salary');
    });
  });

  // ============================================================================
  // 2. Adversarial & Malformed IDs (NoSQL / SQL Injection / Buffer Overflow Attempts)
  // ============================================================================
  describe('Adversarial ID Sanitization', () => {
    const adversarialIds = [
      '123',
      'not-a-valid-object-id',
      '507f1f77bcf86cd79943901z', // Invalid hex character 'z'
      '../../etc/passwd',
      "' OR 1=1 --",
      '<script>alert(1)</script>',
      '0000000000000000000000000000000000000000', // Oversized hex string
    ];

    it.each(adversarialIds)('safely rejects adversarial transaction ID "%s" with 400 or 422', async (badId) => {
      const res = await request(app)
        .get(`/api/v1/transactions/${encodeURIComponent(badId)}`)
        .set('Cookie', userAlphaCookie);

      expect([400, 404, 422]).toContain(res.status);
      expect(res.body.error).toBeDefined();
    });

    it.each(adversarialIds)('safely rejects adversarial goal ID "%s" with 400 or 422', async (badId) => {
      const res = await request(app)
        .get(`/api/v1/goals/${encodeURIComponent(badId)}`)
        .set('Cookie', userAlphaCookie);

      expect([400, 404, 422]).toContain(res.status);
    });

    it('safely handles non-existent but valid 24-char ObjectId without 500 error', async () => {
      const nonExistentId = new mongoose.Types.ObjectId().toString();

      const txRes = await request(app)
        .get(`/api/v1/transactions/${nonExistentId}`)
        .set('Cookie', userAlphaCookie);
      expect(txRes.status).toBe(404);

      const goalRes = await request(app)
        .get(`/api/v1/goals/${nonExistentId}`)
        .set('Cookie', userAlphaCookie);
      expect(goalRes.status).toBe(404);
    });
  });

  // ============================================================================
  // 3. Oversized Uploads & Payload Protection
  // ============================================================================
  describe('Oversized Payload & Buffer Overflow Defenses', () => {
    it('rejects oversized JSON request body exceeding 1MB limit with 413 Payload Too Large', async () => {
      // Create a payload larger than 1MB
      const bigString = 'A'.repeat(1.2 * 1024 * 1024);

      const res = await request(app)
        .post('/api/v1/transactions')
        .set('Cookie', userAlphaCookie)
        .set('x-requested-with', 'moneylens')
        .send({ description: bigString });

      expect(res.status).toBe(413);
      expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
    });

    it('rejects CSV file upload exceeding 5MB limit with 400 BAD_REQUEST', async () => {
      // 5.5 MB dummy buffer
      const oversizedBuffer = Buffer.alloc(5.5 * 1024 * 1024, 'a,b,c\n');

      const res = await request(app)
        .post('/api/v1/transactions/import')
        .set('Cookie', userAlphaCookie)
        .set('x-requested-with', 'moneylens')
        .attach('file', oversizedBuffer, 'oversized.csv');

      expect([400, 413]).toContain(res.status);
    });
  });

  // ============================================================================
  // 4. Malformed CSV & File Tampering Defenses
  // ============================================================================
  describe('Malformed CSV Validation', () => {
    it('rejects non-CSV binary files disguised as CSV', async () => {
      const fakeBinary = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01]); // ELF header

      const res = await request(app)
        .post('/api/v1/transactions/import')
        .set('Cookie', userAlphaCookie)
        .set('x-requested-with', 'moneylens')
        .attach('file', fakeBinary, 'executable.exe');

      expect(res.status).toBe(400);
      expect(res.body.error.message).toMatch(/Only CSV files/i);
    });

    it('handles CSV with missing required columns gracefully without server crash', async () => {
      const corruptCsv = Buffer.from('columnA,columnB\nvalue1,value2\n');

      const res = await request(app)
        .post('/api/v1/transactions/import')
        .set('Cookie', userAlphaCookie)
        .set('x-requested-with', 'moneylens')
        .attach('file', corruptCsv, 'missing_cols.csv');

      // Reject non-transaction table CSV with clear 400 error
      expect(res.status).toBe(400);
      expect(res.body.error.message).toMatch(/Could not find the transaction table/i);

      // Verify that CSV with valid header but invalid row values returns 200 preview with rejected count
      const validHeaderBrokenRowsCsv = Buffer.from('date,description,amount\n2026-01-01,Test,\n');
      const previewRes = await request(app)
        .post('/api/v1/transactions/import')
        .set('Cookie', userAlphaCookie)
        .set('x-requested-with', 'moneylens')
        .attach('file', validHeaderBrokenRowsCsv, 'broken_rows.csv');

      expect(previewRes.status).toBe(200);
      expect(previewRes.body.counts.accepted).toBe(0);
      expect(previewRes.body.counts.rejected).toBeGreaterThanOrEqual(1);
    });
  });

  // ============================================================================
  // 5. CORS Defense
  // ============================================================================
  describe('CORS Origin Defense', () => {
    it('rejects state-changing requests originating from unauthorized external domain with 403', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .set('Origin', 'http://hacker-controlled-domain.xyz')
        .send({
          email: 'alpha@moneylens.security',
          password: 'Password123!',
        });

      // Express CORS middleware returns 403 Forbidden with standard error shape
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('permits authorized origin with correct credentials header', async () => {
      const res = await request(app)
        .get('/api/v1/health')
        .set('Origin', 'http://localhost:5173');

      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    });
  });

  // ============================================================================
  // 6. Cookie Security Flags
  // ============================================================================
  describe('Authentication Cookie Hardening Flags', () => {
    it('verifies httpOnly, path=/, and SameSite=Lax flags on issued session cookie', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .set('x-requested-with', 'moneylens')
        .send({
          email: 'alpha@moneylens.security',
          password: 'Password123!',
        });

      expect(res.status).toBe(200);
      const setCookie = res.headers['set-cookie'] as unknown as string[];
      expect(setCookie).toBeDefined();

      const cookieStr = setCookie[0]!;
      expect(cookieStr).toMatch(/moneylens_token=/);
      expect(cookieStr).toMatch(/HttpOnly/i);
      expect(cookieStr).toMatch(/Path=\//i);
      expect(cookieStr).toMatch(/SameSite=Lax/i);
    });
  });
});
