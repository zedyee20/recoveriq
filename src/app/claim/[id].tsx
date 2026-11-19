import * as Clipboard from 'expo-clipboard';
import * as MailComposer from 'expo-mail-composer';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Image, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { Button, Card, CategoryBadge, Chip, CurrencyPicker, Field, SectionTitle, StatusPill, colors, space, styles } from '@/components/ui';
import { CATEGORY_LABELS } from '@/lib/analyzer';
import { confirm, notify } from '@/lib/dialog';
import {
  authorize,
  buildLetter,
  closeClaim,
  currentStage,
  escalate,
  formatDate,
  formatMoney,
  goToStage,
  ladderFor,
  markRecovered,
  markStageSent,
  nextStep,
  regionOf,
  REGION_LABELS,
  removeEvidence,
  reopen,
  stageSentAt,
  updateDetails,
} from '@/lib/escalation';
import { successFee, SUCCESS_FEE_RATE } from '@/lib/plans';
import { useStore } from '@/lib/store';
import type { Claim, ClaimCategory, Region } from '@/lib/types';

export default function ClaimScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getClaim, updateClaim, removeClaim, profile } = useStore();
  const claim = getClaim(id);
  const [editing, setEditing] = useState(false);

  if (!claim) {
    return (
      <View style={[styles.screen, styles.content]}>
        <Text style={styles.h2}>Claim not found</Text>
        <Button title="Back to claims" variant="secondary" onPress={() => router.replace('/')} />
      </View>
    );
  }

  const update = (fn: (c: Claim) => Claim) => updateClaim(claim.id, fn);
  const step = nextStep(claim);

  return (
    <>
      <Stack.Screen options={{ title: claim.merchant || 'Claim' }} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Card style={{ gap: space.md }}>
          <View style={styles.row}>
            <CategoryBadge category={claim.category} size={48} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.muted, { fontSize: 13 }]}>{CATEGORY_LABELS[claim.category]}</Text>
              <Text style={styles.h2} numberOfLines={2}>
                {claim.merchant}
              </Text>
            </View>
            <StatusPill status={claim.status} overdue={step.kind === 'overdue'} />
          </View>
          <Text style={{ fontSize: 34, fontWeight: '800', color: colors.ink, letterSpacing: -0.5 }}>
            {formatMoney(claim.status === 'recovered' ? (claim.recoveredAmount ?? claim.amount) : claim.amount, claim.currency)}
          </Text>
          <View style={{ gap: 4 }}>
            {claim.reference && <Meta label="Reference" value={claim.reference} />}
            {claim.purchaseDate && <Meta label="Date" value={claim.purchaseDate} />}
            {claim.contactEmail && <Meta label="Contact" value={claim.contactEmail} />}
            <Meta label="Opened" value={formatDate(claim.createdAt)} />
          </View>
        </Card>

        <NextStepPanel claim={claim} update={update} />

        <SectionTitle>Escalation path</SectionTitle>
        <Ladder claim={claim} update={update} />

        <SectionTitle>Evidence ({claim.evidence.length})</SectionTitle>
        <EvidenceList claim={claim} onRemove={(eid) => update((c) => removeEvidence(c, eid))} />

        <SectionTitle>Timeline</SectionTitle>
        <Card style={{ gap: space.md }}>
          {[...claim.events].reverse().map((e) => (
            <View key={e.id} style={{ flexDirection: 'row', gap: space.md }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand, marginTop: 6 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.body}>{e.label}</Text>
                <Text style={[styles.muted, { fontSize: 12 }]}>{formatDate(e.at)}</Text>
              </View>
            </View>
          ))}
        </Card>

        <SectionTitle>Manage</SectionTitle>
        {editing ? (
          <EditDetails
            claim={claim}
            onCancel={() => setEditing(false)}
            onSave={(d) => {
              update((c) => updateDetails(c, d));
              setEditing(false);
            }}
          />
        ) : (
          <Button title="Edit details" variant="secondary" onPress={() => setEditing(true)} />
        )}
        {claim.status === 'draft' || claim.status === 'active' ? (
          <Button
            title="Close claim"
            variant="secondary"
            onPress={async () => {
              if (await confirm('Close this claim?', 'You can reopen it later.', 'Close')) update((c) => closeClaim(c, 'closed by you'));
            }}
          />
        ) : (
          <Button title="Reopen claim" variant="secondary" onPress={() => update(reopen)} />
        )}
        <Button
          title="Delete claim"
          variant="danger"
          onPress={async () => {
            if (await confirm('Delete this claim?', 'This removes the claim and its evidence from this device.', 'Delete', true)) {
              router.back();
              removeClaim(claim.id);
            }
          }}
        />
        {profile.plan === 'success' && (
          <Text style={[styles.muted, { fontSize: 12, textAlign: 'center' }]}>
            Pay-on-success plan: a {Math.round(SUCCESS_FEE_RATE * 100)}% fee applies only to money you actually recover.
          </Text>
        )}
      </ScrollView>
    </>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: space.sm }}>
      <Text style={[styles.muted, { width: 80, fontSize: 13 }]}>{label}</Text>
      <Text style={{ flex: 1, fontSize: 13, color: colors.ink }} selectable>
        {value}
      </Text>
    </View>
  );
}

