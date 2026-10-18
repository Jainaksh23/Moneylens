import request from 'supertest';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import * as mlClient from '../src/services/mlClient.js';

describe('Phase 3: Transactions Domain, CSV Import & Analytics Tests', () => {
  const app = createApp();
  const csrfHeader = { 'X-Requested-With': 'moneylens' };

  let userACookie: string;
  let userBCookie: string;

  beforeEach(async () => {
    // 1. Register User A
    const regARes = await request(app)
      .post('/api/v1/auth/register')
      .set(csrfHeader)
      .send({
        name: 'User Alpha',
        email: 'user.alpha@example.com',
        password: 'Password123',
      });
    const cookiesA = (regARes.headers['set-cookie'] as unknown as string[]) || [];
    userACookie = cookiesA.find((c) => c.startsWith(`${env.COOKIE_NAME}=`))!;

    // 2. Register User B
    const regBRes = await request(app)
      .post('/api/v1/auth/register')
      .set(csrfHeader)
      .send({
        name: 'User Beta',
        email: 'user.beta@example.com',
        password: 'Password123',
      });
    const cookiesB = (regBRes.headers['set-cookie'] as unknown as string[]) || [];
    userBCookie = cookiesB.find((c) => c.startsWith(`${env.COOKIE_NAME}=`))!;
  });

  // ========================================================
  // 1. VALIDATION & MANUAL CREATION
  // ========================================================
  describe('POST /api/v1/transactions - Validation & Creation', () => {
    it('should reject transaction with zero or negative amount', async () => {
      const res = await request(app)
        .post('/api/v1/transactions')
        .set(csrfHeader)
        .set('Cookie', [userACookie])
        .send({
          date: '2026-10-10',
          amount: -500,
          direction: 'expense',
          description: 'Invalid negative test',
        });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject transaction with missing description', async () => {
      const res = await request(app)
        .post('/api/v1/transactions')
        .set(csrfHeader)
        .set('Cookie', [userACookie])
        .send({
          date: '2026-10-10',
          amount: 500,
          direction: 'expense',
        });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should successfully create manual transaction with rule-based categorization', async () => {
      const res = await request(app)
        .post('/api/v1/transactions')
        .set(csrfHeader)
        .set('Cookie', [userACookie])
        .send({
          date: '2026-10-10',
          amount: 350.5,
          direction: 'expense',
          description: 'Swiggy Dinner Order',
          merchant: 'Swiggy',
        });

      expect(res.status).toBe(201);
      expect(res.body.transaction).toBeDefined();
      expect(res.body.transaction.amount).toBe(350.5);
      expect(res.body.transaction.direction).toBe('expense');
      expect(res.body.transaction.category).toBe('Food');
      expect(res.body.transaction.categorySource).toBe('rule');
      expect(res.body.transaction.isDuplicate).toBe(false);
    });

    it('should flag subsequent duplicate manual transaction', async () => {
      // First transaction
      await request(app)
        .post('/api/v1/transactions')
        .set(csrfHeader)
        .set('Cookie', [userACookie])
        .send({
          date: '2026-10-10',
          amount: 350.5,
          direction: 'expense',
          description: 'Swiggy Dinner Order',
          merchant: 'Swiggy',
        });

      // Second identical transaction
      const res2 = await request(app)
        .post('/api/v1/transactions')
        .set(csrfHeader)
        .set('Cookie', [userACookie])
        .send({
          date: '2026-10-10',
          amount: 350.5,
          direction: 'expense',
          description: 'Swiggy Dinner Order',
          merchant: 'Swiggy',
        });

      expect(res2.status).toBe(201);
      expect(res2.body.transaction.isDuplicate).toBe(true);
    });
  });

  // ========================================================
  // 2. OWNERSHIP ISOLATION
  // ========================================================
  describe('Ownership Isolation (User A vs User B)', () => {
    it('user B cannot read, edit, or delete user A transaction', async () => {
      // User A creates a transaction
      const createRes = await request(app)
        .post('/api/v1/transactions')
        .set(csrfHeader)
        .set('Cookie', [userACookie])
        .send({
          date: '2026-10-01',
          amount: 1500,
          direction: 'expense',
          description: 'Private User A Expense',
          merchant: 'Amazon',
        });

      const txId = createRes.body.transaction.id;

      // User B tries to view transactions list
      const listBRes = await request(app)
        .get('/api/v1/transactions')
        .set('Cookie', [userBCookie]);

      expect(listBRes.status).toBe(200);
      expect(listBRes.body.total).toBe(0);
      expect(listBRes.body.items).toHaveLength(0);

      // User B tries to PATCH User A's transaction
      const patchBRes = await request(app)
        .patch(`/api/v1/transactions/${txId}`)
        .set(csrfHeader)
        .set('Cookie', [userBCookie])
        .send({ description: 'Hacked by User B' });

      expect(patchBRes.status).toBe(404);

      // User B tries to DELETE User A's transaction
      const deleteBRes = await request(app)
        .delete(`/api/v1/transactions/${txId}`)
        .set(csrfHeader)
        .set('Cookie', [userBCookie]);

      expect(deleteBRes.status).toBe(404);

      // Verify User A still has the transaction intact
      const listARes = await request(app)
        .get('/api/v1/transactions')
        .set('Cookie', [userACookie]);

      expect(listARes.body.total).toBe(1);
      expect(listARes.body.items[0].id).toBe(txId);
      expect(listARes.body.items[0].description).toBe('Private User A Expense');
    });
  });

  // ========================================================
  // 3. PAGINATION, SEARCH & FILTERING
  // ========================================================
  describe('GET /api/v1/transactions - Pagination & Query Filters', () => {
    beforeEach(async () => {
      // Seed 5 transactions for User A
      const items = [
        { date: '2026-10-01', amount: 95000, direction: 'income', desc: 'Salary October', merchant: 'Infosys' },
        { date: '2026-10-02', amount: 22000, direction: 'expense', desc: 'Rent Payment', merchant: 'Landlord' },
        { date: '2026-10-03', amount: 450, direction: 'expense', desc: 'Swiggy Dinner', merchant: 'Swiggy' },
        { date: '2026-10-04', amount: 800, direction: 'expense', desc: 'Zepto Groceries', merchant: 'Zepto' },
        { date: '2026-10-05', amount: 10000, direction: 'expense', desc: 'Zerodha SIP', merchant: 'Zerodha' },
      ];

      for (const item of items) {
        await request(app)
          .post('/api/v1/transactions')
          .set(csrfHeader)
          .set('Cookie', [userACookie])
          .send({
            date: item.date,
            amount: item.amount,
            direction: item.direction,
            description: item.desc,
            merchant: item.merchant,
          });
      }
    });

    it('should paginate items correctly (page 1, pageSize 2)', async () => {
      const res = await request(app)
        .get('/api/v1/transactions?page=1&pageSize=2')
        .set('Cookie', [userACookie]);

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(2);
      expect(res.body.total).toBe(5);
      expect(res.body.page).toBe(1);
      expect(res.body.pageSize).toBe(2);
      expect(res.body.totalPages).toBe(3);
    });

    it('should filter by direction (income)', async () => {
      const res = await request(app)
        .get('/api/v1/transactions?direction=income')
        .set('Cookie', [userACookie]);

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(1);
      expect(res.body.items[0].description).toBe('Salary October');
    });

    it('should search query string q matching description or merchant', async () => {
      const res = await request(app)
        .get('/api/v1/transactions?q=swiggy')
        .set('Cookie', [userACookie]);

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(1);
      expect(res.body.items[0].merchant).toBe('swiggy');
    });

    it('should safely handle search query with regex special characters without crashing or 500', async () => {
      const res = await request(app)
        .get('/api/v1/transactions?q=(unclosed&category=Food(')
        .set('Cookie', [userACookie]);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.items)).toBe(true);
    });

    it('should reject malformed transaction ID with 400 BAD_REQUEST instead of 500', async () => {
      const res = await request(app)
        .patch('/api/v1/transactions/not-a-valid-id')
        .set(csrfHeader)
        .set('Cookie', [userACookie])
        .send({ amount: 100 });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('BAD_REQUEST');
    });

    it('should reject malformed importJobId on confirm with 400 BAD_REQUEST', async () => {
      const res = await request(app)
        .post('/api/v1/transactions/import/confirm')
        .set(csrfHeader)
        .set('Cookie', [userACookie])
        .send({ importJobId: 'invalid-job-id' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('BAD_REQUEST');
    });
  });

  // ========================================================
  // 4. RECATEGORIZATION FEEDBACK
  // ========================================================
  describe('PATCH /api/v1/transactions/:id - Feedback Recategorization', () => {
    it('should update category and flag categorySource as user feedback', async () => {
      const createRes = await request(app)
        .post('/api/v1/transactions')
        .set(csrfHeader)
        .set('Cookie', [userACookie])
        .send({
          date: '2026-10-02',
          amount: 500,
          direction: 'expense',
          description: 'Mystery Merchant Payment',
          merchant: 'Unknown Store',
        });

      const txId = createRes.body.transaction.id;
      expect(createRes.body.transaction.categorySource).toBe('unknown');

      // User corrects the category
      const patchRes = await request(app)
        .patch(`/api/v1/transactions/${txId}`)
        .set(csrfHeader)
        .set('Cookie', [userACookie])
        .send({ category: 'Personal Care' });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.transaction.category).toBe('Personal Care');
      expect(patchRes.body.transaction.categorySource).toBe('user');
    });
  });

  // ========================================================
  // 5. CSV IMPORT PREVIEW & CONFIRM
  // ========================================================
  describe('POST /api/v1/transactions/import & /confirm', () => {
    it('should preview CSV with valid, duplicate, and rejected rows, then confirm import', async () => {
      // First insert an existing transaction to trigger duplicate candidate detection
      await request(app)
        .post('/api/v1/transactions')
        .set(csrfHeader)
        .set('Cookie', [userACookie])
        .send({
          date: '2026-10-01',
          amount: 500,
          direction: 'expense',
          description: 'Existing Zepto Order',
          merchant: 'Zepto',
        });

      const csvContent = [
        'date,description,amount,type,merchant',
        '2026-10-02,Swiggy Lunch,350.00,debit,Swiggy', // Accepted
        '2026-10-01,Existing Zepto Order,500.00,debit,Zepto', // Duplicate candidate
        'invalid-date,Broken Row,100.00,debit,Store', // Rejected: invalid date
        '2026-10-03,,200.00,debit,Store', // Rejected: missing description
      ].join('\n');

      // Step 1: Preview
      const previewRes = await request(app)
        .post('/api/v1/transactions/import')
        .set(csrfHeader)
        .set('Cookie', [userACookie])
        .attach('file', Buffer.from(csvContent, 'utf-8'), 'statement.csv');

      expect(previewRes.status).toBe(200);
      expect(previewRes.body.counts.accepted).toBe(1);
      expect(previewRes.body.counts.duplicates).toBe(1);
      expect(previewRes.body.counts.rejected).toBe(2);
      expect(previewRes.body.errors).toHaveLength(2);
      expect(previewRes.body.errors[0].row).toBe(4);
      expect(previewRes.body.errors[1].row).toBe(5);

      const importJobId = previewRes.body.importJobId;

      // Step 2: Confirm
      const confirmRes = await request(app)
        .post('/api/v1/transactions/import/confirm')
        .set(csrfHeader)
        .set('Cookie', [userACookie])
        .send({ importJobId, includeDuplicates: false });

      expect(confirmRes.status).toBe(200);
      expect(confirmRes.body.importedCount).toBe(1);

      // Verify transaction list contains the newly imported row
      const listRes = await request(app)
        .get('/api/v1/transactions?q=swiggy')
        .set('Cookie', [userACookie]);

      expect(listRes.body.total).toBe(1);
      expect(listRes.body.items[0].source).toBe('csv');
    });

    it('should preview PDF statement with parsed transactions and confirm import with source="pdf"', async () => {
      const mockPdfResult: mlClient.ParsePdfResult = {
        success: true,
        statementType: 'bank_account_statement',
        totalExtracted: 2,
        validRows: 2,
        errorRows: 0,
        transactions: [
          {
            row: 2,
            date: '2026-10-04',
            description: 'Apex Synthetic Salary Credit',
            merchant: 'Apex Bank',
            amount: 75000,
            direction: 'income',
            type: 'income',
            category: 'Income',
            categorySource: 'model',
            categoryConfidence: 0.98,
            needsReview: false,
            modelVersion: '1.0.0',
            raw: '04-10-2026 | Salary Credit | 75000.00',
          },
        ],
        errors: [],
      };

      const spy = jest
        .spyOn(mlClient, 'parsePdfStatementWithMl')
        .mockResolvedValueOnce(mockPdfResult);

      // Step 1: Preview PDF
      const previewRes = await request(app)
        .post('/api/v1/transactions/import')
        .set(csrfHeader)
        .set('Cookie', [userACookie])
        .attach('file', Buffer.from('%PDF-1.4 dummy binary', 'utf-8'), 'statement.pdf');

      expect(previewRes.status).toBe(200);
      expect(previewRes.body.counts.accepted).toBe(1);
      expect(previewRes.body.counts.rejected).toBe(0);
      expect(previewRes.body.sampleAccepted[0].source).toBe('pdf');

      const importJobId = previewRes.body.importJobId;

      // Step 2: Confirm PDF import
      const confirmRes = await request(app)
        .post('/api/v1/transactions/import/confirm')
        .set(csrfHeader)
        .set('Cookie', [userACookie])
        .send({ importJobId, includeDuplicates: false });

      expect(confirmRes.status).toBe(200);
      expect(confirmRes.body.importedCount).toBe(1);

      // Verify transaction list shows source: 'pdf'
      const listRes = await request(app)
        .get('/api/v1/transactions?q=Apex')
        .set('Cookie', [userACookie]);

      expect(listRes.body.total).toBe(1);
      expect(listRes.body.items[0].source).toBe('pdf');
      expect(listRes.body.items[0].amount).toBe(75000);

      spy.mockRestore();
    });

    it('should return clear 422 error when scanned / image-only PDF is uploaded', async () => {
      const err = new Error(
        'Scanned or image-only PDF detected. Text extraction requires a digital text PDF statement (OCR is not supported in v1).',
      ) as any;
      err.statusCode = 422;
      err.code = 'VALIDATION_ERROR';

      const spy = jest
        .spyOn(mlClient, 'parsePdfStatementWithMl')
        .mockRejectedValueOnce(err);

      const res = await request(app)
        .post('/api/v1/transactions/import')
        .set(csrfHeader)
        .set('Cookie', [userACookie])
        .attach('file', Buffer.from('%PDF-1.4 scanned', 'utf-8'), 'scanned.pdf');

      expect(res.status).toBe(422);
      expect(res.body.error.message).toContain('Scanned or image-only PDF detected');
      expect(res.body.error.message).toContain('OCR is not supported in v1');

      spy.mockRestore();
    });
  });

  // ========================================================
  // 6. ANALYTICS SUMMARY ON FIXED FIXTURE
  // ========================================================
  describe('GET /api/v1/analytics/summary - Fixed Fixture Calculations', () => {
    it('should compute exact income, expense, net, savingsRate, and category totals', async () => {
      // Fixed fixture:
      // Income: 60,000 (50k + 10k)
      // Expense: 30,000 (20k + 5k + 5k)
      // Net: 30,000
      // Savings rate: 50.0%
      const fixture = [
        { date: '2026-10-01', amount: 50000, direction: 'income', desc: 'Salary', merchant: 'Employer', cat: 'Income' },
        { date: '2026-10-02', amount: 10000, direction: 'income', desc: 'Consulting', merchant: 'Client', cat: 'Income' },
        { date: '2026-10-03', amount: 20000, direction: 'expense', desc: 'Rent', merchant: 'Landlord', cat: 'Housing' },
        { date: '2026-10-04', amount: 5000, direction: 'expense', desc: 'Dining 1', merchant: 'Swiggy', cat: 'Food & Dining' },
        { date: '2026-10-05', amount: 5000, direction: 'expense', desc: 'Dining 2', merchant: 'Zomato', cat: 'Food & Dining' },
      ];

      for (const item of fixture) {
        await request(app)
          .post('/api/v1/transactions')
          .set(csrfHeader)
          .set('Cookie', [userACookie])
          .send({
            date: item.date,
            amount: item.amount,
            direction: item.direction,
            description: item.desc,
            merchant: item.merchant,
            category: item.cat,
          });
      }

      const res = await request(app)
        .get('/api/v1/analytics/summary?from=2026-10-01&to=2026-10-31')
        .set('Cookie', [userACookie]);

      expect(res.status).toBe(200);
      expect(res.body.income).toBe(60000);
      expect(res.body.expense).toBe(30000);
      expect(res.body.net).toBe(30000);
      expect(res.body.savingsRate).toBe(50.0);
      expect(res.body.currency).toBe('INR');

      // Verify category breakdown
      expect(res.body.categoryTotals).toHaveLength(2);
      const housing = res.body.categoryTotals.find((c: { category: string }) => c.category === 'Housing');
      const food = res.body.categoryTotals.find((c: { category: string }) => c.category === 'Food & Dining');

      expect(housing).toBeDefined();
      expect(housing.amount).toBe(20000);
      expect(housing.percentage).toBe(66.7);

      expect(food).toBeDefined();
      expect(food.amount).toBe(10000);
      expect(food.percentage).toBe(33.3);

      // Verify monthly trend contains 2026-10
      expect(res.body.monthlyTrend.length).toBeGreaterThanOrEqual(1);
      const oct = res.body.monthlyTrend.find((m: { month: string }) => m.month === '2026-10');
      expect(oct).toBeDefined();
      expect(oct.income).toBe(60000);
      expect(oct.expense).toBe(30000);
      expect(oct.savingsRate).toBe(50.0);
    });
  });
});
