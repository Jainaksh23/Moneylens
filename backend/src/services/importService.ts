import { parse } from 'csv-parse/sync';
import {
  parseKolkataDate,
  normalizeDirectionAndAmount,
  normalizeMerchant,
  computeFingerprint,
} from '../utils/transactionUtils.js';
import { ruleBasedCategorize } from '../utils/categorizer.js';
import { ImportJob, ImportErrorItem, ImportCandidate } from '../models/ImportJob.js';
import { Transaction } from '../models/Transaction.js';
import { BadRequestError, NotFoundError } from '../utils/errors.js';
import { batchCategorizeTransactions } from './mlClient.js';
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
   * Step 1: Parses CSV buffer, validates row by row, detects duplicates,
   * stages candidates in ImportJob, and returns preview statistics.
   */
  processPreview: async (
    userId: string,
    filename: string,
    fileBuffer: Buffer,
  ): Promise<CsvPreviewResult> => {
    let records: Record<string, string>[];
    try {
      records = parse(fileBuffer, {
        columns: (header: string[]) =>
          header.map((col) => col.trim().toLowerCase().replace(/[\s_-]+/g, '')),
        skip_empty_lines: true,
        trim: true,
        bom: true, // Handle UTF-8 BOM if exported from Excel
      });
    } catch (parseErr) {
      throw new BadRequestError(
        `Failed to parse CSV file: ${parseErr instanceof Error ? parseErr.message : 'Malformed CSV'}`,
      );
    }

    if (!records || records.length === 0) {
      throw new BadRequestError('The uploaded CSV file contains no data rows.');
    }

    const errors: ImportErrorItem[] = [];
    const candidates: ImportCandidate[] = [];
    const seenFingerprintsInFile = new Set<string>();

    for (let i = 0; i < records.length; i++) {
      const row = records[i]!;
      const rowNum = i + 2; // Row 1 is header

      // Extract columns with case/whitespace-tolerant fallbacks
      const rawDate = row['date'] || row['transactiondate'] || row['txdate'];
      const rawDesc = row['description'] || row['desc'] || row['narration'] || row['particulars'];
      const rawAmt = row['amount'] || row['amt'] || row['value'];
      const rawType = row['type'] || row['direction'] || row['crdror'] || row['trxtype'];
      const rawMerchant = row['merchant'] || row['vendor'] || row['payee'];
      const rawCategory = row['category'];

      // Validation 1: Date
      if (!rawDate) {
        errors.push({ row: rowNum, message: 'Missing "date" column value', raw: JSON.stringify(row) });
        continue;
      }

      let parsedDate: Date;
      try {
        parsedDate = parseKolkataDate(rawDate);
      } catch (dateErr) {
        errors.push({
          row: rowNum,
          message: dateErr instanceof Error ? dateErr.message : 'Invalid date',
          raw: JSON.stringify(row),
        });
        continue;
      }

      // Validation 2: Description
      if (!rawDesc || rawDesc.trim().length === 0) {
        errors.push({ row: rowNum, message: 'Missing "description" column value', raw: JSON.stringify(row) });
        continue;
      }

      // Validation 3: Amount & Direction
      if (rawAmt === undefined || rawAmt === null || String(rawAmt).trim() === '') {
        errors.push({ row: rowNum, message: 'Missing "amount" column value', raw: JSON.stringify(row) });
        continue;
      }

      let financials: { direction: 'income' | 'expense'; amount: number };
      try {
        financials = normalizeDirectionAndAmount(rawType || '', rawAmt);
      } catch (amtErr) {
        errors.push({
          row: rowNum,
          message: amtErr instanceof Error ? amtErr.message : 'Invalid amount or type',
          raw: JSON.stringify(row),
        });
        continue;
      }

      // Normalization: Merchant
      const merchant = normalizeMerchant(rawMerchant);

      // Normalization & Inference: Category
      let category = 'unknown';
      let categorySource: 'model' | 'user' | 'rule' | 'unknown' = 'unknown';

      if (rawCategory && rawCategory.trim().length > 0) {
        category = rawCategory.trim();
        categorySource = 'user';
      } else {
        const ruleRes = ruleBasedCategorize(merchant, rawDesc.trim());
        category = ruleRes.category;
        categorySource = ruleRes.source;
      }

      // Fingerprint computation
      const fingerprint = computeFingerprint(userId, parsedDate, financials.amount, merchant);

      // Check intra-file duplicate
      let isDuplicate = false;
      if (seenFingerprintsInFile.has(fingerprint)) {
        isDuplicate = true;
      } else {
        seenFingerprintsInFile.add(fingerprint);
      }

      candidates.push({
        date: parsedDate,
        amount: financials.amount,
        currency: 'INR',
        direction: financials.direction,
        merchant,
        description: rawDesc.trim(),
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
        totalRows: records.length,
      },
      errors: errors.slice(0, 50), // Return top errors
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
          source: 'csv' as const,
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
