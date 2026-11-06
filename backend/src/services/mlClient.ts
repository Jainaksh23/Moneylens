import { env } from '../config/env';
import { logger } from '../utils/logger';
import { ruleBasedCategorize } from '../utils/categorizer';
import { CategorySource } from '../models/Transaction';
import { AppError, BadRequestError, ValidationError, ErrorCode } from '../utils/errors';

export interface CategorizationInput {
  id: string;
  description: string;
  merchant?: string;
}

export interface CategorizationResult {
  category: string;
  categorySource: CategorySource;
  categoryConfidence: number | null;
  modelVersion: string | null;
  needsReview: boolean;
}

interface MLPredictionItem {
  id: string;
  category: string;
  confidence: number;
  needsReview: boolean;
  modelVersion: string;
}

interface MLBatchResponse {
  predictions: MLPredictionItem[];
  modelVersion: string;
}

const isTest = process.env.NODE_ENV === 'test';

// Render free-tier ML service sleeps after 15 min and takes ~60s to wake.
// Use 70s timeout to survive a cold start, with 1 retry (2 total attempts).
const TIMEOUT_MS = isTest ? 300 : parseInt(process.env.ML_TIMEOUT_MS || '70000', 10);
const MAX_RETRIES = isTest ? 0 : 1;
const INITIAL_BACKOFF_MS = isTest ? 10 : 2000;

async function fetchWithRetry(url: string, options: RequestInit, retries = MAX_RETRIES): Promise<Response> {
  let attempt = 0;
  while (attempt <= retries) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        return response;
      }

      // If server returned 5xx, retry
      if (response.status >= 500 && attempt < retries) {
        attempt++;
        await new Promise((resolve) => setTimeout(resolve, INITIAL_BACKOFF_MS * Math.pow(2, attempt)));
        continue;
      }

      return response;
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (attempt < retries) {
        attempt++;
        await new Promise((resolve) => setTimeout(resolve, INITIAL_BACKOFF_MS * Math.pow(2, attempt)));
        continue;
      }
      throw err;
    }
  }
  throw new Error('Max retries exceeded');
}

/**
 * Predicts categories for a batch of transactions using the FastAPI ML service.
 * Automatically falls back to deterministic rule-based matching if ML service is unreachable.
 * Never fails the import or throws unhandled exceptions.
 */
export async function batchCategorizeTransactions(
  items: CategorizationInput[],
): Promise<Map<string, CategorizationResult>> {
  const results = new Map<string, CategorizationResult>();

  if (items.length === 0) {
    return results;
  }

  let mlResponse: MLBatchResponse | null = null;

  try {
    const endpoint = `${env.ML_SERVICE_URL}/predict/category`;
    const payload = {
      items: items.map((it) => ({
        id: it.id,
        description: it.description,
        merchant: it.merchant || 'unknown',
      })),
    };

    const res = await fetchWithRetry(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Key': env.INTERNAL_API_KEY,
      },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      mlResponse = (await res.json()) as MLBatchResponse;
    } else {
      logger.warn(
        { status: res.status, url: endpoint },
        'ML service returned non-200 status. Falling back to rule-based categorizer.',
      );
    }
  } catch (error: any) {
    logger.warn(
      { error: error.message },
      'ML service is unreachable or timed out. Falling back gracefully to rule-based categorizer.',
    );
  }

  // If ML service returned predictions, map them
  if (mlResponse && Array.isArray(mlResponse.predictions)) {
    const predMap = new Map<string, MLPredictionItem>();
    for (const p of mlResponse.predictions) {
      predMap.set(p.id, p);
    }

    for (const item of items) {
      const pred = predMap.get(item.id);

      if (pred) {
        if (pred.needsReview || pred.category === 'unknown') {
          // Check if rule matches as secondary aid
          const ruleFallback = ruleBasedCategorize(item.merchant, item.description);
          if (ruleFallback.source === 'rule') {
            results.set(item.id, {
              category: ruleFallback.category,
              categorySource: 'rule',
              categoryConfidence: pred.confidence,
              modelVersion: pred.modelVersion,
              needsReview: true,
            });
          } else {
            results.set(item.id, {
              category: 'unknown',
              categorySource: 'unknown',
              categoryConfidence: pred.confidence,
              modelVersion: pred.modelVersion,
              needsReview: true,
            });
          }
        } else {
          results.set(item.id, {
            category: pred.category,
            categorySource: 'model',
            categoryConfidence: pred.confidence,
            modelVersion: pred.modelVersion,
            needsReview: false,
          });
        }
      } else {
        // Fallback for missing item in batch
        const ruleFallback = ruleBasedCategorize(item.merchant, item.description);
        results.set(item.id, {
          category: ruleFallback.category,
          categorySource: ruleFallback.source === 'rule' ? 'rule' : 'unknown',
          categoryConfidence: null,
          modelVersion: null,
          needsReview: ruleFallback.source !== 'rule',
        });
      }
    }

    return results;
  }

  // Graceful rule-based fallback when ML service is down
  for (const item of items) {
    const ruleFallback = ruleBasedCategorize(item.merchant, item.description);
    results.set(item.id, {
      category: ruleFallback.category,
      categorySource: ruleFallback.source === 'rule' ? 'rule' : 'unknown',
      categoryConfidence: null,
      modelVersion: null,
      needsReview: ruleFallback.source !== 'rule',
    });
  }

  return results;
}

export interface ParsedPdfTransaction {
  row: number;
  date: string;
  description: string;
  merchant?: string;
  amount: number;
  direction: 'income' | 'expense';
  type: string;
  category?: string;
  categoryConfidence?: number | null;
  needsReview?: boolean;
  modelVersion?: string | null;
  categorySource?: 'model' | 'rules' | 'user' | 'unknown';
  raw?: string;
}

export interface ParsedPdfError {
  row: number;
  message: string;
  raw?: string;
}

export interface ParsePdfResult {
  success: boolean;
  statementType: string;
  totalExtracted: number;
  validRows: number;
  errorRows: number;
  transactions: ParsedPdfTransaction[];
  errors: ParsedPdfError[];
}

/**
 * Sends a PDF statement buffer to the FastAPI ML service for text extraction via pdfplumber.
 */
export async function parsePdfStatementWithMl(
  fileBuffer: Buffer,
  filename: string,
): Promise<ParsePdfResult> {
  const endpoint = `${env.ML_SERVICE_URL}/parse/pdf-statement`;
  const blob = new Blob([fileBuffer], { type: 'application/pdf' });
  const formData = new FormData();
  formData.append('file', blob, filename);

  const res = await fetchWithRetry(endpoint, {
    method: 'POST',
    headers: {
      'X-Internal-Key': env.INTERNAL_API_KEY,
    },
    body: formData,
  });

  if (!res.ok) {
    const errorBody = (await res.json().catch(() => ({}))) as Record<string, any>;
    const message =
      errorBody?.error?.message || errorBody?.detail || 'Failed to parse PDF statement';
    if (res.status === 422) {
      throw new ValidationError(message, errorBody?.error?.details);
    }
    if (res.status === 400) {
      throw new BadRequestError(message, errorBody?.error?.details);
    }
    const code = (errorBody?.error?.code || 'INTERNAL_SERVER_ERROR') as ErrorCode;
    throw new AppError(message, res.status, code, errorBody?.error?.details);
  }

  return (await res.json()) as ParsePdfResult;
}

