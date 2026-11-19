import type { Claim, ClaimCategory, Region } from './types';

/**
 * Escalation ladders: the steps a claim climbs when the other side doesn't pay.
 * Each region gets steps that actually exist there. India uses consumer
 * helplines, ombudsmen and legal notices rather than chargebacks and small
 * claims court. This is general guidance, not legal advice.
 */

export interface Stage {
  key: string;
  title: string;
  /** What the user does at this stage. */
  action: string;
  /** Days to wait for a response before moving to the next stage. */
  waitDays: number;
  /** 'email' stages produce a letter; 'external' stages produce a case summary to file elsewhere. */
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

const LOAN_REQUEST: Stage = {
  key: 'loan_request',
  title: 'Friendly request',
  action: 'Ask for the money back in a polite, written message. Email or WhatsApp both work.',
  waitDays: 7,
  channel: 'email',
  tip: 'Keep it friendly and offer instalments. A written message also becomes proof that you asked.',
};

const LOAN_REMINDER: Stage = {
  key: 'loan_reminder',
  title: 'Reminder with deadline',
  action: 'Send a firmer reminder with a clear date to repay by.',
  waitDays: 7,
  channel: 'email',
  tip: 'Save any replies, bank transfer records, or chats where they admit the loan. That evidence matters later.',
};

/* ---------- International (default) ---------- */

const INTL: Record<ClaimCategory, Stage[]> = {
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
  loan: [LOAN_REQUEST, LOAN_REMINDER, FINAL_DEMAND],
  other: [REQUEST, FOLLOW_UP, FINAL_DEMAND],
};

/* ---------- India ---------- */

const IN_LEGAL_NOTICE: Stage = {
  key: 'legal_notice',
  title: 'Legal notice (through a lawyer)',
  action: 'Ask a lawyer to send a legal notice. Give them the case summary below.',
  waitDays: 15,
  channel: 'external',
  tip: 'A lawyer’s notice often gets results without going to court. Keep the postal or email receipt as proof it was sent.',
};

const IN_NCH: Stage = {
  key: 'nch',
  title: 'National Consumer Helpline',
  action: 'Register a grievance on the National Consumer Helpline (call 1915, or file online at consumerhelpline.gov.in).',
  waitDays: 30,
  channel: 'external',
  tip: 'It’s free. The helpline forwards your complaint to the company, and many companies resolve it at this stage.',
};

const IN_CONSUMER_COMMISSION: Stage = {
  key: 'consumer_commission',
  title: 'Consumer Commission complaint',
  action: 'File a complaint with the District Consumer Commission online through e-Daakhil (edaakhil.nic.in).',
  waitDays: 45,
  channel: 'external',
  tip: 'You can file without a lawyer. Attach this case summary, your invoice, and all your correspondence.',
};

const IN: Record<ClaimCategory, Stage[]> = {
  deposit: [
    REQUEST,
    FOLLOW_UP,
    IN_LEGAL_NOTICE,
    {
      key: 'rent_authority',
      title: 'Rent Authority or civil court',
      action: 'File with your state’s Rent Authority if it has one; otherwise file a recovery suit in civil court.',
      waitDays: 60,
      channel: 'external',
      tip: 'Your rent agreement, deposit receipt or bank transfer, and move-out photos are your strongest evidence.',
    },
  ],
  refund: [REQUEST, FOLLOW_UP, IN_NCH, IN_CONSUMER_COMMISSION],
  reimbursement: [
    REQUEST,
    FOLLOW_UP,
    {
      key: 'grievance',
      title: 'Formal grievance',
      action: 'Write to the grievance officer. For insurance, use the insurer’s grievance cell or the Bima Bharosa portal; for salary or expenses, HR.',
      waitDays: 30,
      channel: 'external',
      tip: 'Ask for the rejection reason in writing. You usually need it to go further.',
    },
    {
      key: 'ombudsman',
      title: 'Ombudsman or labour office',
      action: 'Insurance: file with the Insurance Ombudsman (cioins.co.in). Employer dues: approach your Labour Commissioner’s office.',
      waitDays: 45,
      channel: 'external',
      tip: 'The Insurance Ombudsman generally needs you to have complained to the insurer first. It’s free.',
    },
  ],
  travel: [
    REQUEST,
    FOLLOW_UP,
    {
      key: 'airsewa',
      title: 'AirSewa complaint',
      action: 'File a complaint on AirSewa (airsewa.gov.in) for flights, or the operator’s grievance portal for trains and buses.',
      waitDays: 30,
      channel: 'external',
      tip: 'Airlines in India must have a grievance officer. Quote the PNR and any delay or cancellation message.',
    },
    IN_CONSUMER_COMMISSION,
  ],
  subscription: [
    REQUEST,
    {
      key: 'bank_dispute',
      title: 'Bank or UPI dispute',
      action: 'Raise a dispute with your bank or card issuer. For UPI, use the “Raise a complaint” option in your UPI app.',
      waitDays: 30,
      channel: 'external',
      tip: 'Ask your bank to block future charges from this merchant too.',
    },
    {
      key: 'rbi_ombudsman',
      title: 'RBI Ombudsman',
      action: 'If your bank doesn’t resolve it within 30 days, complain to the RBI Ombudsman at cms.rbi.org.in.',
      waitDays: 45,
      channel: 'external',
      tip: 'It’s free, and handled online. Attach your bank complaint and its reply, if any.',
    },
  ],
  loan: [
    LOAN_REQUEST,
    LOAN_REMINDER,
    IN_LEGAL_NOTICE,
    {
      key: 'recovery_suit',
      title: 'Recovery suit in court',
      action: 'With a lawyer, file a money recovery suit. If they gave you a cheque that bounced, a Section 138 case is often faster.',
      waitDays: 90,
      channel: 'external',
      tip: 'Bank transfer records, messages admitting the loan, or a signed note are key. There are time limits on filing (often 3 years), so don’t wait too long.',
    },
  ],
  other: [REQUEST, FOLLOW_UP, IN_LEGAL_NOTICE, IN_CONSUMER_COMMISSION],
};

const LADDERS: Record<Region, Record<ClaimCategory, Stage[]>> = { IN, intl: INTL };

/** The region whose rules apply to a claim. Older claims didn't store one, so infer it from the currency. */
export function regionOf(claim: Pick<Claim, 'region' | 'currency'>): Region {
  return claim.region ?? (claim.currency === 'INR' ? 'IN' : 'intl');
}

export function ladderFor(claim: Pick<Claim, 'category' | 'region' | 'currency'>): Stage[] {
  return LADDERS[regionOf(claim)][claim.category];
}

export function currentStage(claim: Pick<Claim, 'category' | 'stage' | 'region' | 'currency'>): Stage {
  const ladder = ladderFor(claim);
  return ladder[Math.min(claim.stage, ladder.length - 1)];
}

export function isFinalStage(claim: Pick<Claim, 'category' | 'stage' | 'region' | 'currency'>): boolean {
  return claim.stage >= ladderFor(claim).length - 1;
}

export const REGION_LABELS: Record<Region, string> = { IN: 'India', intl: 'Other countries' };
