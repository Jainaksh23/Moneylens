import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import mongoose from 'mongoose';
import { Transaction } from '../models/Transaction.js';
import { authMiddleware } from '../middlewares/auth.js';
import { strictLimiter } from '../middlewares/rateLimiter.js';
import { importService } from '../services/importService.js';
import {
  createTransactionSchema,
  updateTransactionSchema,
  queryTransactionsSchema,
} from '../validators/transaction.validators.js';
import {
  parseKolkataDate,
  normalizeMerchant,
  computeFingerprint,
  escapeRegex,
} from '../utils/transactionUtils.js';
import { ruleBasedCategorize } from '../utils/categorizer.js';
import { batchCategorizeTransactions } from '../services/mlClient.js';
import {
  BadRequestError,
  NotFoundError,
  ValidationError,
} from '../utils/errors.js';

export const transactionRouter = Router();

// Configure Multer for in-memory CSV uploads with limits
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (_req, file, cb) => {
    const isCsv =
      file.mimetype === 'text/csv' ||
      file.mimetype === 'text/plain' ||
      file.mimetype === 'application/vnd.ms-excel' ||
      file.originalname.toLowerCase().endsWith('.csv');

    if (isCsv) {
      cb(null, true);
    } else {
      cb(new BadRequestError('Only CSV files (.csv) are permitted for transaction imports'));
    }
  },
});

// Protect all transaction routes with auth middleware
transactionRouter.use(authMiddleware);

/**
 * GET /api/v1/transactions/template
 * Returns a documented CSV template for users to download.
 */
transactionRouter.get('/template', (_req: Request, res: Response) => {
  const templateCsv = [
    'date,description,amount,type,merchant,category',
    '2026-10-01,Monthly Salary Credited,95000.00,credit,Infosys,Income',
    '2026-10-02,Swiggy Dinner Order,480.00,debit,Swiggy,Food & Dining',
    '2026-10-03,House Rent Transfer,22000.00,debit,Landlord,Housing',
    '2026-10-04,Zepto Quick Grocery,320.00,debit,Zepto,Groceries',
    '2026-10-05,Zerodha Nifty Index Fund SIP,10000.00,debit,Zerodha,Investments',
  ].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="moneylens_template.csv"');
  res.status(200).send(templateCsv);
});

/**
 * GET /api/v1/transactions
 * Paginated query with search, date range, category, and direction filters.
 */
