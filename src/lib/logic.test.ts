import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { analyze, findAmounts, findReference } from './analyzer';
import {
  authorize,
  buildLetter,
  currentStage,
  escalate,
  isFinalStage,
  ladderFor,
  markRecovered,
  markStageSent,
  nextStep,
  regionOf,
  removeEvidence,
  goToStage,
  stageSentAt,
  stageSentLetter,
  outstanding,
  paidSoFar,
  parseDayInput,
  recordPayment,
  reopen,
  uid,
  updateDetails,
} from './escalation';
import { SAMPLES } from './samples';
import type { Claim } from './types';

const sample = (label: string) => SAMPLES.find((s) => s.label === label)!.text;

describe('analyzer', () => {
  it('detects a rejected refund with merchant, amount, reference and contact', () => {
    const a = analyze(sample('Rejected refund'));
    assert.equal(a.isLikelyClaim, true);
    assert.equal(a.category, 'refund');
    assert.equal(a.merchant, 'Brightline Electronics');
    assert.equal(a.amount, 249.99);
    assert.equal(a.currency, 'USD');
    assert.equal(a.contactEmail, 'support@brightline-shop.com');
    assert.ok(a.reference === 'RMA-55821' || a.reference === 'BL-204417');
    assert.ok(a.signals.some((s) => s.label === 'Status'));
  });

  it('detects a security deposit with thousands separator', () => {
    const a = analyze(sample('Security deposit'));
    assert.equal(a.category, 'deposit');
    assert.equal(a.amount, 1800);
    assert.equal(a.date, '2026-08-31');
    assert.equal(a.contactEmail, 'rentals@oakridgepm.com');
  });

  it('detects a flight delay in euros', () => {
    const a = analyze(sample('Flight delay'));
    assert.equal(a.category, 'travel');
    assert.equal(a.currency, 'EUR');
    assert.equal(a.amount, 312.4);
    assert.equal(a.reference, 'QXR7TL');
    assert.equal(a.merchant, 'Northwind Air');
  });

  it('detects an unwanted subscription renewal', () => {
    const a = analyze(sample('Unwanted renewal'));
    assert.equal(a.category, 'subscription');
    assert.equal(a.amount, 119.99);
    assert.equal(a.contactEmail, 'billing@streamplus.tv');
  });

  it('reads rupees: ₹, Rs. and Indian lakh grouping', () => {
    assert.equal(findAmounts('Paid Rs. 1,80,000')[0].value, 180000);
    assert.equal(findAmounts('Refund ₹1,68,000.50 due')[0].value, 168000.5);
    assert.equal(findAmounts('Total: INR 2,499.00')[0].currency, 'INR');
    const a = analyze(sample('Rent deposit (₹)'));
    assert.equal(a.category, 'deposit');
    assert.equal(a.currency, 'INR');
    assert.equal(a.amount, 168000, 'balance due should beat deposit paid');
    assert.equal(a.merchant, 'Mr. R. Kumar');
    assert.match(a.summary, /₹1,68,000\.00/);
  });

  it('falls back to the default currency when the text has none', () => {
    assert.equal(analyze('My refund of 500 for order #A12345 was rejected', 'INR').currency, 'INR');
  });

  it('does not flag unrelated text', () => {
    const a = analyze('Hey, are we still on for lunch tomorrow?');
    assert.equal(a.isLikelyClaim, false);
    assert.equal(a.amount, undefined);
  });

  it('parses European number formats and codes', () => {
    assert.equal(findAmounts('Total EUR 1.234,56')[0].value, 1234.56);
    assert.equal(findAmounts('Refund: 45,00 €')[0].value, 45);
  });

  it('ignores reference-like words without digits', () => {
    assert.equal(findReference('Your order was shipped'), undefined);
  });
});

function makeClaim(over: Partial<Claim> = {}): Claim {
  return {
    id: uid('t'),
    title: 'Refund — Acme',
    merchant: 'Acme',
    category: 'refund',
    amount: 50,
    currency: 'USD',
    evidence: [],
    stage: 0,
    status: 'draft',
    events: [],
    createdAt: '2026-11-01T00:00:00.000Z',
    ...over,
  };
}

