import { currentStage, isFinalStage, ladderFor, type Stage } from './ladders';
import type { Claim, ClaimCategory, ClaimEvent, ClaimEventType, Profile } from './types';
import { CATEGORY_LABELS } from './analyzer';
import { localeForCurrency } from './currency';

export { currentStage, isFinalStage, ladderFor, regionOf, REGION_LABELS } from './ladders';
export type { Stage } from './ladders';

export function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export function daysUntil(iso: string, now: Date = new Date()): number {
  return Math.ceil((new Date(iso).getTime() - now.getTime()) / 86_400_000);
}

let counter = 0;
export function uid(prefix = 'id'): string {
  counter = (counter + 1) % 1_000_000;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function event(type: ClaimEventType, label: string, at = new Date().toISOString()): ClaimEvent {
  return { id: uid('ev'), at, type, label };
}

/* ---------- State transitions (pure) ---------- */

export function authorize(claim: Claim, at = new Date().toISOString()): Claim {
  if (claim.authorizedAt) return claim;
  return {
    ...claim,
    authorizedAt: at,
    events: [...claim.events, event('authorized', 'You authorized RecoverIQ to prepare requests for this claim', at)],
  };
}

/** Records that the current stage's request was sent and starts its wait timer. */
export function markStageSent(claim: Claim, at = new Date().toISOString()): Claim {
  const stage = currentStage(claim);
  const verb = stage.channel === 'email' ? 'sent' : 'filed';
  return {
    ...claim,
    status: 'active',
    nextActionAt: addDays(at, stage.waitDays),
    events: [...claim.events, event('request_sent', `${stage.title} ${verb}`, at)],
  };
}

export function escalate(claim: Claim, at = new Date().toISOString()): Claim {
  if (isFinalStage(claim)) return claim;
  const next = { ...claim, stage: claim.stage + 1, nextActionAt: undefined };
  return {
    ...next,
    events: [...claim.events, event('escalated', `Escalated to: ${currentStage(next).title}`, at)],
  };
}

export function markRecovered(claim: Claim, amount: number, at = new Date().toISOString()): Claim {
  return {
    ...claim,
    status: 'recovered',
    recoveredAmount: amount,
    nextActionAt: undefined,
    events: [...claim.events, event('recovered', `Recovered ${formatMoney(amount, claim.currency)}`, at)],
  };
}

export function closeClaim(claim: Claim, reason: string, at = new Date().toISOString()): Claim {
  return {
    ...claim,
    status: 'closed',
    nextActionAt: undefined,
    events: [...claim.events, event('closed', `Closed: ${reason}`, at)],
  };
}

export function reopen(claim: Claim, at = new Date().toISOString()): Claim {
  return {
    ...claim,
    status: claim.events.some((e) => e.type === 'request_sent') ? 'active' : 'draft',
    recoveredAmount: undefined,
    events: [...claim.events, event('reopened', 'Claim reopened', at)],
  };
}

export function removeEvidence(claim: Claim, evidenceId: string, at = new Date().toISOString()): Claim {
  const item = claim.evidence.find((e) => e.id === evidenceId);
  if (!item) return claim;
  return {
    ...claim,
    evidence: claim.evidence.filter((e) => e.id !== evidenceId),
    events: [...claim.events, event('note', `Removed evidence: ${item.name}`, at)],
  };
}

export type ClaimDetails = Pick<
  Claim,
  'merchant' | 'category' | 'amount' | 'currency' | 'purchaseDate' | 'reference' | 'contactEmail' | 'notes' | 'region'
>;

/** Edits a claim's facts. If the type or region changes, the claim keeps its progress on the new path. */
export function updateDetails(claim: Claim, details: Partial<ClaimDetails>, at = new Date().toISOString()): Claim {
  const next: Claim = { ...claim, ...details };
  const maxStage = ladderFor(next).length - 1;
  if (next.stage > maxStage) next.stage = maxStage;
  return { ...next, events: [...claim.events, event('note', 'Details updated', at)] };
}

export type NextStep =
  | { kind: 'prepare'; stage: Stage }
  | { kind: 'waiting'; stage: Stage; daysLeft: number }
  | { kind: 'overdue'; stage: Stage; canEscalate: boolean }
  | { kind: 'done' };

export function nextStep(claim: Claim, now: Date = new Date()): NextStep {
  if (claim.status === 'recovered' || claim.status === 'closed') return { kind: 'done' };
  const stage = currentStage(claim);
  if (!claim.nextActionAt) return { kind: 'prepare', stage };
  const daysLeft = daysUntil(claim.nextActionAt, now);
  if (daysLeft > 0) return { kind: 'waiting', stage, daysLeft };
  return { kind: 'overdue', stage, canEscalate: !isFinalStage(claim) };
}

/* ---------- Formatting ---------- */

/** `whole` drops the decimals, for headline totals where space is tight. */
export function formatMoney(amount: number, currency = 'USD', whole = false): string {
  try {
    return new Intl.NumberFormat(localeForCurrency(currency), {
      style: 'currency',
      currency,
      ...(whole ? { minimumFractionDigits: 0, maximumFractionDigits: 0 } : {}),
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/* ---------- Letters ---------- */

export interface Letter {
  subject: string;
  body: string;
}

function factsBlock(claim: Claim): string {
  const files = claim.evidence.filter((e) => e.kind !== 'text');
  const lines = [
    `${claim.category === 'loan' ? 'Amount lent' : 'Amount owed'}: ${formatMoney(claim.amount, claim.currency)}`,
    claim.reference ? `Reference: ${claim.reference}` : undefined,
    claim.purchaseDate ? `${claim.category === 'loan' ? 'Date lent' : 'Date of transaction'}: ${claim.purchaseDate}` : undefined,
    files.length ? `Evidence attached: ${files.map((e) => e.name).join(', ')}` : undefined,
    hasQuoted(claim) ? 'Original correspondence: quoted below' : undefined,
  ];
  return lines.filter(Boolean).join('\n');
}

function hasQuoted(claim: Claim): boolean {
  return claim.evidence.some((e) => e.kind === 'text' && e.text?.trim());
}

/** Pasted text can't be attached as a file, so it's quoted at the end of the letter instead. */
function quotedOriginal(claim: Claim): string {
  const texts = claim.evidence.filter((e) => e.kind === 'text' && e.text?.trim());
  return texts.map((e) => `\n\n----- ${e.name} -----\n${e.text!.trim()}`).join('');
}

const REASONS: Record<ClaimCategory, string> = {
  deposit: 'the return of my refundable deposit, which has not been returned',
  refund: 'a refund that I am entitled to and have not received',
  reimbursement: 'reimbursement of expenses I paid that are covered',
  travel: 'compensation and/or a refund for the disruption to my travel',
  subscription: 'a refund of a charge I did not authorize or had already cancelled',
  loan: 'repayment of the money I lent you',
  other: 'payment of money that is owed to me',
};

export function buildLetter(claim: Claim, profile: Profile, now: Date = new Date()): Letter {
  const stage = currentStage(claim);
  const name = profile.fullName.trim() || '[Your name]';
  const who = claim.merchant || 'Sir or Madam';
  const ref = claim.reference ? ` (Ref: ${claim.reference})` : '';
  const amount = formatMoney(claim.amount, claim.currency);
  const sentBefore = claim.events.filter((e) => e.type === 'request_sent');
  const firstSent = sentBefore[0] ? formatDate(sentBefore[0].at) : undefined;
  const deadline = formatDate(addDays(now.toISOString(), stage.waitDays));
  const sign = `Sincerely,\n${name}${profile.email ? `\n${profile.email}` : ''}`;
  const notes = claim.notes?.trim() ? `\n\nDetails:\n${claim.notes.trim()}` : '';

  const when = claim.purchaseDate ? ` on ${claim.purchaseDate}` : '';
  switch (stage.key) {
    case 'loan_request':
      return {
        subject: `Repayment of ${amount} I lent you${when}`,
        body:
          `Hi ${claim.merchant || 'there'},\n\nI hope you’re doing well. I’m writing about the ${amount} I lent you${when}. ` +
          `I’d like to ask for it back now.\n\n${factsBlock(claim)}${notes}\n\n` +
          `Could you please repay it by ${deadline}? If paying it all at once is difficult, let me know and we can agree on instalments.\n\n` +
          `Thanks,\n${name}` + quotedOriginal(claim),
      };
    case 'loan_reminder':
      return {
        subject: `Reminder: ${amount} still to be repaid`,
        body:
          `Hi ${claim.merchant || 'there'},\n\nI’m following up${firstSent ? ` on my message from ${firstSent}` : ''} about the ${amount} I lent you${when}. ` +
          `I haven’t received the money or a reply.\n\n${factsBlock(claim)}\n\n` +
          `Please repay the full amount by ${deadline}. If I don’t hear from you by then, I will have to take formal steps to recover it, ` +
          `starting with a legal notice.\n\nRegards,\n${name}` + quotedOriginal(claim),
      };
    case 'request':
      return {
        subject: `${CATEGORY_LABELS[claim.category]} request — ${amount}${ref}`,
        body:
          `Dear ${who},\n\nI am writing to request ${REASONS[claim.category]}.\n\n${factsBlock(claim)}${notes}\n\n` +
          `Please process the payment of ${amount} to my original payment method, or confirm in writing when it will be issued, by ${deadline}.\n\n` +
          `If you need anything further from me, please reply to this email.\n\n${sign}` + quotedOriginal(claim),
      };
    case 'follow_up':
      return {
        subject: `Second notice: ${amount} still outstanding${ref}`,
        body:
          `Dear ${who},\n\nI wrote to you${firstSent ? ` on ${firstSent}` : ''} requesting ${REASONS[claim.category]}. ` +
          `I have not received the payment or a satisfactory response.\n\n${factsBlock(claim)}\n\n` +
          `Please resolve this by ${deadline}. If it is not resolved by then, I will escalate this matter, ` +
          `which may include a payment dispute or a complaint to the relevant authority.\n\n${sign}` + quotedOriginal(claim),
      };
    case 'final_demand':
      return {
        subject: `Final demand before legal action: ${amount}${ref}`,
        body:
          `Dear ${who},\n\nThis is my final demand for payment of ${amount}, which remains outstanding despite my previous requests` +
          `${firstSent ? ` (first sent ${firstSent})` : ''}.\n\n${factsBlock(claim)}\n\n` +
          `If I do not receive full payment by ${deadline}, I intend to file a claim in small claims court without further notice, ` +
          `and will seek court costs where permitted.\n\n${sign}` + quotedOriginal(claim),
      };
    default:
      // External stages (chargeback, regulator, appeal) need a case summary rather than a letter.
      return {
        subject: `Case summary: ${CATEGORY_LABELS[claim.category]} — ${claim.merchant || 'merchant'}${ref}`,
        body:
          `Case summary for: ${stage.title}\n\nComplainant: ${name}\n${claim.category === 'loan' ? 'Borrower' : 'Business'}: ${claim.merchant || '—'}\n${factsBlock(claim)}${notes}\n\n` +
          `What happened:\n${claim.category === 'loan' ? `I lent ${amount}${when}. I asked for repayment in writing and it has not been repaid.` : `I requested ${REASONS[claim.category]}. It has not been resolved.`}\n\n` +
          `Timeline:\n${claim.events.map((e) => `• ${formatDate(e.at)} — ${e.label}`).join('\n')}\n\n` +
          `Outcome requested: payment of ${amount}.` + quotedOriginal(claim),
      };
  }
}
