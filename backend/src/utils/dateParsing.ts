/**
 * Indian & Hinglish Date Expression Parser for MoneyLens Chat.
 *
 * Resolves natural language expressions (English, Hindi, Hinglish)
 * and explicit ISO date ranges in Asia/Kolkata (+05:30) timezone.
 */

import { BadRequestError } from './errors.js';

export interface ParsedDateRange {
  from: Date;
  to: Date;
  label: string;
}

export const MONTH_MAP: Record<string, number> = {
  january: 0, jan: 0,
  february: 1, feb: 1,
  march: 2, mar: 2,
  april: 3, apr: 3,
  may: 4,
  june: 5, jun: 5,
  july: 6, jul: 6,
  august: 7, aug: 7,
  september: 8, sep: 8, sept: 8,
  october: 9, oct: 9,
  november: 10, nov: 10,
  december: 11, dec: 11,
};

/**
 * Returns current date in Asia/Kolkata timezone.
 */
export function getKolkataNow(): Date {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utc + 3600000 * 5.5);
}

/**
 * Resolves date parameters from tool calls or natural language queries.
 */
export function resolveDateRange(
  fromDateStr?: string,
  toDateStr?: string,
  referenceDate: Date = getKolkataNow(),
): ParsedDateRange {
  const cleanFrom = (fromDateStr || '').toLowerCase().trim();
  const currentYear = referenceDate.getFullYear();

  // 1. Check if fromDateStr is a recognized month name (e.g. "March", "march")
  if (cleanFrom in MONTH_MAP) {
    const mIdx = MONTH_MAP[cleanFrom]!;
    const from = new Date(Date.UTC(currentYear, mIdx, 1, 0, 0, 0, 0));
    const to = new Date(Date.UTC(currentYear, mIdx + 1, 0, 23, 59, 59, 999));
    const displayMonth = cleanFrom.charAt(0).toUpperCase() + cleanFrom.slice(1);
    return {
      from,
      to,
      label: `${displayMonth} ${currentYear}`,
    };
  }

  // 2. Explicit ISO dates where both fromDate and toDate are given
  if (fromDateStr && toDateStr) {
    const from = new Date(fromDateStr);
    const to = new Date(toDateStr);

    if (isNaN(from.getTime())) {
      throw new BadRequestError(`Invalid fromDate parameter: ${fromDateStr}`);
    }
    if (isNaN(to.getTime())) {
      throw new BadRequestError(`Invalid toDate parameter: ${toDateStr}`);
    }
    to.setHours(23, 59, 59, 999);

    if (from > to) {
      throw new BadRequestError('fromDate cannot be after toDate');
    }

    const diffDays = (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays > 366) {
      throw new BadRequestError('Date range cannot exceed 365 days for analysis');
    }

    return {
      from,
      to,
      label: `${from.toISOString().slice(0, 10)} to ${to.toISOString().slice(0, 10)}`,
    };
  }

  // 3. Single phrase or natural language expression
  const input = fromDateStr || toDateStr;
  return parseNaturalDateRange(input, referenceDate);
}

/**
 * Parses natural language date range into from/to dates.
 */