transactionRouter.get(
  '/',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = queryTransactionsSchema.safeParse(req.query);
      if (!parsed.success) {
        throw new ValidationError(
          'Invalid query parameters',
          parsed.error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        );
      }

      const { page, pageSize, from, to, category, direction, q, sort, needsReview } = parsed.data;
      const userObjectId = new mongoose.Types.ObjectId(req.userId);

      const filter: Record<string, unknown> = { userId: userObjectId };

      // Review status filter
      if (needsReview !== undefined) {
        filter.needsReview = needsReview;
      }

      // Date range filtering
      if (from || to) {
        const dateFilter: Record<string, Date> = {};
        if (from) {
          try {
            dateFilter.$gte = parseKolkataDate(from);
          } catch {
            dateFilter.$gte = new Date(from);
          }
        }
        if (to) {
          try {
            const toD = parseKolkataDate(to);
            toD.setHours(23, 59, 59, 999);
            dateFilter.$lte = toD;
          } catch {
            dateFilter.$lte = new Date(to);
          }
        }
        filter.date = dateFilter;
      }

      // Category filter
      if (category && category !== 'all') {
        filter.category = new RegExp(`^${escapeRegex(category.trim())}$`, 'i');
      }

      // Direction filter
      if (direction) {
        filter.direction = direction;
      }

      // Text search in description or merchant
      if (q && q.trim().length > 0) {
        const regex = new RegExp(escapeRegex(q.trim()), 'i');
        filter.$or = [{ description: regex }, { merchant: regex }];
      }

      // Sort configuration
      const sortMap: Record<string, Record<string, 1 | -1>> = {
        'date:desc': { date: -1, _id: -1 },
        'date:asc': { date: 1, _id: 1 },
        'amount:desc': { amount: -1, date: -1 },
        'amount:asc': { amount: 1, date: -1 },
      };
      const sortOption = sortMap[sort] || { date: -1, _id: -1 };

      const skip = (page - 1) * pageSize;

      const [items, total] = await Promise.all([
        Transaction.find(filter)
          .sort(sortOption)
          .skip(skip)
          .limit(pageSize)
          .lean(),
        Transaction.countDocuments(filter),
      ]);

      res.status(200).json({
        items: items.map((t) => ({
          id: t._id.toString(),
          date: t.date,
          amount: t.amount,
          currency: t.currency,
          direction: t.direction,
          merchant: t.merchant,
          description: t.description,
          category: t.category,
          categorySource: t.categorySource,
          categoryConfidence: t.categoryConfidence,
          modelVersion: t.modelVersion,
          needsReview: t.needsReview ?? false,
          source: t.source,
          isDuplicate: t.isDuplicate,
          createdAt: t.createdAt,
        })),
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize) || 1,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/transactions
 * Create a single manual transaction.
 */
transactionRouter.post(
  '/',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = createTransactionSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError(
          'Transaction validation failed',
          parsed.error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        );
      }

      const { date, amount, direction, description, merchant, category, currency } =
        parsed.data;

      const parsedDate = parseKolkataDate(date);
      const normalizedMerchantName = normalizeMerchant(merchant);

      let finalCategory = category || 'unknown';
      let categorySource: 'model' | 'user' | 'rule' | 'unknown' = 'user';
      let categoryConfidence: number | null = null;
      let modelVersion: string | null = null;
      let needsReview = false;

      if (!category || category === 'unknown') {
        const mlMap = await batchCategorizeTransactions([
          { id: 'manual-1', description: description.trim(), merchant: normalizedMerchantName },
        ]);
        const mlRes = mlMap.get('manual-1');
        if (mlRes) {
          finalCategory = mlRes.category;
          categorySource = mlRes.categorySource;
          categoryConfidence = mlRes.categoryConfidence;
          modelVersion = mlRes.modelVersion;
          needsReview = mlRes.needsReview;
        } else {
          const ruleRes = ruleBasedCategorize(normalizedMerchantName, description.trim());
          finalCategory = ruleRes.category;
          categorySource = ruleRes.source;
          needsReview = ruleRes.source !== 'rule';
        }
      }

      const userObjectId = new mongoose.Types.ObjectId(req.userId);
      const fingerprint = computeFingerprint(
        req.userId!,
        parsedDate,
        amount,
        normalizedMerchantName,
      );

      // Check if duplicate exists
      const existing = await Transaction.findOne({
        userId: userObjectId,
        fingerprint,
      });
      const isDuplicate = !!existing;

      const transaction = await Transaction.create({
        userId: userObjectId,
        date: parsedDate,
        amount,
        currency: currency || 'INR',
        direction,
        merchant: normalizedMerchantName,
        description: description.trim(),
        category: finalCategory,
        categorySource,
        categoryConfidence,
        modelVersion,
        needsReview,
        source: 'manual',
        fingerprint,
        isDuplicate,
      });

      res.status(201).json({
        transaction: {
          id: transaction._id.toString(),
          date: transaction.date,
          amount: transaction.amount,
          currency: transaction.currency,
          direction: transaction.direction,
          merchant: transaction.merchant,
          description: transaction.description,
          category: transaction.category,
          categorySource: transaction.categorySource,
          categoryConfidence: transaction.categoryConfidence,
          modelVersion: transaction.modelVersion,
          needsReview: transaction.needsReview,
          source: transaction.source,
          isDuplicate: transaction.isDuplicate,
          createdAt: transaction.createdAt,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH /api/v1/transactions/:id
 * Edit transaction. If category is updated, stores as feedback with categorySource "user".
 * Enforces ownership isolation.
 */
transactionRouter.patch(
  '/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id!)) {
        throw new BadRequestError('Invalid transaction ID format');
      }

      const parsed = updateTransactionSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError(
          'Update validation failed',
          parsed.error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        );
      }

      const userObjectId = new mongoose.Types.ObjectId(req.userId);
      const transaction = await Transaction.findOne({
        _id: id,
        userId: userObjectId,
      });

      if (!transaction) {
        throw new NotFoundError('Transaction not found or access denied');
      }

      const data = parsed.data;

      if (data.description !== undefined) {
        transaction.description = data.description.trim();
      }

      if (data.merchant !== undefined) {
        transaction.merchant = normalizeMerchant(data.merchant);
      }

      if (data.category !== undefined) {
        transaction.category = data.category.trim();
        // Category corrected by user: mark as human feedback and clear review flag
        transaction.categorySource = 'user';
        transaction.needsReview = false;
      }

      if (data.direction !== undefined) {
        transaction.direction = data.direction;
      }

      if (data.amount !== undefined) {
        transaction.amount = data.amount;
      }

      if (data.date !== undefined) {
        transaction.date = parseKolkataDate(data.date);
      }

      // Recompute fingerprint
      transaction.fingerprint = computeFingerprint(
        req.userId!,
        transaction.date,
        transaction.amount,
        transaction.merchant,
      );

      await transaction.save();

      res.status(200).json({
        transaction: {
          id: transaction._id.toString(),
          date: transaction.date,
          amount: transaction.amount,
          currency: transaction.currency,
          direction: transaction.direction,
          merchant: transaction.merchant,
          description: transaction.description,
          category: transaction.category,
          categorySource: transaction.categorySource,
          categoryConfidence: transaction.categoryConfidence,
          modelVersion: transaction.modelVersion,
          needsReview: transaction.needsReview,
          source: transaction.source,
          isDuplicate: transaction.isDuplicate,
          updatedAt: transaction.updatedAt,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * DELETE /api/v1/transactions/:id
 * Delete a transaction. Enforces ownership isolation.
 */
transactionRouter.delete(
  '/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id!)) {
        throw new BadRequestError('Invalid transaction ID format');
      }

      const userObjectId = new mongoose.Types.ObjectId(req.userId);
      const result = await Transaction.findOneAndDelete({
        _id: id,
        userId: userObjectId,
      });

      if (!result) {
        throw new NotFoundError('Transaction not found or access denied');
      }

      res.status(200).json({ message: 'Transaction deleted successfully' });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/transactions/import
 * Step 1: Upload CSV file, validate format, detect duplicates, return preview statistics.
 * Strict rate limiting applied.
 */
transactionRouter.post(
  '/import',
  strictLimiter,
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        throw new BadRequestError('No CSV file uploaded. Please attach a CSV file under field "file".');
      }

      const result = await importService.processPreview(
        req.userId!,
        req.file.originalname,
        req.file.buffer,
      );

      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/transactions/import/confirm
 * Step 2: Persist accepted transactions from the preview stage into the database.
 * Strict rate limiting applied.
 */
transactionRouter.post(
  '/import/confirm',
  strictLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { importJobId, includeDuplicates } = req.body;
      if (!importJobId || typeof importJobId !== 'string' || !mongoose.Types.ObjectId.isValid(importJobId)) {
        throw new BadRequestError('Missing or invalid importJobId in request body');
      }

      const result = await importService.confirmImport(
        req.userId!,
        importJobId,
        includeDuplicates === true,
      );

      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
);
