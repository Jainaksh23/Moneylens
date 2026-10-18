import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { Insight, IInsight, InsightStatus } from '../models/Insight.js';
import { Transaction } from '../models/Transaction.js';
import { Goal } from '../models/Goal.js';
import { Reminder } from '../models/Reminder.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';

const TIMEOUT_MS = 6000;

interface AnomalyResult {
  transactionId: string;
  date: string;
  amount: number;
  category: string;
  merchant: string;
  anomalyScore: number;
  robustZScore: number;
  reasonCode: string;
  explanation: string;
  comparisonPeriod: string;
  supportingValues: Record<string, unknown>;
  severity: 'low' | 'medium' | 'high';
}

interface RecommendationResult {
  id: string;
  type: string;
  title: string;
  rationale: string;
  evidenceValues: Record<string, unknown>;
  evidencePeriod: string;
  rule: string;
  threshold: string;
  estimatedEffect: string;
  actionableNextStep: string;
  status: 'open' | 'dismissed' | 'done';
  rank: number;
}

interface RecurringChargeResult {
  merchant: string;
  category: string;
  cadence: 'monthly' | 'weekly' | 'irregular';
  averageAmount: number;
  lastAmount: number;
  lastDate: string;
  suggestedDueDay: number;
  occurrences: number;
  isPriceIncrease: boolean;
  priceIncreaseAmount?: number | null;
  priceIncreasePct?: number | null;
  isNewSubscription: boolean;
  needsReview: boolean;
  reviewReason?: string | null;
  transactionIds: string[];
}

/**
 * Validates that all numbers in the LLM-generated string match numbers present
 * in the evidenceValues or template text. Prevents numerical hallucinations.
 */
export function validateLLMNumbers(
  llmText: string,
  allowedNumbers: (number | string)[],
): boolean {
  // Extract all digit sequences (integers and decimals)
  const matches = llmText.match(/\d+(?:\.\d+)?/g);
  if (!matches) return true; // No numbers generated, safe

  const allowedSet = new Set(
    allowedNumbers.map((n) => String(n).replace(/,/g, '')),
  );

  for (const match of matches) {
    const cleanNum = match.replace(/,/g, '');
    // Ignore harmless small integers like 1, 2, 3 if used in step numbering
    if (['1', '2', '3'].includes(cleanNum)) continue;

    // Check if the number or an equivalent rounded form exists in allowedSet
    const numVal = parseFloat(cleanNum);
    const hasMatch = Array.from(allowedSet).some((allowed) => {
      const allowedVal = parseFloat(allowed);
      if (isNaN(allowedVal)) return false;
      return (
        allowed === cleanNum ||
        Math.abs(allowedVal - numVal) < 0.05 ||
        Math.round(allowedVal) === Math.round(numVal)
      );
    });

    if (!hasMatch) {
      logger.warn(
        { hallucinatedNumber: cleanNum, allowed: Array.from(allowedSet) },
        'LLM validation rejected: hallucinated number detected',
      );
      return false;
    }
  }

  return true;
}