function NextStepPanel({ claim, update }: { claim: Claim; update: (fn: (c: Claim) => Claim) => void }) {
  const { profile } = useStore();
  const step = nextStep(claim);
  const [paidOpen, setPaidOpen] = useState(false);
  const [paidAmount, setPaidAmount] = useState(claim.amount.toFixed(2));
  const [consent, setConsent] = useState(false);
  const letter = useMemo(() => buildLetter(claim, profile), [claim, profile]);

  if (step.kind === 'done') {
    if (claim.status !== 'recovered') return null;
    const got = claim.recoveredAmount ?? claim.amount;
    return (
      <Card style={{ backgroundColor: colors.brandSoft, borderColor: colors.brand, gap: 6 }}>
        <Text style={{ fontSize: 28 }}>🎉</Text>
        <Text style={[styles.h2, { color: colors.brandDark }]}>You recovered {formatMoney(got, claim.currency)}</Text>
        {profile.plan === 'success' && (
          <Text style={styles.muted}>
            Success fee ({Math.round(SUCCESS_FEE_RATE * 100)}%): {formatMoney(successFee(got), claim.currency)} · You keep{' '}
            {formatMoney(got - successFee(got), claim.currency)}
          </Text>
        )}
      </Card>
    );
  }

  const stage = step.stage;

  const paidPanel = paidOpen ? (
    <View style={{ gap: space.sm }}>
      <Field label="Amount you received" value={paidAmount} onChangeText={setPaidAmount} keyboardType="decimal-pad" />
      <Button
        title="Confirm recovery"
        onPress={() => {
          const n = Number(paidAmount.replace(/,/g, ''));
          if (!Number.isFinite(n) || n <= 0) return notify('Check the amount', 'Enter how much you received.');
          update((c) => markRecovered(c, n));
        }}
      />
      <Button title="Cancel" variant="ghost" onPress={() => setPaidOpen(false)} />
    </View>
  ) : (
    <Button title="They paid me" variant="secondary" onPress={() => setPaidOpen(true)} />
  );

  if (step.kind === 'waiting' || step.kind === 'overdue') {
    const overdue = step.kind === 'overdue';
    const nextTitle = !overdue || step.canEscalate ? ladderFor(claim)[claim.stage + 1]?.title : undefined;
    return (
      <Card style={{ gap: space.md, borderColor: overdue ? colors.warn : colors.line, borderWidth: overdue ? 1.5 : undefined }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: overdue ? colors.warn : colors.info, letterSpacing: 0.4 }}>
          {overdue ? 'NO REPLY BY DEADLINE' : 'WAITING FOR A REPLY'}
        </Text>
        <Text style={styles.h2}>
          {overdue
            ? `${claim.merchant} missed the deadline`
            : `${step.daysLeft} ${step.daysLeft === 1 ? 'day' : 'days'} left for ${claim.merchant} to respond`}
        </Text>
        <Text style={styles.muted}>
          {stage.title} sent. Deadline: {claim.nextActionAt ? formatDate(claim.nextActionAt) : '—'}.
          {nextTitle ? ` If they don’t pay, the next step is: ${nextTitle}.` : ' This is the last step in the path.'}
        </Text>
        {paidPanel}
        {!paidOpen && nextTitle && (
          <Button
            title={overdue ? `Escalate: ${nextTitle}` : `They refused. Escalate now`}
            variant={overdue ? 'primary' : 'secondary'}
            onPress={() => update((c) => escalate(c))}
          />
        )}
        {!paidOpen && !nextTitle && overdue && (
          <Text style={styles.muted}>
            You’ve reached the end of the escalation path. Consider filing in small claims court. Check your local court’s website for limits and
            fees.
          </Text>
        )}
      </Card>
    );
  }

  // step.kind === 'prepare'
  const isEmail = stage.channel === 'email';

  async function send() {
    if (!isEmail) return;
    const recipients = claim.contactEmail ? [claim.contactEmail] : [];
    const attachments = Platform.OS === 'web' ? [] : claim.evidence.filter((e) => e.uri).map((e) => e.uri as string);
    const available = await MailComposer.isAvailableAsync();
    if (!available) {
      await Clipboard.setStringAsync(`${letter.subject}\n\n${letter.body}`);
      notify('No email app set up', 'We copied your request to the clipboard so you can send it from any app.');
      return;
    }
    const result = await MailComposer.composeAsync({ recipients, subject: letter.subject, body: letter.body, attachments });
    // Android always reports "sent" and web can't tell, so double-check with the user before starting the clock.
    if (result.status === 'cancelled' || result.status === 'saved') return;
    const sent =
      Platform.OS === 'ios' && result.status === 'sent'
        ? true
        : await confirm('Did you send it?', 'We’ll start the response timer once your request is sent.', 'Yes, it’s sent');
    if (sent) update((c) => markStageSent(c));
  }

  return (
    <Card style={{ gap: space.md, borderColor: colors.brand, borderWidth: 1.5 }}>
      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.brand, letterSpacing: 0.4 }}>
        NEXT STEP · {claim.stage + 1} OF {ladderFor(claim).length}
      </Text>
      <Text style={styles.h2}>{stage.title}</Text>
      <Text style={styles.body}>{stage.action}</Text>
      <Text style={[styles.muted, { fontSize: 13 }]}>💡 {stage.tip}</Text>

      {!claim.authorizedAt ? (
        <>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: consent }}
            onPress={() => setConsent((v) => !v)}
            style={{ flexDirection: 'row', gap: space.md, alignItems: 'flex-start' }}
          >
            <View
              style={{
                width: 22,
                height: 22,
                borderRadius: 6,
                borderWidth: 2,
                borderColor: consent ? colors.brand : colors.faint,
                backgroundColor: consent ? colors.brand : 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: 1,
              }}
            >
              {consent && <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>✓</Text>}
            </View>
            <Text style={[styles.muted, { flex: 1 }]}>
              I authorize RecoverIQ to prepare requests for this claim in my name. The information is accurate to my knowledge, and I’ll review
              each request before I send it.
            </Text>
          </Pressable>
          <Button title="Authorize & prepare request" disabled={!consent} onPress={() => update((c) => authorize(c))} />
        </>
      ) : (
        <>
          {!profile.fullName && (
            <Text style={{ color: colors.warn, fontSize: 13 }}>Add your name in Settings so your letters are signed properly.</Text>
          )}
          {isEmail && !claim.contactEmail && (
            <Text style={{ color: colors.warn, fontSize: 13 }}>No contact email on file. You can add the recipient in your email app.</Text>
          )}
          <View style={{ backgroundColor: colors.bg, borderRadius: 12, padding: space.md, gap: 6 }}>
            <Text style={{ fontWeight: '700', color: colors.ink }} selectable>
              {letter.subject}
            </Text>
            <Text style={[styles.body, { fontSize: 14 }]} selectable>
              {letter.body}
            </Text>
          </View>
          {isEmail ? (
            <>
              <Button title="Open in email app" onPress={send} />
              <Button
                title="I sent it another way"
                variant="secondary"
                onPress={() => update((c) => markStageSent(c))}
              />
            </>
          ) : (
            <Button title="I’ve filed it" onPress={() => update((c) => markStageSent(c))} />
          )}
          <Button
            title="Copy text"
            variant="ghost"
            onPress={async () => {
              await Clipboard.setStringAsync(`${letter.subject}\n\n${letter.body}`);
              notify('Copied', 'The text is on your clipboard.');
            }}
          />
          {claim.stage > 0 && paidPanel}
        </>
      )}
    </Card>
  );
}

