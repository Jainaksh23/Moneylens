import { z } from 'zod';

export const createGoalSchema = z.object({
  name: z
    .string()
    .min(1, 'Goal name is required')
    .max(200, 'Goal name must be 200 characters or fewer'),
  targetAmount: z.coerce
    .number()
    .positive('Target amount must be greater than 0'),
  currentAmount: z.coerce
    .number()
    .min(0, 'Current amount cannot be negative')
    .optional()
    .default(0),
  targetDate: z
    .string()
    .min(1, 'Target date is required')
    .refine(
      (val) => {
        const d = new Date(val);
        return !isNaN(d.getTime()) && d > new Date();
      },
      { message: 'Target date must be a valid future date' },
    ),
  priority: z.enum(['high', 'medium', 'low']).optional().default('medium'),
  monthlyContribution: z.coerce
    .number()
    .min(0, 'Monthly contribution cannot be negative')
    .optional()
    .nullable(),
  expectedReturnRate: z.coerce
    .number()
    .min(0, 'Expected return rate cannot be negative')
    .max(100, 'Expected return rate cannot exceed 100%')
    .optional()
    .nullable(),
});

export const updateGoalSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(200)
    .optional(),
  targetAmount: z.coerce.number().positive('Target amount must be greater than 0').optional(),
  currentAmount: z.coerce.number().min(0, 'Current amount cannot be negative').optional(),
  targetDate: z
    .string()
    .refine(
      (val) => {
        const d = new Date(val);
        return !isNaN(d.getTime()) && d > new Date();
      },
      { message: 'Target date must be a valid future date' },
    )
    .optional(),
  priority: z.enum(['high', 'medium', 'low']).optional(),
  status: z.enum(['active', 'completed', 'paused', 'cancelled']).optional(),
  monthlyContribution: z.coerce.number().min(0).optional().nullable(),
  expectedReturnRate: z.coerce.number().min(0).max(100).optional().nullable(),
});

export const directGoalScoreSchema = z.object({
  target: z.coerce.number().positive('Valid target amount is required'),
  current: z.coerce.number().min(0, 'Current amount cannot be negative').optional().default(0),
  monthsLeft: z.coerce.number().int().min(1, 'Months left must be at least 1').optional(),
  targetDate: z.string().optional(),
  monthlyContribution: z.coerce.number().min(0).optional().nullable(),
  expectedAnnualReturn: z.coerce.number().min(0).max(100).optional().nullable(),
});

