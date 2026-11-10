import {
  parseKolkataDate,
  normalizeMerchant,
  computeFingerprint,
} from '../utils/transactionUtils.js';
import { ruleBasedCategorize } from '../utils/categorizer.js';
import { parseCsvStatement } from '../utils/csvStatementParser.js';
import { ImportJob, ImportErrorItem, ImportCandidate } from '../models/ImportJob.js';
import { Transaction } from '../models/Transaction.js';
import { BadRequestError, NotFoundError } from '../utils/errors.js';
import { batchCategorizeTransactions, parsePdfStatementWithMl } from './mlClient.js';
import mongoose from 'mongoose';

export interface CsvPreviewResult {
  importJobId: string;
  filename: string;
  counts: {
    accepted: number;
    rejected: number;
    duplicates: number;
    totalRows: number;
  };
  errors: ImportErrorItem[];
  sampleAccepted: ImportCandidate[];
  sampleDuplicates: ImportCandidate[];
}

export const importService = {
  /**
   * Step 1: Parses CSV or PDF statement buffer, validates row by row, detects duplicates,
   * stages candidates in ImportJob, and returns preview statistics.
   */
  processPreview: async (
    userId: string,
    filename: string,
    fileBuffer: Buffer,
  ): Promise<CsvPreviewResult> => {
    if (filename.toLowerCase().endsWith('.pdf')) {
      return await importService.processPdfPreview(userId, filename, fileBuffer);
    }

    const parsedCsv = parseCsvStatement(fileBuffer);

    const errors: ImportErrorItem[] = parsedCsv.errors.map((e) => ({
      row: e.row,
      message: e.message,
      raw: e.raw,
    }));

    const candidates: ImportCandidate[] = [];
    const seenFingerprintsInFile = new Set<string>();

    for (const tx of parsedCsv.transactions) {
      const merchant = normalizeMerchant(tx.merchant);

      let category = 'unknown';
      let categorySource: 'model' | 'user' | 'rule' | 'unknown' = 'unknown';

      if (tx.category && tx.category.trim().length > 0) {
        category = tx.category.trim();
        categorySource = 'user';
      } else {
        const ruleRes = ruleBasedCategorize(merchant, tx.description);
        category = ruleRes.category;
        categorySource = ruleRes.source;
      }

      const fingerprint = computeFingerprint(userId, tx.date, tx.amount, merchant);

      let isDuplicate = false;
      if (seenFingerprintsInFile.has(fingerprint)) {
        isDuplicate = true;
      } else {
        seenFingerprintsInFile.add(fingerprint);
      }

      candidates.push({
        date: tx.date,
        amount: tx.amount,
        currency: 'INR',
        direction: tx.direction,
        merchant,
        description: tx.description,
        category,
        categorySource,
        source: 'csv',
        fingerprint,
        isDuplicate,
      });
    }

    // Check duplicate fingerprints against existing database records for this user
    const fingerprintsToCheck = candidates
      .filter((c) => !c.isDuplicate)
      .map((c) => c.fingerprint);

    if (fingerprintsToCheck.length > 0) {
      const existingTransactions = await Transaction.find({
        userId: new mongoose.Types.ObjectId(userId),
        fingerprint: { $in: fingerprintsToCheck },
      }).select('fingerprint');

      const existingFingerprintSet = new Set(existingTransactions.map((t) => t.fingerprint));

      for (const candidate of candidates) {
        if (!candidate.isDuplicate && existingFingerprintSet.has(candidate.fingerprint)) {
          candidate.isDuplicate = true;
        }
      }
    }

    const duplicatesCount = candidates.filter((c) => c.isDuplicate).length;
    const acceptedCount = candidates.filter((c) => !c.isDuplicate).length;
    const rejectedCount = errors.length;

    // Create ImportJob record (never logging full raw file contents)
    const importJob = await ImportJob.create({
      userId: new mongoose.Types.ObjectId(userId),
      filename,
      status: 'preview',
      counts: {
        accepted: acceptedCount,
        rejected: rejectedCount,
        duplicates: duplicatesCount,
      },
      errors,
      previewTransactions: candidates,
      startedAt: new Date(),
    });

    return {
      importJobId: importJob._id.toString(),
      filename,
      counts: {
        accepted: acceptedCount,
        rejected: rejectedCount,
        duplicates: duplicatesCount,
        totalRows: candidates.length + errors.length,
      },
      errors: errors.slice(0, 50), // Return top errors
      sampleAccepted: candidates.filter((c) => !c.isDuplicate).slice(0, 10),
      sampleDuplicates: candidates.filter((c) => c.isDuplicate).slice(0, 10),
    };
  },

  /**
   * Parses digital PDF statement buffer via ML service pdfplumber endpoint,
   * validates row by row, detects duplicates, stages candidates in ImportJob, and returns preview statistics.
   */
  processPdfPreview: async (
    userId: string,
    filename: string,
    fileBuffer: Buffer,
  ): Promise<CsvPreviewResult> => {
    const pdfResult = await parsePdfStatementWithMl(fileBuffer, filename);

    const errors: ImportErrorItem[] = (pdfResult.errors || []).map((e) => ({
      row: e.row,
      message: e.message,
      raw: e.raw || '',
    }));

    const candidates: ImportCandidate[] = [];
    const seenFingerprintsInFile = new Set<string>();

    for (let i = 0; i < (pdfResult.transactions || []).length; i++) {
      const tx = pdfResult.transactions[i]!;
      let parsedDate: Date;
      try {
        parsedDate = parseKolkataDate(tx.date);
      } catch {
        errors.push({
          row: tx.row || i + 1,
          message: 'Invalid transaction date',
          raw: tx.raw || JSON.stringify(tx),
        });
        continue;
      }

      if (!tx.description || tx.description.trim().length === 0) {
        errors.push({
          row: tx.row || i + 1,
          message: 'Missing transaction description',
          raw: tx.raw || JSON.stringify(tx),
        });
        continue;
      }

      if (!tx.amount || tx.amount <= 0 || isNaN(tx.amount)) {
        errors.push({
          row: tx.row || i + 1,
          message: 'Invalid transaction amount',
          raw: tx.raw || JSON.stringify(tx),
        });
        continue;
      }

      const merchant = normalizeMerchant(tx.merchant || tx.description);
      const category = tx.category || 'unknown';
      const categorySource =
        (tx.categorySource as any) || (category !== 'unknown' ? 'model' : 'unknown');

      const fingerprint = computeFingerprint(userId, parsedDate, tx.amount, merchant);

      let isDuplicate = false;
      if (seenFingerprintsInFile.has(fingerprint)) {
        isDuplicate = true;
      } else {
        seenFingerprintsInFile.add(fingerprint);
      }

      candidates.push({
        date: parsedDate,
        amount: tx.amount,
        currency: 'INR',
        direction: tx.direction || 'expense',
        merchant,
        description: tx.description.trim(),
        category,
        categorySource,
        source: 'pdf',
        fingerprint,
        isDuplicate,
      });
    }

    // Check duplicate fingerprints against existing database records for this user
    const fingerprintsToCheck = candidates
      .filter((c) => !c.isDuplicate)
      .map((c) => c.fingerprint);

    if (fingerprintsToCheck.length > 0) {
      const existingTransactions = await Transaction.find({
        userId: new mongoose.Types.ObjectId(userId),
        fingerprint: { $in: fingerprintsToCheck },
      }).select('fingerprint');

      const existingFingerprintSet = new Set(existingTransactions.map((t) => t.fingerprint));

      for (const candidate of candidates) {
        if (!candidate.isDuplicate && existingFingerprintSet.has(candidate.fingerprint)) {
          candidate.isDuplicate = true;
        }
      }
    }

    const duplicatesCount = candidates.filter((c) => c.isDuplicate).length;
    const acceptedCount = candidates.filter((c) => !c.isDuplicate).length;
    const rejectedCount = errors.length;

    const importJob = await ImportJob.create({
      userId: new mongoose.Types.ObjectId(userId),
      filename,
      status: 'preview',
      counts: {
        accepted: acceptedCount,
        rejected: rejectedCount,
        duplicates: duplicatesCount,
      },
      errors,
      previewTransactions: candidates,
      startedAt: new Date(),
    });

    return {
      importJobId: importJob._id.toString(),
      filename,
      counts: {
        accepted: acceptedCount,
        rejected: rejectedCount,
        duplicates: duplicatesCount,
        totalRows: candidates.length + rejectedCount,
      },
      errors: errors.slice(0, 50),
      sampleAccepted: candidates.filter((c) => !c.isDuplicate).slice(0, 10),
      sampleDuplicates: candidates.filter((c) => c.isDuplicate).slice(0, 10),
    };
  },

  /**
   * Step 2: Confirms an import session, persisting accepted candidates to the database.
   */
  confirmImport: async (
    userId: string,
    importJobId: string,
    includeDuplicates = false,
  ): Promise<{ message: string; importedCount: number; importJobId: string }> => {
    if (!mongoose.Types.ObjectId.isValid(importJobId)) {
      throw new BadRequestError('Invalid import job ID format');
    }

    const job = await ImportJob.findOne({
      _id: importJobId,
      userId: new mongoose.Types.ObjectId(userId),
    });

    if (!job) {
      throw new NotFoundError('Import job not found or does not belong to this user');
    }

    if (job.status === 'completed') {
      throw new BadRequestError('This import job has already been confirmed and processed');
    }

    const candidates = job.previewTransactions || [];
    const toInsert = candidates.filter((c) => includeDuplicates || !c.isDuplicate);

    if (toInsert.length > 0) {
      // Predict categories using ML service (or graceful fallback)
      const inputItems = toInsert.map((c, idx) => ({
        id: idx.toString(),
        description: c.description,
        merchant: c.merchant,
      }));

      const categoryMap = await batchCategorizeTransactions(inputItems);

      const transactionsToInsert = toInsert.map((c, idx) => {
        const catRes = categoryMap.get(idx.toString());

        // If CSV already explicitly specified a user category (and not unknown), preserve it
        const isUserSpecified = c.categorySource === 'user' && c.category && c.category !== 'unknown';
        const finalCategory = isUserSpecified ? c.category : (catRes?.category || c.category);
        const finalSource = isUserSpecified ? 'user' : (catRes?.categorySource || c.categorySource);

        return {
          userId: job.userId,
          date: c.date,
          amount: c.amount,
          currency: c.currency || 'INR',
          direction: c.direction,
          merchant: c.merchant,
          description: c.description,
          category: finalCategory,
          categorySource: finalSource,
          categoryConfidence: isUserSpecified ? null : (catRes?.categoryConfidence ?? null),
          modelVersion: isUserSpecified ? null : (catRes?.modelVersion ?? null),
          needsReview: isUserSpecified ? false : (catRes?.needsReview ?? false),
          source: (c.source as 'csv' | 'pdf') || (job.filename.toLowerCase().endsWith('.pdf') ? 'pdf' : 'csv'),
          fingerprint: c.fingerprint,
          isDuplicate: c.isDuplicate,
        };
      });

      await Transaction.insertMany(transactionsToInsert, { ordered: false });
    }

    // Update job status
    job.status = 'completed';
    job.completedAt = new Date();
    // Clean up staged preview transactions to preserve database storage
    job.previewTransactions = [];
    await job.save();

    return {
      message: 'Transactions imported successfully',
      importedCount: toInsert.length,
      importJobId: job._id.toString(),
    };
  },
};