function Ladder({ claim, update }: { claim: Claim; update: (fn: (c: Claim) => Claim) => void }) {
  const { profile } = useStore();
  const ladder = ladderFor(claim);
  const current = currentStage(claim);
  const done = claim.status === 'recovered' || claim.status === 'closed';
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [showLetter, setShowLetter] = useState(false);

  return (
    <Card style={{ gap: 0 }}>
      {ladder.map((s, i) => {
        const past = i < claim.stage || (i === claim.stage && !!claim.nextActionAt);
        const isCurrent = s.key === current.key && i === claim.stage && !done;
        const isOpen = openIdx === i;
        const sentAt = stageSentAt(claim, i);
        const letter = isOpen && showLetter ? buildLetter(claim, profile, sentAt ? new Date(sentAt) : new Date(), i) : null;
        return (
          <View key={s.key} style={{ flexDirection: 'row', gap: space.md }}>
            <View style={{ alignItems: 'center' }}>
              <View
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: past ? colors.brand : isCurrent ? colors.brandSoft : colors.line,
                  borderWidth: isCurrent ? 2 : 0,
                  borderColor: colors.brand,
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: '800', color: past ? '#fff' : colors.brandDark }}>{past ? '✓' : i + 1}</Text>
              </View>
              {i < ladder.length - 1 && <View style={{ width: 2, flex: 1, minHeight: 16, backgroundColor: past ? colors.brand : colors.line }} />}
            </View>
            <View style={{ flex: 1, paddingBottom: i < ladder.length - 1 ? space.lg : 0, gap: space.sm }}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: isOpen }}
                accessibilityLabel={`Step ${i + 1}: ${s.title}`}
                onPress={() => {
                  setOpenIdx(isOpen ? null : i);
                  setShowLetter(false);
                }}
                style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.sm }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: isCurrent ? '700' : '600', color: isCurrent || past ? colors.ink : colors.muted }}>{s.title}</Text>
                  <Text style={[styles.muted, { fontSize: 13 }]}>
                    {sentAt
                      ? `${s.channel === 'email' ? 'Sent' : 'Filed'} ${formatDate(sentAt)}`
                      : `${s.channel === 'email' ? 'Email' : 'Outside the app'} · wait up to ${s.waitDays} days`}
                  </Text>
                </View>
                <Text style={{ color: colors.brand, fontWeight: '700', fontSize: 16 }}>{isOpen ? '−' : '+'}</Text>
              </Pressable>

              {isOpen && (
                <View style={{ backgroundColor: colors.bg, borderRadius: 12, padding: space.md, gap: space.sm }}>
                  <Text style={[styles.body, { fontSize: 14 }]}>{s.action}</Text>
                  <Text style={[styles.muted, { fontSize: 13 }]}>💡 {s.tip}</Text>
                  <Text style={[styles.muted, { fontSize: 13, fontStyle: 'italic' }]}>
                    {isCurrent
                      ? 'This is your current step. Use “Next step” above to act on it.'
                      : i < claim.stage
                        ? 'You’ve already done this step.'
                        : done
                          ? 'This claim is finished.'
                          : 'You’ll reach this step if they don’t respond in time.'}
                  </Text>

                  <Button
                    title={showLetter ? 'Hide' : s.channel === 'email' ? (sentAt ? 'View the letter you sent' : 'Preview the letter') : 'Preview the case summary'}
                    variant="secondary"
                    onPress={() => setShowLetter((v) => !v)}
                  />
                  {letter && (
                    <View style={{ backgroundColor: colors.card, borderRadius: 10, padding: space.md, gap: 6 }}>
                      <Text style={{ fontWeight: '700', color: colors.ink }} selectable>
                        {letter.subject}
                      </Text>
                      <Text style={[styles.body, { fontSize: 13 }]} selectable>
                        {letter.body}
                      </Text>
                      <Button
                        title="Copy text"
                        variant="ghost"
                        onPress={async () => {
                          await Clipboard.setStringAsync(`${letter.subject}\n\n${letter.body}`);
                          notify('Copied', 'The text is on your clipboard.');
                        }}
                      />
                    </View>
                  )}

                  {i < claim.stage && !done && (
                    <Button
                      title="Go back to this step"
                      variant="ghost"
                      onPress={async () => {
                        if (
                          await confirm(
                            `Go back to “${s.title}”?`,
                            'Use this if you moved ahead by mistake. You can send this step again, and later steps will wait until then.',
                            'Go back',
                          )
                        ) {
                          update((c) => goToStage(c, i));
                          setOpenIdx(null);
                        }
                      }}
                    />
                  )}
                </View>
              )}
            </View>
          </View>
        );
      })}
    </Card>
  );
}

