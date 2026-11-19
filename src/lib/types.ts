export type ClaimCategory =
  | 'deposit'
  | 'refund'
  | 'reimbursement'
  | 'travel'
  | 'subscription'
  | 'loan'
  | 'other';

/** Whose rules and escalation routes apply. */
export type Region = 'IN' | 'intl';

export type ClaimStatus = 'draft' | 'active' | 'recovered' | 'closed';

export type EvidenceKind = 'image' | 'document' | 'text';

export interface Evidence {
  id: string;
  kind: EvidenceKind;
  name: string;
  addedAt: string;
  uri?: string;
  mimeType?: string;
  text?: string;
}

export type ClaimEventType =
  | 'created'
  | 'authorized'
  | 'request_sent'
  | 'escalated'
  | 'response'
  | 'payment'
  | 'recovered'
  | 'closed'
  | 'reopened'
  | 'note';

export interface ClaimEvent {
  id: string;
  at: string;
  type: ClaimEventType;
  label: string;
  /** For 'request_sent': which escalation step was sent. */
  stageKey?: string;
  /** For 'request_sent': an exact copy of the letter as prepared, kept unchanged. */
  letter?: { subject: string; body: string };
}

export interface Payment {
  id: string;
  amount: number;
  /** ISO date the money was received. */
  receivedAt: string;
}

/** A complaint registered outside the app, e.g. with the National Consumer Helpline. */
export interface Filing {
  channel: 'nch';
  /** Docket / complaint number issued on filing. */
  reference: string;
  filedAt: string;
}

export interface Claim {
  id: string;
  title: string;
  merchant: string;
  category: ClaimCategory;
  amount: number;
  currency: string;
  purchaseDate?: string;
  reference?: string;
  contactEmail?: string;
  notes?: string;
  evidence: Evidence[];
  /** Index into the escalation ladder for this claim's category. */
  stage: number;
  status: ClaimStatus;
  events: ClaimEvent[];
  createdAt: string;
  /** ISO timestamp when the current stage's waiting period ends. */
  nextActionAt?: string;
  /** ISO timestamp when the user authorized RecoverIQ to prepare requests. */
  authorizedAt?: string;
  recoveredAmount?: number;
  /** Money received so far. The claim stays open until these cover the amount. */
  payments?: Payment[];
  filings?: Filing[];
  region?: Region;
}

export interface Profile {
  fullName: string;
  email: string;
  plan: 'free' | 'pro' | 'success';
  /** Default currency for new claims and dashboard totals. */
  currency: string;
  region: Region;
}

export interface AnalysisSignal {
  label: string;
  value: string;
}

export interface Analysis {
  isLikelyClaim: boolean;
  confidence: number; // 0..1
  category: ClaimCategory;
  merchant?: string;
  amount?: number;
  currency: string;
  date?: string;
  reference?: string;
  contactEmail?: string;
  signals: AnalysisSignal[];
  summary: string;
  suggestedTitle: string;
}
