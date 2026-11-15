/**
 * Secure, Read-Only Financial Aggregate Tools for Chat Orchestration.
 *
 * CRITICAL SECURITY PRINCIPLES:
 * 1. Read-Only: Chat never mutates financial data, creates transactions, or modifies goals.
 * 2. Authenticated Scoping: All tools receive userId strictly from the verified request session.
 * 3. Zod Input Validation: Validates all arguments, rejects absurd ranges, caps limits.
 * 4. Aggregates & Masking: Payees are masked before entering LLM context.
 * 5. Precomputed Math: Percent changes and shares of total are computed deterministically in code.
 */

import mongoose from 'mongoose';
import { z } from 'zod';
import { Transaction } from '../models/Transaction.js';
import { Goal } from '../models/Goal.js';
import { Reminder } from '../models/Reminder.js';
import { resolveDateRange, validateDateRange } from '../utils/dateParsing.js';
import { maskPayeeName, PayeeMasker } from '../utils/chatPrivacy.js';

// -------------------------------------------------------------
// Tool Input Schemas with Zod
// -------------------------------------------------------------
export const SummaryInputSchema = z.object({
  fromDate: z.string().max(100).optional(),
  toDate: z.string().max(100).optional(),
});

export const CategorySpendInputSchema = z.object({
  category: z.string().min(1).max(100),
  fromDate: z.string().max(100).optional(),
  toDate: z.string().max(100).optional(),
});

export const TopCategoriesInputSchema = z.object({
  fromDate: z.string().max(100).optional(),
  toDate: z.string().max(100).optional(),
  n: z.number().int().min(1).max(14).optional().default(5),
});

export const TopPayeesInputSchema = z.object({
  fromDate: z.string().max(100).optional(),
  toDate: z.string().max(100).optional(),
  n: z.number().int().min(1).max(20).optional().default(5),
  direction: z.enum(['income', 'expense', 'all']).optional().default('expense'),
});

export const SearchTransactionsInputSchema = z.object({
  query: z.string().max(100).optional(),
  fromDate: z.string().max(100).optional(),
  toDate: z.string().max(100).optional(),
  minAmount: z.number().min(0).optional(),
  maxAmount: z.number().min(0).optional(),
  category: z.string().max(100).optional(),
  direction: z.enum(['income', 'expense']).optional(),
  limit: z.number().int().min(1).max(50).optional().default(10),
});

export const MonthlyTrendInputSchema = z.object({
  months: z.number().int().min(1).max(24).optional().default(6),
});

export const ComparePeriodsInputSchema = z.object({
  fromA: z.string().max(100),
  toA: z.string().max(100),
  fromB: z.string().max(100),
  toB: z.string().max(100),
});

export const GoalScoreInputSchema = z.object({
  goalId: z.string().max(100).optional(),
});

export const LargestTransactionsInputSchema = z.object({
  fromDate: z.string().max(100).optional(),
  toDate: z.string().max(100).optional(),
  n: z.number().int().min(1).max(20).optional().default(5),
  direction: z.enum(['income', 'expense']).optional().default('expense'),
});

export const TransactionCountInputSchema = z.object({
  fromDate: z.string().max(100).optional(),
  toDate: z.string().max(100).optional(),
});

// -------------------------------------------------------------
// Tool Result Interfaces
// -------------------------------------------------------------
export interface UserSnapshot {
  hasData: boolean;
  dateCoverage: {
    firstDate: string | null;
    lastDate: string | null;
    transactionCount: number;
    monthsCount: number;
  };
  totalIncome: number;
  totalExpense: number;
  netCashFlow: number;
  savingsRate: number;
  topCategories: { category: string; amount: number; shareOfTotal: number }[];
  topPayees: { payee: string; amount: number; count: number; shareOfTotal: number }[];
  monthlyTrend: { month: string; income: number; expense: number; net: number; savingsRate: number }[];
  recurring: { totalRecurringMonthly: number; count: number; items: { title: string; amount: number; dueDay: number }[] };
  goals: { totalGoals: number; activeGoals: { name: string; targetAmount: number; currentAmount: number; progressPercent: number }[] };
  needsReviewCount: number;
}

