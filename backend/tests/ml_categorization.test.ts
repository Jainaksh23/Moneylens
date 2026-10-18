import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { User } from '../src/models/User.js';
import { Transaction } from '../src/models/Transaction.js';
import { ImportJob } from '../src/models/ImportJob.js';

describe('Phase 4: ML Service Categorization & Fallback Integration Tests', () => {
  const app = createApp();
  let userACookie: string;
  let userAId: string;
  const originalFetch = global.fetch;

  beforeAll(async () => {
    // Register user
    const res = await request(app)
      .post('/api/v1/auth/register')
      .set('X-Requested-With', 'moneylens')
      .send({
        name: 'ML Test User',
        email: 'ml.user@example.com',
        password: 'ValidPassword123',
      });
    const cookies = (res.headers['set-cookie'] as unknown as string[]) || [];
    userACookie = cookies[0] || '';

    const user = await User.findOne({ email: 'ml.user@example.com' });
    userAId = user!._id.toString();
  });

  afterEach(() => {
    // Restore global fetch after each test
    global.fetch = originalFetch;
  });

  afterAll(async () => {
    await User.deleteMany({});
    await Transaction.deleteMany({});
    await ImportJob.deleteMany({});
  });

  describe('Manual Transaction Creation with ML Service UP', () => {
    it('should assign ML predicted category, confidence, and modelVersion with categorySource="model"', async () => {
      // Mock global.fetch for ML service
      global.fetch = jest.fn().mockImplementation((url: string) => {
        if (url.includes('/predict/category')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              predictions: [
                {
                  id: 'manual-1',
                  category: 'Food',
                  confidence: 0.9421,
                  needsReview: false,
                  modelVersion: 'v1.0.0',
                },
              ],
              modelVersion: 'v1.0.0',
            }),
          } as Response);
        }
        return originalFetch(url);
      });

      const res = await request(app)
        .post('/api/v1/transactions')
        .set('X-Requested-With', 'moneylens')
        .set('Cookie', userACookie)
        .send({
          date: '2026-10-14',
          amount: 450,
          direction: 'expense',
          description: 'Swiggy dinner order biryani',
          merchant: 'Swiggy',
        });

      expect(res.status).toBe(201);
      expect(res.body.transaction.category).toBe('Food');
      expect(res.body.transaction.categorySource).toBe('model');
      expect(res.body.transaction.categoryConfidence).toBeCloseTo(0.9421, 2);
      expect(res.body.transaction.modelVersion).toBe('v1.0.0');
      expect(res.body.transaction.needsReview).toBe(false);
    });

    it('should flag low-confidence prediction as category="unknown" and needsReview=true', async () => {
      global.fetch = jest.fn().mockImplementation((url: string) => {
        if (url.includes('/predict/category')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              predictions: [
                {
                  id: 'manual-1',
                  category: 'unknown',
                  confidence: 0.312,
                  needsReview: true,
                  modelVersion: 'v1.0.0',
                },
              ],
              modelVersion: 'v1.0.0',
            }),
          } as Response);
        }
        return originalFetch(url);
      });

      const res = await request(app)
        .post('/api/v1/transactions')
        .set('X-Requested-With', 'moneylens')
        .set('Cookie', userACookie)
        .send({
          date: '2026-10-14',
          amount: 120,
          direction: 'expense',
          description: 'Unidentified random vendor 9999',
          merchant: 'unknown',
        });

      expect(res.status).toBe(201);
      expect(res.body.transaction.category).toBe('unknown');
      expect(res.body.transaction.categoryConfidence).toBeCloseTo(0.312, 2);
      expect(res.body.transaction.needsReview).toBe(true);
    });
  });

  describe('Graceful Fallback with ML Service DOWN', () => {
    it('should fall back to rule-based categorizer and not fail transaction creation when ML service is DOWN', async () => {
      // Mock fetch failure (simulating network error / connection refused)
      global.fetch = jest.fn().mockImplementation((url: string) => {
        if (url.includes('/predict/category')) {
          return Promise.reject(new Error('ECONNREFUSED 127.0.0.1:8000'));
        }
        return originalFetch(url);
      });

      const res = await request(app)
        .post('/api/v1/transactions')
        .set('X-Requested-With', 'moneylens')
        .set('Cookie', userACookie)
        .send({
          date: '2026-10-14',
          amount: 22000,
          direction: 'expense',
          description: 'House rent payment to landlord',
          merchant: 'Landlord',
        });

      // Never fail the request!
      expect(res.status).toBe(201);
      expect(res.body.transaction.category).toBe('Rent');
      expect(res.body.transaction.categorySource).toBe('rule');
      expect(res.body.transaction.categoryConfidence).toBeNull();
    });

    it('should fall back during CSV import confirm without failing the import when ML service is DOWN', async () => {
      // Mock ML failure
      global.fetch = jest.fn().mockImplementation((url: string) => {
        if (url.includes('/predict/category')) {
          return Promise.reject(new Error('ML Service Timeout'));
        }
        return originalFetch(url);
      });

      // Stage an import job
      const stagedJob = await ImportJob.create({
        userId: new mongoose.Types.ObjectId(userAId),
        filename: 'test_fallback.csv',
        status: 'preview',
        counts: { accepted: 1, rejected: 0, duplicates: 0 },
        previewTransactions: [
          {
            date: new Date('2026-10-10'),
            amount: 1499,
            currency: 'INR',
            direction: 'expense',
            merchant: 'BESCOM',
            description: 'BESCOM electricity bill',
            category: 'unknown',
            categorySource: 'unknown',
            source: 'csv',
            fingerprint: 'fallback-fingerprint-123',
            isDuplicate: false,
          },
        ],
      });

      const confirmRes = await request(app)
        .post('/api/v1/transactions/import/confirm')
        .set('X-Requested-With', 'moneylens')
        .set('Cookie', userACookie)
        .send({
          importJobId: stagedJob._id.toString(),
          includeDuplicates: false,
        });

      expect(confirmRes.status).toBe(200);
      expect(confirmRes.body.importedCount).toBe(1);

      // Verify the persisted transaction used rule fallback
      const savedTx = await Transaction.findOne({ fingerprint: 'fallback-fingerprint-123' });
      expect(savedTx).toBeDefined();
      expect(savedTx!.category).toBe('Bills & Utilities');
      expect(savedTx!.categorySource).toBe('rule');
    });
  });

  describe('User Feedback and Needs Review Filtering', () => {
    it('should clear needsReview and set categorySource="user" on PATCH recategorization', async () => {
      const tx = await Transaction.create({
        userId: new mongoose.Types.ObjectId(userAId),
        date: new Date('2026-10-14'),
        amount: 850,
        currency: 'INR',
        direction: 'expense',
        merchant: 'unknown',
        description: 'Store purchase pending review',
        category: 'unknown',
        categorySource: 'unknown',
        needsReview: true,
        source: 'manual',
        fingerprint: `fp-review-${Date.now()}`,
      });

      expect(tx.needsReview).toBe(true);

      const patchRes = await request(app)
        .patch(`/api/v1/transactions/${tx._id}`)
        .set('X-Requested-With', 'moneylens')
        .set('Cookie', userACookie)
        .send({ category: 'Shopping' });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.transaction.category).toBe('Shopping');
      expect(patchRes.body.transaction.categorySource).toBe('user');
      expect(patchRes.body.transaction.needsReview).toBe(false);
    });

    it('should filter transactions by needsReview=true', async () => {
      const res = await request(app)
        .get('/api/v1/transactions?needsReview=true')
        .set('X-Requested-With', 'moneylens')
        .set('Cookie', userACookie);

      expect(res.status).toBe(200);
      for (const item of res.body.items) {
        expect(item.needsReview).toBe(true);
      }
    });
  });
});