export function parseNaturalDateRange(
  input?: string,
  referenceDate: Date = getKolkataNow(),
): ParsedDateRange {
  const currentYear = referenceDate.getFullYear();
  const currentMonth = referenceDate.getMonth();
  const currentDate = referenceDate.getDate();

  if (!input || !input.trim()) {
    // Default: Past 30 days
    const from = new Date(Date.UTC(currentYear, currentMonth, currentDate - 30, 0, 0, 0, 0));
    const to = new Date(Date.UTC(currentYear, currentMonth, currentDate, 23, 59, 59, 999));
    return {
      from,
      to,
      label: 'Past 30 Days',
    };
  }

  const clean = input.toLowerCase().trim();

  // 1. Last month / Pichle mahine / Pichla mahina
  if (
    clean.includes('last month') ||
    clean.includes('pichle mahine') ||
    clean.includes('pichla mahina') ||
    clean.includes('previous month') ||
    clean === 'last_month'
  ) {
    const prevMonthIdx = currentMonth - 1;
    const year = prevMonthIdx < 0 ? currentYear - 1 : currentYear;
    const mIdx = (prevMonthIdx + 12) % 12;
    const from = new Date(Date.UTC(year, mIdx, 1, 0, 0, 0, 0));
    const to = new Date(Date.UTC(year, mIdx + 1, 0, 23, 59, 59, 999));
    const monthName = Object.keys(MONTH_MAP).find((k) => MONTH_MAP[k] === mIdx && k.length > 3) || 'Last Month';
    return {
      from,
      to,
      label: `${monthName.charAt(0).toUpperCase() + monthName.slice(1)} ${year}`,
    };
  }

  // 2. This month / Is mahine / Ye mahina
  if (
    clean.includes('this month') ||
    clean.includes('is mahine') ||
    clean.includes('ye mahina') ||
    clean.includes('current month') ||
    clean === 'this_month'
  ) {
    const from = new Date(Date.UTC(currentYear, currentMonth, 1, 0, 0, 0, 0));
    const to = new Date(Date.UTC(currentYear, currentMonth, currentDate, 23, 59, 59, 999));
    const monthName = Object.keys(MONTH_MAP).find((k) => MONTH_MAP[k] === currentMonth && k.length > 3) || 'This Month';
    return {
      from,
      to,
      label: `${monthName.charAt(0).toUpperCase() + monthName.slice(1)} ${currentYear} (MTD)`,
    };
  }

  // 3. Last 3 months / Pichle 3 mahine
  if (
    clean.includes('last 3 months') ||
    clean.includes('past 3 months') ||
    clean.includes('pichle 3 mahine') ||
    clean.includes('pichle teen mahine') ||
    clean.includes('past 90 days')
  ) {
    const from = new Date(Date.UTC(currentYear, currentMonth - 3, currentDate, 0, 0, 0, 0));
    const to = new Date(Date.UTC(currentYear, currentMonth, currentDate, 23, 59, 59, 999));
    return {
      from,
      to,
      label: 'Past 3 Months',
    };
  }

  // 4. Last 6 months / Pichle 6 mahine
  if (
    clean.includes('last 6 months') ||
    clean.includes('past 6 months') ||
    clean.includes('pichle 6 mahine') ||
    clean.includes('pichle chhe mahine')
  ) {
    const from = new Date(Date.UTC(currentYear, currentMonth - 6, currentDate, 0, 0, 0, 0));
    const to = new Date(Date.UTC(currentYear, currentMonth, currentDate, 23, 59, 59, 999));
    return {
      from,
      to,
      label: 'Past 6 Months',
    };
  }

  // 5. This year / Is saal / Current year
  if (
    clean.includes('this year') ||
    clean.includes('is saal') ||
    clean.includes('ye saal') ||
    clean.includes('current year') ||
    clean.includes('ytd')
  ) {
    const from = new Date(Date.UTC(currentYear, 0, 1, 0, 0, 0, 0));
    const to = new Date(Date.UTC(currentYear, currentMonth, currentDate, 23, 59, 59, 999));
    return {
      from,
      to,
      label: `${currentYear} (YTD)`,
    };
  }

  // 6. Last year / Pichle saal
  if (
    clean.includes('last year') ||
    clean.includes('pichle saal') ||
    clean.includes('previous year')
  ) {
    const from = new Date(Date.UTC(currentYear - 1, 0, 1, 0, 0, 0, 0));
    const to = new Date(Date.UTC(currentYear - 1, 11, 31, 23, 59, 59, 999));
    return {
      from,
      to,
      label: `Full Year ${currentYear - 1}`,
    };
  }

  // 7. Last week / Pichle hafte
  if (
    clean.includes('last week') ||
    clean.includes('pichle hafte') ||
    clean.includes('past week') ||
    clean.includes('past 7 days')
  ) {
    const from = new Date(Date.UTC(currentYear, currentMonth, currentDate - 7, 0, 0, 0, 0));
    const to = new Date(Date.UTC(currentYear, currentMonth, currentDate, 23, 59, 59, 999));
    return {
      from,
      to,
      label: 'Past 7 Days',
    };
  }

  // 8. This week / Is hafte
  if (clean.includes('this week') || clean.includes('is hafte')) {
    const dayOfWeek = referenceDate.getDay();
    const diff = (dayOfWeek + 6) % 7;
    const from = new Date(Date.UTC(currentYear, currentMonth, currentDate - diff, 0, 0, 0, 0));
    const to = new Date(Date.UTC(currentYear, currentMonth, currentDate, 23, 59, 59, 999));
    return {
      from,
      to,
      label: 'This Week',
    };
  }

  // 9. Diwali ke time / Festive season
  if (clean.includes('diwali') || clean.includes('festive')) {
    const from = new Date(Date.UTC(currentYear, 9, 1, 0, 0, 0, 0));
    const to = new Date(Date.UTC(currentYear, 10, 30, 23, 59, 59, 999));
    return {
      from,
      to,
      label: `Festive / Diwali Season ${currentYear} (Oct-Nov)`,
    };
  }

  // 10. Month names: e.g. "March", "March mein", "in April 2026"
  for (const [monthKey, mIdx] of Object.entries(MONTH_MAP)) {
    if (new RegExp(`\\b${monthKey}\\b`, 'i').test(clean)) {
      const yearMatch = clean.match(/\b(202\d)\b/);
      const targetYear = yearMatch && yearMatch[1] ? parseInt(yearMatch[1], 10) : currentYear;
      const from = new Date(Date.UTC(targetYear, mIdx, 1, 0, 0, 0, 0));
      const to = new Date(Date.UTC(targetYear, mIdx + 1, 0, 23, 59, 59, 999));
      const displayMonth = monthKey.charAt(0).toUpperCase() + monthKey.slice(1);
      return {
        from,
        to,
        label: `${displayMonth} ${targetYear}`,
      };
    }
  }

  // 11. Explicit ISO date
  const maybeDate = new Date(input);
  if (!isNaN(maybeDate.getTime())) {
    const from = new Date(maybeDate);
    from.setHours(0, 0, 0, 0);
    const to = new Date(maybeDate);
    to.setHours(23, 59, 59, 999);
    return {
      from,
      to,
      label: input,
    };
  }

  // Fallback: Past 30 days
  const from = new Date(Date.UTC(currentYear, currentMonth, currentDate - 30, 0, 0, 0, 0));
  const to = new Date(Date.UTC(currentYear, currentMonth, currentDate, 23, 59, 59, 999));
  return {
    from,
    to,
    label: 'Past 30 Days',
  };
}

/**
 * Validates date ranges:
 * - from <= to
 * - max span <= 5 years (1826 days)
 */
export function validateDateRange(from: Date, to: Date): void {
  if (from > to) {
    throw new BadRequestError('fromDate cannot be after toDate');
  }
  const diffDays = (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24);
  if (diffDays > 1826) {
    throw new BadRequestError('Date range cannot exceed 5 years');
  }
}
