import type { Claim, ClaimCategory, ClaimEvent, ClaimEventType, Profile } from './types';
import { CATEGORY_LABELS } from './analyzer';

export interface Stage {
  key: string;
  title: string;
  /** What the user does at this stage. */
  action: string;
  /** Days to wait for a response before moving to the next stage. */
  waitDays: number;
  /** Where the request goes. */
  channel: 'email' | 'external';
  tip: string;
}

const REQUEST: Stage = {
  key: 'request',
  title: 'Formal request',
  action: 'Send a written request with your evidence attached.',
  waitDays: 14,
  channel: 'email',
  tip: 'Most claims resolve here. A clear, dated request with evidence is hard to ignore.',
};

const FOLLOW_UP: Stage = {
  key: 'follow_up',
  title: 'Follow-up with deadline',
  action: 'Send a second notice that sets a firm response deadline.',
  waitDays: 10,
  channel: 'email',
  tip: 'Referencing your first request and giving a date shows you will escalate.',
};

const FINAL_DEMAND: Stage = {
  key: 'final_demand',
  title: 'Final demand',
  action: 'Send a final demand stating you will file in small claims court.',
  waitDays: 14,
  channel: 'email',
  tip: 'Small claims courts are built for amounts like this. Check your local filing limit and fee.',
};

const LADDERS: Record<ClaimCategory, Stage[]> = {
  deposit: [
    REQUEST,
    FOLLOW_UP,
    {
      key: 'regulator',
      title: 'Housing authority complaint',
      action: 'File a complaint with your local tenant/housing authority or consumer agency.',
      waitDays: 21,
      channel: 'external',
      tip: 'Many places set deadlines for returning deposits and penalties for missing them. Check your local rules.',
    },
    FINAL_DEMAND,
  ],
  refund: [
    REQUEST,
    FOLLOW_UP,
    {
      key: 'chargeback',
      title: 'Card dispute (chargeback)',
      action: 'Open a dispute with your card issuer or bank, attaching this claim file.',
      waitDays: 30,
      channel: 'external',
      tip: 'Dispute windows are often 60–120 days from the statement date. Do not wait too long.',
    },
    FINAL_DEMAND,
  ],
  reimbursement: [
    REQUEST,
    FOLLOW_UP,
    {
      key: 'internal_appeal',
      title: 'Formal appeal',
      action: 'File a formal appeal with HR, finance, or your insurer’s appeals department.',
      waitDays: 30,
      channel: 'external',
      tip: 'Insurers must usually give a written reason for a denial. Ask for it if you don’t have one.',
    },
    {
      key: 'regulator',
      title: 'Regulator complaint',
      action: 'Escalate to the relevant regulator (insurance department, labor agency, etc.).',
      waitDays: 30,
      channel: 'external',
      tip: 'Regulator complaints are free and often prompt a quick response.',
    },
  ],
  travel: [
    REQUEST,
    FOLLOW_UP,
    {
      key: 'regulator',
      title: 'Transport regulator complaint',
      action: 'File a complaint with the transport/aviation regulator or an approved dispute body.',
      waitDays: 30,
      channel: 'external',
      tip: 'Passenger rights depend on route and carrier. Keep boarding passes and delay notices.',
    },
    FINAL_DEMAND,
  ],
  subscription: [
    REQUEST,
    {
      key: 'chargeback',
      title: 'Card dispute (chargeback)',
      action: 'Dispute the charge with your card issuer, and block future charges from this merchant.',
      waitDays: 30,
      channel: 'external',
      tip: 'Mention any cancellation confirmation, or the missing renewal notice.',
    },
    {
      key: 'regulator',
      title: 'Consumer protection complaint',
      action: 'Report the merchant to your consumer protection agency.',
      waitDays: 30,
      channel: 'external',
      tip: 'Auto-renewal rules often require clear disclosure and easy cancellation.',
    },
  ],
  other: [REQUEST, FOLLOW_UP, FINAL_DEMAND],
};

export function ladderFor(category: ClaimCategory): Stage[] {
  return LADDERS[category];
}

export function currentStage(claim: Pick<Claim, 'category' | 'stage'>): Stage {
  const ladder = ladderFor(claim.category);
  return ladder[Math.min(claim.stage, ladder.length - 1)];
}

export function isFinalStage(claim: Pick<Claim, 'category' | 'stage'>): boolean {
  return claim.stage >= ladderFor(claim.category).length - 1;
}

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

export function formatMoney(amount: number, currency = 'USD'): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
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
    `Amount owed: ${formatMoney(claim.amount, claim.currency)}`,
    claim.reference ? `Reference: ${claim.reference}` : undefined,
    claim.purchaseDate ? `Date of transaction: ${claim.purchaseDate}` : undefined,
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

  switch (stage.key) {
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
          `Complaint summary for: ${stage.title}\n\nComplainant: ${name}\nBusiness: ${claim.merchant || '—'}\n${factsBlock(claim)}${notes}\n\n` +
          `What happened:\nI requested ${REASONS[claim.category]}. The business has not resolved it.\n\n` +
          `Timeline:\n${claim.events.map((e) => `• ${formatDate(e.at)} — ${e.label}`).join('\n')}\n\n` +
          `Outcome requested: payment of ${amount}.` + quotedOriginal(claim),
      };
  }
}
