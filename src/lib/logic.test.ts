import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { analyze, findAmounts, findReference } from './analyzer';
import { authorize, buildLetter, escalate, isFinalStage, markRecovered, markStageSent, nextStep, uid } from './escalation';
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
  const profile = { fullName: 'Jordan Lee', email: 'j@example.com', plan: 'free' as const };

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
