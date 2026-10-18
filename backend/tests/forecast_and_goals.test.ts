import request from 'supertest';
import { createApp } from '../src/app.js';
import { User } from '../src/models/User.js';
import { Transaction } from '../src/models/Transaction.js';
import { Goal } from '../src/models/Goal.js';
import { env } from '../src/config/env.js';

describe('Phase 5: Cash-Flow Forecast & Goals Domain Integration Tests', () => {
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
        name: 'User Alpha',
        email: 'alpha.phase5@example.com',
        password: 'Password123',
      });
    const cookiesA = (regARes.headers['set-cookie'] as unknown as string[]) || [];
    userACookie = cookiesA.find((c) => c.startsWith(`${env.COOKIE_NAME}=`))!;
    const userA = await User.findOne({ email: 'alpha.phase5@example.com' });
    userAId = userA!._id.toString();

    // 2. Register User Beta
    const regBRes = await request(app)
      .post('/api/v1/auth/register')
      .set(csrfHeader)
      .send({
        name: 'User Beta',
        email: 'beta.phase5@example.com',
        password: 'Password123',
      });
    const cookiesB = (regBRes.headers['set-cookie'] as unknown as string[]) || [];
    userBCookie = cookiesB.find((c) => c.startsWith(`${env.COOKIE_NAME}=`))!;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  // ========================================================
  // 1. FORECAST ENDPOINTS
  // ========================================================
  describe('GET /api/v1/forecast', () => {
    it('should reject unauthenticated request with 401', async () => {
      const res = await request(app).get('/api/v1/forecast').set(csrfHeader);
      expect(res.status).toBe(401);
    });

    it('should return available: false when user has no transaction history', async () => {
      const res = await request(app)
        .get('/api/v1/forecast')
        .set(csrfHeader)
        .set('Cookie', [userACookie]);

      expect(res.status).toBe(200);
      expect(res.body.available).toBe(false);
      expect(res.body.reason).toContain('No transaction data available');
      expect(res.body.monthlyTrend).toEqual([]);
    });

    it('should return ML-powered forecast when user has transactions and ML is UP', async () => {
      // Seed some transactions for User Alpha across 4 months
      await Transaction.create([
        {
          userId: userAId,
          date: new Date('2026-01-15'),
          amount: 50000,
          direction: 'income',
          description: 'Salary Jan',
          merchant: 'Employer',
          category: 'Income',
          categorySource: 'user',
          source: 'manual',
          fingerprint: 'fp-1-jan',
        },
        {
          userId: userAId,
          date: new Date('2026-01-20'),
          amount: 20000,
          direction: 'expense',
          description: 'Rent Jan',
          merchant: 'Landlord',
          category: 'Housing',
          categorySource: 'user',
          source: 'manual',
          fingerprint: 'fp-2-jan',
        },
        {
          userId: userAId,
          date: new Date('2026-02-15'),
          amount: 55000,
          direction: 'income',
          description: 'Salary Feb',
          merchant: 'Employer',
          category: 'Income',
          categorySource: 'user',
          source: 'manual',
          fingerprint: 'fp-3-feb',
        },
        {
          userId: userAId,
          date: new Date('2026-02-22'),
          amount: 25000,
          direction: 'expense',
          description: 'Rent Feb',
          merchant: 'Landlord',
          category: 'Housing',
          categorySource: 'user',
          source: 'manual',
          fingerprint: 'fp-4-feb',
        },
      ]);

      // Mock ML service forecast response
      global.fetch = jest.fn().mockImplementation((url: string) => {
        if (url.includes('/forecast')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              values: [
                { month: '2026-03', value: 30000, lower: 25000, upper: 35000 },
                { month: '2026-04', value: 30000, lower: 23000, upper: 37000 },
                { month: '2026-05', value: 30000, lower: 21000, upper: 39000 },
              ],
              horizon: 3,
              dataCoverage: { dataPoints: 2, monthsSpan: 2 },
              modelUsed: 'rolling_mean',
              modelVersion: '1.0.0',
              warnings: ['Only 2 months of history.'],
            }),
          });
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });

      const res = await request(app)
        .get('/api/v1/forecast?horizon=3')
        .set(csrfHeader)
        .set('Cookie', [userACookie]);

      expect(res.status).toBe(200);
      expect(res.body.available).toBe(true);
      expect(res.body.forecast).toBeDefined();
      expect(res.body.forecast.modelUsed).toBe('rolling_mean');
      expect(res.body.forecast.values).toHaveLength(3);
      expect(res.body.monthlyTrend.length).toBeGreaterThanOrEqual(2);
    });

    it('should return available: false without fabricating numbers when ML service is DOWN', async () => {
      // Seed transactions
      await Transaction.create([
        {
          userId: userAId,
          date: new Date('2026-01-15'),
          amount: 40000,
          direction: 'income',
          description: 'Salary',
          merchant: 'Employer',
          category: 'Income',
          categorySource: 'user',
          source: 'manual',
          fingerprint: 'fp-down-1',
        },
      ]);

      // Mock ML service down
      global.fetch = jest.fn().mockRejectedValue(new Error('Connection refused'));

      const res = await request(app)
        .get('/api/v1/forecast')
        .set(csrfHeader)
        .set('Cookie', [userACookie]);

      expect(res.status).toBe(200);
      expect(res.body.available).toBe(false);
      expect(res.body.reason).toContain('temporarily unavailable');
      expect(res.body.forecast).toBeUndefined(); // NEVER fabricated
    });
  });

  // ========================================================
  // 2. GOALS CRUD & VALIDATION
  // ========================================================
  describe('Goals CRUD Operations', () => {
    it('should reject unauthenticated requests to /goals', async () => {
      const getRes = await request(app).get('/api/v1/goals').set(csrfHeader);
      expect(getRes.status).toBe(401);

      const postRes = await request(app).post('/api/v1/goals').set(csrfHeader).send({});
      expect(postRes.status).toBe(401);
    });

    it('should validate goal creation inputs', async () => {
      // Target amount <= 0
      const res1 = await request(app)
        .post('/api/v1/goals')
        .set(csrfHeader)
        .set('Cookie', [userACookie])
        .send({
          name: 'Invalid Goal',
          targetAmount: -100,
          targetDate: '2028-12-31',
        });
      expect(res1.status).toBe(422);

      // Past target date
      const res2 = await request(app)
        .post('/api/v1/goals')
        .set(csrfHeader)
        .set('Cookie', [userACookie])
        .send({
          name: 'Past Goal',
          targetAmount: 50000,
          targetDate: '2020-01-01',
        });
      expect(res2.status).toBe(422);

      // Missing name
      const res3 = await request(app)
        .post('/api/v1/goals')
        .set(csrfHeader)
        .set('Cookie', [userACookie])
        .send({
          name: '',
          targetAmount: 50000,
          targetDate: '2028-12-31',
        });
      expect(res3.status).toBe(422);
    });

    it('should create goal and list it for authenticated user with full attributes', async () => {
      const futureDate = '2028-06-30';
      const postRes = await request(app)
        .post('/api/v1/goals')
        .set(csrfHeader)
        .set('Cookie', [userACookie])
        .send({
          name: 'New Car',
          targetAmount: 800000,
          currentAmount: 100000,
          targetDate: futureDate,
          priority: 'high',
          monthlyContribution: 15000,
          expectedReturnRate: 8.5,
        });

      expect(postRes.status).toBe(201);
      const createdGoal = postRes.body.goal;
      expect(createdGoal.name).toBe('New Car');
      expect(createdGoal.targetAmount).toBe(800000);
      expect(createdGoal.currentAmount).toBe(100000);
      expect(createdGoal.priority).toBe('high');
      expect(createdGoal.status).toBe('active');
      expect(createdGoal.monthlyContribution).toBe(15000);
      expect(createdGoal.expectedReturnRate).toBe(8.5);

      // List goals
      const listRes = await request(app)
        .get('/api/v1/goals')
        .set(csrfHeader)
        .set('Cookie', [userACookie]);

      expect(listRes.status).toBe(200);
      expect(listRes.body.goals).toHaveLength(1);
      expect(listRes.body.goals[0]._id).toBe(createdGoal._id);
    });

    it('should enforce user isolation: User Beta cannot view, update, or delete User Alpha goal', async () => {
      // Create goal for User Alpha
      const goalA = await Goal.create({
        userId: userAId,
        name: "Alpha's Secret Fund",
        targetAmount: 200000,
        currentAmount: 50000,
        targetDate: new Date('2028-01-01'),
        priority: 'high',
      });

      // User Beta lists goals -> should be empty
      const listRes = await request(app)
        .get('/api/v1/goals')
        .set(csrfHeader)
        .set('Cookie', [userBCookie]);
      expect(listRes.body.goals).toHaveLength(0);

      // User Beta attempts to update User Alpha's goal -> 404
      const updateRes = await request(app)
        .patch(`/api/v1/goals/${goalA._id}`)
        .set(csrfHeader)
        .set('Cookie', [userBCookie])
        .send({ targetAmount: 999999 });
      expect(updateRes.status).toBe(404);

      // User Beta attempts to delete User Alpha's goal -> 404
      const deleteRes = await request(app)
        .delete(`/api/v1/goals/${goalA._id}`)
        .set(csrfHeader)
        .set('Cookie', [userBCookie]);
      expect(deleteRes.status).toBe(404);

      // Verify goal unchanged
      const checkGoal = await Goal.findById(goalA._id);
      expect(checkGoal!.targetAmount).toBe(200000);
    });

    it('should update goal using PATCH and PUT by exact ID', async () => {
      const goal = await Goal.create({
        userId: userAId,
        name: 'House Downpayment',
        targetAmount: 1500000,
        currentAmount: 300000,
        targetDate: new Date('2029-01-01'),
        priority: 'high',
      });

      // Update via PATCH
      const patchRes = await request(app)
        .patch(`/api/v1/goals/${goal._id}`)
        .set(csrfHeader)
        .set('Cookie', [userACookie])
        .send({ currentAmount: 350000, priority: 'medium' });
      expect(patchRes.status).toBe(200);
      expect(patchRes.body.goal.currentAmount).toBe(350000);
      expect(patchRes.body.goal.priority).toBe('medium');

      // Update via PUT
      const putRes = await request(app)
        .put(`/api/v1/goals/${goal._id}`)
        .set(csrfHeader)
        .set('Cookie', [userACookie])
        .send({ name: 'Dream Home Downpayment', monthlyContribution: 25000 });
      expect(putRes.status).toBe(200);
      expect(putRes.body.goal.name).toBe('Dream Home Downpayment');
      expect(putRes.body.goal.monthlyContribution).toBe(25000);
    });

    it('should delete goal by exact ID', async () => {
      const goal = await Goal.create({
        userId: userAId,
        name: 'Temporary Goal',
        targetAmount: 50000,
        currentAmount: 10000,
        targetDate: new Date('2028-01-01'),
      });

      const delRes = await request(app)
        .delete(`/api/v1/goals/${goal._id}`)
        .set(csrfHeader)
        .set('Cookie', [userACookie]);
      expect(delRes.status).toBe(200);
      expect(delRes.body.message).toContain('deleted successfully');

      const found = await Goal.findById(goal._id);
      expect(found).toBeNull();
    });

    it('should return 422 for malformed goal ID', async () => {
      const res = await request(app)
        .patch('/api/v1/goals/not-a-valid-id')
        .set(csrfHeader)
        .set('Cookie', [userACookie])
        .send({ currentAmount: 5000 });
      expect(res.status).toBe(422);
    });
  });

  // ========================================================
  // 3. GOAL SCORING & WHAT-IF ENDPOINTS
  // ========================================================
  describe('Goal Scoring & What-If Simulation', () => {
    it('should return goal score with band and SIP compounding when ML service is UP', async () => {
      const goal = await Goal.create({
        userId: userAId,
        name: 'Higher Education',
        targetAmount: 1000000,
        currentAmount: 200000,
        targetDate: new Date('2028-12-31'),
        monthlyContribution: 20000,
        expectedReturnRate: 10.0,
      });

      // Mock ML goal score response
      global.fetch = jest.fn().mockImplementation((url: string) => {
        if (url.includes('/goals/score')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              requiredMonthly: 22222.22,
              estimatedMonthlyAvailable: 25000,
              band: 'on_track',
              score: 85,
              sipProjection: {
                monthlyContribution: 20000,
                expectedAnnualReturn: 10.0,
                projectedCorpus: 980000,
                totalInvested: 720000,
                interestEarned: 260000,
                disclaimer: 'SIP return calculation is purely indicative.',
              },
              assumptions: ['Returns are compounded monthly'],
              limitations: ['Past returns do not guarantee future performance'],
              methodology: 'Monte Carlo simulation',
            }),
          });
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });

      const res = await request(app)
        .get(`/api/v1/goals/${goal._id}/score?contribution=22000&annualReturn=12`)
        .set(csrfHeader)
        .set('Cookie', [userACookie]);

      expect(res.status).toBe(200);
      expect(res.body.available).toBe(true);
      expect(res.body.score.band).toBe('on_track');
      expect(res.body.score.score).toBe(85);
      expect(res.body.score.sipProjection.projectedCorpus).toBe(980000);
      expect(res.body.monthsLeft).toBeGreaterThan(0);
    });

    it('should support POST /api/v1/goals/:id/score with what-if body params', async () => {
      const goal = await Goal.create({
        userId: userAId,
        name: 'Trip to Japan',
        targetAmount: 300000,
        currentAmount: 50000,
        targetDate: new Date('2027-10-31'),
      });

      global.fetch = jest.fn().mockImplementation((url: string) => {
        if (url.includes('/goals/score')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              requiredMonthly: 15000,
              estimatedMonthlyAvailable: null,
              band: 'needs_attention',
              score: 60,
              sipProjection: null,
              assumptions: [],
              limitations: [],
              methodology: 'Deterministic shortfall heuristic',
            }),
          });
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });

      const res = await request(app)
        .post(`/api/v1/goals/${goal._id}/score`)
        .set(csrfHeader)
        .set('Cookie', [userACookie])
        .send({ monthlyContribution: 12000, expectedAnnualReturn: 7.5 });

      expect(res.status).toBe(200);
      expect(res.body.available).toBe(true);
      expect(res.body.score.score).toBe(60);
    });

    it('should return available: false gracefully when ML scoring service is DOWN', async () => {
      const goal = await Goal.create({
        userId: userAId,
        name: 'Emergency Fund',
        targetAmount: 500000,
        currentAmount: 100000,
        targetDate: new Date('2028-01-01'),
      });

      global.fetch = jest.fn().mockRejectedValue(new Error('ML connection refused'));

      const res = await request(app)
        .get(`/api/v1/goals/${goal._id}/score`)
        .set(csrfHeader)
        .set('Cookie', [userACookie]);

      expect(res.status).toBe(200);
      expect(res.body.available).toBe(false);
      expect(res.body.reason).toContain('temporarily unavailable');
    });

    it('should support standalone POST /api/v1/goals/score without pre-saved goal', async () => {
      global.fetch = jest.fn().mockImplementation((url: string) => {
        if (url.includes('/goals/score')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              requiredMonthly: 10000,
              estimatedMonthlyAvailable: null,
              band: 'on_track',
              score: 90,
              sipProjection: {
                monthlyContribution: 10000,
                expectedAnnualReturn: 6.0,
                projectedCorpus: 130000,
                totalInvested: 120000,
                interestEarned: 10000,
                disclaimer: 'Indicative only',
              },
              assumptions: [],
              limitations: [],
              methodology: 'Heuristic',
            }),
          });
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });

      const res = await request(app)
        .post('/api/v1/goals/score')
        .set(csrfHeader)
        .set('Cookie', [userACookie])
        .send({
          target: 120000,
          current: 10000,
          monthsLeft: 12,
          monthlyContribution: 10000,
          expectedAnnualReturn: 6.0,
        });

      expect(res.status).toBe(200);
      expect(res.body.available).toBe(true);
      expect(res.body.score.score).toBe(90);
    });

    it('should reject invalid payload to POST /api/v1/goals/score with 422 VALIDATION_ERROR', async () => {
      const res = await request(app)
        .post('/api/v1/goals/score')
        .set(csrfHeader)
        .set('Cookie', [userACookie])
        .send({
          target: -50000,
        });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });
});

