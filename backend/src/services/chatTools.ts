/**
 * Secure, Read-Only Financial Aggregate Tools for Chat Orchestration.
 *
 * CRITICAL SECURITY PRINCIPLES:
 * 1. Read-Only: Chat never mutates financial data, creates transactions, or modifies goals in v1.
 * 2. Authenticated Scoping: All tools receive userId strictly from the verified request session.
 * 3. Input Validation: Validates date ranges, rejects absurd parameters, protects against SQL/NoSQL injection.
 * 4. Aggregates Only: Returns summary metrics (totals, category sums, goal progress), never raw document dumps.
 */

import mongoose from 'mongoose';
import { z } from 'zod';
import { Transaction } from '../models/Transaction';
import { Goal } from '../models/Goal';
import { Reminder } from '../models/Reminder';
import { BadRequestError } from '../utils/errors';

// -------------------------------------------------------------
// Schema Validators
// -------------------------------------------------------------
export const DateRangeSchema = z.object({
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  category: z.string().max(100).optional(),
});

export interface SummaryToolResult {
  period: string;
  totalIncome: number;
  totalExpense: number;
  netCashFlow: number;
  savingsRate: number;
  transactionCount: number;
}

export interface CategorySpendToolResult {
  period: string;
  category: string;
  totalSpend: number;
  transactionCount: number;
  averageTransactionAmount: number;
  topMerchants: { merchant: string; amount: number }[];
}

export interface GoalsToolResult {
  totalGoals: number;
  activeGoals: {
    name: string;
    targetAmount: number;
    currentAmount: number;
    progressPercent: number;
    targetDate: string;
    monthlyContribution: number;
    status: string;
  }[];
}

export interface RecurringToolResult {
  totalRecurringCommitments: number;
  remindersCount: number;
  upcomingReminders: {
    title: string;
    amount: number;
    dueDay: number;
    source: string;
  }[];
}

// Helper to resolve dates or month names (e.g., "March", "2026-03", "last_month")
export const parsePeriodDates = (
  fromDateStr?: string,
  toDateStr?: string,
  referenceDate: Date = new Date()
): { from: Date; to: Date; label: string } => {
  const currentYear = referenceDate.getFullYear();

  const monthNames: Record<string, number> = {
    january: 0, jan: 0,
    february: 1, feb: 1,
    march: 2, mar: 2,
    april: 3, apr: 3,
    may: 4,
    june: 5, jun: 5,
    july: 6, jul: 6,
    august: 7, aug: 7,
    september: 8, sep: 8, sept: 8,
    october: 9, oct: 9,
    november: 10, nov: 10,
    december: 11, dec: 11,
  };

  // Check if fromDate is a recognized month name
  if (fromDateStr) {
    const cleanFrom = fromDateStr.toLowerCase().trim();
    if (cleanFrom in monthNames) {
      const monthIdx = monthNames[cleanFrom]!;
      const start = new Date(Date.UTC(currentYear, monthIdx, 1));
      const end = new Date(Date.UTC(currentYear, monthIdx + 1, 0, 23, 59, 59, 999));
      return {
        from: start,
        to: end,
        label: `${fromDateStr.charAt(0).toUpperCase() + fromDateStr.slice(1)} ${currentYear}`,
      };
    }
  }

  // Parse explicit ISO dates or default to past 30 days
  let from: Date;
  let to: Date;

  if (fromDateStr) {
    from = new Date(fromDateStr);
    if (isNaN(from.getTime())) {
      throw new BadRequestError(`Invalid fromDate parameter: ${fromDateStr}`);
    }
  } else {
    // Default past 30 days
    from = new Date(referenceDate);
    from.setDate(from.getDate() - 30);
    from.setHours(0, 0, 0, 0);
  }

  if (toDateStr) {
    to = new Date(toDateStr);
    if (isNaN(to.getTime())) {
      throw new BadRequestError(`Invalid toDate parameter: ${toDateStr}`);
    }
  } else {
    to = new Date(referenceDate);
    to.setHours(23, 59, 59, 999);
  }

  if (from > to) {
    throw new BadRequestError('fromDate cannot be after toDate');
  }

  // Cap max window to 365 days to prevent excessive load
  const daysDiff = (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24);
  if (daysDiff > 366) {
    throw new BadRequestError('Date range cannot exceed 365 days for analysis');
  }

  return {
    from,
    to,
    label: `${from.toISOString().slice(0, 10)} to ${to.toISOString().slice(0, 10)}`,
  };
};

