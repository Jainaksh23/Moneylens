import { z } from 'zod';

export const createTransactionSchema = z.object({
  date: z.string().min(1, 'Date is required'),
  amount: z.coerce.number().positive('Amount must be a positive number (> 0)'),
  direction: z.enum(['income', 'expense'], {
    errorMap: () => ({ message: 'Direction must be either "income" or "expense"' }),
  }),
  description: z.string().min(1, 'Description is required').max(500),
  merchant: z.string().max(200).optional().default('unknown'),
  category: z.string().max(100).optional().default('unknown'),
  currency: z.string().max(10).optional().default('INR'),
});

export const updateTransactionSchema = z.object({
  date: z.string().optional(),
  amount: z.coerce.number().positive('Amount must be a positive number (> 0)').optional(),
  direction: z.enum(['income', 'expense']).optional(),
  description: z.string().min(1).max(500).optional(),
  merchant: z.string().max(200).optional(),
  category: z.string().max(100).optional(),
});

export const queryTransactionsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  from: z.string().optional(),
  to: z.string().optional(),
  category: z.string().optional(),
  direction: z.enum(['income', 'expense']).optional(),
  q: z.string().max(200).optional(),
  sort: z.string().optional().default('date:desc'),
  needsReview: z
    .enum(['true', 'false'])
    .transform((val) => val === 'true')
    .optional(),
});

export const analyticsQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
});
