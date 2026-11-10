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

    it('should return available: false with status insufficient_data when user has no transaction history', async () => {
      const res = await request(app)
        .get('/api/v1/forecast')
        .set(csrfHeader)
        .set('Cookie', [userACookie]);

      expect(res.status).toBe(200);
      expect(res.body.available).toBe(false);
      expect(res.body.status).toBe('insufficient_data');
      expect(res.body.reason).toContain('No transaction data available');
      expect(res.body.monthlyTrend).toEqual([]);
    });

    it('should return insufficient_data when history is less than 14 days', async () => {
      // 5 days of transactions (Jan 1 to Jan 5)
      const txs = [1, 2, 3, 4, 5].map((d) => ({
        userId: userAId,
        date: new Date(`2026-01-0${d}`),
        amount: 1000,
        direction: 'expense' as const,
        description: `Tx Day ${d}`,
        merchant: 'Store',
        category: 'Food',
        categorySource: 'user' as const,
        source: 'manual' as const,
        fingerprint: `fp-short-${d}`,
      }));
      await Transaction.create(txs);

      const res = await request(app)
        .get('/api/v1/forecast')
        .set(csrfHeader)
        .set('Cookie', [userACookie]);

      expect(res.status).toBe(200);
      expect(res.body.available).toBe(false);
      expect(res.body.status).toBe('insufficient_data');
      expect(res.body.reason).toContain('Need at least 14 days of transaction history');
      expect(res.body.dataCoverage.days).toBe(5);
      expect(res.body.dataCoverage.minDaysRequired).toBe(14);
    });

    it('should route synthetic 20-day series (<2 months) to short_history mode with sane ranges and no leakage', async () => {
      // 20 days of transactions (Jan 1 to Jan 20)
      const txs = Array.from({ length: 20 }, (_, i) => ({
        userId: userAId,
        date: new Date(2026, 0, i + 1),
        amount: (i + 1) * 200,
        direction: i % 5 === 0 ? ('income' as const) : ('expense' as const),
        description: `Tx ${i + 1}`,
        merchant: 'Merchant',
        category: i % 5 === 0 ? 'Income' : 'Living',
        categorySource: 'user' as const,
        source: 'manual' as const,
        fingerprint: `fp-20d-${i + 1}`,
      }));
      await Transaction.create(txs);

      let capturedPayload: any = null;
      global.fetch = jest.fn().mockImplementation((url: string, opts: any) => {
        if (url.includes('/forecast')) {
          capturedPayload = JSON.parse(opts.body);
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              available: true,
              mode: 'short_history',
              status: 'ok',
              confidence: 'low',
              dataCoverage: { firstDate: '2026-01-01', lastDate: '2026-01-20', days: 20 },
              modelUsed: 'short_history_run_rate',
              modelVersion: '1.0.0',
              values: [
                { month: '2026-02', value: 5000, lower: 3000, upper: 7000 },
                { month: '2026-03', value: 5000, lower: 2500, upper: 7500 },
                { month: '2026-04', value: 5000, lower: 2000, upper: 8000 },
              ],
              dailyValues: [
                { date: '2026-01-21', value: 166.6, lower: 100, upper: 233.3 },
                { date: '2026-01-22', value: 166.6, lower: 100, upper: 233.3 },
              ],
              assumptions: ['Spending continues at observed daily run-rate.'],
              limitations: ['Based on only 20 days of data.'],
              warnings: [],
              evaluation: 'No backtest metric available for short-history mode.',
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
      expect(res.body.status).toBe('ok');
      expect(capturedPayload.mode).toBe('short_history');
      expect(capturedPayload.dailySeries).toBeDefined();
      expect(capturedPayload.dailySeries.length).toBe(20);

      const f = res.body.forecast;
      expect(f.mode).toBe('short_history');
      expect(f.confidence).toBe('low');
      expect(f.dataCoverage.days).toBe(20);

      // Sane ranges: lower <= value <= upper
      for (const val of f.values) {
        expect(val.lower).toBeLessThanOrEqual(val.value);
        expect(val.value).toBeLessThanOrEqual(val.upper);
      }
      for (const d of f.dailyValues) {
        expect(d.lower).toBeLessThanOrEqual(d.value);
        expect(d.value).toBeLessThanOrEqual(d.upper);
        expect(d.date > '2026-01-20').toBe(true); // no leakage into past
      }
    });

    it('should route synthetic 35-day series (<2 months) to short_history with 6M horizon mapping', async () => {
      // 35 days (Jan 1 to Feb 4)
      const txs = Array.from({ length: 35 }, (_, i) => ({
        userId: userAId,
        date: new Date(2026, 0, i + 1),
        amount: 500,
        direction: 'expense' as const,
        description: `Tx 35-${i + 1}`,
        merchant: 'Vendor',
        category: 'Food',
        categorySource: 'user' as const,
        source: 'manual' as const,
        fingerprint: `fp-35d-${i + 1}`,
      }));
      await Transaction.create(txs);

      let capturedPayload: any = null;
      global.fetch = jest.fn().mockImplementation((url: string, opts: any) => {
        if (url.includes('/forecast')) {
          capturedPayload = JSON.parse(opts.body);
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              available: true,
              mode: 'short_history',
              status: 'ok',
              confidence: 'low',
              dataCoverage: { firstDate: '2026-01-01', lastDate: '2026-02-04', days: 35 },
              modelUsed: 'short_history_run_rate',
              modelVersion: '1.0.0',
              values: Array.from({ length: 6 }, (_, idx) => ({
                month: `2026-0${idx + 3}`,
                value: -15000,
                lower: -20000,
                upper: -10000,
              })),
              assumptions: ['Run rate assumption.'],
              limitations: ['Short history.'],
              warnings: ['Projecting 180 days (6 months) from short-history carries high uncertainty.'],
            }),
          });
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });

      const res = await request(app)
        .get('/api/v1/forecast?horizon=6')
        .set(csrfHeader)
        .set('Cookie', [userACookie]);

      expect(res.status).toBe(200);
      expect(capturedPayload.mode).toBe('short_history');
      expect(capturedPayload.horizon).toBe(6);
      expect(capturedPayload.horizonDays).toBe(180);
      expect(res.body.forecast.warnings[0]).toContain('180 days');
    });

    it('should route synthetic 3-month series (2-5 months) to monthly_baseline with wide ranges', async () => {
      // 3 months of transactions (Jan, Feb, Mar)
      const txs = [
        { date: '2026-01-10', amount: 40000, direction: 'income' as const },
        { date: '2026-01-20', amount: 20000, direction: 'expense' as const },
        { date: '2026-02-10', amount: 45000, direction: 'income' as const },
        { date: '2026-02-20', amount: 22000, direction: 'expense' as const },
        { date: '2026-03-10', amount: 42000, direction: 'income' as const },
        { date: '2026-03-25', amount: 21000, direction: 'expense' as const },
      ].map((t, idx) => ({
        userId: userAId,
        date: new Date(t.date),
        amount: t.amount,
        direction: t.direction,
        description: `Tx 3m ${idx}`,
        merchant: 'Org',
        category: t.direction === 'income' ? 'Income' : 'Bills',
        categorySource: 'user' as const,
        source: 'manual' as const,
        fingerprint: `fp-3m-${idx}`,
      }));
      await Transaction.create(txs);

      let capturedPayload: any = null;
      global.fetch = jest.fn().mockImplementation((url: string, opts: any) => {
        if (url.includes('/forecast')) {
          capturedPayload = JSON.parse(opts.body);
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              available: true,
              mode: 'monthly_baseline',
              status: 'ok',
              confidence: 'medium',
              dataCoverage: 3,
              modelUsed: 'rolling_mean',
              modelVersion: '1.0.0',
              values: [
                { month: '2026-04', value: 21000, lower: 15000, upper: 27000 },
                { month: '2026-05', value: 21000, lower: 13000, upper: 29000 },
                { month: '2026-06', value: 21000, lower: 11000, upper: 31000 },
              ],
              assumptions: ['Prediction interval widened by 2.5x standard error due to 2-5 months history.'],
              limitations: ['Limited history.'],
              warnings: ['Only 3 months of history.'],
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
      expect(capturedPayload.mode).toBe('monthly_baseline');
      expect(capturedPayload.series).toHaveLength(3);
      expect(res.body.forecast.mode).toBe('monthly_baseline');
      for (const val of res.body.forecast.values) {
        expect(val.lower).toBeLessThanOrEqual(val.value);
        expect(val.value).toBeLessThanOrEqual(val.upper);
      }
    });

    it('should route synthetic 8-month series (>=6 months) to monthly_standard mode', async () => {
      // 8 months of transactions
      const txs = Array.from({ length: 8 }, (_, m) => [
        {
          userId: userAId,
          date: new Date(2025, m, 10),
          amount: 50000,
          direction: 'income' as const,
          description: `Salary ${m + 1}`,
          merchant: 'Employer',
          category: 'Income',
          categorySource: 'user' as const,
          source: 'manual' as const,
          fingerprint: `fp-8m-inc-${m}`,
        },
        {
          userId: userAId,
          date: new Date(2025, m, 20),
          amount: 30000,
          direction: 'expense' as const,
          description: `Bills ${m + 1}`,
          merchant: 'Landlord',
          category: 'Housing',
          categorySource: 'user' as const,
          source: 'manual' as const,
          fingerprint: `fp-8m-exp-${m}`,
        },
      ]).flat();
      await Transaction.create(txs);

      let capturedPayload: any = null;
      global.fetch = jest.fn().mockImplementation((url: string, opts: any) => {
        if (url.includes('/forecast')) {
          capturedPayload = JSON.parse(opts.body);
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              available: true,
              mode: 'monthly_standard',
              status: 'ok',
              confidence: 'medium',
              dataCoverage: 8,
              modelUsed: 'rolling_mean',
              modelVersion: '1.0.0',
              values: [
                { month: '2025-09', value: 20000, lower: 18000, upper: 22000 },
                { month: '2025-10', value: 20000, lower: 17500, upper: 22500 },
                { month: '2025-11', value: 20000, lower: 17000, upper: 23000 },
              ],
              assumptions: ['Holdout backtest validated.'],
              limitations: [],
              warnings: [],
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
      expect(capturedPayload.mode).toBe('monthly_standard');
      expect(capturedPayload.series).toHaveLength(8);
      expect(res.body.forecast.mode).toBe('monthly_standard');
    });

    it('should return status: ml_unavailable with retryable: true when ML service is DOWN or wakes up', async () => {
      // 20 days of transactions (enough for forecast)
      const txs = Array.from({ length: 20 }, (_, i) => ({
        userId: userAId,
        date: new Date(2026, 0, i + 1),
        amount: 1000,
        direction: 'expense' as const,
        description: `Tx ${i + 1}`,
        merchant: 'Vendor',
        category: 'Food',
        categorySource: 'user' as const,
        source: 'manual' as const,
        fingerprint: `fp-down-${i + 1}`,
      }));
      await Transaction.create(txs);

      // Mock fetch failure
      global.fetch = jest.fn().mockRejectedValue(new Error('Connection refused (ML sleeping)'));

      const res = await request(app)
        .get('/api/v1/forecast')
        .set(csrfHeader)
        .set('Cookie', [userACookie]);

      expect(res.status).toBe(200);
      expect(res.body.available).toBe(false);
      expect(res.body.status).toBe('ml_unavailable');
      expect(res.body.retryable).toBe(true);
      expect(res.body.reason).toContain('Forecast service is waking up, please retry in a minute');
      expect(res.body.forecast).toBeUndefined(); // Never fabricated
    });

    it('should return status: generation_failed with retryable: false when ML service returns 4xx', async () => {
      // 20 days of transactions
      const txs = Array.from({ length: 20 }, (_, i) => ({
        userId: userAId,
        date: new Date(2026, 0, i + 1),
        amount: 1000,
        direction: 'expense' as const,
        description: `Tx ${i + 1}`,
        merchant: 'Vendor',
        category: 'Food',
        categorySource: 'user' as const,
        source: 'manual' as const,
        fingerprint: `fp-4xx-${i + 1}`,
      }));
      await Transaction.create(txs);

      // Mock 422 Unprocessable Entity
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({ detail: 'Invalid parameters in forecast series' }),
      });

      const res = await request(app)
        .get('/api/v1/forecast')
        .set(csrfHeader)
        .set('Cookie', [userACookie]);

      expect(res.status).toBe(200);
      expect(res.body.available).toBe(false);
      expect(res.body.status).toBe('generation_failed');
      expect(res.body.retryable).toBe(false);
      expect(res.body.reason).toBe('Could not generate forecast');
    });

    it('should verify ML-down and insufficient-data states are distinct and different', async () => {
      // 1. User Beta has 0 transactions -> insufficient_data
      const resBeta = await request(app)
        .get('/api/v1/forecast')
        .set(csrfHeader)
        .set('Cookie', [userBCookie]);

      expect(resBeta.body.available).toBe(false);
      expect(resBeta.body.status).toBe('insufficient_data');
      expect(resBeta.body.status).not.toBe('ml_unavailable');

      // 2. User Alpha has 20 days -> triggers ML, which times out -> ml_unavailable
      const txs = Array.from({ length: 20 }, (_, i) => ({
        userId: userAId,
        date: new Date(2026, 0, i + 1),
        amount: 1000,
        direction: 'expense' as const,
        description: `Tx ${i + 1}`,
        merchant: 'Vendor',
        category: 'Food',
        categorySource: 'user' as const,
        source: 'manual' as const,
        fingerprint: `fp-distinct-${i + 1}`,
      }));
      await Transaction.create(txs);

      global.fetch = jest.fn().mockRejectedValue(new Error('Timeout'));

      const resAlpha = await request(app)
        .get('/api/v1/forecast')
        .set(csrfHeader)
        .set('Cookie', [userACookie]);

      expect(resAlpha.body.available).toBe(false);
      expect(resAlpha.body.status).toBe('ml_unavailable');
      expect(resAlpha.body.status).not.toBe(resBeta.body.status);
      expect(resAlpha.body.reason).not.toBe(resBeta.body.reason);
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