describe('escalation', () => {
  const profile = { fullName: 'Jordan Lee', email: 'j@example.com', plan: 'free' as const, currency: 'USD', region: 'intl' as const };

  it('walks a claim through send → wait → overdue → escalate → recovered', () => {
    let c = authorize(makeClaim(), '2026-11-01T00:00:00.000Z');
    assert.equal(nextStep(c).kind, 'prepare');

    c = markStageSent(c, '2026-11-01T00:00:00.000Z');
    assert.equal(c.status, 'active');
    const waiting = nextStep(c, new Date('2026-11-05T00:00:00.000Z'));
    assert.equal(waiting.kind, 'waiting');
    assert.equal(waiting.kind === 'waiting' && waiting.daysLeft, 10);

    const overdue = nextStep(c, new Date('2026-11-20T00:00:00.000Z'));
    assert.equal(overdue.kind, 'overdue');

    c = escalate(c);
    assert.equal(c.stage, 1);
    assert.equal(nextStep(c).kind, 'prepare');

    c = markRecovered(c, 40);
    assert.equal(c.status, 'recovered');
    assert.equal(c.recoveredAmount, 40);
    assert.equal(nextStep(c).kind, 'done');
    assert.deepEqual(
      c.events.map((e) => e.type),
      ['authorized', 'request_sent', 'escalated', 'recovered'],
    );
  });

  it('does not escalate past the final stage', () => {
    const c = makeClaim({ category: 'other', stage: 2 });
    assert.equal(isFinalStage(c), true);
    assert.equal(escalate(c), c);
  });

  it('builds stage-appropriate letters', () => {
    const c = makeClaim({ reference: 'A-123', contactEmail: 'help@acme.com' });
    const first = buildLetter(c, profile, new Date('2026-11-01T00:00:00Z'));
    assert.match(first.subject, /Refund request — \$50\.00 \(Ref: A-123\)/);
    assert.match(first.body, /Dear Acme/);
    assert.match(first.body, /Jordan Lee/);

    const second = buildLetter(markStageSent(escalate(markStageSent(c, '2026-10-01T00:00:00Z'))), profile);
    assert.match(second.subject, /Second notice/);
    assert.match(second.body, /Oct 1, 2026/);

    const withText = {
      ...c,
      evidence: [
        { id: 'e1', kind: 'text' as const, name: 'Original message', text: 'Your refund was rejected.', addedAt: c.createdAt },
        { id: 'e2', kind: 'image' as const, name: 'receipt.jpg', uri: 'file:///r.jpg', addedAt: c.createdAt },
      ],
    };
    const quoted = buildLetter(withText, profile);
    assert.match(quoted.body, /Evidence attached: receipt\.jpg\n/);
    assert.doesNotMatch(quoted.body, /Evidence attached: .*Original message/);
    assert.match(quoted.body, /Original correspondence: quoted below/);
    assert.match(quoted.body, /----- Original message -----\nYour refund was rejected\.$/);

    const chargeback = buildLetter({ ...c, stage: 2 }, profile);
    assert.match(chargeback.subject, /Case summary/);
  });
});

