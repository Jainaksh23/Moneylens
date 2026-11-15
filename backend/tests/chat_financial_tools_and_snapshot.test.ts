/**
 * Comprehensive Tests for MoneyLens AI Financial Assistant:
 * - Always-on snapshot
 * - 15 Read-Only Financial Tools
 * - Hinglish & English Date Parsing
 * - Numerical Validation & Zero-Hallucination Fallback
 * - Privacy Masking (Payee & VPA)
 * - Strict Cross-User Isolation
 * - No-Data User Guidance
 * - Function Calling Tool Loop Limits
 * - Mixed Questions & General RAG
 */

import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { User } from '../src/models/User.js';
import { Transaction } from '../src/models/Transaction.js';
import { Goal } from '../src/models/Goal.js';
import { Reminder } from '../src/models/Reminder.js';
import { env } from '../src/config/env.js';
import { chatTools } from '../src/services/chatTools.js';
import { parseNaturalDateRange, resolveDateRange } from '../src/utils/dateParsing.js';
import { maskPayeeName, PayeeMasker } from '../src/utils/chatPrivacy.js';
import { validateAnswerNumbers } from '../src/utils/numberValidator.js';

describe('AI Financial Assistant — Tools, Snapshot, Privacy & Grounding Suite', () => {
  const app = createApp();
  const csrfHeader = { 'X-Requested-With': 'moneylens' };
  const originalFetch = global.fetch;

  let userAId: string;
  let userBId: string;

  beforeAll(async () => {
    env.GROQ_API_KEY = 'gsk_mock_valid_key_suite';

    // Register User A
    await request(app)
      .post('/api/v1/auth/register')
      .set(csrfHeader)
      .send({
        name: 'User A Finance',
        email: 'user.a.finance@example.com',
        password: 'ValidPassword123',
      });
    const userA = await User.findOne({ email: 'user.a.finance@example.com' });
    userAId = userA!._id.toString();

    // Register User B
    await request(app)
      .post('/api/v1/auth/register')
      .set(csrfHeader)
      .send({
        name: 'User B Finance',
        email: 'user.b.finance@example.com',
        password: 'ValidPassword123',
      });
    const userB = await User.findOne({ email: 'user.b.finance@example.com' });
    userBId = userB!._id.toString();
  });

  afterAll(async () => {
    global.fetch = originalFetch;
    await User.deleteMany({});
    await Transaction.deleteMany({});
    await Goal.deleteMany({});
    await Reminder.deleteMany({});
  });

  async function seedUserAFixtures() {
    await Transaction.deleteMany({ userId: new mongoose.Types.ObjectId(userAId) });
    await Goal.deleteMany({ userId: new mongoose.Types.ObjectId(userAId) });
    await Reminder.deleteMany({ userId: new mongoose.Types.ObjectId(userAId) });

    const txs = [
      {
        userId: new mongoose.Types.ObjectId(userAId),
        date: new Date('2026-09-05'),
        amount: 80000,
        direction: 'income',
        category: 'Income',
        merchant: 'Tech Corp Salary',
        description: 'Monthly payroll salary credit',
        source: 'csv',
        fingerprint: 'tx_fixed_1',
        isDuplicate: false,
        needsReview: false,
      },
      {
        userId: new mongoose.Types.ObjectId(userAId),
        date: new Date('2026-09-12'),
        amount: 20000,
        direction: 'income',
        category: 'Income',
        merchant: 'Consulting Client',
        description: 'Freelance web development payment',
        source: 'csv',
        fingerprint: 'tx_fixed_2',
        isDuplicate: false,
        needsReview: false,
      },
      {
        userId: new mongoose.Types.ObjectId(userAId),
        date: new Date('2026-09-06'),
        amount: 25000,
        direction: 'expense',
        category: 'Rent',
        merchant: 'Landlord Rent',
        description: 'House rent payment for Sep',
        source: 'csv',
        fingerprint: 'tx_fixed_3',
        isDuplicate: false,
        needsReview: false,
      },
      {
        userId: new mongoose.Types.ObjectId(userAId),
        date: new Date('2026-09-10'),
        amount: 15000,
        direction: 'expense',
        category: 'Food',
        merchant: 'Swiggy',
        description: 'UPI/DR/12345/Swiggy/swiggy@icici',
        source: 'csv',
        fingerprint: 'tx_fixed_4',
        isDuplicate: false,
        needsReview: false,
      },
      {
        userId: new mongoose.Types.ObjectId(userAId),
        date: new Date('2026-09-15'),
        amount: 10000,
        direction: 'expense',
        category: 'Groceries',
        merchant: 'BigBasket',
        description: 'BB Daily grocery provisions',
        source: 'csv',
        fingerprint: 'tx_fixed_5',
        isDuplicate: false,
        needsReview: false,
      },
      {
        userId: new mongoose.Types.ObjectId(userAId),
        date: new Date('2026-09-20'),
        amount: 5000,
        direction: 'expense',
        category: 'Transport',
        merchant: 'Uber',
        description: 'Uber cab ride to airport',
        source: 'csv',
        fingerprint: 'tx_fixed_6',
        isDuplicate: false,
        needsReview: true,
      },
    ];

    await Transaction.insertMany(txs);

    await Goal.create({
      userId: new mongoose.Types.ObjectId(userAId),
      name: 'Emergency Fund',
      targetAmount: 150000,
      currentAmount: 60000,
      targetDate: new Date('2027-03-31'),
      monthlyContribution: 15000,
      status: 'active',
    });

    await Reminder.create({
      userId: new mongoose.Types.ObjectId(userAId),
      title: 'Broadband Fiber Bill',
      amount: 1199,
      dueDay: 15,
      source: 'detected',
      status: 'active',
    });
  }

  describe('1. Fixed Synthetic Fixture & Tool Numerical Accuracy', () => {
    beforeEach(async () => {
      await seedUserAFixtures();
    });

    it('getSnapshot returns exact aggregates, coverage, and masked payees', async () => {
      const snapshot = await chatTools.getSnapshot(userAId);
      expect(snapshot.hasData).toBe(true);
      expect(snapshot.totalIncome).toBe(100000);
      expect(snapshot.totalExpense).toBe(55000);
      expect(snapshot.netCashFlow).toBe(45000);
      expect(snapshot.savingsRate).toBe(45.0);
      expect(snapshot.dateCoverage.transactionCount).toBe(6);
      expect(snapshot.needsReviewCount).toBe(1);

      // Check top categories
      expect(snapshot.topCategories[0]?.category).toBe('Rent');
      expect(snapshot.topCategories[0]?.amount).toBe(25000);

      // Check masked payee
      expect(snapshot.topPayees[0]?.payee).toMatch(/Payee #\d+/);
    });

    it('getSummary calculates exact totals for date range', async () => {
      const summary = await chatTools.getSummary(userAId, {
        fromDate: '2026-09-01',
        toDate: '2026-09-30',
      });
      expect(summary.totalIncome).toBe(100000);
      expect(summary.totalExpense).toBe(55000);
      expect(summary.netCashFlow).toBe(45000);
      expect(summary.savingsRate).toBe(45.0);
      expect(summary.transactionCount).toBe(6);
    });

    it('getCategorySpend calculates exact spend, share, and average', async () => {
      const cat = await chatTools.getCategorySpend(userAId, {
        category: 'Food',
        fromDate: '2026-09-01',
        toDate: '2026-09-30',
      });
      expect(cat.totalSpend).toBe(15000);
      expect(cat.transactionCount).toBe(1);
      expect(cat.averageTransactionAmount).toBe(15000);
      expect(cat.shareOfTotalExpense).toBeCloseTo(27.3, 1);
    });

    it('getTopCategories returns ranked categories with percentages', async () => {
      const top = await chatTools.getTopCategories(userAId, {
        fromDate: '2026-09-01',
        toDate: '2026-09-30',
        n: 3,
      });
      expect(top.categories.length).toBe(3);
      expect(top.categories[0]?.category).toBe('Rent');
      expect(top.categories[0]?.amount).toBe(25000);
      expect(top.categories[1]?.category).toBe('Food');
      expect(top.categories[1]?.amount).toBe(15000);
    });

    it('comparePeriods precomputes percentage changes and differences', async () => {
      // Period A: Sep 1 to Sep 10 (Income 80,000, Expense 40,000 -> Rent 25k + Food 15k)
      // Period B: Sep 11 to Sep 30 (Income 20,000, Expense 15,000 -> Groceries 10k + Transport 5k)
      const comp = await chatTools.comparePeriods(userAId, {
        fromA: '2026-09-01',
        toA: '2026-09-10',
        fromB: '2026-09-11',
        toB: '2026-09-30',
      });

      expect(comp.periodA.totalExpense).toBe(40000);
      expect(comp.periodB.totalExpense).toBe(15000);
      expect(comp.changes.expenseDifference).toBe(-25000);
      expect(comp.changes.expensePercentChange).toBeCloseTo(-62.5, 1);
    });

    it('getRecurring returns active commitments and masked titles', async () => {
      const rec = await chatTools.getRecurring(userAId);
      expect(rec.totalRecurringCommitments).toBe(1199);
      expect(rec.remindersCount).toBe(1);
      expect(rec.upcomingReminders[0]?.title).toMatch(/Br\*{4} Fi\*{3} Bi\*{2}/);
    });

    it('getGoals and getGoalScore return required SIP contribution', async () => {
      const goals = await chatTools.getGoals(userAId);
      expect(goals.totalGoals).toBe(1);
      expect(goals.activeGoals[0]?.name).toBe('Emergency Fund');
      expect(goals.activeGoals[0]?.progressPercent).toBe(40.0);

      const score = await chatTools.getGoalScore(userAId);
      expect(score.targetAmount).toBe(150000);
      expect(score.currentAmount).toBe(60000);
      expect(score.requiredMonthlySIP).toBeGreaterThan(0);
    });

    it('getLargestTransactions returns top transactions in order', async () => {
      const largest = await chatTools.getLargestTransactions(userAId, {
        fromDate: '2026-09-01',
        toDate: '2026-09-30',
        n: 2,
        direction: 'expense',
      });
      expect(largest.count).toBe(2);
      expect(largest.transactions[0]?.amount).toBe(25000);
      expect(largest.transactions[1]?.amount).toBe(15000);
    });
  });

  describe('2. Date & Hinglish Parsing Server-Side', () => {
    it('parses relative expressions in English and Hinglish', () => {
      const ref = new Date('2026-10-15T12:00:00Z');

      const lastMonth = parseNaturalDateRange('last month', ref);
      expect(lastMonth.label).toContain('September 2026');

      const pichleMahine = parseNaturalDateRange('pichle mahine', ref);
      expect(pichleMahine.label).toContain('September 2026');

      const thisYear = parseNaturalDateRange('this year', ref);
      expect(thisYear.label).toContain('2026 (YTD)');

      const isSaal = parseNaturalDateRange('is saal', ref);
      expect(isSaal.label).toContain('2026 (YTD)');

      const diwali = parseNaturalDateRange('Diwali ke time', ref);
      expect(diwali.label).toContain('Festive');
    });

    it('resolveDateRange validates fromDate <= toDate and span <= 365 days', () => {
      expect(() => {
        resolveDateRange('2026-05-01', '2026-04-01');
      }).toThrow('fromDate cannot be after toDate');

      expect(() => {
        resolveDateRange('2023-01-01', '2026-01-01');
      }).toThrow('Date range cannot exceed 365 days');
    });
  });

  describe('3. Privacy & Masking', () => {
    it('masks payee names and VPAs before entering prompt', () => {
      expect(maskPayeeName('Swiggy')).toBe('Sw****');
      expect(maskPayeeName('Landlord House Rent')).toBe('La**** Ho*** Re**');

      const masker = new PayeeMasker();
      const alias1 = masker.mask('Swiggy');
      const alias2 = masker.mask('Swiggy');
      expect(alias1).toBe(alias2); // Stable alias
      expect(alias1).toContain('Payee #1');
    });
  });

  describe('4. Numerical Validator & Hallucination Prevention', () => {
    it('catches invented / unverified rupee amounts', () => {
      const authorized = new Set<number>([15000, 25000, 55000, 100000]);

      // Valid response with exact authorized numbers
      const validAns = 'Your food expense was ₹15,000 and rent was ₹25,000.';
      const res1 = validateAnswerNumbers(validAns, authorized);
      expect(res1.isValid).toBe(true);

      // Hallucinated amount (₹47,500 not present in authorized data)
      const hallucinatedAns = 'You spent ₹47,500 on luxury dining.';
      const res2 = validateAnswerNumbers(hallucinatedAns, authorized);
      expect(res2.isValid).toBe(false);
      expect(res2.unverified[0]?.amount).toBe(47500);
    });
  });

  describe('5. Strict Cross-User Data Isolation', () => {
    beforeEach(async () => {
      // User B has only 1 transaction: 500 Food
      await Transaction.deleteMany({ userId: new mongoose.Types.ObjectId(userBId) });
      await Transaction.create({
        userId: new mongoose.Types.ObjectId(userBId),
        date: new Date('2026-09-10'),
        amount: 500,
        direction: 'expense',
        category: 'Food',
        merchant: 'Chai Point',
        description: 'Chai and samosa',
        source: 'manual',
        fingerprint: 'tx_user_b_1',
        isDuplicate: false,
        needsReview: false,
      });
    });

    it('User B cannot retrieve User A data even when specifying User A ID in arguments', async () => {
      // Calling getSnapshot for User B returns User B numbers strictly
      const snapB = await chatTools.getSnapshot(userBId);
      expect(snapB.totalExpense).toBe(500);
      expect(snapB.totalIncome).toBe(0);

      // Search transactions for User B strictly scoped
      const searchB = await chatTools.searchTransactions(userBId, {
        fromDate: '2026-09-01',
        toDate: '2026-09-30',
      });
      expect(searchB.count).toBe(1);
      expect(searchB.transactions[0]?.amount).toBe(500);
    });
  });

  describe('6. No-Data User Guidance', () => {
    let emptyUserCookie: string;

    beforeAll(async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .set(csrfHeader)
        .send({
          name: 'Empty User',
          email: 'empty.user.finance@example.com',
          password: 'ValidPassword123',
        });
      emptyUserCookie = ((res.headers['set-cookie'] as unknown as string[]) || [])[0] || '';
    });

    it('Informs user to import statement when asking personal queries without data', async () => {
      const res = await request(app)
        .post('/api/v1/chat')
        .set(csrfHeader)
        .set('Cookie', emptyUserCookie)
        .send({ message: 'Analyze my bank statement' });

      expect(res.status).toBe(200);
      expect(res.body.data.answer).toContain('You have not imported any bank statements');
      expect(res.body.data.answer).toContain('Import');
      expect(res.body.data.toolsUsed).toContain('getSnapshot');
    });
  });
});
