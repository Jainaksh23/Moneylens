import { parse } from 'csv-parse/sync';
import { BadRequestError } from './errors.js';
import {
  parseKolkataDate,
  normalizeDirectionAndAmount,
} from './transactionUtils.js';

export interface ParsedCsvRow {
  rowNumber: number;
  date: Date;
  amount: number;
  direction: 'income' | 'expense';
  description: string;
  merchant?: string;
  category?: string;
  raw: string;
}

export interface CsvRowError {
  row: number;
  message: string;
  raw: string;
}

export interface DetectedHeader {
  headerLineNumber: number;
  headerIndex: number;
  layout: 'split_debit_credit' | 'single_amount';
  dateCol: number;
  descCol: number;
  debitCol?: number;
  creditCol?: number;
  amountCol?: number;
  typeCol?: number;
  merchantCol?: number;
  categoryCol?: number;
  balanceCol?: number;
}

export interface ParseCsvStatementResult {
  detectedHeader: DetectedHeader;
  transactions: ParsedCsvRow[];
  errors: CsvRowError[];
  totalDataRows: number;
}

// Header matching regular expressions
const DATE_COL_EXACT = /^(txn\s*date|transaction\s*date|trans\s*date|booking\s*date|value\s*date|val\s*date|post\s*date|posting\s*date|date)$/i;
const DATE_COL_KEYWORD = /\b(date|txn\s*date)\b/i;

const DESC_COL_EXACT = /^(narration|particulars|description|desc|transaction\s*details|transaction\s*particulars|details|remarks)$/i;
const DESC_COL_KEYWORD = /\b(narration|particulars|description|details)\b/i;

const DEBIT_COL_REGEX = /^(debit(\s*amount)?|dr(\s*amount)?|withdrawal(\s*amount)?|withdrawals?)$/i;
const CREDIT_COL_REGEX = /^(credit(\s*amount)?|cr(\s*amount)?|deposit(\s*amount)?|deposits?)$/i;

const AMOUNT_COL_REGEX = /^(amount|amt|txn\s*amount|trans\s*amount|transaction\s*amount|value)$/i;
const TYPE_COL_REGEX = /^(type|dr\/?cr|cr\/?dr|trx\s*type|trans\s*type|direction)$/i;

const MERCHANT_COL_REGEX = /^(merchant|vendor|payee)$/i;
const CATEGORY_COL_REGEX = /^(category)$/i;
const BALANCE_COL_REGEX = /^(balance|bal|running\s*balance|closing\s*balance)$/i;

// Footer/summary row keywords
const FOOTER_REGEX = /\b(total|grand\s*total|subtotal|closing\s*balance|closing\s*bal|opening\s*balance|opening\s*bal|end\s*of\s*statement|statement\s*summary|computer\s*generated|generated\s*on|page\s*\d+(\s*of\s*\d+)?|disclaimer|notice|summary)\b/i;

interface RawRowItem {
  cells: string[];
  lineNumber: number;
  rawText: string;
}

/**
 * Checks whether a row is a footer, summary, or disclaimer line that should be ignored.
 */
export const isFooterRow = (rowCells: string[], dateColIdx: number): boolean => {
  if (rowCells.every((c) => !c || c.trim().length === 0)) {
    return true;
  }

  const rawDateCell = (rowCells[dateColIdx] || '').trim();

  // If the date column parses into a valid date, it's a real transaction, not a footer
  if (rawDateCell) {
    try {
      parseKolkataDate(rawDateCell);
      return false;
    } catch {
      // Date did not parse
    }
  }

  const rowJoined = rowCells.join(' ').trim();
  if (FOOTER_REGEX.test(rowJoined)) {
    return true;
  }

  // If date cell is empty and the row has only 1 or 2 small populated cells with words like total/balance
  if (!rawDateCell && rowCells.filter((c) => c.trim().length > 0).length <= 2) {
    if (FOOTER_REGEX.test(rowJoined) || /^(total|bal|balance)$/i.test(rowJoined)) {
      return true;
    }
  }

  return false;
};

/**
 * Scans the first ~35 rows of parsed CSV lines to detect the transaction table header row.
 */