export const chatTools = {
  /**
   * Tool: getSummary
   * Computes aggregated total income, expense, net cash flow, and savings rate.
   */
  async getSummary(
    userId: string,
    params: { fromDate?: string; toDate?: string } = {}
  ): Promise<SummaryToolResult> {
    const { from, to, label } = parsePeriodDates(params.fromDate, params.toDate);
    const userObjId = new mongoose.Types.ObjectId(userId);

    const matchStage = {
      userId: userObjId,
      date: { $gte: from, $lte: to },
    };

    const aggregates = await Transaction.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$direction',
          total: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
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
    const savingsRate =
      totalIncome > 0 ? Math.round(((totalIncome - totalExpense) / totalIncome) * 1000) / 10 : 0;

    return {
      period: label,
      totalIncome: Math.round(totalIncome * 100) / 100,
      totalExpense: Math.round(totalExpense * 100) / 100,
      netCashFlow: Math.round(netCashFlow * 100) / 100,
      savingsRate,
      transactionCount,
    };
  },

  /**
   * Tool: getCategorySpend
   * Aggregates spend for a particular category or all categories during a period.
   * Answers statement queries such as "March mein food pe kitna gaya".
   */
  async getCategorySpend(
    userId: string,
    params: { fromDate?: string; toDate?: string; category?: string } = {}
  ): Promise<CategorySpendToolResult> {
    const { from, to, label } = parsePeriodDates(params.fromDate, params.toDate);
    const userObjId = new mongoose.Types.ObjectId(userId);
    const categoryTarget = params.category?.trim();

    const matchQuery: Record<string, any> = {
      userId: userObjId,
      direction: 'expense',
      date: { $gte: from, $lte: to },
    };

    if (categoryTarget && categoryTarget.toLowerCase() !== 'all') {
      // Case-insensitive safe regex match on category or merchant
      const safeTarget = categoryTarget.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      matchQuery.category = { $regex: new RegExp(safeTarget, 'i') };
    }

    const transactions = await Transaction.find(matchQuery).sort({ amount: -1 }).lean();

    const totalSpend = transactions.reduce((acc, tx) => acc + tx.amount, 0);
    const count = transactions.length;
    const average = count > 0 ? totalSpend / count : 0;

    // Top merchants in this category
    const merchantMap: Record<string, number> = {};
    for (const tx of transactions) {
      const m = tx.merchant || 'Unknown Merchant';
      merchantMap[m] = (merchantMap[m] || 0) + tx.amount;
    }

    const topMerchants = Object.entries(merchantMap)
      .map(([merchant, amount]) => ({ merchant, amount: Math.round(amount * 100) / 100 }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 3);

    return {
      period: label,
      category: categoryTarget || 'All Expenses',
      totalSpend: Math.round(totalSpend * 100) / 100,
      transactionCount: count,
      averageTransactionAmount: Math.round(average * 100) / 100,
      topMerchants,
    };
  },

  /**
   * Tool: getGoals
   * Fetches active goals, targets, and monthly required contributions.
   */
  async getGoals(userId: string): Promise<GoalsToolResult> {
    const userObjId = new mongoose.Types.ObjectId(userId);
    const goals = await Goal.find({ userId: userObjId, status: 'active' }).lean();

    const activeGoals = goals.map((g) => {
      const progress = g.targetAmount > 0 ? Math.min(100, (g.currentAmount / g.targetAmount) * 100) : 0;
      return {
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
   * Tool: getRecurring
   * Fetches upcoming bills, subscriptions, and detected reminders.
   */
  async getRecurring(userId: string): Promise<RecurringToolResult> {
    const userObjId = new mongoose.Types.ObjectId(userId);
    const reminders = await Reminder.find({
      userId: userObjId,
      status: 'active',
    })
      .sort({ dueDay: 1 })
      .lean();

    const total = reminders.reduce((acc, r) => acc + r.amount, 0);

    return {
      totalRecurringCommitments: Math.round(total * 100) / 100,
      remindersCount: reminders.length,
      upcomingReminders: reminders.map((r) => ({
        title: r.title,
        amount: r.amount,
        dueDay: r.dueDay,
        source: r.source,
      })),
    };
  },
};
