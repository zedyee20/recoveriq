export type ClaimCategory =
  | 'deposit'
  | 'refund'
  | 'reimbursement'
  | 'travel'
  | 'subscription'
  | 'other';

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
  | 'recovered'
  | 'closed'
  | 'reopened'
  | 'note';

export interface ClaimEvent {
  id: string;
  at: string;
  type: ClaimEventType;
  label: string;
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
}

export interface Profile {
  fullName: string;
  email: string;
  plan: 'free' | 'pro' | 'success';
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
