import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { authMiddleware } from '../middlewares/auth.js';
import { User } from '../models/User.js';
import { Transaction } from '../models/Transaction.js';
import { Goal } from '../models/Goal.js';
import { Insight } from '../models/Insight.js';
import { Reminder } from '../models/Reminder.js';
import { ChatMessage } from '../models/ChatMessage.js';
import { ImportJob } from '../models/ImportJob.js';
import { UnauthorizedError, ValidationError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export const meRouter = Router();

// Apply auth middleware to all /me routes
meRouter.use(authMiddleware);

const updatePreferencesSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  preferences: z
    .object({
      currency: z.enum(['INR']).optional(),
      dateFormat: z.enum(['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD']).optional(),
    })
    .optional(),
});

/**
 * GET /api/v1/me
 * Returns authenticated user profile.
 */
meRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      throw new UnauthorizedError('User account not found');
    }

    res.status(200).json({
      user: {
        id: user._id.toString(),
        email: user.email,
        name: user.name,
        preferences: user.preferences,
        createdAt: user.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/v1/me
 * Updates name or preferences (currency, dateFormat).
 */
meRouter.patch('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = updatePreferencesSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        })),
      );
    }

    const updates: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) {
      updates.name = parsed.data.name;
    }
    if (parsed.data.preferences?.currency) {
      updates['preferences.currency'] = parsed.data.preferences.currency;
    }
    if (parsed.data.preferences?.dateFormat) {
      updates['preferences.dateFormat'] = parsed.data.preferences.dateFormat;
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.userId,
      { $set: updates },
      { new: true, runValidators: true },
    );

    if (!updatedUser) {
      throw new UnauthorizedError('User account not found');
    }

    logger.info({ userId: req.userId }, 'User preferences updated');

    res.status(200).json({
      user: {
        id: updatedUser._id.toString(),
        email: updatedUser.email,
        name: updatedUser.name,
        preferences: updatedUser.preferences,
        createdAt: updatedUser.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/me/export
 * Exports all user transactions as CSV or complete financial bundle as JSON.
 */
meRouter.get('/export', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const format = (req.query.format as string)?.toLowerCase() || 'csv';

    if (format === 'csv') {
      const transactions = await Transaction.find({ userId: req.userId }).sort({ date: -1 });

      const headers = [
        'Date',
        'Amount',
        'Currency',
        'Direction',
        'Merchant',
        'Description',
        'Category',
        'CategorySource',
        'Source',
      ];

      const csvRows = [headers.join(',')];

      for (const t of transactions) {
        const dateStr = t.date ? new Date(t.date).toISOString().split('T')[0] : '';
        const escapeCsv = (val: string | number | undefined | null) => {
          if (val === undefined || val === null) return '';
          const str = String(val);
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        };

        csvRows.push(
          [
            escapeCsv(dateStr),
            escapeCsv(t.amount),
            escapeCsv(t.currency || 'INR'),
            escapeCsv(t.direction),
            escapeCsv(t.merchant),
            escapeCsv(t.description),
            escapeCsv(t.category),
            escapeCsv(t.categorySource),
            escapeCsv(t.source),
          ].join(','),
        );
      }

      const csvContent = csvRows.join('\r\n');

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="moneylens_transactions_export.csv"',
      );
      res.status(200).send(csvContent);
      return;
    }

    // Default JSON export bundle
    const [user, transactions, goals, insights, reminders, chatMessages] = await Promise.all([
      User.findById(req.userId).lean(),
      Transaction.find({ userId: req.userId }).lean(),
      Goal.find({ userId: req.userId }).lean(),
      Insight.find({ userId: req.userId }).lean(),
      Reminder.find({ userId: req.userId }).lean(),
      ChatMessage.find({ userId: req.userId }).lean(),
    ]);

    const exportBundle = {
      exportedAt: new Date().toISOString(),
      user: user
        ? {
            id: user._id.toString(),
            email: user.email,
            name: user.name,
            preferences: user.preferences,
            createdAt: user.createdAt,
          }
        : null,
      summary: {
        totalTransactions: transactions.length,
        totalGoals: goals.length,
        totalInsights: insights.length,
        totalReminders: reminders.length,
        totalChatMessages: chatMessages.length,
      },
      transactions,
      goals,
      insights,
      reminders,
      chatMessages,
    };

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="moneylens_user_data_export.json"',
    );
    res.status(200).json(exportBundle);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/v1/me
 * Permanently deletes user account, cascade deletes all user data (transactions, goals,
 * insights, reminders, chat logs, import jobs), and clears authentication cookie.
 */
meRouter.delete('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.userId;

    // Delete in parallel across all collections
    const [tRes, gRes, iRes, rRes, cRes, jRes, uRes] = await Promise.all([
      Transaction.deleteMany({ userId }),
      Goal.deleteMany({ userId }),
      Insight.deleteMany({ userId }),
      Reminder.deleteMany({ userId }),
      ChatMessage.deleteMany({ userId }),
      ImportJob.deleteMany({ userId }),
      User.findByIdAndDelete(userId),
    ]);

    logger.info(
      {
        userId,
        deletedTransactions: tRes.deletedCount,
        deletedGoals: gRes.deletedCount,
        deletedInsights: iRes.deletedCount,
        deletedReminders: rRes.deletedCount,
        deletedChatMessages: cRes.deletedCount,
        deletedImportJobs: jRes.deletedCount,
      },
      'User account and all personal financial records permanently deleted',
    );

    // Clear session cookie
    res.clearCookie(env.COOKIE_NAME, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      path: '/',
    });

    res.status(200).json({
      message:
        'Your account and all associated financial records, goals, insights, and chat logs have been permanently deleted.',
      recordsDeleted: {
        transactions: tRes.deletedCount,
        goals: gRes.deletedCount,
        insights: iRes.deletedCount,
        reminders: rRes.deletedCount,
        chatMessages: cRes.deletedCount,
        userDeleted: !!uRes,
      },
    });
  } catch (err) {
    next(err);
  }
});
