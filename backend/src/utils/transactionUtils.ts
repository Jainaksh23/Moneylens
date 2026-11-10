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

const MONTH_NAMES: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  january: 1, february: 2, march: 3, april: 4, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

/**
 * Normalizes direction and amount once to prevent double-negation bugs.
 * Amount is guaranteed to be a positive number (> 0).
 */
export const normalizeDirectionAndAmount = (
  rawType: string,
  rawAmount: number | string,
): NormalizedFinancials => {
  const amtStr = typeof rawAmount === 'number' ? String(rawAmount) : String(rawAmount || '');
  let inferredType = (rawType || '').trim().toLowerCase();

  // If type was not explicitly given, check for Dr/Cr indicators inside the amount string
  if (!inferredType && typeof rawAmount === 'string') {
    if (/\b(dr|debit)\b/i.test(amtStr) || /\(dr\)/i.test(amtStr)) {
      inferredType = 'debit';
    } else if (/\b(cr|credit)\b/i.test(amtStr) || /\(cr\)/i.test(amtStr)) {
      inferredType = 'credit';
    }
  }

  // Clean currency symbols, commas, whitespace, Dr/Cr suffix, and wrapping parens
  const cleanNumeric = amtStr
    .replace(/[₹,\s]/g, '')
    .replace(/\b(dr|cr|debit|credit)\b/gi, '')
    .replace(/[()]/g, '')
    .trim();

  const parsedAmt = parseFloat(cleanNumeric);

  if (isNaN(parsedAmt) || !isFinite(parsedAmt)) {
    throw new Error(`Invalid numeric amount: ${rawAmount}`);
  }

  const positiveAmount = Math.abs(parsedAmt);
  if (positiveAmount <= 0) {
    throw new Error('Transaction amount must be strictly greater than zero');
  }

  const typeStr = inferredType.replace(/[^a-z]/g, '');

  // If rawType indicates expense/debit
  if (['debit', 'expense', 'dr', 'd', 'outflow', 'withdrawal'].includes(typeStr)) {
    return { direction: 'expense', amount: Number(positiveAmount.toFixed(2)) };
  }

  // If rawType indicates income/credit
  if (['credit', 'income', 'cr', 'c', 'inflow', 'deposit', 'salary'].includes(typeStr)) {
    return { direction: 'income', amount: Number(positiveAmount.toFixed(2)) };
  }

  // Fallback: If type was missing or ambiguous, infer from original sign
  if (parsedAmt < 0 || amtStr.trim().startsWith('-')) {
    return { direction: 'expense', amount: Number(positiveAmount.toFixed(2)) };
  }

  throw new Error(
    `Unrecognized transaction type: "${rawType}". Expected "debit", "credit", "income", or "expense"`,
  );
};

/**
 * Parses a date string in YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, or DD-Mon-YYYY format with Asia/Kolkata timezone (+05:30).
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

  // Strip trailing time portion if present (e.g. "01/01/2026 14:32:00" -> "01/01/2026")
  const dateOnly = trimmed.split(/\s{2,}|\s(?=\d{1,2}:)/)[0]!.split(/\s+/)[0]!;

  // Pattern 1: YYYY-MM-DD
  const isoMatch = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(dateOnly);
  // Pattern 2: DD/MM/YYYY or DD-MM-YYYY
  const indianNumericMatch = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(dateOnly);
  // Pattern 3: DD-Mon-YYYY or DD Mon YYYY
  const textDatePart = trimmed.split(/\s{2,}|\s(?=\d{1,2}:)/)[0]!;
  const indianNamedMatch = /^(\d{1,2})[-/. ]([A-Za-z]{3,9})[-/. ](\d{4})$/.exec(textDatePart);

  if (isoMatch) {
    year = parseInt(isoMatch[1]!, 10);
    month = parseInt(isoMatch[2]!, 10);
    day = parseInt(isoMatch[3]!, 10);
  } else if (indianNumericMatch) {
    day = parseInt(indianNumericMatch[1]!, 10);
    month = parseInt(indianNumericMatch[2]!, 10);
    year = parseInt(indianNumericMatch[3]!, 10);
  } else if (indianNamedMatch) {
    day = parseInt(indianNamedMatch[1]!, 10);
    const mStr = indianNamedMatch[2]!.toLowerCase();
    month = MONTH_NAMES[mStr] || 0;
    year = parseInt(indianNamedMatch[3]!, 10);
    if (!month) {
      throw new Error(`Invalid month name "${indianNamedMatch[2]}" in date: "${dateStr}"`);
    }
  } else {
    throw new Error(
      `Invalid date format: "${dateStr}". Supported formats are DD/MM/YYYY, DD-MM-YYYY, DD-Mon-YYYY, or YYYY-MM-DD`,
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

