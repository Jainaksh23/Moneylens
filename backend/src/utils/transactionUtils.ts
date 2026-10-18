import crypto from 'crypto';

/**
 * Normalizes merchant names for consistent display and fingerprint matching.
 * Missing or empty merchant values return 'unknown'.
 */
export const normalizeMerchant = (rawMerchant?: string | null): string => {
  if (!rawMerchant || typeof rawMerchant !== 'string') {
    return 'unknown';
  }
  const cleaned = rawMerchant.trim().toLowerCase().replace(/\s+/g, ' ');
  return cleaned.length > 0 ? cleaned : 'unknown';
};

/**
 * Normalizes category names.
 * Missing or empty categories return 'unknown'.
 */
export const normalizeCategory = (rawCategory?: string | null): string => {
  if (!rawCategory || typeof rawCategory !== 'string') {
    return 'unknown';
  }
  const cleaned = rawCategory.trim().toLowerCase().replace(/\s+/g, ' ');
  return cleaned.length > 0 ? cleaned : 'unknown';
};

export interface NormalizedFinancials {
  direction: 'income' | 'expense';
  amount: number;
}

/**
 * Normalizes direction and amount once to prevent double-negation bugs.
 * Amount is guaranteed to be a positive number (> 0).
 */
export const normalizeDirectionAndAmount = (
  rawType: string,
  rawAmount: number | string,
): NormalizedFinancials => {
  const parsedAmt = typeof rawAmount === 'number' ? rawAmount : parseFloat(String(rawAmount).replace(/[₹,\s]/g, ''));

  if (isNaN(parsedAmt) || !isFinite(parsedAmt)) {
    throw new Error(`Invalid numeric amount: ${rawAmount}`);
  }

  const positiveAmount = Math.abs(parsedAmt);
  if (positiveAmount <= 0) {
    throw new Error('Transaction amount must be strictly greater than zero');
  }

  const typeStr = (rawType || '').trim().toLowerCase();

  // If rawType indicates expense/debit
  if (['debit', 'expense', 'dr', 'outflow'].includes(typeStr)) {
    return { direction: 'expense', amount: Number(positiveAmount.toFixed(2)) };
  }

  // If rawType indicates income/credit
  if (['credit', 'income', 'cr', 'inflow', 'salary'].includes(typeStr)) {
    return { direction: 'income', amount: Number(positiveAmount.toFixed(2)) };
  }

  // Fallback: If type was missing or ambiguous, infer from original sign
  if (parsedAmt < 0) {
    return { direction: 'expense', amount: Number(positiveAmount.toFixed(2)) };
  }

  throw new Error(
    `Unrecognized transaction type: "${rawType}". Expected "debit", "credit", "income", or "expense"`,
  );
};

/**
 * Parses a date string in YYYY-MM-DD or DD/MM/YYYY format with Asia/Kolkata timezone (+05:30).
 * Prevents UTC timezone drift where 2026-10-14 becomes 2026-10-13 in UTC.
 */
export const parseKolkataDate = (dateStr: string): Date => {
  if (!dateStr || typeof dateStr !== 'string') {
    throw new Error('Date string is required');
  }

  const trimmed = dateStr.trim();
  let year: number;
  let month: number; // 1-12
  let day: number;

  // Pattern 1: YYYY-MM-DD
  const isoMatch = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(trimmed);
  // Pattern 2: DD/MM/YYYY or DD-MM-YYYY
  const indianMatch = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(trimmed);

  if (isoMatch) {
    year = parseInt(isoMatch[1]!, 10);
    month = parseInt(isoMatch[2]!, 10);
    day = parseInt(isoMatch[3]!, 10);
  } else if (indianMatch) {
    day = parseInt(indianMatch[1]!, 10);
    month = parseInt(indianMatch[2]!, 10);
    year = parseInt(indianMatch[3]!, 10);
  } else {
    throw new Error(
      `Invalid date format: "${dateStr}". Supported formats are YYYY-MM-DD or DD/MM/YYYY`,
    );
  }

  if (month < 1 || month > 12) {
    throw new Error(`Invalid month ${month} in date: "${dateStr}"`);
  }

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day < 1 || day > daysInMonth) {
    throw new Error(`Invalid day ${day} for month ${month} in date: "${dateStr}"`);
  }

  // Construct ISO string with explicit Asia/Kolkata offset (+05:30)
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  const kolkataIso = `${year}-${mm}-${dd}T00:00:00+05:30`;

  const parsedDate = new Date(kolkataIso);
  if (isNaN(parsedDate.getTime())) {
    throw new Error(`Failed to parse valid date: "${dateStr}"`);
  }

  return parsedDate;
};

/**
 * Computes deterministic duplicate fingerprint:
 * userId + ISO date (YYYY-MM-DD) + amount (2 decimal places) + normalized merchant.
 */
export const computeFingerprint = (
  userId: string,
  date: Date,
  amount: number,
  normalizedMerchant: string,
): string => {
  // Extract Kolkata calendar date YYYY-MM-DD
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const dateKey = formatter.format(date);
  const amountKey = amount.toFixed(2);
  const merchantKey = normalizedMerchant.toLowerCase().trim();

  const rawKey = `${userId}::${dateKey}::${amountKey}::${merchantKey}`;
  return crypto.createHash('sha256').update(rawKey).digest('hex');
};

/**
 * Safely escapes regular expression special characters to prevent regex injection and ReDoS.
 */
export const escapeRegex = (str: string): string => {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