describe('personal loans and India', () => {
  const profile = { fullName: 'Mohan', email: '', plan: 'free' as const, currency: 'INR', region: 'IN' as const };

  it('detects a personal loan and the borrower', () => {
    const a = analyze('I lent Rohan Rs. 50,000 on 12 Nov 2026. He promised to repay it in a week but has not paid me back.', 'INR');
    assert.equal(a.category, 'loan');
    assert.equal(a.merchant, 'Rohan');
    assert.equal(a.amount, 50000);
    assert.equal(a.isLikelyClaim, true);
    assert.equal(a.date, '12 Nov 2026');
    assert.equal(analyze('I lent Rohan Rs. 50,000 on 12-Nov-2026').date, '12-Nov-2026');
    assert.equal(analyze('Paid ₹500 on 05.11.2026').date, '05.11.2026');
  });

  it('uses India escalation routes, inferring India from INR on older claims', () => {
    const loan = makeClaim({ category: 'loan', currency: 'INR', merchant: 'Rohan' });
    assert.equal(regionOf(loan), 'IN');
    assert.deepEqual(
      ladderFor(loan).map((s) => s.key),
      ['loan_request', 'loan_reminder', 'legal_notice', 'recovery_suit'],
    );
    assert.ok(ladderFor({ ...loan, category: 'refund' }).some((s) => s.key === 'nch'));
    assert.ok(!ladderFor({ ...loan, category: 'refund' }).some((s) => s.key === 'chargeback'));
    assert.equal(regionOf({ ...loan, region: 'intl' }), 'intl');
  });

  it('writes friendly loan letters without refund wording', () => {
    const loan = makeClaim({ category: 'loan', currency: 'INR', merchant: 'Rohan', amount: 50000, purchaseDate: '12-Nov-2026' });
    const first = buildLetter(loan, profile, new Date('2026-11-19T00:00:00Z'));
    assert.match(first.subject, /Repayment of ₹50,000\.00 I lent you on 12-Nov-2026/);
    assert.match(first.body, /^Hi Rohan,/);
    assert.match(first.body, /Amount lent: ₹50,000\.00/);
    assert.match(first.body, /instalments/);
    assert.doesNotMatch(first.body, /refund/i);

    const reminder = buildLetter(escalate(markStageSent(loan, '2026-11-19T00:00:00Z')), profile);
    assert.match(reminder.body, /legal notice/);
    assert.doesNotMatch(reminder.body, /refund/i);

    const summary = buildLetter({ ...loan, stage: 2 }, profile);
    assert.match(summary.body, /Borrower: Rohan/);
  });

  it('removes evidence and records it', () => {
    const c = makeClaim({
      evidence: [{ id: 'e1', kind: 'text', name: 'Original message', text: 'StreamPlus Receipt', addedAt: '' }],
    });
    const out = removeEvidence(c, 'e1');
    assert.equal(out.evidence.length, 0);
    assert.match(out.events.at(-1)!.label, /Removed evidence/);
    assert.doesNotMatch(buildLetter(out, profile).body, /StreamPlus/);
  });

  it('keeps progress when the claim type changes, clamped to the new path', () => {
    const c = makeClaim({ category: 'refund', currency: 'INR', stage: 1 });
    const asLoan = updateDetails(c, { category: 'loan' });
    assert.equal(asLoan.stage, 1);
    assert.equal(currentStage(asLoan).key, 'loan_reminder');
    const shortPath = updateDetails({ ...c, stage: 3 }, { category: 'other', region: 'intl' });
    assert.equal(shortPath.stage, 2);
  });
});

describe('looking back along the path', () => {
  const profile = { fullName: 'Mohan', email: '', plan: 'free' as const, currency: 'INR', region: 'IN' as const };

  it('shows the letter sent at an earlier step, dated as sent', () => {
    let c = makeClaim({ category: 'loan', currency: 'INR', merchant: 'Rohan', amount: 50000 });
    c = markStageSent(c, '2026-11-19T00:00:00.000Z');
    c = escalate(c);
    assert.equal(stageSentAt(c, 0), '2026-11-19T00:00:00.000Z');
    assert.equal(stageSentAt(c, 1), undefined);
    const first = buildLetter(c, profile, new Date(stageSentAt(c, 0)!), 0);
    assert.match(first.subject, /^Repayment of/);
    assert.match(first.body, /Nov 26, 2026/); // 7-day deadline from the send date
    assert.match(buildLetter(c, profile).subject, /^Reminder/); // current step unchanged
  });

  it('goes back to an earlier step and only backwards', () => {
    const c = escalate(markStageSent(makeClaim({ category: 'loan', currency: 'INR' })));
    const back = goToStage(c, 0);
    assert.equal(back.stage, 0);
    assert.equal(back.nextActionAt, undefined);
    assert.match(back.events.at(-1)!.label, /Moved back to: Friendly request/);
    assert.equal(goToStage(c, 2), c);
  });
});

describe('saved copies of sent letters', () => {
  const profile = { fullName: 'Mohan', email: '', plan: 'free' as const, currency: 'INR', region: 'IN' as const };

  it('keeps the sent letter unchanged after the claim is edited', () => {
    let c = makeClaim({ category: 'loan', currency: 'INR', merchant: 'Rohan', amount: 50000 });
    const shown = buildLetter(c, profile);
    c = markStageSent(c, '2026-11-19T00:00:00.000Z', shown);
    c = escalate(c);
    c = updateDetails(c, { amount: 45000, merchant: 'Rohan Sharma' });
    const saved = stageSentLetter(c, 0)!;
    assert.deepEqual(saved, { subject: shown.subject, body: shown.body });
    assert.match(saved.body, /₹50,000\.00/);
    assert.match(saved.body, /^Hi Rohan,/);
    assert.match(buildLetter(c, profile).body, /₹45,000\.00/); // live letters use the new details
  });

  it('keeps the latest copy when a step is sent again', () => {
    let c = makeClaim({ category: 'loan', currency: 'INR' });
    c = markStageSent(c, '2026-11-01T00:00:00.000Z', { subject: 'first', body: 'a' });
    c = goToStage(escalate(c), 0);
    c = markStageSent(c, '2026-11-10T00:00:00.000Z', { subject: 'second', body: 'b' });
    assert.equal(stageSentLetter(c, 0)!.subject, 'second');
    assert.equal(stageSentAt(c, 0), '2026-11-10T00:00:00.000Z');
  });

  it('has no saved copy for steps sent before copies were kept', () => {
    const c = markStageSent(makeClaim({ category: 'loan', currency: 'INR' }));
    assert.ok(stageSentAt(c, 0));
    assert.equal(stageSentLetter(c, 0), undefined);
  });
});