export const detectHeaderRow = (rows: RawRowItem[]): DetectedHeader | null => {
  const maxScan = Math.min(35, rows.length);

  for (let idx = 0; idx < maxScan; idx++) {
    const rowItem = rows[idx]!;
    const cells = rowItem.cells.map((c) => (c || '').trim().toLowerCase().replace(/[\r\n]+/g, ' '));

    // 1. Detect Date Column
    let dateCol = -1;
    // Prefer transaction/txn date over value date
    for (let c = 0; c < cells.length; c++) {
      if (/^(txn\s*date|transaction\s*date|trans\s*date)$/i.test(cells[c]!)) {
        dateCol = c;
        break;
      }
    }
    if (dateCol === -1) {
      for (let c = 0; c < cells.length; c++) {
        if (/^date$/i.test(cells[c]!)) {
          dateCol = c;
          break;
        }
      }
    }
    if (dateCol === -1) {
      for (let c = 0; c < cells.length; c++) {
        if (DATE_COL_EXACT.test(cells[c]!) || DATE_COL_KEYWORD.test(cells[c]!)) {
          dateCol = c;
          break;
        }
      }
    }

    // 2. Detect Description Column
    let descCol = -1;
    for (let c = 0; c < cells.length; c++) {
      if (DESC_COL_EXACT.test(cells[c]!)) {
        descCol = c;
        break;
      }
    }
    if (descCol === -1) {
      for (let c = 0; c < cells.length; c++) {
        if (DESC_COL_KEYWORD.test(cells[c]!)) {
          descCol = c;
          break;
        }
      }
    }

    // 3. Detect Balance Column first (to avoid misclassifying it as debit/credit)
    let balanceCol = -1;
    for (let c = 0; c < cells.length; c++) {
      if (BALANCE_COL_REGEX.test(cells[c]!)) {
        balanceCol = c;
        break;
      }
    }

    // 4. Detect Debit & Credit Columns
    let debitCol = -1;
    let creditCol = -1;
    for (let c = 0; c < cells.length; c++) {
      if (c === balanceCol) continue;
      const val = cells[c]!;
      if (DEBIT_COL_REGEX.test(val) || (/\b(debit|dr|withdrawal)\b/i.test(val) && !/\b(cr|credit|deposit)\b/i.test(val))) {
        if (debitCol === -1) debitCol = c;
      }
      if (CREDIT_COL_REGEX.test(val) || (/\b(credit|cr|deposit)\b/i.test(val) && !/\b(dr|debit|withdrawal)\b/i.test(val))) {
        if (creditCol === -1) creditCol = c;
      }
    }

    // 5. Detect Single Amount Column
    let amountCol = -1;
    for (let c = 0; c < cells.length; c++) {
      if (c === balanceCol) continue;
      const val = cells[c]!;
      if (AMOUNT_COL_REGEX.test(val) || (/\b(amount|amt)\b/i.test(val) && !/\b(balance|bal|total)\b/i.test(val))) {
        amountCol = c;
        break;
      }
    }

    // 6. Auxiliary Columns
    let typeCol = -1;
    let merchantCol = -1;
    let categoryCol = -1;

    for (let c = 0; c < cells.length; c++) {
      if (c === debitCol || c === creditCol || c === amountCol || c === balanceCol) continue;
      const val = cells[c]!;
      if (TYPE_COL_REGEX.test(val) || /\b(dr\/?cr|cr\/?dr)\b/i.test(val)) {
        typeCol = c;
      }
      if (MERCHANT_COL_REGEX.test(val)) merchantCol = c;
      if (CATEGORY_COL_REGEX.test(val)) categoryCol = c;
    }

    // Header validation
    if (dateCol !== -1 && descCol !== -1) {
      if (debitCol !== -1 && creditCol !== -1) {
        return {
          headerLineNumber: rowItem.lineNumber,
          headerIndex: idx,
          layout: 'split_debit_credit',
          dateCol,
          descCol,
          debitCol,
          creditCol,
          balanceCol: balanceCol !== -1 ? balanceCol : undefined,
          merchantCol: merchantCol !== -1 ? merchantCol : undefined,
          categoryCol: categoryCol !== -1 ? categoryCol : undefined,
        };
      }

      if (amountCol !== -1) {
        return {
          headerLineNumber: rowItem.lineNumber,
          headerIndex: idx,
          layout: 'single_amount',
          dateCol,
          descCol,
          amountCol,
          typeCol: typeCol !== -1 ? typeCol : undefined,
          balanceCol: balanceCol !== -1 ? balanceCol : undefined,
          merchantCol: merchantCol !== -1 ? merchantCol : undefined,
          categoryCol: categoryCol !== -1 ? categoryCol : undefined,
        };
      }

      if (debitCol !== -1 || creditCol !== -1) {
        return {
          headerLineNumber: rowItem.lineNumber,
          headerIndex: idx,
          layout: 'split_debit_credit',
          dateCol,
          descCol,
          debitCol: debitCol !== -1 ? debitCol : undefined,
          creditCol: creditCol !== -1 ? creditCol : undefined,
          balanceCol: balanceCol !== -1 ? balanceCol : undefined,
          merchantCol: merchantCol !== -1 ? merchantCol : undefined,
          categoryCol: categoryCol !== -1 ? categoryCol : undefined,
        };
      }
    }
  }

  return null;
};

/**
 * Cleans string and parses numeric amount (ignoring currency symbols, commas, and dashes).
 * Returns positive float, or 0 if string is empty / invalid / dash.
 */
const parseCleanAmount = (str?: string): number => {
  if (!str) return 0;
  const cleaned = str
    .replace(/[₹,\s]/g, '')
    .replace(/\b(dr|cr|debit|credit)\b/gi, '')
    .replace(/[()]/g, '')
    .trim();

  if (!cleaned || cleaned === '-' || cleaned === '--') {
    return 0;
  }

  const num = parseFloat(cleaned);
  return isNaN(num) || !isFinite(num) ? 0 : Math.abs(num);
};

/**
 * Parses statement CSV buffer, automatically handles preamble skipping,
 * detects header and layout (single amount vs split debit/credit),
 * ignores footers, and normalizes valid rows to canonical schema.
 */