function EvidenceList({ claim, onRemove }: { claim: Claim; onRemove: (id: string) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  if (claim.evidence.length === 0) {
    return (
      <Card>
        <Text style={styles.muted}>No evidence attached. Receipts and emails make requests much stronger.</Text>
      </Card>
    );
  }
  return (
    <Card style={{ gap: space.md }}>
      {claim.evidence.map((e) => (
        <View key={e.id} style={{ gap: space.sm }}>
          <Pressable
            accessibilityRole="button"
            onPress={() => setOpen(open === e.id ? null : e.id)}
            style={styles.row}
            disabled={e.kind === 'document'}
          >
            {e.kind === 'image' && e.uri ? (
              <Image source={{ uri: e.uri }} style={{ width: 44, height: 44, borderRadius: 8, backgroundColor: colors.line }} />
            ) : (
              <Text style={{ fontSize: 24, width: 44, textAlign: 'center' }}>{e.kind === 'text' ? '✉️' : '📄'}</Text>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.body} numberOfLines={1}>
                {e.name}
              </Text>
              <Text style={[styles.muted, { fontSize: 12 }]}>Added {formatDate(e.addedAt)}</Text>
            </View>
            {e.kind !== 'document' && <Text style={{ color: colors.brand, fontWeight: '600' }}>{open === e.id ? 'Hide' : 'View'}</Text>}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remove ${e.name}`}
              hitSlop={10}
              onPress={async () => {
                if (await confirm('Remove this evidence?', `“${e.name}” will no longer be attached or quoted in your letters.`, 'Remove', true)) {
                  onRemove(e.id);
                }
              }}
            >
              <Text style={{ color: colors.danger, fontWeight: '600', marginLeft: space.sm }}>Remove</Text>
            </Pressable>
          </Pressable>
          {open === e.id && e.kind === 'text' && (
            <Text style={[styles.muted, { backgroundColor: colors.bg, padding: space.md, borderRadius: 10, fontSize: 13 }]} selectable>
              {e.text}
            </Text>
          )}
          {open === e.id && e.kind === 'image' && e.uri && (
            <Image source={{ uri: e.uri }} style={{ width: '100%', aspectRatio: 0.75, borderRadius: 10 }} resizeMode="contain" />
          )}
        </View>
      ))}
    </Card>
  );
}

const CATEGORIES = Object.keys(CATEGORY_LABELS) as ClaimCategory[];

function EditDetails({ claim, onSave, onCancel }: { claim: Claim; onSave: (d: Parameters<typeof updateDetails>[1]) => void; onCancel: () => void }) {
  const [merchant, setMerchant] = useState(claim.merchant);
  const [category, setCategory] = useState<ClaimCategory>(claim.category);
  const [amount, setAmount] = useState(String(claim.amount));
  const [currency, setCurrency] = useState(claim.currency);
  const [region, setRegion] = useState<Region>(regionOf(claim));
  const [purchaseDate, setPurchaseDate] = useState(claim.purchaseDate ?? '');
  const [reference, setReference] = useState(claim.reference ?? '');
  const [contactEmail, setContactEmail] = useState(claim.contactEmail ?? '');
  const [notes, setNotes] = useState(claim.notes ?? '');
  const amountNum = Number(amount.replace(/,/g, ''));
  const valid = merchant.trim().length > 0 && Number.isFinite(amountNum) && amountNum > 0;

  return (
    <Card>
      <Field label="Who owes you?" value={merchant} onChangeText={setMerchant} />
      <Text style={styles.label}>Type of claim</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.md }}>
        {CATEGORIES.map((c) => (
          <Chip key={c} label={CATEGORY_LABELS[c]} selected={category === c} onPress={() => setCategory(c)} />
        ))}
      </View>
      <Field label={category === 'loan' ? 'Amount lent' : 'Amount owed'} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
      <CurrencyPicker value={currency} onChange={setCurrency} />
      <Text style={styles.label}>Rules and escalation steps for</Text>
      <View style={{ flexDirection: 'row', gap: space.sm, marginBottom: space.md }}>
        {(Object.keys(REGION_LABELS) as Region[]).map((r) => (
          <Chip key={r} label={REGION_LABELS[r]} selected={region === r} onPress={() => setRegion(r)} />
        ))}
      </View>
      <Field label={category === 'loan' ? 'Date lent' : 'Date of purchase / event'} value={purchaseDate} onChangeText={setPurchaseDate} />
      <Field label="Reference (optional)" value={reference} onChangeText={setReference} autoCapitalize="characters" />
      <Field label="Their contact email" value={contactEmail} onChangeText={setContactEmail} keyboardType="email-address" autoCapitalize="none" />
      <Field label="What happened? (optional)" value={notes} onChangeText={setNotes} multiline />
      <View style={{ gap: space.sm }}>
        <Button
          title="Save changes"
          disabled={!valid}
          onPress={() =>
            onSave({
              merchant: merchant.trim(),
              category,
              amount: amountNum,
              currency,
              region,
              purchaseDate: purchaseDate.trim() || undefined,
              reference: reference.trim() || undefined,
              contactEmail: contactEmail.trim() || undefined,
              notes: notes.trim() || undefined,
            })
          }
        />
        <Button title="Cancel" variant="ghost" onPress={onCancel} />
      </View>
    </Card>
  );
}
