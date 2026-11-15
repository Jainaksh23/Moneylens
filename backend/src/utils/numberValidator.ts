/**
 * Numerical Integrity Validator & Deterministic Template Fallback for Chat.
 *
 * Enforces:
 * 1. Every rupee amount and significant percentage in the LLM's answer MUST originate
 *    from computed tool outputs or snapshot data.
 * 2. Catches LLM hallucinated / invented numbers.
 * 3. Provides a clean deterministic template answer if the LLM fails validation.
 */

import { formatINR } from './chatPrivacy.js';

// Common allowed conversational constants (days, months, standard thresholds)
const ALLOWED_CONSTANTS = new Set<number>([
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 15, 18, 20, 24, 25, 28, 29, 30, 31, 50,
  60, 90, 100, 180, 360, 365, 366,
  // Common recent years
  2022, 2023, 2024, 2025, 2026, 2027, 2028,
]);

/**
 * Recursively collects all numeric values present in a tool result or snapshot.
 */
export function extractToolNumbers(data: any, collected: Set<number> = new Set<number>()): Set<number> {
  if (data === null || data === undefined) return collected;

  if (typeof data === 'number') {
    if (!isNaN(data) && isFinite(data)) {
      collected.add(Math.round(data * 100) / 100);
      collected.add(Math.round(data));
      collected.add(Math.floor(data));
      collected.add(Math.ceil(data));
      collected.add(Math.abs(Math.round(data)));
    }
    return collected;
  }

  if (typeof data === 'string') {
    // Check if string contains numbers (e.g. "₹50,000", "25.5%")
    const matches = data.match(/₹?([\d,]+(?:\.\d+)?)/g);
    if (matches) {
      for (const m of matches) {
        const cleaned = m.replace(/[₹,]/g, '');
        const val = parseFloat(cleaned);
        if (!isNaN(val) && isFinite(val)) {
          collected.add(Math.round(val * 100) / 100);
          collected.add(Math.round(val));
          collected.add(Math.abs(Math.round(val)));
        }
      }
    }
    return collected;
  }

  if (Array.isArray(data)) {
    for (const item of data) {
      extractToolNumbers(item, collected);
    }
    return collected;
  }

  if (typeof data === 'object') {
    for (const val of Object.values(data)) {
      extractToolNumbers(val, collected);
    }
  }

  return collected;
}

/**
 * Extracts all rupee amounts, percentages, and amounts > 100 from an LLM response text.
 */
export function extractAnswerNumbers(text: string): { amount: number; raw: string; isRupee: boolean }[] {
  const results: { amount: number; raw: string; isRupee: boolean }[] = [];
  if (!text) return results;

  // 1. Explicit Rupee amounts: e.g. ₹1,50,000 or ₹ 500 or Rs. 1200 or INR 450
  const rupeeRegex = /(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d+)?)/gi;
  let match: RegExpExecArray | null;

  while ((match = rupeeRegex.exec(text)) !== null) {
    if (match[1]) {
      const rawNum = match[1].replace(/,/g, '');
      const parsed = parseFloat(rawNum);
      if (!isNaN(parsed) && isFinite(parsed)) {
        results.push({ amount: parsed, raw: match[0], isRupee: true });
      }
    }
  }

  // 2. Percentages: e.g. 35.5% or 40%
  const pctRegex = /([\d,]+(?:\.\d+)?)\s*%/g;
  while ((match = pctRegex.exec(text)) !== null) {
    if (match[1]) {
      const rawNum = match[1].replace(/,/g, '');
      const parsed = parseFloat(rawNum);
      if (!isNaN(parsed) && isFinite(parsed)) {
        results.push({ amount: parsed, raw: match[0], isRupee: false });
      }
    }
  }

  // 3. Indian comma-grouped standalone numbers: e.g. 1,50,000
  const groupedRegex = /\b\d{1,3}(?:,\d{2,3})+\b/g;
  while ((match = groupedRegex.exec(text)) !== null) {
    const rawNum = match[0].replace(/,/g, '');
    const parsed = parseFloat(rawNum);
    if (!isNaN(parsed) && isFinite(parsed)) {
      // Avoid duplicates with rupee matches
      if (!results.some((r) => r.amount === parsed)) {
        results.push({ amount: parsed, raw: match[0], isRupee: true });
      }
    }
  }

  return results;
}

/**
 * Validates that every rupee amount in the LLM answer is verified by tool outputs.
 */
export function validateAnswerNumbers(
  answer: string,
  authorizedNumbers: Set<number>,
): { isValid: boolean; unverified: { amount: number; raw: string }[] } {
  const answerNumbers = extractAnswerNumbers(answer);
  const unverified: { amount: number; raw: string }[] = [];

  for (const item of answerNumbers) {
    const amt = Math.abs(item.amount);
    const roundedAmt = Math.round(amt);

    // If it's an allowed standard constant or small integer, permit it
    if (ALLOWED_CONSTANTS.has(roundedAmt) && !item.isRupee) {
      continue;
    }

    // Check if the number is within tolerance of any authorized number
    let matched = false;
    for (const auth of authorizedNumbers) {
      const diff = Math.abs(amt - auth);
      // Absolute tolerance <= 1.0 or relative tolerance <= 0.2%
      if (diff <= 1.0 || (auth > 0 && diff / auth <= 0.002)) {
        matched = true;
        break;
      }
    }

    if (!matched) {
      unverified.push({ amount: item.amount, raw: item.raw });
    }
  }

  return {
    isValid: unverified.length === 0,
    unverified,
  };
}

