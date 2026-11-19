import { localeForCurrency } from './currency';
import type { Analysis, AnalysisSignal, ClaimCategory } from './types';

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(localeForCurrency(currency), { style: 'currency', currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

/**
 * On-device heuristic analyzer. It extracts the facts a claim needs (merchant,
 * amount, date, reference, contact) from receipt/email text and guesses the
 * claim category. It is deliberately dependency-free so it can later sit
 * behind the same interface as a server-side model.
 */

const CATEGORY_KEYWORDS: Record<Exclude<ClaimCategory, 'other'>, string[]> = {
  loan: [
    'lent', 'borrowed', 'hand loan', 'personal loan', 'loan', 'repay', 'pay me back', 'pay back',
    'owe me', 'owes me', 'udhaar', 'udhar', 'return my money',
  ],
  deposit: [
    'deposit', 'security deposit', 'damage deposit', 'move-out', 'move out', 'lease',
    'tenancy', 'landlord', 'refundable', 'equipment return', 'bottle deposit', 'key deposit',
  ],
  refund: [
    'refund', 'return', 'returned', 'rma', 'rejected', 'denied', 'declined', 'not eligible',
    'cancelled order', 'canceled order', 'store credit', 'defective', 'damaged', 'never arrived',
    'not delivered', 'order', 'receipt',
  ],
  reimbursement: [
    'reimburse', 'reimbursement', 'expense report', 'expense claim', 'out-of-pocket',
    'hsa', 'fsa', 'insurance claim', 'eob', 'explanation of benefits', 'per diem', 'mileage',
  ],
  travel: [
    'flight', 'delayed', 'delay', 'cancelled flight', 'canceled flight', 'boarding', 'airline',
    'baggage', 'luggage', 'hotel', 'booking', 'reservation', 'train', 'itinerary', 'pnr',
  ],
  subscription: [
    'subscription', 'renewal', 'renewed', 'auto-renew', 'membership', 'trial', 'recurring',
    'billing cycle', 'monthly plan', 'annual plan', 'charged again', 'cancel anytime',
  ],
};

const CLAIM_TRIGGERS = [
  'lent', 'borrowed', 'loan', 'repay', 'owe', 'udhaar', 'udhar',
  'refund', 'deposit', 'reimburse', 'rejected', 'denied', 'declined', 'delayed', 'cancelled',
  'canceled', 'overcharged', 'charged twice', 'double charge', 'not eligible', 'compensation',
  'return', 'renewal', 'owed', 'credit',
];

const CURRENCY_SYMBOLS: Record<string, string> = { $: 'USD', '€': 'EUR', '£': 'GBP', '¥': 'JPY', '₹': 'INR' };
const CURRENCY_CODES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'INR', 'NZD', 'AED', 'SGD'];

// What the money is called just before the figure. "Owed" words beat "paid" words: the balance due is the claim.
const AMOUNT_OWED = /(refund|balance|owed|due|reimburs|compensation|outstanding)/i;
const AMOUNT_CONTEXT = /(deposit|total|amount|charged|paid|price|fare)/i;

interface AmountHit {
  value: number;
  currency?: string;
  index: number;
  /** 2 = labelled as owed, 1 = labelled as a payment, 0 = unlabelled. */
  weight: number;
}

function parseNumber(raw: string): number | undefined {
  let s = raw.replace(/\s/g, '');
  // Indian grouping: "1,80,000.00" or "12,34,567"
  if (/^\d{1,2}(,\d{2})+,\d{3}(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
  // "1.234,56" (EU) vs "1,234.56" (US)
  if (/,\d{2}$/.test(s) && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(,\d{3})*(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
  else if (/^\d+,\d{2}$/.test(s)) s = s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export function findAmounts(text: string): AmountHit[] {
  const hits: AmountHit[] = [];
  // Indian lakh grouping first (1,80,000.00), then western (1,234.56 / 1.234,56), then plain.
  const num = '(\\d{1,2}(?:,\\d{2})+,\\d{3}(?:\\.\\d{2})?|\\d{1,3}(?:[.,\\s]\\d{3})*(?:[.,]\\d{2})?|\\d+(?:[.,]\\d{2})?)';
  const patterns: { re: RegExp; cur: (m: RegExpExecArray) => string | undefined; n: number }[] = [
    { re: new RegExp(`([$€£¥₹])\\s?${num}`, 'g'), cur: (m) => CURRENCY_SYMBOLS[m[1]], n: 2 },
    { re: new RegExp(`\\b(?:Rs\\.?|Rupees)\\s?${num}`, 'gi'), cur: () => 'INR', n: 1 },
    { re: new RegExp(`\\b(${CURRENCY_CODES.join('|')})\\s?${num}`, 'g'), cur: (m) => m[1], n: 2 },
    { re: new RegExp(`${num}\\s?(${CURRENCY_CODES.join('|')}|[€£₹])`, 'g'), cur: (m) => CURRENCY_SYMBOLS[m[2]] ?? m[2], n: 1 },
  ];
  for (const p of patterns) {
    let m: RegExpExecArray | null;
    while ((m = p.re.exec(text))) {
      const value = parseNumber(m[p.n]);
      if (value === undefined) continue;
      if (hits.some((h) => Math.abs(h.index - m!.index) < 4)) continue;
      const lineStart = text.lastIndexOf('\n', m.index) + 1;
      const before = text.slice(Math.max(lineStart, m.index - 40), m.index);
      const weight = AMOUNT_OWED.test(before) ? 2 : AMOUNT_CONTEXT.test(before) ? 1 : 0;
      hits.push({ value, currency: p.cur(m), index: m.index, weight });
    }
  }
  return hits.sort((a, b) => a.index - b.index);
}

function pickAmount(hits: AmountHit[]): AmountHit | undefined {
  if (!hits.length) return undefined;
  const best = Math.max(...hits.map((h) => h.weight));
  const pool = hits.filter((h) => h.weight === best);
  // Labelled figures: take the first. Unlabelled: the largest is usually the total.
  return best > 0 ? pool[0] : pool.reduce((a, b) => (b.value > a.value ? b : a));
}

const MONTHS = 'jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec';

export function findDate(text: string): string | undefined {
  const res = [
    /\b(\d{4}-\d{2}-\d{2})\b/,
    new RegExp(`\\b((?:${MONTHS})[a-z]*\\.?\\s+\\d{1,2},?\\s+\\d{4})\\b`, 'i'),
    new RegExp(`\\b(\\d{1,2}\\s+(?:${MONTHS})[a-z]*\\.?,?\\s+\\d{4})\\b`, 'i'),
    /\b(\d{1,2}\/\d{1,2}\/\d{2,4})\b/,
  ];
  for (const re of res) {
    const m = re.exec(text);
    if (m) return m[1];
  }
  return undefined;
}

export function findEmails(text: string): string[] {
  return Array.from(new Set(text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? []));
}

function pickContactEmail(emails: string[]): string | undefined {
  const preferred = /^(support|help|refunds?|returns?|billing|care|customer|service|claims?|disputes?|hello|contact)/i;
  const noreply = /no-?reply|donotreply|mailer-daemon/i;
  return emails.find((e) => preferred.test(e)) ?? emails.find((e) => !noreply.test(e));
}

export function findReference(text: string): string | undefined {
  const re =
    /\b(?:order|booking|confirmation|reference|ref|invoice|case|ticket|claim|rma|pnr|receipt)\s*(?:no\.?|number|#|id|code)?\s*[:#]?\s*([A-Z0-9][A-Z0-9-]{3,})\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    // Must contain a digit, or be an all-caps code like an airline PNR.
    if (/\d/.test(m[1]) || /^[A-Z]{5,8}$/.test(m[1])) return m[1];
    // Retry just past this keyword so "Booking reference: X" can match on "reference".
    re.lastIndex = m.index + 1;
  }
  return undefined;
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

const GENERIC_DOMAINS = /^(gmail|yahoo|outlook|hotmail|icloud|aol|proton|protonmail|mail|email|live)$/i;

export function findMerchant(text: string, emails: string[]): string | undefined {
  // "From: Acme Store <support@acme.com>"
  const from = /^from:\s*"?([^"<\n]+?)"?\s*</im.exec(text);
  if (from && from[1].trim().length > 1) return from[1].trim();

  // "Landlord: Oakridge Property Management (…)"
  const labelled = /^(?:landlord|merchant|seller|store|vendor|company|airline|carrier|business|sold by):\s*([^(\n<]+?)\s*(?:[(<]|$)/im.exec(text);
  if (labelled && labelled[1].length > 1) return labelled[1];

  // "I lent Rohan ₹50,000" / "Rohan borrowed …"
  const lent = /\b(?:[Ll]ent|[Gg]ave)\s+(?:money\s+to\s+)?([A-Z][a-z]+(?:\s+(?!Rs\b|Rupees\b)[A-Z][a-z]+)?)\b/.exec(text) ??
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:borrowed|owes me)\b/.exec(text);
  if (lent && !/^(I|We|My|The|He|She|They)$/.test(lent[1])) return lent[1];

  // "Thank you for shopping at Acme" / "your order from Acme"
  const at = /\b(?:[Ss]hopping (?:at|with)|[Oo]rder(?:ed)? (?:from|with)|[Pp]urchase (?:at|from)|[Ss]tay(?:ing)? at|[Ff]lying with|[Bb]ooked with)\s+([A-Z][\w&'.-]*(?:\s+[A-Z][\w&'.-]*){0,3})/.exec(text);
  if (at) return at[1].replace(/[.,]$/, '').replace(/\s+[—-].*$/, '');

  // Sender domain, ignoring personal mail providers.
  for (const e of emails) {
    const domain = e.split('@')[1].split('.');
    const base = domain.length > 2 ? domain[domain.length - 2] : domain[0];
    if (!GENERIC_DOMAINS.test(base)) return titleCase(base.replace(/-/g, ' '));
  }

  // Receipts usually lead with the store name on its own line.
  const firstLine = text
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length >= 3 && l.length <= 40 && /[A-Za-z]/.test(l) && !/^(subject|to|date|from|re):/i.test(l));
  if (firstLine && /^[A-Z0-9 &'.-]+$/.test(firstLine)) return titleCase(firstLine);
  return undefined;
}

export function classify(text: string): { category: ClaimCategory; score: number } {
  const lower = text.toLowerCase();
  let best: ClaimCategory = 'other';
  let bestScore = 0;
  for (const [cat, words] of Object.entries(CATEGORY_KEYWORDS) as [ClaimCategory, string[]][]) {
    // Multi-word phrases are stronger evidence than single words.
    const score = words.reduce((s, w) => (lower.includes(w) ? s + (w.includes(' ') ? 2 : 1) : s), 0);
    if (score > bestScore) {
      best = cat;
      bestScore = score;
    }
  }
  return { category: best, score: bestScore };
}

export const CATEGORY_LABELS: Record<ClaimCategory, string> = {
  deposit: 'Refundable deposit',
  refund: 'Refund',
  reimbursement: 'Reimbursement',
  travel: 'Travel compensation',
  subscription: 'Unwanted charge',
  loan: 'Personal loan',
  other: 'Money owed',
};

export function analyze(text: string, fallbackCurrency = 'USD'): Analysis {
  const clean = text.replace(/\r\n/g, '\n').trim();
  const emails = findEmails(clean);
  const amountHit = pickAmount(findAmounts(clean));
  const date = findDate(clean);
  const reference = findReference(clean);
  const merchant = findMerchant(clean, emails);
  const contactEmail = pickContactEmail(emails);
  const { category, score } = classify(clean);
  const lower = clean.toLowerCase();
  const triggers = CLAIM_TRIGGERS.filter((t) => lower.includes(t));
  const rejected = /(rejected|denied|declined|not eligible|unable to (?:process|offer)|cannot be refunded)/i.test(clean);

  const signals: AnalysisSignal[] = [];
  if (merchant) signals.push({ label: 'Merchant', value: merchant });
  const currency = amountHit?.currency ?? fallbackCurrency;
  if (amountHit) signals.push({ label: 'Amount', value: formatMoney(amountHit.value, currency) });
  if (date) signals.push({ label: 'Date', value: date });
  if (reference) signals.push({ label: 'Reference', value: reference });
  if (contactEmail) signals.push({ label: 'Contact', value: contactEmail });
  if (triggers.length) signals.push({ label: 'Keywords', value: triggers.slice(0, 5).join(', ') });
  if (rejected) signals.push({ label: 'Status', value: 'Previously rejected — escalation likely needed' });

  let confidence = 0;
  if (amountHit) confidence += 0.3;
  if (merchant) confidence += 0.15;
  if (date) confidence += 0.1;
  if (reference) confidence += 0.1;
  confidence += Math.min(0.25, triggers.length * 0.08);
  confidence += Math.min(0.1, score * 0.03);
  confidence = Math.min(0.97, Math.round(confidence * 100) / 100);

  const isLikelyClaim = triggers.length > 0 && confidence >= 0.4;
  const label = CATEGORY_LABELS[category];
  const who = merchant ?? 'the merchant';
  const money = amountHit ? formatMoney(amountHit.value, currency) : 'an unconfirmed amount';
  const summary = isLikelyClaim
    ? `Looks like a ${label.toLowerCase()} of ${money} from ${who}${rejected ? ' that was previously rejected' : ''}.`
    : clean.length < 20
      ? 'Not enough text to analyze. Paste the full email or receipt text, or fill in the details yourself.'
      : `No clear claim found. You can still create one and fill in the details.`;

  return {
    isLikelyClaim,
    confidence,
    category: isLikelyClaim || score > 0 ? category : 'other',
    merchant,
    amount: amountHit?.value,
    currency,
    date,
    reference,
    contactEmail,
    signals,
    summary,
    suggestedTitle: `${label}${merchant ? ` — ${merchant}` : ''}`,
  };
}
