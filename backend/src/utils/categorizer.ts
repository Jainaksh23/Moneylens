export interface CategoryRuleResult {
  category: string;
  source: 'rule' | 'unknown';
}

const RULES: Array<{ pattern: RegExp; category: string }> = [
  { pattern: /\b(salary|payroll|stipend|bonus|dividend|interest credit)\b/i, category: 'Income' },
  { pattern: /\b(swiggy|zomato|chaayos|starbucks|mcdonald|subway|coffee|restaurant|cafe|dine|burger|pizza|biryani|bakery|food)\b/i, category: 'Food' },
  { pattern: /\b(zepto|blinkit|bigbasket|dmart|grocery|supermarket|kirana|milk|dairy|nature'?s basket|fruits|vegetables)\b/i, category: 'Groceries' },
  { pattern: /\b(uber|ola|rapido|metro|petrol|diesel|fuel|hpcl|bpcl|iocl|fastag|blusmart)\b/i, category: 'Transport' },
  { pattern: /\b(amazon|flipkart|myntra|nykaa|decathlon|tata cliq|shopping|ajio|croma|reliance digital|zara|h&m)\b/i, category: 'Shopping' },
  { pattern: /\b(bescom|electricity|power|tata power|adani|jio fiber|airtel|broadband|wifi|mobile recharge|water bill|gas|lpg)\b/i, category: 'Bills & Utilities' },
  { pattern: /\b(netflix|spotify|bookmyshow|hotstar|prime video|cinema|movie|youtube premium|sonyliv|pvr|inox)\b/i, category: 'Entertainment' },
  { pattern: /\b(rent|house rent|flat rent|nobroker|cred rentpay|maintenance|society)\b/i, category: 'Rent' },
  { pattern: /\b(sip|mutual fund|zerodha|groww|coin|stocks|uti|nippon|hdfc fund|ppfas|index fund|ppf|nps)\b/i, category: 'Investments/SIP' },
  { pattern: /\b(emi|loan|home loan|car loan|personal loan|credit card bill|bajaj finserv)\b/i, category: 'EMI/Loans' },
  { pattern: /\b(pharmacy|apollo|1mg|doctor|hospital|clinic|dentist|medicines|lab test|pharmeasy|medplus|practo|lenskart)\b/i, category: 'Health' },
  { pattern: /\b(coursera|udemy|byju|unacademy|school|college|tuition|textbooks|university)\b/i, category: 'Education' },
  { pattern: /\b(irctc|flight|indigo|air india|makemytrip|yatra|goibibo|train|railway|hotel|resort|redbus|airbnb)\b/i, category: 'Travel' },
  { pattern: /\b(atm cash|withdrawal|bank charges|fee|penalty|splitwise)\b/i, category: 'Other' },
];

/**
 * Categorizes a transaction based on rule patterns across merchant and description.
 * Returns { category, source: "rule" } if a pattern matches, or { category: "unknown", source: "unknown" } otherwise.
 */
export const ruleBasedCategorize = (
  merchant?: string,
  description?: string,
): CategoryRuleResult => {
  const combined = `${merchant || ''} ${description || ''}`.trim();
  if (!combined) {
    return { category: 'unknown', source: 'unknown' };
  }

  for (const rule of RULES) {
    if (rule.pattern.test(combined)) {
      return { category: rule.category, source: 'rule' };
    }
  }

  return { category: 'unknown', source: 'unknown' };
};
