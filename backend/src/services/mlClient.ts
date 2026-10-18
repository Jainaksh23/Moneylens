import { env } from '../config/env';
import { logger } from '../utils/logger';
import { ruleBasedCategorize } from '../utils/categorizer';
import { CategorySource } from '../models/Transaction';

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
const TIMEOUT_MS = isTest ? 300 : parseInt(process.env.ML_TIMEOUT_MS || '15000', 10);
const MAX_RETRIES = isTest ? 0 : 2;
const INITIAL_BACKOFF_MS = isTest ? 10 : 1000;

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