export const chatTools = {
  /**
   * Tool: getSnapshot
   * Computes the complete, compact financial snapshot for a user.
   */
  async getSnapshot(userId: string, masker: PayeeMasker = new PayeeMasker()): Promise<UserSnapshot> {
    const userObjId = new mongoose.Types.ObjectId(userId);

    // 1. Transaction counts and date bounds
    const firstTx = await Transaction.findOne({ userId: userObjId }).sort({ date: 1 }).lean();
    const lastTx = await Transaction.findOne({ userId: userObjId }).sort({ date: -1 }).lean();
    const totalTxCount = await Transaction.countDocuments({ userId: userObjId });
    const needsReviewCount = await Transaction.countDocuments({ userId: userObjId, needsReview: true });

    if (!firstTx || !lastTx || totalTxCount === 0) {
      return {
        hasData: false,
        dateCoverage: { firstDate: null, lastDate: null, transactionCount: 0, monthsCount: 0 },
        totalIncome: 0,
        totalExpense: 0,
        netCashFlow: 0,
        savingsRate: 0,
        topCategories: [],
        topPayees: [],
        monthlyTrend: [],
        recurring: { totalRecurringMonthly: 0, count: 0, items: [] },
        goals: { totalGoals: 0, activeGoals: [] },
        needsReviewCount: 0,
      };
    }

    const firstDateStr = firstTx.date.toISOString().slice(0, 10);
    const lastDateStr = lastTx.date.toISOString().slice(0, 10);

    const firstYear = firstTx.date.getFullYear();
    const firstMonth = firstTx.date.getMonth();
    const lastYear = lastTx.date.getFullYear();
    const lastMonth = lastTx.date.getMonth();
    const monthsCount = Math.max(1, (lastYear - firstYear) * 12 + (lastMonth - firstMonth) + 1);

    // 2. All-time aggregate income & expense
    const totalsAgg = await Transaction.aggregate([
      { $match: { userId: userObjId } },
      { $group: { _id: '$direction', total: { $sum: '$amount' } } },
    ]);

    let totalIncome = 0;
    let totalExpense = 0;
    for (const a of totalsAgg) {
      if (a._id === 'income') totalIncome = a.total;
      if (a._id === 'expense') totalExpense = a.total;
    }

    const netCashFlow = totalIncome - totalExpense;
    const savingsRate = totalIncome > 0 ? Math.round(((totalIncome - totalExpense) / totalIncome) * 1000) / 10 : 0;

    // 3. Top 8 categories
    const catAgg = await Transaction.aggregate([
      { $match: { userId: userObjId, direction: 'expense' } },
      { $group: { _id: '$category', total: { $sum: '$amount' } } },
      { $sort: { total: -1 } },
      { $limit: 8 },
    ]);

    const topCategories = catAgg.map((c) => ({
      category: c._id || 'Other',
      amount: Math.round(c.total * 100) / 100,
      shareOfTotal: totalExpense > 0 ? Math.round((c.total / totalExpense) * 1000) / 10 : 0,
    }));

    // 4. Top 10 payees (masked)
    const payeeAgg = await Transaction.aggregate([
      { $match: { userId: userObjId, direction: 'expense' } },
      { $group: { _id: '$merchant', total: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $sort: { total: -1 } },
      { $limit: 10 },
    ]);

    const topPayees = payeeAgg.map((p) => {
      const maskedAlias = masker.mask(p._id || 'Other');
      return {
        payee: maskedAlias,
        amount: Math.round(p.total * 100) / 100,
        count: p.count,
        shareOfTotal: totalExpense > 0 ? Math.round((p.total / totalExpense) * 1000) / 10 : 0,
      };
    });

    // 5. Monthly Trend (last 6 months)
    const trendMonths = await chatTools.getMonthlyTrend(userId, { months: 6 });

    // 6. Recurring commitments
    const recurringData = await chatTools.getRecurring(userId);

    // 7. Goals
    const goalsData = await chatTools.getGoals(userId);

    return {
      hasData: true,
      dateCoverage: {
        firstDate: firstDateStr,
        lastDate: lastDateStr,
        transactionCount: totalTxCount,
        monthsCount,
      },
      totalIncome: Math.round(totalIncome * 100) / 100,
      totalExpense: Math.round(totalExpense * 100) / 100,
      netCashFlow: Math.round(netCashFlow * 100) / 100,
      savingsRate,
      topCategories,
      topPayees,
      monthlyTrend: trendMonths,
      recurring: {
        totalRecurringMonthly: recurringData.totalRecurringCommitments,
        count: recurringData.remindersCount,
        items: recurringData.upcomingReminders.slice(0, 5),
      },
      goals: {
        totalGoals: goalsData.totalGoals,
        activeGoals: goalsData.activeGoals.slice(0, 5).map((g) => ({
          name: g.name,
          targetAmount: g.targetAmount,
          currentAmount: g.currentAmount,
          progressPercent: g.progressPercent,
        })),
      },
      needsReviewCount,
    };
  },

  /**
   * Tool: getSummary
   */
  async getSummary(
    userId: string,
    params: z.infer<typeof SummaryInputSchema> = {}
  ) {
    const validated = SummaryInputSchema.parse(params);
    const range = resolveDateRange(validated.fromDate, validated.toDate);
    validateDateRange(range.from, range.to);

    const userObjId = new mongoose.Types.ObjectId(userId);
    const match = {
      userId: userObjId,
      date: { $gte: range.from, $lte: range.to },
    };

    const aggregates = await Transaction.aggregate([
      { $match: match },
      { $group: { _id: '$direction', total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]);

    let totalIncome = 0;
    let totalExpense = 0;
    let transactionCount = 0;

    for (const agg of aggregates) {
      if (agg._id === 'income') {
        totalIncome = agg.total;
        transactionCount += agg.count;
      } else if (agg._id === 'expense') {
        totalExpense = agg.total;
        transactionCount += agg.count;
      }
    }

    const netCashFlow = totalIncome - totalExpense;
    const savingsRate = totalIncome > 0 ? Math.round(((totalIncome - totalExpense) / totalIncome) * 1000) / 10 : 0;

    return {
      period: range.label,
      totalIncome: Math.round(totalIncome * 100) / 100,
      totalExpense: Math.round(totalExpense * 100) / 100,
      netCashFlow: Math.round(netCashFlow * 100) / 100,
      savingsRate,
      transactionCount,
    };
  },

  /**
   * Tool: getCategorySpend
   */
  async getCategorySpend(
    userId: string,
    params: z.infer<typeof CategorySpendInputSchema>,
    masker: PayeeMasker = new PayeeMasker()
  ) {
    const validated = CategorySpendInputSchema.parse(params);
    const range = resolveDateRange(validated.fromDate, validated.toDate);
    validateDateRange(range.from, range.to);

    const userObjId = new mongoose.Types.ObjectId(userId);
    const targetCategory = validated.category.trim();

    // 1. Total expense in period for shareOfTotal computation
    const totalExpAgg = await Transaction.aggregate([
      { $match: { userId: userObjId, direction: 'expense', date: { $gte: range.from, $lte: range.to } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const overallExpense = totalExpAgg[0]?.total || 0;

    // 2. Specific category spend
    const safeRegex = new RegExp(`^${targetCategory.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
    const transactions = await Transaction.find({
      userId: userObjId,
      direction: 'expense',
      date: { $gte: range.from, $lte: range.to },
      category: { $regex: safeRegex },
    }).sort({ amount: -1 }).lean();

    const totalSpend = transactions.reduce((acc, tx) => acc + tx.amount, 0);
    const count = transactions.length;
    const average = count > 0 ? totalSpend / count : 0;
    const shareOfTotalExpense = overallExpense > 0 ? Math.round((totalSpend / overallExpense) * 1000) / 10 : 0;

    // Top payees in this category
    const payeeMap: Record<string, { total: number; count: number }> = {};
    for (const tx of transactions) {
      const p = tx.merchant || 'Other';
      if (!payeeMap[p]) payeeMap[p] = { total: 0, count: 0 };
      payeeMap[p].total += tx.amount;
      payeeMap[p].count += 1;
    }

    const topPayees = Object.entries(payeeMap)
      .map(([payee, data]) => ({
        payee: masker.mask(payee),
        amount: Math.round(data.total * 100) / 100,
        count: data.count,
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 3);

    return {
      period: range.label,
      category: targetCategory,
      totalSpend: Math.round(totalSpend * 100) / 100,
      transactionCount: count,
      averageTransactionAmount: Math.round(average * 100) / 100,
      shareOfTotalExpense,
      topPayees,
    };
  },

  /**
   * Tool: getTopCategories
   */
  async getTopCategories(
    userId: string,
    params: z.input<typeof TopCategoriesInputSchema> = {}
  ) {
    const validated = TopCategoriesInputSchema.parse(params);
    const range = resolveDateRange(validated.fromDate, validated.toDate);
    validateDateRange(range.from, range.to);

    const userObjId = new mongoose.Types.ObjectId(userId);
    const totalExpAgg = await Transaction.aggregate([
      { $match: { userId: userObjId, direction: 'expense', date: { $gte: range.from, $lte: range.to } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const overallExpense = totalExpAgg[0]?.total || 0;

    const catAgg = await Transaction.aggregate([
      { $match: { userId: userObjId, direction: 'expense', date: { $gte: range.from, $lte: range.to } } },
      { $group: { _id: '$category', total: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $sort: { total: -1 } },
      { $limit: validated.n || 5 },
    ]);

    const categories = catAgg.map((c) => ({
      category: c._id || 'Other',
      amount: Math.round(c.total * 100) / 100,
      count: c.count,
      shareOfTotal: overallExpense > 0 ? Math.round((c.total / overallExpense) * 1000) / 10 : 0,
    }));

    return {
      period: range.label,
      totalExpense: Math.round(overallExpense * 100) / 100,
      categories,
    };
  },

  /**
   * Tool: getTopPayees
   */
  async getTopPayees(
    userId: string,
    params: z.input<typeof TopPayeesInputSchema> = {},
    masker: PayeeMasker = new PayeeMasker()
  ) {
    const validated = TopPayeesInputSchema.parse(params);
    const range = resolveDateRange(validated.fromDate, validated.toDate);
    validateDateRange(range.from, range.to);

    const userObjId = new mongoose.Types.ObjectId(userId);
    const matchQuery: Record<string, any> = {
      userId: userObjId,
      date: { $gte: range.from, $lte: range.to },
    };
    if (validated.direction && validated.direction !== 'all') {
      matchQuery.direction = validated.direction;
    }

    const totalAgg = await Transaction.aggregate([
      { $match: matchQuery },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const overallTotal = totalAgg[0]?.total || 0;

    const payeeAgg = await Transaction.aggregate([
      { $match: matchQuery },
      { $group: { _id: '$merchant', total: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $sort: { total: -1 } },
      { $limit: validated.n || 5 },
    ]);

    const payees = payeeAgg.map((p) => ({
      payee: masker.mask(p._id || 'Other'),
      amount: Math.round(p.total * 100) / 100,
      count: p.count,
      shareOfTotal: overallTotal > 0 ? Math.round((p.total / overallTotal) * 1000) / 10 : 0,
    }));

    return {
      period: range.label,
      direction: validated.direction || 'expense',
      totalAmount: Math.round(overallTotal * 100) / 100,
      payees,
    };
  },

  /**
   * Tool: searchTransactions
   */
  async searchTransactions(
    userId: string,
    params: z.input<typeof SearchTransactionsInputSchema> = {},
    masker: PayeeMasker = new PayeeMasker()
  ) {
    const validated = SearchTransactionsInputSchema.parse(params);
    const range = resolveDateRange(validated.fromDate, validated.toDate);
    validateDateRange(range.from, range.to);

    const userObjId = new mongoose.Types.ObjectId(userId);
    const queryObj: Record<string, any> = {
      userId: userObjId,
      date: { $gte: range.from, $lte: range.to },
    };

    if (validated.direction) queryObj.direction = validated.direction;
    if (validated.category) queryObj.category = { $regex: new RegExp(validated.category, 'i') };
    if (validated.minAmount !== undefined || validated.maxAmount !== undefined) {
      queryObj.amount = {};
      if (validated.minAmount !== undefined) queryObj.amount.$gte = validated.minAmount;
      if (validated.maxAmount !== undefined) queryObj.amount.$lte = validated.maxAmount;
    }
    if (validated.query) {
      const q = validated.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      queryObj.$or = [
        { merchant: { $regex: new RegExp(q, 'i') } },
        { description: { $regex: new RegExp(q, 'i') } },
      ];
    }

    const txs = await Transaction.find(queryObj)
      .sort({ date: -1 })
      .limit(validated.limit || 10)
      .lean();

    return {
      count: txs.length,
      period: range.label,
      transactions: txs.map((t) => ({
        id: t._id.toString(),
        date: t.date.toISOString().slice(0, 10),
        amount: t.amount,
        direction: t.direction,
        category: t.category,
        merchant: masker.mask(t.merchant),
        needsReview: t.needsReview,
      })),
    };
  },

  /**
   * Tool: getMonthlyTrend
   */
  async getMonthlyTrend(
    userId: string,
    params: z.input<typeof MonthlyTrendInputSchema> = {}
  ) {
    const validated = MonthlyTrendInputSchema.parse(params);
    const months = validated.months || 6;
    const userObjId = new mongoose.Types.ObjectId(userId);

    const now = new Date();
    const startDate = new Date(Date.UTC(now.getFullYear(), now.getMonth() - months + 1, 1, 0, 0, 0, 0));

    const agg = await Transaction.aggregate([
      { $match: { userId: userObjId, date: { $gte: startDate } } },
      {
        $group: {
          _id: {
            yearMonth: { $dateToString: { format: '%Y-%m', date: '$date' } },
            direction: '$direction',
          },
          total: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.yearMonth': 1 } },
    ]);

    const monthMap: Record<string, { income: number; expense: number; count: number }> = {};
    for (const item of agg) {
      const ym = item._id.yearMonth;
      if (!monthMap[ym]) monthMap[ym] = { income: 0, expense: 0, count: 0 };
      if (item._id.direction === 'income') monthMap[ym].income += item.total;
      if (item._id.direction === 'expense') monthMap[ym].expense += item.total;
      monthMap[ym].count += item.count;
    }

    return Object.entries(monthMap)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, data]) => {
        const net = Math.round((data.income - data.expense) * 100) / 100;
        const savingsRate = data.income > 0 ? Math.round(((data.income - data.expense) / data.income) * 1000) / 10 : 0;
        return {
          month,
          income: Math.round(data.income * 100) / 100,
          expense: Math.round(data.expense * 100) / 100,
          net,
          savingsRate,
          transactionCount: data.count,
        };
      });
  },

  /**
   * Tool: comparePeriods
   */
  async comparePeriods(
    userId: string,
    params: z.infer<typeof ComparePeriodsInputSchema>
  ) {
    const validated = ComparePeriodsInputSchema.parse(params);
    const rangeA = resolveDateRange(validated.fromA, validated.toA);
    const rangeB = resolveDateRange(validated.fromB, validated.toB);
    validateDateRange(rangeA.from, rangeA.to);
    validateDateRange(rangeB.from, rangeB.to);

    const summaryA = await chatTools.getSummary(userId, { fromDate: rangeA.from.toISOString(), toDate: rangeA.to.toISOString() });
    const summaryB = await chatTools.getSummary(userId, { fromDate: rangeB.from.toISOString(), toDate: rangeB.to.toISOString() });

    const expenseDiff = Math.round((summaryB.totalExpense - summaryA.totalExpense) * 100) / 100;
    const incomeDiff = Math.round((summaryB.totalIncome - summaryA.totalIncome) * 100) / 100;
    const netDiff = Math.round((summaryB.netCashFlow - summaryA.netCashFlow) * 100) / 100;

    const expensePercentChange = summaryA.totalExpense > 0
      ? Math.round(((summaryB.totalExpense - summaryA.totalExpense) / summaryA.totalExpense) * 1000) / 10
      : 0;

    const incomePercentChange = summaryA.totalIncome > 0
      ? Math.round(((summaryB.totalIncome - summaryA.totalIncome) / summaryA.totalIncome) * 1000) / 10
      : 0;

    return {
      periodA: summaryA,
      periodB: summaryB,
      changes: {
        expenseDifference: expenseDiff,
        incomeDifference: incomeDiff,
        netCashFlowDifference: netDiff,
        expensePercentChange,
        incomePercentChange,
      },
    };
  },

  /**
   * Tool: getRecurring
   */
  async getRecurring(userId: string) {
    const userObjId = new mongoose.Types.ObjectId(userId);
    const reminders = await Reminder.find({ userId: userObjId, status: 'active' })
      .sort({ dueDay: 1 })
      .lean();

    const total = reminders.reduce((acc, r) => acc + r.amount, 0);

    return {
      totalRecurringCommitments: Math.round(total * 100) / 100,
      remindersCount: reminders.length,
      upcomingReminders: reminders.map((r) => ({
        title: maskPayeeName(r.title),
        amount: r.amount,
        dueDay: r.dueDay,
        source: r.source,
      })),
    };
  },

  /**
   * Tool: getGoals
   */
  async getGoals(userId: string) {
    const userObjId = new mongoose.Types.ObjectId(userId);
    const goals = await Goal.find({ userId: userObjId, status: 'active' }).lean();

    const activeGoals = goals.map((g) => {
      const progress = g.targetAmount > 0 ? Math.min(100, (g.currentAmount / g.targetAmount) * 100) : 0;
      return {
        id: g._id.toString(),
        name: g.name,
        targetAmount: g.targetAmount,
        currentAmount: g.currentAmount,
        progressPercent: Math.round(progress * 10) / 10,
        targetDate: g.targetDate.toISOString().slice(0, 10),
        monthlyContribution: g.monthlyContribution || 0,
        status: g.status,
      };
    });

    return {
      totalGoals: goals.length,
      activeGoals,
    };
  },

  /**
   * Tool: getGoalScore
   */
  async getGoalScore(userId: string, params: z.infer<typeof GoalScoreInputSchema> = {}) {
    const userObjId = new mongoose.Types.ObjectId(userId);
    const query: Record<string, any> = { userId: userObjId, status: 'active' };
    if (params.goalId && mongoose.Types.ObjectId.isValid(params.goalId)) {
      query._id = new mongoose.Types.ObjectId(params.goalId);
    }

    const goal = await Goal.findOne(query).lean();
    if (!goal) {
      return { error: 'Goal not found or no active goals available for this user' };
    }

    const remainingAmount = Math.max(0, goal.targetAmount - goal.currentAmount);
    const monthsRemaining = Math.max(1, Math.round((goal.targetDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30)));
    const requiredMonthlySIP = Math.round(remainingAmount / monthsRemaining);

    return {
      goalName: goal.name,
      targetAmount: goal.targetAmount,
      currentAmount: goal.currentAmount,
      targetDate: goal.targetDate.toISOString().slice(0, 10),
      monthsRemaining,
      requiredMonthlySIP,
      plannedMonthlyContribution: goal.monthlyContribution || 0,
      feasibilityStatus: (goal.monthlyContribution || 0) >= requiredMonthlySIP ? 'On Track' : 'Needs Higher Contribution',
    };
  },

  /**
   * Tool: getForecast
   */
  async getForecast(userId: string) {
    const summary = await chatTools.getSummary(userId, { fromDate: 'past 60 days' });

    // Deterministic 30-day forecast projection
    const avgDailyIncome = summary.totalIncome / 60;
    const avgDailyExpense = summary.totalExpense / 60;

    const projected30DayIncome = Math.round(avgDailyIncome * 30 * 100) / 100;
    const projected30DayExpense = Math.round(avgDailyExpense * 30 * 100) / 100;
    const projectedNetCashFlow = Math.round((projected30DayIncome - projected30DayExpense) * 100) / 100;

    return {
      forecastHorizonDays: 30,
      historicalBasisDays: 60,
      projectedIncome: projected30DayIncome,
      projectedExpense: projected30DayExpense,
      projectedNetCashFlow,
      projectedSavingsRate: projected30DayIncome > 0 ? Math.round((projectedNetCashFlow / projected30DayIncome) * 1000) / 10 : 0,
      confidence: summary.transactionCount >= 20 ? 'High' : 'Moderate (Short History)',
    };
  },

  /**
   * Tool: getAnomalies
   */
  async getAnomalies(userId: string) {
    const userObjId = new mongoose.Types.ObjectId(userId);
    const expenses = await Transaction.find({ userId: userObjId, direction: 'expense' })
      .sort({ date: -1 })
      .limit(100)
      .lean();

    if (expenses.length < 5) {
      return { count: 0, anomalies: [] };
    }

    const amounts = expenses.map((e) => e.amount);
    const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const variance = amounts.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / amounts.length;
    const std = Math.sqrt(variance);

    const threshold = mean + 2.5 * std;
    const unusual = expenses
      .filter((e) => e.amount > threshold && e.amount > 2000)
      .slice(0, 5)
      .map((e) => ({
        id: e._id.toString(),
        date: e.date.toISOString().slice(0, 10),
        amount: e.amount,
        category: e.category,
        merchant: maskPayeeName(e.merchant),
        zScore: std > 0 ? Math.round(((e.amount - mean) / std) * 10) / 10 : 0,
      }));

    return {
      count: unusual.length,
      averageExpense: Math.round(mean * 100) / 100,
      unusualTransactions: unusual,
    };
  },

  /**
   * Tool: getLargestTransactions
   */
  async getLargestTransactions(
    userId: string,
    params: z.input<typeof LargestTransactionsInputSchema> = {},
    masker: PayeeMasker = new PayeeMasker()
  ) {
    const validated = LargestTransactionsInputSchema.parse(params);
    const range = resolveDateRange(validated.fromDate, validated.toDate);
    validateDateRange(range.from, range.to);

    const userObjId = new mongoose.Types.ObjectId(userId);
    const txs = await Transaction.find({
      userId: userObjId,
      direction: validated.direction || 'expense',
      date: { $gte: range.from, $lte: range.to },
    })
      .sort({ amount: -1 })
      .limit(validated.n || 5)
      .lean();

    return {
      period: range.label,
      direction: validated.direction || 'expense',
      count: txs.length,
      transactions: txs.map((t) => ({
        date: t.date.toISOString().slice(0, 10),
        amount: t.amount,
        category: t.category,
        merchant: masker.mask(t.merchant),
      })),
    };
  },

  /**
   * Tool: getTransactionCountByCategory
   */
  async getTransactionCountByCategory(
    userId: string,
    params: z.infer<typeof TransactionCountInputSchema> = {}
  ) {
    const validated = TransactionCountInputSchema.parse(params);
    const range = resolveDateRange(validated.fromDate, validated.toDate);
    validateDateRange(range.from, range.to);

    const userObjId = new mongoose.Types.ObjectId(userId);
    const agg = await Transaction.aggregate([
      { $match: { userId: userObjId, date: { $gte: range.from, $lte: range.to } } },
      { $group: { _id: '$category', count: { $sum: 1 }, totalAmount: { $sum: '$amount' } } },
      { $sort: { count: -1 } },
    ]);

    const needsReview = await Transaction.countDocuments({
      userId: userObjId,
      needsReview: true,
      date: { $gte: range.from, $lte: range.to },
    });

    return {
      period: range.label,
      needsReviewCount: needsReview,
      categories: agg.map((a) => ({
        category: a._id || 'Other',
        count: a.count,
        totalAmount: Math.round(a.totalAmount * 100) / 100,
      })),
    };
  },
};

// -------------------------------------------------------------
// OpenAI / Groq Function Calling Tool Definitions
// -------------------------------------------------------------
export const GROQ_TOOL_DEFINITIONS = [
  {
    type: 'function' as const,
    function: {
      name: 'getSnapshot',
      description: 'Returns the compact user financial snapshot including date coverage, total income/expense, savings rate, top categories, monthly trend, and active goals.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'getSummary',
      description: 'Calculates total income, total expense, net cash flow, savings rate, and transaction count for a specified date range or relative period (e.g. "last month", "March 2026", "past 30 days").',
      parameters: {
        type: 'object',
        properties: {
          fromDate: { type: 'string', description: 'Start date or relative expression like "last month", "2026-03-01", "pichle mahine"' },
          toDate: { type: 'string', description: 'End date or relative expression' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'getCategorySpend',
      description: 'Calculates total spend, transaction count, average transaction, and top payees for a specific category (e.g. Food, Groceries, Rent, Transport) in a given period.',
      parameters: {
        type: 'object',
        properties: {
          category: { type: 'string', description: 'The exact spending category (e.g. Food, Groceries, Shopping, Bills & Utilities, Rent, Transport, Entertainment, Health)' },
          fromDate: { type: 'string', description: 'Start date or relative month expression (e.g. "March", "last month")' },
          toDate: { type: 'string', description: 'End date' },
        },
        required: ['category'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'getTopCategories',
      description: 'Returns the top spending categories ranked by total amount with percentage share of expenses for a given period.',
      parameters: {
        type: 'object',
        properties: {
          fromDate: { type: 'string', description: 'Start date or relative expression' },
          toDate: { type: 'string', description: 'End date' },
          n: { type: 'number', description: 'Number of top categories to return (default 5, max 14)' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'getTopPayees',
      description: 'Returns the top merchants or payees ranked by total transaction amount with counts and share of total.',
      parameters: {
        type: 'object',
        properties: {
          fromDate: { type: 'string', description: 'Start date or relative period' },
          toDate: { type: 'string', description: 'End date' },
          n: { type: 'number', description: 'Number of top payees to return (default 5, max 20)' },
          direction: { type: 'string', enum: ['expense', 'income', 'all'], description: 'Transaction direction filter' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'searchTransactions',
      description: 'Searches and filters transactions by text query, amount range, category, or direction. Returns masked results up to limit 50.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search term for merchant or description' },
          fromDate: { type: 'string', description: 'Start date' },
          toDate: { type: 'string', description: 'End date' },
          minAmount: { type: 'number', description: 'Minimum amount filter' },
          maxAmount: { type: 'number', description: 'Maximum amount filter' },
          category: { type: 'string', description: 'Category name filter' },
          direction: { type: 'string', enum: ['income', 'expense'], description: 'Income or expense' },
          limit: { type: 'number', description: 'Maximum results to return (max 50, default 10)' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'getMonthlyTrend',
      description: 'Returns monthly cash flow breakdown (income, expense, net, savings rate) for the past N months (default 6, max 24).',
      parameters: {
        type: 'object',
        properties: {
          months: { type: 'number', description: 'Number of past months to retrieve (1 to 24)' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'comparePeriods',
      description: 'Compares financial performance across two distinct periods (e.g. this month vs last month, March vs April), calculating exact percentage changes and differences.',
      parameters: {
        type: 'object',
        properties: {
          fromA: { type: 'string', description: 'Period A start or relative expression (e.g. "last month")' },
          toA: { type: 'string', description: 'Period A end' },
          fromB: { type: 'string', description: 'Period B start or relative expression (e.g. "this month")' },
          toB: { type: 'string', description: 'Period B end' },
        },
        required: ['fromA', 'toA', 'fromB', 'toB'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'getRecurring',
      description: 'Fetches active recurring bills, subscriptions, EMIs, and upcoming reminders.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'getGoals',
      description: 'Fetches all active financial savings goals, target amounts, saved amounts, progress percentages, and deadlines.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'getGoalScore',
      description: 'Calculates the required monthly SIP contribution and feasibility score for reaching a specific goal.',
      parameters: {
        type: 'object',
        properties: {
          goalId: { type: 'string', description: 'Optional goal ID' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'getForecast',
      description: 'Returns projected 30-day cash flow, estimated income, expenses, and savings rate based on historical trends.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'getAnomalies',
      description: 'Identifies statistically unusual or high-value expenses that deviated significantly from the average.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'getLargestTransactions',
      description: 'Returns the largest individual expense or income transactions in a given period.',
      parameters: {
        type: 'object',
        properties: {
          fromDate: { type: 'string', description: 'Start date or relative period' },
          toDate: { type: 'string', description: 'End date' },
          n: { type: 'number', description: 'Number of largest transactions to return (default 5, max 20)' },
          direction: { type: 'string', enum: ['income', 'expense'], description: 'Expense or income' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'getTransactionCountByCategory',
      description: 'Returns transaction volume distribution across categories and count of unreviewed transactions.',
      parameters: {
        type: 'object',
        properties: {
          fromDate: { type: 'string', description: 'Start date' },
          toDate: { type: 'string', description: 'End date' },
        },
      },
    },
  },
];
