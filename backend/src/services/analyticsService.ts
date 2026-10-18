import mongoose from 'mongoose';
import { Transaction } from '../models/Transaction.js';
import { parseKolkataDate } from '../utils/transactionUtils.js';

export interface CategoryTotalItem {
  category: string;
  amount: number;
  count: number;
  percentage: number;
}

export interface MonthlyTrendItem {
  month: string; // YYYY-MM
  income: number;
  expense: number;
  net: number;
  savingsRate: number;
}

export interface AnalyticsSummary {
  income: number;
  expense: number;
  net: number;
  savingsRate: number;
  transactionCount: number;
  categoryTotals: CategoryTotalItem[];
  monthlyTrend: MonthlyTrendItem[];
  dateRange: {
    from: string | null;
    to: string | null;
  };
  currency: string;
}

export const analyticsService = {
  getSummary: async (
    userId: string,
    rawFrom?: string,
    rawTo?: string,
  ): Promise<AnalyticsSummary> => {
    const userObjectId = new mongoose.Types.ObjectId(userId);

    // Build date filter
    const matchFilter: Record<string, unknown> = {
      userId: userObjectId,
    };

    let fromDate: Date | null = null;
    let toDate: Date | null = null;

    if (rawFrom) {
      try {
        fromDate = parseKolkataDate(rawFrom);
      } catch {
        fromDate = new Date(rawFrom);
      }
    }

    if (rawTo) {
      try {
        toDate = parseKolkataDate(rawTo);
        // Include full day up to 23:59:59.999
        toDate.setHours(23, 59, 59, 999);
      } catch {
        toDate = new Date(rawTo);
      }
    }

    if (fromDate || toDate) {
      const dateQuery: Record<string, Date> = {};
      if (fromDate) dateQuery.$gte = fromDate;
      if (toDate) dateQuery.$lte = toDate;
      matchFilter.date = dateQuery;
    }

    // 1. Overall Income & Expense Totals
    const totalsAgg = await Transaction.aggregate([
      { $match: matchFilter },
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
    let totalCount = 0;

    for (const record of totalsAgg) {
      if (record._id === 'income') {
        totalIncome = Number(record.total.toFixed(2));
      } else if (record._id === 'expense') {
        totalExpense = Number(record.total.toFixed(2));
      }
      totalCount += record.count;
    }

    const net = Number((totalIncome - totalExpense).toFixed(2));
    const savingsRate =
      totalIncome > 0
        ? Number((((totalIncome - totalExpense) / totalIncome) * 100).toFixed(1))
        : 0;

    // 2. Category Breakdown (Expenses)
    const categoryAgg = await Transaction.aggregate([
      {
        $match: {
          ...matchFilter,
          direction: 'expense',
        },
      },
      {
        $group: {
          _id: '$category',
          total: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
      { $sort: { total: -1 } },
    ]);

    const categoryTotals: CategoryTotalItem[] = categoryAgg.map((cat) => {
      const amount = Number(cat.total.toFixed(2));
      const percentage =
        totalExpense > 0 ? Number(((amount / totalExpense) * 100).toFixed(1)) : 0;
      return {
        category: cat._id || 'unknown',
        amount,
        count: cat.count,
        percentage,
      };
    });

    // 3. Monthly Trend (Income vs Expense grouped by YYYY-MM)
    const monthlyAgg = await Transaction.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: {
            yearMonth: {
              $dateToString: {
                format: '%Y-%m',
                date: '$date',
                timezone: 'Asia/Kolkata',
              },
            },
            direction: '$direction',
          },
          total: { $sum: '$amount' },
        },
      },
      { $sort: { '_id.yearMonth': 1 } },
    ]);

    const monthlyMap = new Map<
      string,
      { income: number; expense: number }
    >();

    for (const item of monthlyAgg) {
      const ym = item._id.yearMonth;
      if (!monthlyMap.has(ym)) {
        monthlyMap.set(ym, { income: 0, expense: 0 });
      }
      const current = monthlyMap.get(ym)!;
      if (item._id.direction === 'income') {
        current.income = Number(item.total.toFixed(2));
      } else if (item._id.direction === 'expense') {
        current.expense = Number(item.total.toFixed(2));
      }
    }

    // Convert map to sorted array
    const monthlyTrend: MonthlyTrendItem[] = Array.from(monthlyMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, data]) => {
        const mNet = Number((data.income - data.expense).toFixed(2));
        const mSavingsRate =
          data.income > 0
            ? Number((((data.income - data.expense) / data.income) * 100).toFixed(1))
            : 0;
        return {
          month,
          income: data.income,
          expense: data.expense,
          net: mNet,
          savingsRate: mSavingsRate,
        };
      });

    return {
      income: totalIncome,
      expense: totalExpense,
      net,
      savingsRate,
      transactionCount: totalCount,
      categoryTotals,
      monthlyTrend,
      dateRange: {
        from: fromDate ? fromDate.toISOString().split('T')[0]! : rawFrom || null,
        to: toDate ? toDate.toISOString().split('T')[0]! : rawTo || null,
      },
      currency: 'INR',
    };
  },
};
