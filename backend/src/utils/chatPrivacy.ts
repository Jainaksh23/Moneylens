/**
 * Privacy, Data Masking, Indian Number Formatting, and Sandboxing for Chat.
 *
 * Enforces:
 * 1. Payee & VPA Masking before prompt assembly (real values shown only in UI).
 * 2. Never send account numbers, card digits, phone, or email to LLM.
 * 3. Strip control characters and escape prompt injection markers.
 * 4. Deterministic Indian Rupee (INR) formatting with commas (₹1,23,456.78).
 */

const VPA_REGEX = /([a-zA-Z0-9.\-_]{2})[a-zA-Z0-9.\-_]*@([a-zA-Z]{2})[a-zA-Z]*/gi;
const ACCOUNT_REGEX = /\b\d{9,18}\b/g;
const CARD_REGEX = /\b(?:\d{4}[-\s]?){3}\d{4}\b/g;
const PHONE_REGEX = /\b[6-9]\d{9}\b/g;
const EMAIL_REGEX = /([a-zA-Z0-9_\-.]{2})[a-zA-Z0-9_\-.]*@([a-zA-Z0-9_\-.]{2})[a-zA-Z0-9_\-.]*\.([a-zA-Z]{2,5})/gi;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_REGEX = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/**
 * Masks a payee or merchant name.
 * e.g., "Swiggy" -> "Sw****"
 * "Landlord Rent" -> "La**** Re****"
 * "R" -> "R*"
 */
export function maskPayeeName(name?: string | null): string {
  if (!name || !name.trim()) return 'Payee';
  const clean = name.trim();
  if (clean.toLowerCase() === 'unknown' || clean.toLowerCase() === 'other') {
    return 'Other';
  }

  const words = clean.split(/\s+/);
  const maskedWords = words.map((w) => {
    if (w.length <= 2) return `${w.charAt(0)}*`;
    return `${w.slice(0, 2)}${'*'.repeat(Math.min(4, Math.max(2, w.length - 2)))}`;
  });

  return maskedWords.join(' ');
}

/**
 * Creates a stable session alias for a payee name.
 * e.g., "Payee #1 (Sw****)"
 */
export class PayeeMasker {
  private payeeMap: Map<string, string> = new Map();
  private reverseMap: Map<string, string> = new Map();
  private counter = 1;

  public mask(rawPayee: string): string {
    const key = (rawPayee || '').trim().toLowerCase();
    if (!key || key === 'unknown' || key === 'other') {
      return 'Other';
    }

    if (this.payeeMap.has(key)) {
      return this.payeeMap.get(key)!;
    }

    const maskedHint = maskPayeeName(rawPayee);
    const alias = `Payee #${this.counter} (${maskedHint})`;
    this.counter += 1;

    this.payeeMap.set(key, alias);
    this.reverseMap.set(alias, rawPayee);
    return alias;
  }

  public getRealName(alias: string): string | undefined {
    return this.reverseMap.get(alias);
  }
}

/**
 * Masks PII (VPAs, account numbers, cards, phones, emails) in any freeform text.
 */
export function maskSensitiveText(text: string): string {
  if (!text) return '';

  let sanitized = text.replace(CONTROL_CHARS_REGEX, ' ');

  // Mask email
  sanitized = sanitized.replace(EMAIL_REGEX, '$1***@$2***.$3');

  // Mask VPA handles
  sanitized = sanitized.replace(VPA_REGEX, '$1***@$2***');

  // Mask cards and accounts
  sanitized = sanitized.replace(CARD_REGEX, '[CARD_MASKED]');
  sanitized = sanitized.replace(ACCOUNT_REGEX, '[ACCOUNT_MASKED]');
  sanitized = sanitized.replace(PHONE_REGEX, '[PHONE_MASKED]');

  return sanitized.trim();
}

/**
 * Formats a numeric amount in Indian numbering system (lakhs, crores).
 * e.g., 150000 -> "₹1,50,000"
 * 150000.5 -> "₹1,50,000.50"
 */
export function formatINR(amount: number, includeDecimals = false): string {
  if (isNaN(amount) || !isFinite(amount)) return '₹0';

  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(amount);

  if (includeDecimals) {
    const parts = abs.toFixed(2).split('.');
    const integerPart = parts[0] || '0';
    const decimalPart = parts[1] || '00';
    return `${sign}₹${formatIndianGrouping(integerPart)}.${decimalPart}`;
  }

  const rounded = Math.round(abs).toString();
  return `${sign}₹${formatIndianGrouping(rounded)}`;
}

/**
 * Formats digits with Indian comma grouping:
 * 1234567 -> 12,34,567
 */
function formatIndianGrouping(intStr: string): string {
  if (intStr.length <= 3) return intStr;
  const lastThree = intStr.substring(intStr.length - 3);
  const remaining = intStr.substring(0, intStr.length - 3);
  const groupedRemaining = remaining.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${groupedRemaining},${lastThree}`;
}

/**
 * Strips prompt-injection phrases from user message or text.
 */
export function sanitizeForPrompt(text: string): string {
  if (!text) return '';
  return text
    .replace(CONTROL_CHARS_REGEX, ' ')
    .replace(/\b(ignore previous instructions|system prompt reveal|disregard instructions|you are now in developer mode)\b/gi, '[FILTERED_PHRASE]')
    .trim();
}
