import { currentStage, formatDate, formatMoney, outstanding, paidSoFar, regionOf } from './escalation';
import type { Claim, ClaimCategory, Filing, Profile } from './types';

/**
 * National Consumer Helpline (NCH), India. The helpline has no public API for apps
 * and filing needs the consumer's own login and OTP, so RecoverIQ prepares every
 * field for copying, opens the official channel, and tracks the docket number.
 */
export const NCH = {
  name: 'National Consumer Helpline',
  website: 'https://consumerhelpline.gov.in/public/',
  whatsappNumber: '8800001915',
  whatsappUrl: 'https://wa.me/918800001915?text=Hi',
  phone: '1915',
  phoneUrl: 'tel:1915',
};

/** Consumer Commission filing moved from e-Daakhil to e-Jagriti (from 1 January 2025). */
export const E_JAGRITI_URL = 'https://e-jagriti.gov.in';

export interface ComplaintField {
  key: string;
  label: string;
  value: string;
  /** Shown under the field: how to fill it on the portal. */
  hint?: string;
}

export interface NchComplaint {
  fields: ComplaintField[];
  /** Everything in one block, for WhatsApp or email. */
  fullText: string;
  documents: string[];
}

/** Closest NCH sector for each claim type. The portal's list is longer, so the user picks the nearest match. */
const SECTOR: Record<ClaimCategory, string> = {
  refund: 'E-Commerce / Retail (or the sector of the product)',
  deposit: 'Real Estate / Housing',
  reimbursement: 'Insurance (or the relevant service)',
  travel: 'Airlines / Travel & Tourism',
  subscription: 'Banking / Digital services',
  loan: 'Other',
  other: 'Other',
};

const NATURE: Record<ClaimCategory, string> = {
  refund: 'Refund not received / refund rejected',
  deposit: 'Security deposit not returned',
  reimbursement: 'Claim or reimbursement not paid',
  travel: 'Refund or compensation not given for delay or cancellation',
  subscription: 'Unauthorised or wrong charge / auto-renewal after cancellation',
  loan: 'Money not repaid',
  other: 'Deficiency in service / money not paid',
};

const RELIEF: Record<ClaimCategory, string> = {
  refund: 'Refund of',
  deposit: 'Return of the deposit of',
  reimbursement: 'Payment of the claim of',
  travel: 'Refund and/or compensation of',
  subscription: 'Refund of the charge of',
  loan: 'Repayment of',
  other: 'Payment of',
};

/** Whether the helpline route makes sense: Indian consumer disputes with a business, not personal loans. */
export function canFileWithNch(claim: Claim): boolean {
  return regionOf(claim) === 'IN' && claim.category !== 'loan';
}

export function isAtNchStep(claim: Claim): boolean {
  return regionOf(claim) === 'IN' && currentStage(claim).key === 'nch';
}

export function nchFiling(claim: Claim): Filing | undefined {
  return (claim.filings ?? []).find((f) => f.channel === 'nch');
}

/** Adds or replaces the helpline docket number for a claim. */
export function saveNchDocket(claim: Claim, docket: string, filedAt = new Date().toISOString()): Claim {
  const reference = docket.trim();
  if (!reference) return claim;
  const others = (claim.filings ?? []).filter((f) => f.channel !== 'nch');
  return { ...claim, filings: [...others, { channel: 'nch', reference, filedAt }] };
}

function timeline(claim: Claim): string[] {
  const lines: string[] = [];
  if (claim.purchaseDate) lines.push(`${claim.purchaseDate}: Purchase / transaction${claim.reference ? ` (ref. ${claim.reference})` : ''}.`);
  for (const e of claim.events) {
    if (e.type === 'request_sent' || e.type === 'payment') lines.push(`${formatDate(e.at)}: ${e.label}.`);
  }
  return lines;
}

export function buildNchComplaint(claim: Claim, profile: Profile): NchComplaint {
  const due = formatMoney(outstanding(claim), claim.currency);
  const paid = paidSoFar(claim);
  const sentRequests = claim.events.filter((e) => e.type === 'request_sent');
  const firstAsked = sentRequests[0] ? formatDate(sentRequests[0].at) : undefined;

  const intro =
    `I am filing this grievance against ${claim.merchant || 'the company'}` +
    `${claim.reference ? ` regarding order/reference ${claim.reference}` : ''}` +
    `${claim.purchaseDate ? ` dated ${claim.purchaseDate}` : ''}.`;
  const problem = `Issue: ${NATURE[claim.category].toLowerCase()}. The amount involved is ${formatMoney(claim.amount, claim.currency)}.`;
  const attempts = sentRequests.length
    ? `I asked the company in writing on ${firstAsked}` +
      (sentRequests.length > 1 ? ` and followed up ${sentRequests.length - 1} more time${sentRequests.length > 2 ? 's' : ''}` : '') +
      `, but the matter has not been resolved.`
    : 'I have contacted the company, but the matter has not been resolved.';
  const partial = paid > 0 ? ` They have paid ${formatMoney(paid, claim.currency)}, and ${due} is still outstanding.` : '';
  const ask = `I request ${RELIEF[claim.category].toLowerCase()} ${due} at the earliest.`;
  const notes = claim.notes?.trim() ? `\n\nDetails: ${claim.notes.trim()}` : '';
  const events = timeline(claim);
  const description =
    `${intro} ${problem}${notes}\n\n${attempts}${partial} ${ask}` + (events.length ? `\n\nTimeline:\n${events.join('\n')}` : '');

  const documents = [
    ...claim.evidence.filter((e) => e.kind !== 'text').map((e) => e.name),
    ...(claim.evidence.some((e) => e.kind === 'text') ? ['The original email or message (copy it from the claim’s Evidence)'] : []),
    ...(sentRequests.length ? ['Your written requests to the company (from your email or WhatsApp Sent folder)'] : []),
    'Invoice, receipt, or payment proof (bank or UPI statement)',
  ];

  const fields: ComplaintField[] = [
    { key: 'name', label: 'Your name', value: profile.fullName.trim(), hint: 'As on your helpline account.' },
    { key: 'email', label: 'Your email', value: profile.email.trim() },
    { key: 'company', label: 'Company / brand name', value: claim.merchant, hint: 'Search for it in the portal’s company list; choose “Other” if it isn’t listed.' },
    { key: 'sector', label: 'Sector', value: SECTOR[claim.category], hint: 'Pick the closest match in the portal’s list.' },
    { key: 'nature', label: 'Nature of grievance', value: NATURE[claim.category] },
    { key: 'reference', label: 'Order / invoice / reference number', value: claim.reference ?? '' },
    { key: 'date', label: 'Date of purchase / transaction', value: claim.purchaseDate ?? '' },
    { key: 'amount', label: 'Amount (₹)', value: String(outstanding(claim)), hint: paid > 0 ? `Outstanding after ${formatMoney(paid, claim.currency)} paid.` : undefined },
    { key: 'description', label: 'Grievance details', value: description },
    { key: 'relief', label: 'Relief sought', value: `${RELIEF[claim.category]} ${due}` },
  ];

  const fullText =
    fields
      .filter((f) => f.value && f.key !== 'description')
      .map((f) => `${f.label}: ${f.value}`)
      .join('\n') + `\n\n${description}`;

  return { fields, fullText, documents };
}