export const insightService = {
  /**
   * Run ML anomaly detection on user's transactions and persist insights.
   */
  detectAndSyncAnomalies: async (userId: string): Promise<IInsight[]> => {
    // 1. Fetch user transactions
    const transactions = await Transaction.find({ userId })
      .sort({ date: 1 })
      .lean();

    if (transactions.length < 3) {
      return Insight.find({ userId, type: 'anomaly' })
        .sort({ createdAt: -1 });
    }

    const payload = {
      transactions: transactions.map((t) => ({
        id: t._id.toString(),
        date: t.date.toISOString().split('T')[0],
        amount: t.amount,
        category: t.category || 'Uncategorized',
        merchant: t.merchant || 'Unknown',
        direction: t.direction,
        description: t.description,
      })),
      evaluateHorizonDays: 45,
      zScoreThreshold: 3.0,
    };

    // 2. Call ML Service
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const res = await fetch(`${env.ML_SERVICE_URL}/anomalies/detect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Key': env.INTERNAL_API_KEY,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = (await res.json()) as {
          anomalies: AnomalyResult[];
          modelVersion: string;
        };

        // 3. Upsert detected anomalies into Insight collection
        for (const anomaly of data.anomalies) {
          await Insight.findOneAndUpdate(
            {
              userId: new mongoose.Types.ObjectId(userId),
              type: 'anomaly',
              'evidence.transactionId': anomaly.transactionId,
            },
            {
              $setOnInsert: {
                userId: new mongoose.Types.ObjectId(userId),
                type: 'anomaly',
                period: anomaly.comparisonPeriod,
                severity: anomaly.severity,
                explanation: anomaly.explanation,
                evidence: {
                  transactionId: anomaly.transactionId,
                  date: anomaly.date,
                  amount: anomaly.amount,
                  category: anomaly.category,
                  merchant: anomaly.merchant,
                  anomalyScore: anomaly.anomalyScore,
                  robustZScore: anomaly.robustZScore,
                  reasonCode: anomaly.reasonCode,
                  supportingValues: anomaly.supportingValues,
                },
                status: 'open',
                modelVersion: data.modelVersion || '1.0.0',
              },
            },
            { upsert: true, new: true },
          );
        }
      } else {
        logger.warn(
          { status: res.status },
          'ML anomalies endpoint returned non-200',
        );
      }
    } catch (err: any) {
      logger.warn(
        { error: err.message },
        'ML anomaly service unreachable, falling back to stored insights',
      );
    }

    // 4. Return all persisted anomaly insights for the user
    return Insight.find({ userId, type: 'anomaly' })
      .sort({ createdAt: -1 });
  },

  /**
   * Get stored anomalies with optional status filter.
   */
  getStoredAnomalies: async (
    userId: string,
    status?: string,
  ): Promise<IInsight[]> => {
    const query: Record<string, unknown> = {
      userId: new mongoose.Types.ObjectId(userId),
      type: 'anomaly',
    };
    if (status) {
      query.status = status;
    }
    return Insight.find(query).sort({ createdAt: -1 });
  },

  /**
   * Update status feedback for an insight (open, expected, incorrect, dismissed).
   */
  updateInsightStatus: async (
    insightId: string,
    userId: string,
    status: InsightStatus,
  ): Promise<IInsight> => {
    if (!mongoose.Types.ObjectId.isValid(insightId)) {
      throw new ValidationError('Invalid insight ID format');
    }

    const validStatuses: InsightStatus[] = [
      'open',
      'expected',
      'incorrect',
      'dismissed',
    ];
    if (!validStatuses.includes(status)) {
      throw new ValidationError(
        `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
      );
    }

    const insight = await Insight.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(insightId),
        userId: new mongoose.Types.ObjectId(userId),
      },
      { $set: { status } },
      { new: true, runValidators: true },
    );

    if (!insight) {
      throw new NotFoundError('Insight not found');
    }

    return insight;
  },

  /**
   * Generate actionable financial recommendations with optional LLM rephrasing.
   */
  getRecommendations: async (
    userId: string,
  ): Promise<RecommendationResult[]> => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    const startOfCurrentMonth = new Date(currentYear, currentMonth, 1);
    const startOfPreviousMonth = new Date(currentYear, currentMonth - 1, 1);
    const endOfPreviousMonth = new Date(currentYear, currentMonth, 0, 23, 59, 59);

    // 1. Aggregate current month transactions
    const currTxs = await Transaction.find({
      userId,
      date: { $gte: startOfCurrentMonth },
    }).lean();

    // 2. Aggregate previous month transactions
    const prevTxs = await Transaction.find({
      userId,
      date: { $gte: startOfPreviousMonth, $lte: endOfPreviousMonth },
    }).lean();

    let currentIncome = 0;
    let currentExpense = 0;
    const catSpendCurr: Record<string, number> = {};

    for (const t of currTxs) {
      if (t.direction === 'income') {
        currentIncome += t.amount;
      } else {
        currentExpense += t.amount;
        const cat = t.category || 'Uncategorized';
        catSpendCurr[cat] = (catSpendCurr[cat] || 0) + t.amount;
      }
    }

    let prevIncome = 0;
    let prevExpense = 0;
    const catSpendPrev: Record<string, number> = {};

    for (const t of prevTxs) {
      if (t.direction === 'income') {
        prevIncome += t.amount;
      } else {
        prevExpense += t.amount;
        const cat = t.category || 'Uncategorized';
        catSpendPrev[cat] = (catSpendPrev[cat] || 0) + t.amount;
      }
    }

    // 3. Fetch active goals
    const goals = await Goal.find({ userId, status: 'active' }).lean();
    const activeGoals = goals.map((g) => {
      const targetDate = new Date(g.targetDate);
      const monthsLeft = Math.max(
        1,
        (targetDate.getFullYear() - now.getFullYear()) * 12 +
          (targetDate.getMonth() - now.getMonth()),
      );
      const remaining = Math.max(0, g.targetAmount - g.currentAmount);
      const requiredMonthly = Math.round(remaining / monthsLeft);
      return {
        id: g._id.toString(),
        name: g.name,
        targetAmount: g.targetAmount,
        currentAmount: g.currentAmount,
        targetDate: g.targetDate.toISOString().split('T')[0],
        requiredMonthly,
        status: g.status,
      };
    });

    // 4. Fetch recurring charges from ML service
    let recurringChargesCount = 0;
    let recurringChargesTotal = 0;
    let priceIncreasesCount = 0;

    try {
      const allTxs = await Transaction.find({ userId }).sort({ date: 1 }).lean();
      if (allTxs.length >= 2) {
        const recRes = await fetch(`${env.ML_SERVICE_URL}/recurring/detect`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Internal-Key': env.INTERNAL_API_KEY,
          },
          body: JSON.stringify({
            transactions: allTxs.map((t) => ({
              id: t._id.toString(),
              date: t.date.toISOString().split('T')[0],
              amount: t.amount,
              category: t.category || 'Uncategorized',
              merchant: t.merchant || 'Unknown',
              direction: t.direction,
            })),
          }),
        });

        if (recRes.ok) {
          const recData = (await recRes.json()) as {
            recurringCharges: RecurringChargeResult[];
            totalRecurringMonthly: number;
            priceIncreasesDetected: number;
          };
          recurringChargesCount = recData.recurringCharges.length;
          recurringChargesTotal = recData.totalRecurringMonthly;
          priceIncreasesCount = recData.priceIncreasesDetected;
        }
      }
    } catch {
      // Non-fatal, continue with zeros
    }

    // 5. Build context payload for ML recommendations rule engine
    const contextPayload = {
      currentMonthIncome: currentIncome,
      currentMonthExpense: currentExpense,
      previousMonthIncome: prevIncome,
      previousMonthExpense: prevExpense,
      categorySpendCurrentMonth: catSpendCurr,
      categorySpendPreviousMonth: catSpendPrev,
      forecastSurplusNextMonth: currentIncome - currentExpense,
      activeGoals,
      recurringChargesCount,
      recurringChargesTotal,
      priceIncreasesCount,
      targetSavingsRate: 20.0,
    };

    // 6. Call ML Recommendation Engine
    let recommendations: RecommendationResult[] = [];
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const res = await fetch(
        `${env.ML_SERVICE_URL}/recommendations/features`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Internal-Key': env.INTERNAL_API_KEY,
          },
          body: JSON.stringify(contextPayload),
          signal: controller.signal,
        },
      );
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = (await res.json()) as {
          recommendations: RecommendationResult[];
        };
        recommendations = data.recommendations;
      }
    } catch (err: any) {
      logger.warn(
        { error: err.message },
        'ML recommendation engine unreachable',
      );
    }

    // 7. Optional LLM wording rephrase with strict numerical verification
    if (env.GEMINI_API_KEY && recommendations.length > 0) {
      try {
        recommendations = await Promise.all(
          recommendations.map(async (rec) => {
            try {
              // Gather allowed numbers from evidence values and template
              const allowedNumbers: (number | string)[] = Object.values(
                rec.evidenceValues,
              ).filter((v) => typeof v === 'number' || typeof v === 'string') as (
                | number
                | string
              )[];

              // Call Gemini to gently polish wording without modifying facts or numbers
              const prompt = `You are a financial assistant. Rephrase the following financial recommendation rationale clearly and concisely.
IMPORTANT: You MUST NOT invent, modify, or add any numbers. Use only the exact numbers provided.
Original: "${rec.rationale}"
Polished:`;

              const geminiRes = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { temperature: 0.1, maxOutputTokens: 150 },
                  }),
                },
              );

              if (geminiRes.ok) {
                const geminiData = (await geminiRes.json()) as any;
                const candidateText =
                  geminiData.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

                if (
                  candidateText &&
                  validateLLMNumbers(candidateText, allowedNumbers)
                ) {
                  return { ...rec, rationale: candidateText };
                }
              }
            } catch {
              // Fall back to template on any error
            }
            return rec;
          }),
        );
      } catch {
        // Fall back to deterministic templates
      }
    }

    return recommendations;
  },

  /**
   * Detect recurring subscriptions from transactions and sync into Reminder model.
   */
  detectAndSyncReminders: async (userId: string) => {
    const transactions = await Transaction.find({ userId })
      .sort({ date: 1 })
      .lean();

    if (transactions.length < 2) {
      return Reminder.find({ userId, status: 'active' })
        .sort({ dueDay: 1 })
        .lean();
    }

    try {
      const res = await fetch(`${env.ML_SERVICE_URL}/recurring/detect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Key': env.INTERNAL_API_KEY,
        },
        body: JSON.stringify({
          transactions: transactions.map((t) => ({
            id: t._id.toString(),
            date: t.date.toISOString().split('T')[0],
            amount: t.amount,
            category: t.category || 'Uncategorized',
            merchant: t.merchant || 'Unknown',
            direction: t.direction,
          })),
        }),
      });

      if (res.ok) {
        const data = (await res.json()) as {
          recurringCharges: RecurringChargeResult[];
        };

        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();
        const currentDay = now.getDate();

        for (const charge of data.recurringCharges) {
          if (charge.cadence === 'monthly') {
            // Compute next due date
            const dueDay = charge.suggestedDueDay || 1;
            let nextDue: Date;
            if (currentDay <= dueDay) {
              nextDue = new Date(currentYear, currentMonth, dueDay);
            } else {
              nextDue = new Date(currentYear, currentMonth + 1, dueDay);
            }

            await Reminder.findOneAndUpdate(
              {
                userId: new mongoose.Types.ObjectId(userId),
                title: charge.merchant,
              },
              {
                $setOnInsert: {
                  userId: new mongoose.Types.ObjectId(userId),
                  title: charge.merchant,
                  amount: charge.lastAmount,
                  dueDay,
                  category: charge.category || 'Subscription',
                  source: 'detected',
                  status: 'active',
                  nextDueDate: nextDue,
                },
              },
              { upsert: true, new: true },
            );
          }
        }
      }
    } catch (err: any) {
      logger.warn(
        { error: err.message },
        'ML recurring service unreachable, returning existing reminders',
      );
    }

    return Reminder.find({ userId, status: 'active' })
      .sort({ dueDay: 1 })
      .lean();
  },
};