/**
 * Builds a deterministic, verified template answer from tool outputs and snapshot.
 * Used when the LLM hallucinates numbers or when operating in degraded fallback mode.
 */
export function buildDeterministicAnswer(context: {
  snapshot?: any;
  toolResults?: any[];
  userQuery?: string;
}): string {
  const { snapshot, toolResults } = context;

  // 1. If Category Spend tool was run
  const catSpend = toolResults?.find((t) => t.tool === 'getCategorySpend')?.result;
  if (catSpend) {
    let ans = `For **${catSpend.category}** during ${catSpend.period}, your total spend was **${formatINR(catSpend.totalSpend)}** across ${catSpend.transactionCount} transaction(s).`;
    if (catSpend.shareOfTotalExpense !== undefined && catSpend.shareOfTotalExpense > 0) {
      ans += ` This accounted for **${catSpend.shareOfTotalExpense}%** of your total expenses in this period.`;
    }
    if (catSpend.averageTransactionAmount > 0) {
      ans += `\n\n- **Average per transaction:** ${formatINR(catSpend.averageTransactionAmount)}`;
    }
    if (catSpend.topPayees && catSpend.topPayees.length > 0) {
      ans += `\n- **Top Payees:** ${catSpend.topPayees.map((p: any) => `${p.payee} (${formatINR(p.amount)})`).join(', ')}`;
    }
    return ans;
  }

  // 2. If Comparison tool was run
  const compare = toolResults?.find((t) => t.tool === 'comparePeriods')?.result;
  if (compare) {
    return `### Financial Comparison\n\n` +
      `- **Period A (${compare.periodA.label}):** Income ${formatINR(compare.periodA.totalIncome)} | Expense ${formatINR(compare.periodA.totalExpense)} | Net ${formatINR(compare.periodA.netCashFlow)} (Savings Rate: ${compare.periodA.savingsRate}%)\n` +
      `- **Period B (${compare.periodB.label}):** Income ${formatINR(compare.periodB.totalIncome)} | Expense ${formatINR(compare.periodB.totalExpense)} | Net ${formatINR(compare.periodB.netCashFlow)} (Savings Rate: ${compare.periodB.savingsRate}%)\n\n` +
      `**Changes (Period B vs Period A):**\n` +
      `- Expense Change: **${compare.changes.expensePercentChange > 0 ? '+' : ''}${compare.changes.expensePercentChange}%** (${formatINR(compare.changes.expenseDifference)})\n` +
      `- Income Change: **${compare.changes.incomePercentChange > 0 ? '+' : ''}${compare.changes.incomePercentChange}%**\n` +
      `- Net Cash Flow Difference: **${formatINR(compare.changes.netCashFlowDifference)}**`;
  }

  // 3. If Period Summary tool was run
  const summary = toolResults?.find((t) => t.tool === 'getSummary')?.result;
  if (summary) {
    return `Here is your financial summary for **${summary.period}**:\n\n` +
      `- **Total Income:** ${formatINR(summary.totalIncome)}\n` +
      `- **Total Expenses:** ${formatINR(summary.totalExpense)}\n` +
      `- **Net Cash Flow:** ${formatINR(summary.netCashFlow)}\n` +
      `- **Savings Rate:** ${summary.savingsRate}%\n` +
      `- **Transaction Count:** ${summary.transactionCount}`;
  }

  // 4. Default to Snapshot Data
  if (snapshot && snapshot.hasData) {
    let ans = `### Account Overview (${snapshot.dateCoverage.firstDate} to ${snapshot.dateCoverage.lastDate})\n\n`;
    ans += `- **Total Income:** ${formatINR(snapshot.totalIncome)}\n`;
    ans += `- **Total Expense:** ${formatINR(snapshot.totalExpense)}\n`;
    ans += `- **Net Savings:** ${formatINR(snapshot.netCashFlow)} (Savings Rate: **${snapshot.savingsRate}%**)\n`;
    ans += `- **Total Transactions:** ${snapshot.dateCoverage.transactionCount} across ${snapshot.dateCoverage.monthsCount} month(s)\n\n`;

    if (snapshot.topCategories && snapshot.topCategories.length > 0) {
      ans += `**Top Spending Categories:**\n`;
      for (const c of snapshot.topCategories.slice(0, 5)) {
        ans += `- **${c.category}:** ${formatINR(c.amount)} (${c.shareOfTotal}%)\n`;
      }
    }

    if (snapshot.needsReviewCount > 0) {
      ans += `\n*Note: You have ${snapshot.needsReviewCount} transaction(s) marked for review.*`;
    }

    return ans;
  }

  return 'You have not imported any transactions yet. Please go to the Import page to upload your bank statement CSV or PDF.';
}
