import request from 'supertest';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { User } from '../src/models/User.js';
import { Transaction } from '../src/models/Transaction.js';
import { Goal } from '../src/models/Goal.js';
import { Reminder } from '../src/models/Reminder.js';
import { ChatMessage } from '../src/models/ChatMessage.js';

describe('User Account, Data Export & Deletion Tests (/api/v1/me)', () => {
  const app = createApp();
  const csrfHeader = { 'X-Requested-With': 'moneylens' };

  let authCookie: string;
  let userId: string;

  beforeEach(async () => {
    // Register a test user
    const userPayload = {
      name: 'Priya Sharma',
      email: `priya.${Date.now()}@example.com`,
      password: 'StrongPassword123',
    };

    const res = await request(app)
      .post('/api/v1/auth/register')
      .set(csrfHeader)
      .send(userPayload);

    expect(res.status).toBe(201);
    userId = res.body.user.id;
    const cookies = res.headers['set-cookie'];
    authCookie = Array.isArray(cookies) ? cookies[0] : (cookies as string);

    // Seed test data for this user
    await Transaction.create({
      userId,
      date: new Date('2026-03-15'),
      amount: 1500,
      currency: 'INR',
      direction: 'expense',
      merchant: 'Swiggy',
      description: 'Lunch order',
      category: 'Food & Dining',
      source: 'manual',
      fingerprint: `swiggy-${Date.now()}`,
    });

    await Goal.create({
      userId,
      name: 'Emergency Fund',
      targetAmount: 100000,
      currentAmount: 25000,
      targetDate: new Date('2027-01-01'),
      priority: 'high',
    });

    await Reminder.create({
      userId,
      title: 'Electricity Bill',
      amount: 2200,
      dueDay: 18,
      status: 'active',
    });

    await ChatMessage.create({
      userId,
      role: 'user',
      content: 'How much did I spend on food?',
    });
  });

  describe('GET /api/v1/me', () => {
    it('should return authenticated user profile', async () => {
      const res = await request(app)
        .get('/api/v1/me')
        .set('Cookie', authCookie);

      expect(res.status).toBe(200);
      expect(res.body.user.name).toBe('Priya Sharma');
      expect(res.body.user.preferences.currency).toBe('INR');
      expect(res.body.user.passwordHash).toBeUndefined();
    });

    it('should reject unauthenticated request with 401', async () => {
      const res = await request(app).get('/api/v1/me');
      expect(res.status).toBe(401);
    });
  });

  describe('PATCH /api/v1/me', () => {
    it('should update user name and date preferences', async () => {
      const res = await request(app)
        .patch('/api/v1/me')
        .set('Cookie', authCookie)
        .set(csrfHeader)
        .send({
          name: 'Priya Verma',
          preferences: {
            dateFormat: 'YYYY-MM-DD',
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.user.name).toBe('Priya Verma');
      expect(res.body.user.preferences.dateFormat).toBe('YYYY-MM-DD');
    });
  });

  describe('GET /api/v1/me/export', () => {
    it('should export transactions as CSV', async () => {
      const res = await request(app)
        .get('/api/v1/me/export?format=csv')
        .set('Cookie', authCookie);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain('moneylens_transactions_export.csv');
      expect(res.text).toContain('Date,Amount,Currency,Direction,Merchant,Description,Category');
      expect(res.text).toContain('Swiggy');
      expect(res.text).toContain('1500');
    });

    it('should export full financial bundle as JSON', async () => {
      const res = await request(app)
        .get('/api/v1/me/export?format=json')
        .set('Cookie', authCookie);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/json');
      expect(res.body.transactions).toHaveLength(1);
      expect(res.body.goals).toHaveLength(1);
      expect(res.body.reminders).toHaveLength(1);
      expect(res.body.chatMessages).toHaveLength(1);
      expect(res.body.user.email).toBeDefined();
    });
  });

  describe('DELETE /api/v1/me', () => {
    it('should permanently delete user account and all associated financial data', async () => {
      const res = await request(app)
        .delete('/api/v1/me')
        .set('Cookie', authCookie)
        .set(csrfHeader);

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('permanently deleted');

      // Verify cookies cleared
      const setCookies = res.headers['set-cookie'];
      expect(Array.isArray(setCookies) ? setCookies[0] : setCookies).toContain(
        `${env.COOKIE_NAME}=;`,
      );

      // Verify cascade deletion
      const userAfter = await User.findById(userId);
      expect(userAfter).toBeNull();

      const transactionsAfter = await Transaction.find({ userId });
      expect(transactionsAfter).toHaveLength(0);

      const goalsAfter = await Goal.find({ userId });
      expect(goalsAfter).toHaveLength(0);

      const remindersAfter = await Reminder.find({ userId });
      expect(remindersAfter).toHaveLength(0);

      const chatsAfter = await ChatMessage.find({ userId });
      expect(chatsAfter).toHaveLength(0);
    });
  });
});