describe('partial payments', () => {
  const profile = { fullName: 'Mohan', email: '', plan: 'free' as const, currency: 'INR', region: 'IN' as const };
  const sentLoan = () =>
    escalate(markStageSent(makeClaim({ category: 'loan', currency: 'INR', merchant: 'Rohan', amount: 50000, purchaseDate: '12-Nov-2026' }), '2026-11-01T00:00:00.000Z'));

  it('keeps the claim open with the balance after a partial payment', () => {
    let c = markStageSent(sentLoan(), '2026-11-19T00:00:00.000Z'); // reminder sent, deadline Nov 26
    c = recordPayment(c, 15000, '2026-11-20T12:00:00.000Z', '2026-11-20T12:00:00.000Z');
    assert.equal(c.status, 'active');
    assert.equal(paidSoFar(c), 15000);
    assert.equal(outstanding(c), 35000);
    assert.match(c.events.at(-1)!.label, /Received ₹15,000\.00 · ₹35,000\.00 outstanding · deadline moved to Nov 27, 2026/);
  });

  it('restarts the timer only for payments of at least 10%', () => {
    const c = markStageSent(sentLoan(), '2026-11-19T00:00:00.000Z');
    const big = recordPayment(c, 5000, '2026-11-24T12:00:00.000Z', '2026-11-24T12:00:00.000Z');
    assert.equal(big.nextActionAt, '2026-12-01T12:00:00.000Z');
    const small = recordPayment(c, 4999, '2026-11-24T12:00:00.000Z', '2026-11-24T12:00:00.000Z');
    assert.equal(small.nextActionAt, c.nextActionAt);
    assert.equal(outstanding(small), 45001);
    assert.doesNotMatch(small.events.at(-1)!.label, /deadline moved/);
  });

  it('closes as recovered once payments cover the full amount', () => {
    let c = recordPayment(sentLoan(), 15000, '2026-11-20T12:00:00.000Z');
    c = recordPayment(c, 35000, '2026-12-05T12:00:00.000Z');
    assert.equal(c.status, 'recovered');
    assert.equal(c.recoveredAmount, 50000);
    assert.equal(outstanding(c), 0);
    assert.equal(nextStep(c).kind, 'done');
    const reopened = reopen(c);
    assert.equal(outstanding(reopened), 35000);
  });

  it('asks for the balance in letters and lists the payments', () => {
    const c = recordPayment(sentLoan(), 15000, '2026-11-20T12:00:00.000Z');
    const letter = buildLetter(c, profile);
    assert.match(letter.subject, /Reminder: ₹35,000\.00 still to be repaid/);
    assert.match(letter.body, /the ₹50,000\.00 I lent you on 12-Nov-2026/);
    assert.match(letter.body, /Thank you for the ₹15,000\.00 you’ve paid so far, but ₹35,000\.00 is still outstanding/);
    assert.match(letter.body, /Received so far: ₹15,000\.00 \(₹15,000\.00 on Nov 20, 2026\)/);
    assert.match(letter.body, /Outstanding: ₹35,000\.00/);
    assert.match(letter.body, /Please repay the remaining ₹35,000\.00/);
    const notice = buildLetter({ ...c, stage: 2 }, profile);
    assert.match(notice.body, /Outcome requested: payment of ₹35,000\.00/);
  });

  it('treats old recovered claims (no payment list) as paid', () => {
    const old = markRecovered(makeClaim({ amount: 50 }), 40);
    assert.equal(paidSoFar(old), 40);
  });

  it('parses typed dates, day first', () => {
    assert.equal(new Date(parseDayInput('20-11-2026')!).getDate(), 20);
    assert.equal(new Date(parseDayInput('05/02/2026')!).getMonth(), 1);
    assert.ok(parseDayInput('2026-11-20'));
    assert.equal(parseDayInput('31-02-2026'), undefined);
    assert.equal(parseDayInput('yesterday'), undefined);
  });
});
