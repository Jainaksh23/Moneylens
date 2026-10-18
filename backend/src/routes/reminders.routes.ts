import { Router, Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { authMiddleware } from '../middlewares/auth.js';
import { Reminder } from '../models/Reminder.js';
import { insightService } from '../services/insightService.js';
import { ValidationError, NotFoundError } from '../utils/errors.js';

export const remindersRouter = Router();

remindersRouter.use(authMiddleware);

const createReminderSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  amount: z.coerce.number().positive('Amount must be positive'),
  dueDay: z.coerce.number().int().min(1).max(31),
  category: z.string().optional().default('Bills & Utilities'),
});

const updateReminderSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  amount: z.coerce.number().positive().optional(),
  dueDay: z.coerce.number().int().min(1).max(31).optional(),
  category: z.string().optional(),
  status: z.enum(['active', 'dismissed', 'confirmed']).optional(),
});

/**
 * GET /api/v1/reminders
 * List user reminders, sorted by dueDay.
 */
remindersRouter.get(
  '/',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const reminders = await Reminder.find({
        userId: req.userId,
        status: { $ne: 'dismissed' },
      })
        .sort({ dueDay: 1 })
        .lean();

      res.status(200).json({ reminders });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/reminders
 * Create a manual reminder.
 */
remindersRouter.post(
  '/',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = createReminderSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError(
          'Invalid reminder data',
          parsed.error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        );
      }

      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth();
      const currentDay = now.getDate();
      const dueDay = parsed.data.dueDay;

      let nextDue: Date;
      if (currentDay <= dueDay) {
        nextDue = new Date(currentYear, currentMonth, dueDay);
      } else {
        nextDue = new Date(currentYear, currentMonth + 1, dueDay);
      }

      const reminder = await Reminder.create({
        userId: req.userId,
        title: parsed.data.title,
        amount: parsed.data.amount,
        dueDay: parsed.data.dueDay,
        category: parsed.data.category,
        source: 'manual',
        status: 'active',
        nextDueDate: nextDue,
      });

      res.status(201).json({ reminder });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/reminders/detect
 * Automatically scan transactions for recurring charges and create reminders.
 */
remindersRouter.post(
  '/detect',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const reminders = await insightService.detectAndSyncReminders(req.userId!);
      res.status(200).json({
        message: 'Recurring charge scan completed',
        reminders,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH /api/v1/reminders/:id
 * Update or confirm/dismiss reminder.
 */
remindersRouter.patch(
  '/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id!)) {
        throw new ValidationError('Invalid reminder ID format');
      }

      const parsed = updateReminderSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError(
          'Invalid update data',
          parsed.error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        );
      }

      const reminder = await Reminder.findOneAndUpdate(
        { _id: id, userId: req.userId },
        { $set: parsed.data },
        { new: true, runValidators: true },
      );

      if (!reminder) {
        throw new NotFoundError('Reminder not found');
      }

      res.status(200).json({ reminder });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * DELETE /api/v1/reminders/:id
 * Delete reminder.
 */
remindersRouter.delete(
  '/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id!)) {
        throw new ValidationError('Invalid reminder ID format');
      }

      const reminder = await Reminder.findOneAndDelete({
        _id: id,
        userId: req.userId,
      });

      if (!reminder) {
        throw new NotFoundError('Reminder not found');
      }

      res.status(200).json({ message: 'Reminder deleted successfully' });
    } catch (err) {
      next(err);
    }
  },
);