export const parseCsvStatement = (fileBuffer: Buffer): ParseCsvStatementResult => {
  let rawParsed: Array<{ info: { lines: number }; record: string[] }>;

  try {
    rawParsed = parse(fileBuffer, {
      relax_column_count: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
      relax_quotes: true,
      info: true,
    }) as unknown as Array<{ info: { lines: number }; record: string[] }>;
  } catch (parseErr) {
    throw new BadRequestError(
      `Failed to parse CSV file: ${parseErr instanceof Error ? parseErr.message : 'Malformed CSV'}`,
    );
  }

  if (!rawParsed || rawParsed.length === 0) {
    throw new BadRequestError('The uploaded CSV file contains no data rows.');
  }

  const rows: RawRowItem[] = rawParsed.map((item) => ({
    cells: item.record,
    lineNumber: item.info.lines,
    rawText: item.record.join(','),
  }));

  const detectedHeader = detectHeaderRow(rows);
  if (!detectedHeader) {
    throw new BadRequestError(
      'Could not find the transaction table. Please download the template or upload a standard statement.',
    );
  }

  const transactions: ParsedCsvRow[] = [];
  const errors: CsvRowError[] = [];

  // Process rows strictly after the detected header row
  for (let idx = detectedHeader.headerIndex + 1; idx < rows.length; idx++) {
    const rowItem = rows[idx]!;
    const cells = rowItem.cells;
    const lineNum = rowItem.lineNumber;
    const rawLine = rowItem.rawText;

    // Check if this row is a footer / summary / disclaimer row
    if (isFooterRow(cells, detectedHeader.dateCol)) {
      continue;
    }

    // 1. Extract and validate Date
    const rawDate = (cells[detectedHeader.dateCol] || '').trim();
    if (!rawDate) {
      errors.push({
        row: lineNum,
        message: 'Missing "date" column value',
        raw: rawLine,
      });
      continue;
    }

    let parsedDate: Date;
    try {
      parsedDate = parseKolkataDate(rawDate);
    } catch (dateErr) {
      errors.push({
        row: lineNum,
        message: dateErr instanceof Error ? dateErr.message : 'Invalid date',
        raw: rawLine,
      });
      continue;
    }

    // 2. Extract and validate Description
    const rawDesc = (cells[detectedHeader.descCol] || '').trim();
    if (!rawDesc) {
      errors.push({
        row: lineNum,
        message: 'Missing "description" column value',
        raw: rawLine,
      });
      continue;
    }

    // 3. Extract and normalize Amount & Direction based on layout
    let direction: 'income' | 'expense';
    let amount: number;

    if (detectedHeader.layout === 'split_debit_credit') {
      const debitRaw = detectedHeader.debitCol !== undefined ? cells[detectedHeader.debitCol] : undefined;
      const creditRaw = detectedHeader.creditCol !== undefined ? cells[detectedHeader.creditCol] : undefined;

      const debitVal = parseCleanAmount(debitRaw);
      const creditVal = parseCleanAmount(creditRaw);

      if (debitVal > 0 && creditVal > 0) {
        errors.push({
          row: lineNum,
          message: 'Row cannot have both debit and credit amounts',
          raw: rawLine,
        });
        continue;
      } else if (debitVal > 0) {
        direction = 'expense';
        amount = Number(debitVal.toFixed(2));
      } else if (creditVal > 0) {
        direction = 'income';
        amount = Number(creditVal.toFixed(2));
      } else {
        errors.push({
          row: lineNum,
          message: 'Transaction must have either a debit or credit amount',
          raw: rawLine,
        });
        continue;
      }
    } else {
      // Single amount layout
      const rawAmt = cells[detectedHeader.amountCol!];
      const rawType = detectedHeader.typeCol !== undefined ? cells[detectedHeader.typeCol] : '';

      if (rawAmt === undefined || rawAmt === null || String(rawAmt).trim() === '') {
        errors.push({
          row: lineNum,
          message: 'Missing "amount" column value',
          raw: rawLine,
        });
        continue;
      }

      try {
        const normalized = normalizeDirectionAndAmount(rawType || '', rawAmt);
        direction = normalized.direction;
        amount = normalized.amount;
      } catch (amtErr) {
        errors.push({
          row: lineNum,
          message: amtErr instanceof Error ? amtErr.message : 'Invalid amount or type',
          raw: rawLine,
        });
        continue;
      }
    }

    // 4. Auxiliary columns
    const rawMerchant =
      detectedHeader.merchantCol !== undefined ? cells[detectedHeader.merchantCol]?.trim() : undefined;
    const rawCategory =
      detectedHeader.categoryCol !== undefined ? cells[detectedHeader.categoryCol]?.trim() : undefined;

    transactions.push({
      rowNumber: lineNum,
      date: parsedDate,
      amount,
      direction,
      description: rawDesc,
      merchant: rawMerchant || undefined,
      category: rawCategory || undefined,
      raw: rawLine,
    });
  }

  return {
    detectedHeader,
    transactions,
    errors,
    totalDataRows: transactions.length + errors.length,
  };
};
