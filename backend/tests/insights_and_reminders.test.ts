import request from 'supertest';
import { createApp } from '../src/app.js';
import { User } from '../src/models/User.js';
import { Transaction } from '../src/models/Transaction.js';
import { Insight } from '../src/models/Insight.js';
import { Reminder } from '../src/models/Reminder.js';
import { env } from '../src/config/env.js';
import { validateLLMNumbers } from '../src/services/insightService.js';

describe('Phase 6: Insights, Anomalies, Reminders & Recommendations Integration Tests', () => {
  const app = createApp();
  const csrfHeader = { 'X-Requested-With': 'moneylens' };
  const originalFetch = global.fetch;

  let userACookie: string;
  let userAId: string;
  let userBCookie: string;

  beforeEach(async () => {
    // 1. Register User Alpha
    const regARes = await request(app)
      .post('/api/v1/auth/register')
      .set(csrfHeader)
      .send({
        name: 'Alpha Insights',
        email: 'alpha.insights@example.com',
        password: 'Password123',
      });
    const cookiesA = (regARes.headers['set-cookie'] as unknown as string[]) || [];
    userACookie = cookiesA.find((c) => c.startsWith(`${env.COOKIE_NAME}=`))!;
    const userA = await User.findOne({ email: 'alpha.insights@example.com' });
    userAId = userA!._id.toString();

    // 2. Register User Beta
    const regBRes = await request(app)
      .post('/api/v1/auth/register')
      .set(csrfHeader)
      .send({
        name: 'Beta Insights',
        email: 'beta.insights@example.com',
        password: 'Password123',
      });
    const cookiesB = (regBRes.headers['set-cookie'] as unknown as string[]) || [];
    userBCookie = cookiesB.find((c) => c.startsWith(`${env.COOKIE_NAME}=`))!;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  // ======================================================================
  // 1. ANOMALIES & INSIGHT STATUS FEEDBACK
  // ======================================================================
  describe('GET & PATCH /api/v1/insights/anomalies', () => {
    it('should reject unauthenticated request with 401', async () => {
      const res = await request(app).get('/api/v1/insights/anomalies').set(csrfHeader);
      expect(res.status).toBe(401);
    });

    it('should detect and persist anomalies when ML service is UP', async () => {
      // Seed user transactions
      await Transaction.create([
        {
          userId: userAId,
          date: new Date('2026-08-01'),
          amount: 500,
          direction: 'expense',
          category: 'Dining',
          merchant: 'Cafe',
          description: 'Coffee',
          source: 'manual',
          categorySource: 'user',
          fingerprint: 'fp-ins-1',
        },
        {
          userId: userAId,
          date: new Date('2026-08-05'),
          amount: 600,
          direction: 'expense',
          category: 'Dining',
          merchant: 'Cafe',
          description: 'Coffee',
          source: 'manual',
          categorySource: 'user',
          fingerprint: 'fp-ins-2',
        },
        {
          userId: userAId,
          date: new Date('2026-08-15'),
          amount: 8500, // Spike
          direction: 'expense',
          category: 'Dining',
          merchant: 'Luxury Dining',
          description: 'Big Dinner',
          source: 'manual',
          categorySource: 'user',
          fingerprint: 'fp-ins-3',
        },
      ]);

      // Mock ML service anomaly response
      global.fetch = jest.fn().mockImplementation((url: string) => {
        if (url.includes('/anomalies/detect')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              anomalies: [
                {
                  transactionId: 'fp-ins-3',
                  date: '2026-08-15',
                  amount: 8500,
                  category: 'Dining',
                  merchant: 'Luxury Dining',
                  anomalyScore: 88,
                  robustZScore: 4.8,
                  reasonCode: 'AMOUNT_ABOVE_USUAL',
                  explanation: 'Amount of ₹8,500 is unusual compared to your history.',
                  comparisonPeriod: 'Dining history',
                  supportingValues: { actualAmount: 8500, usualMedian: 550 },
                  severity: 'high',
                },
              ],
              transactionsEvaluated: 3,
              anomaliesFound: 1,
              modelVersion: '1.0.0',
            }),
          });
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });

      const res = await request(app)
        .get('/api/v1/insights/anomalies')
        .set(csrfHeader)
        .set('Cookie', [userACookie]);

      expect(res.status).toBe(200);
      expect(res.body.anomalies).toHaveLength(1);
      expect(res.body.anomalies[0].explanation).toContain('unusual compared to your history');
      expect(res.body.disclaimer).toContain('Not flagged as fraud');

      // Verify persisted in MongoDB
      const stored = await Insight.findOne({ userId: userAId, type: 'anomaly' });
      expect(stored).toBeDefined();
      expect(stored!.severity).toBe('high');
      expect(stored!.status).toBe('open');
    });

    it('should update insight status feedback (expected / incorrect / dismissed)', async () => {
      const insight = await Insight.create({
        userId: userAId,
        type: 'anomaly',
        period: 'Last 90 days',
        severity: 'medium',
        explanation: 'Amount is unusual compared to your history.',
        evidence: { transactionId: 'tx-1', amount: 4500 },
        status: 'open',
        modelVersion: '1.0.0',
      });

      // Update to 'expected'
      const patchRes = await request(app)
        .patch(`/api/v1/insights/${insight._id}`)
        .set(csrfHeader)
        .set('Cookie', [userACookie])
        .send({ status: 'expected' });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.insight.status).toBe('expected');

      const updated = await Insight.findById(insight._id);
      expect(updated!.status).toBe('expected');
    });

    it('should enforce user isolation: User Beta cannot update User Alpha insight', async () => {
      const insight = await Insight.create({
        userId: userAId,
        type: 'anomaly',
        period: 'Last 90 days',
        severity: 'medium',
        explanation: 'Alpha secret anomaly',
        evidence: { transactionId: 'tx-1' },
        status: 'open',
        modelVersion: '1.0.0',
      });

      const patchRes = await request(app)
        .patch(`/api/v1/insights/${insight._id}`)
        .set(csrfHeader)
        .set('Cookie', [userBCookie])
        .send({ status: 'dismissed' });

      expect(patchRes.status).toBe(404);
    });

    it('should reject invalid insight status with 422 VALIDATION_ERROR', async () => {
      const insight = await Insight.create({
        userId: userAId,
        type: 'anomaly',
        period: 'Last 90 days',
        severity: 'medium',
        explanation: 'Validation test anomaly',
        evidence: { transactionId: 'tx-2' },
        status: 'open',
        modelVersion: '1.0.0',
      });

      const patchRes = await request(app)
        .patch(`/api/v1/insights/${insight._id}`)
        .set(csrfHeader)
        .set('Cookie', [userACookie])
        .send({ status: 'invalid_garbage_status' });

      expect(patchRes.status).toBe(422);
      expect(patchRes.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject malformed insight ID with 422 VALIDATION_ERROR', async () => {
      const patchRes = await request(app)
        .patch('/api/v1/insights/malformed-not-an-id')
        .set(csrfHeader)
        .set('Cookie', [userACookie])
        .send({ status: 'dismissed' });

      expect(patchRes.status).toBe(422);
      expect(patchRes.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // ======================================================================
  // 2. REMINDERS & RECURRING CHARGES
  // ======================================================================
  describe('Reminders & EMI Dues CRUD', () => {
    it('should create and list a manual reminder with valid dueDay', async () => {
      const postRes = await request(app)
        .post('/api/v1/reminders')
        .set(csrfHeader)
        .set('Cookie', [userACookie])
        .send({
          title: 'Home Loan EMI',
          amount: 32500,
          dueDay: 10,
          category: 'Housing & EMI',
        });

      expect(postRes.status).toBe(201);
      expect(postRes.body.reminder.title).toBe('Home Loan EMI');
      expect(postRes.body.reminder.dueDay).toBe(10);
      expect(postRes.body.reminder.source).toBe('manual');
      expect(postRes.body.reminder.nextDueDate).toBeDefined();

      const listRes = await request(app)
        .get('/api/v1/reminders')
        .set(csrfHeader)
        .set('Cookie', [userACookie]);

      expect(listRes.status).toBe(200);
      expect(listRes.body.reminders).toHaveLength(1);
    });

    it('should validate dueDay range (1 to 31)', async () => {
      const res = await request(app)
        .post('/api/v1/reminders')
        .set(csrfHeader)
        .set('Cookie', [userACookie])
        .send({
          title: 'Invalid Reminder',
          amount: 500,
          dueDay: 45, // Invalid day of month
        });

      expect(res.status).toBe(422);
    });

    it('should update reminder status and delete reminder', async () => {
      const reminder = await Reminder.create({
        userId: userAId,
        title: 'Broadband Bill',
        amount: 999,
        dueDay: 20,
        status: 'active',
      });

      const patchRes = await request(app)
        .patch(`/api/v1/reminders/${reminder._id}`)
        .set(csrfHeader)
        .set('Cookie', [userACookie])
        .send({ status: 'confirmed' });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.reminder.status).toBe('confirmed');

      const delRes = await request(app)
        .delete(`/api/v1/reminders/${reminder._id}`)
        .set(csrfHeader)
        .set('Cookie', [userACookie]);

      expect(delRes.status).toBe(200);
      expect(delRes.body.message).toContain('deleted successfully');
    });

    it('should auto-detect recurring charges from ML service and sync into reminders', async () => {
      await Transaction.create([
        {
          userId: userAId,
          date: new Date('2026-06-10'),
          amount: 649,
          direction: 'expense',
          category: 'Entertainment',
          merchant: 'Netflix',
          description: 'Netflix Monthly Plan',
          source: 'manual',
          categorySource: 'user',
          fingerprint: 'fp-rec-1',
        },
        {
          userId: userAId,
          date: new Date('2026-07-10'),
          amount: 649,
          direction: 'expense',
          category: 'Entertainment',
          merchant: 'Netflix',
          description: 'Netflix Monthly Plan',
          source: 'manual',
          categorySource: 'user',
          fingerprint: 'fp-rec-2',
        },
      ]);

      global.fetch = jest.fn().mockImplementation((url: string) => {
        if (url.includes('/recurring/detect')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              recurringCharges: [
                {
                  merchant: 'Netflix',
                  category: 'Entertainment',
                  cadence: 'monthly',
                  averageAmount: 649,
                  lastAmount: 649,
                  lastDate: '2026-07-10',
                  suggestedDueDay: 10,
                  occurrences: 2,
                  isPriceIncrease: false,
                  isNewSubscription: false,
                  needsReview: false,
                  transactionIds: ['fp-rec-1', 'fp-rec-2'],
                },
              ],
              totalRecurringMonthly: 649,
              priceIncreasesDetected: 0,
              modelVersion: '1.0.0',
            }),
          });
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });

      const res = await request(app)
        .post('/api/v1/reminders/detect')
        .set(csrfHeader)
        .set('Cookie', [userACookie]);

      expect(res.status).toBe(200);
      expect(res.body.reminders.length).toBeGreaterThanOrEqual(1);
      const netflix = res.body.reminders.find((r: any) => r.title === 'Netflix');
      expect(netflix).toBeDefined();
      expect(netflix.source).toBe('detected');
    });
  });

  // ======================================================================
  // 3. RECOMMENDATIONS & LLM VALIDATION
  // ======================================================================
  describe('Recommendations & LLM Number Validation', () => {
    it('should return recommendations from ML engine', async () => {
      global.fetch = jest.fn().mockImplementation((url: string) => {
        if (url.includes('/recommendations/features')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              recommendations: [
                {
                  id: 'rec_food_spike',
                  type: 'category_spend_increase',
                  title: 'Food Spending Surged by 35%',
                  rationale: 'Food spending reached ₹12,000 this month compared to ₹8,800 last month.',
                  evidenceValues: { currentSpend: 12000, previousSpend: 8800, percentIncrease: 36.4 },
                  evidencePeriod: 'Current Month vs Previous Month',
                  rule: 'CATEGORY_SPEND_INCREASE',
                  threshold: '> 20%',
                  estimatedEffect: 'Estimate: ₹2,200 potential monthly savings',
                  actionableNextStep: 'Set a weekly Food budget cap of ₹2,500.',
                  status: 'open',
                  rank: 1,
                },
              ],
              modelVersion: '1.0.0',
            }),
          });
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });

      const res = await request(app)
        .get('/api/v1/insights/recommendations')
        .set(csrfHeader)
        .set('Cookie', [userACookie]);

      expect(res.status).toBe(200);
      expect(res.body.recommendations).toHaveLength(1);
      expect(res.body.recommendations[0].estimatedEffect).toContain('Estimate:');
    });

    it('validateLLMNumbers correctly accepts valid numbers and rejects hallucinated numbers', () => {
      const allowed = [12000, 8800, 36.4, 'Food'];

      // Legitimate rephrase with existing numbers
      const validText = 'Your Food expenses grew to 12000 compared to 8800 last month (up 36.4%).';
      expect(validateLLMNumbers(validText, allowed)).toBe(true);

      // Hallucinated number (e.g. LLM invented 95000 or 450)
      const invalidText = 'Your Food spending is now 95000 with a huge jump.';
      expect(validateLLMNumbers(invalidText, allowed)).toBe(false);

      // Text with no numbers is always safe
      expect(validateLLMNumbers('Please consider reducing your dining out frequency.', allowed)).toBe(true);
    });

    it('falls back cleanly to template text when ML service is DOWN', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Connection failed'));

      const res = await request(app)
        .get('/api/v1/insights/recommendations')
        .set(csrfHeader)
        .set('Cookie', [userACookie]);

      expect(res.status).toBe(200);
      expect(res.body.recommendations).toEqual([]);
    });
  });
});
