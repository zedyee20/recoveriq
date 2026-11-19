import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { Button, Card, Chip, Field, SectionTitle, colors, space, styles } from '@/components/ui';
import { analyze, CATEGORY_LABELS } from '@/lib/analyzer';
import { confirm } from '@/lib/dialog';
import { event, uid } from '@/lib/escalation';
import { SAMPLES } from '@/lib/samples';
import { activeClaimCount, FREE_ACTIVE_CLAIM_LIMIT, useStore } from '@/lib/store';
import type { Analysis, ClaimCategory, Evidence } from '@/lib/types';

const CATEGORIES = Object.keys(CATEGORY_LABELS) as ClaimCategory[];

export default function NewClaim() {
  const { addClaim, claims, profile } = useStore();
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<Evidence[]>([]);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);

  // Editable claim fields, prefilled from analysis.
  const [title, setTitle] = useState('');
  const [merchant, setMerchant] = useState('');
  const [category, setCategory] = useState<ClaimCategory>('refund');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [reference, setReference] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [notes, setNotes] = useState('');

  async function pickImage() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted && Platform.OS !== 'web') return;
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, allowsMultipleSelection: true });
    if (res.canceled) return;
    setAttachments((a) => [
      ...a,
      ...res.assets.map((asset, i) => ({
        id: uid('evi'),
        kind: 'image' as const,
        name: asset.fileName ?? `Screenshot ${a.length + i + 1}`,
        uri: asset.uri,
        mimeType: asset.mimeType,
        addedAt: new Date().toISOString(),
      })),
    ]);
  }

  async function pickDocument() {
    const res = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*', 'message/rfc822', 'text/*'], multiple: true });
    if (res.canceled) return;
    setAttachments((a) => [
      ...a,
      ...res.assets.map((asset) => ({
        id: uid('evd'),
        kind: (asset.mimeType?.startsWith('image/') ? 'image' : 'document') as Evidence['kind'],
        name: asset.name,
        uri: asset.uri,
        mimeType: asset.mimeType,
        addedAt: new Date().toISOString(),
      })),
    ]);
  }

  async function pasteFromClipboard() {
    const s = await Clipboard.getStringAsync();
    if (s) setText((t) => (t ? `${t}\n\n${s}` : s));
  }

  function runAnalysis() {
    const a = analyze(text);
    setAnalysis(a);
    setTitle(a.suggestedTitle);
    setMerchant(a.merchant ?? '');
    setCategory(a.category);
    setAmount(a.amount !== undefined ? a.amount.toFixed(2) : '');
    setCurrency(a.currency);
    setPurchaseDate(a.date ?? '');
    setReference(a.reference ?? '');
    setContactEmail(a.contactEmail ?? '');
  }

  function skipToDetails() {
    setAnalysis({
      isLikelyClaim: false,
      confidence: 0,
      category: 'refund',
      currency: 'USD',
      signals: [],
      summary:
        attachments.length > 0
          ? 'Your files are attached as evidence. Reading text from images isn’t available yet, so enter the key details below.'
          : 'Enter the details of the money you’re owed.',
      suggestedTitle: '',
    });
  }

  const amountNum = Number(amount.replace(/,/g, ''));
  const canSave = merchant.trim().length > 0 && Number.isFinite(amountNum) && amountNum > 0;

  async function save() {
    if (profile.plan === 'free' && activeClaimCount(claims) >= FREE_ACTIVE_CLAIM_LIMIT) {
      const go = await confirm(
        'Free plan limit reached',
        `The free plan tracks up to ${FREE_ACTIVE_CLAIM_LIMIT} open claims. Upgrade to track unlimited claims, or close one first.`,
        'See plans',
      );
      if (go) router.replace('/settings');
      return;
    }
    const now = new Date().toISOString();
    const evidence: Evidence[] = [...attachments];
    if (text.trim()) {
      evidence.unshift({ id: uid('evt'), kind: 'text', name: 'Original message', text: text.trim(), addedAt: now });
    }
    const id = uid('clm');
    addClaim({
      id,
      title: title.trim() || `${CATEGORY_LABELS[category]} — ${merchant.trim()}`,
      merchant: merchant.trim(),
      category,
      amount: amountNum,
      currency: currency.trim().toUpperCase() || 'USD',
      purchaseDate: purchaseDate.trim() || undefined,
      reference: reference.trim() || undefined,
      contactEmail: contactEmail.trim() || undefined,
      notes: notes.trim() || undefined,
      evidence,
      stage: 0,
      status: 'draft',
      createdAt: now,
      events: [event('created', 'Claim created', now)],
    });
    router.replace({ pathname: '/claim/[id]', params: { id } });
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {!analysis ? (
          <>
            <Text style={styles.h2}>What do you have?</Text>
            <Text style={styles.muted}>Add a receipt, a screenshot, or paste the text of a refund or rejection email.</Text>

            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <SourceButton icon="🖼️" label="Photo or screenshot" onPress={pickImage} />
              <SourceButton icon="📄" label="File or PDF" onPress={pickDocument} />
              <SourceButton icon="📋" label="Paste" onPress={pasteFromClipboard} />
            </View>

            {attachments.length > 0 && (
              <Card style={{ gap: space.sm }}>
                {attachments.map((a) => (
                  <View key={a.id} style={styles.row}>
                    {a.kind === 'image' && a.uri ? (
                      <Image source={{ uri: a.uri }} style={{ width: 40, height: 40, borderRadius: 8 }} />
                    ) : (
                      <Text style={{ fontSize: 24, width: 40, textAlign: 'center' }}>📄</Text>
                    )}
                    <Text style={[styles.body, { flex: 1 }]} numberOfLines={1}>
                      {a.name}
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${a.name}`}
                      hitSlop={10}
                      onPress={() => setAttachments((all) => all.filter((x) => x.id !== a.id))}
                    >
                      <Text style={{ color: colors.danger, fontWeight: '600' }}>Remove</Text>
                    </Pressable>
                  </View>
                ))}
              </Card>
            )}

            <Field
              label="Email or receipt text"
              value={text}
              onChangeText={setText}
              multiline
              placeholder="Paste the email you got about your refund, deposit, or charge…"
              style={{ minHeight: 160 }}
            />

            <Text style={[styles.muted, { fontSize: 13 }]}>Or try an example:</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              {SAMPLES.map((s) => (
                <Chip key={s.label} label={s.label} onPress={() => setText(s.text)} />
              ))}
            </View>

            <Button title="Find my claim" onPress={runAnalysis} disabled={text.trim().length === 0} style={{ marginTop: space.sm }} />
            <Button title="Enter details manually" variant="ghost" onPress={skipToDetails} />
          </>
        ) : (
          <>
            <AnalysisCard analysis={analysis} />

            <SectionTitle>Claim details</SectionTitle>
            <Card>
              <Field label="Who owes you?" value={merchant} onChangeText={setMerchant} placeholder="Business or person" />
              <Text style={styles.label}>Type of claim</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.md }}>
                {CATEGORIES.map((c) => (
                  <Chip key={c} label={CATEGORY_LABELS[c]} selected={category === c} onPress={() => setCategory(c)} />
                ))}
              </View>
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                <View style={{ flex: 2 }}>
                  <Field label="Amount owed" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" />
                </View>
                <View style={{ flex: 1 }}>
                  <Field label="Currency" value={currency} onChangeText={setCurrency} autoCapitalize="characters" maxLength={3} />
                </View>
              </View>
              <Field label="Date of purchase / event" value={purchaseDate} onChangeText={setPurchaseDate} placeholder="e.g. Oct 3, 2026" />
              <Field label="Order / booking reference" value={reference} onChangeText={setReference} autoCapitalize="characters" />
              <Field
                label="Their contact email"
                value={contactEmail}
                onChangeText={setContactEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                hint="Where your request will be addressed."
              />
              <Field label="Claim title" value={title} onChangeText={setTitle} />
              <Field
                label="What happened? (optional)"
                value={notes}
                onChangeText={setNotes}
                multiline
                placeholder="e.g. The item arrived broken and I reported it within 2 days."
                hint="Included in your request letter."
              />
            </Card>

            <Button title="Create claim" onPress={save} disabled={!canSave} />
            <Button title="Start over" variant="ghost" onPress={() => setAnalysis(null)} />
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function SourceButton({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.card, { flex: 1, alignItems: 'center', gap: 6, paddingVertical: 18 }, pressed && { opacity: 0.8 }]}
    >
      <Text style={{ fontSize: 26 }}>{icon}</Text>
      <Text style={{ fontSize: 13, fontWeight: '600', color: colors.ink, textAlign: 'center' }}>{label}</Text>
    </Pressable>
  );
}

function AnalysisCard({ analysis }: { analysis: Analysis }) {
  const found = analysis.isLikelyClaim;
  const pct = Math.round(analysis.confidence * 100);
  return (
    <Card style={{ borderColor: found ? colors.brand : colors.line, borderWidth: found ? 1.5 : undefined, gap: space.sm }}>
      <Text style={{ fontSize: 13, fontWeight: '700', color: found ? colors.brand : colors.muted, letterSpacing: 0.4 }}>
        {found ? 'POTENTIAL CLAIM FOUND' : analysis.signals.length ? 'PARTIAL MATCH' : 'MANUAL ENTRY'}
      </Text>
      <Text style={[styles.body, { fontWeight: '600' }]}>{analysis.summary}</Text>
      {analysis.signals.length > 0 && (
        <>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.line, overflow: 'hidden', marginTop: 4 }}>
            <View style={{ width: `${pct}%`, height: '100%', backgroundColor: found ? colors.brand : colors.faint }} />
          </View>
          <Text style={[styles.muted, { fontSize: 12 }]}>{pct}% confidence. Check the details below before creating the claim.</Text>
          <View style={{ gap: 6, marginTop: 4 }}>
            {analysis.signals.map((s) => (
              <View key={s.label} style={{ flexDirection: 'row', gap: space.sm }}>
                <Text style={[styles.muted, { width: 82, fontSize: 13 }]}>{s.label}</Text>
                <Text style={{ flex: 1, fontSize: 13, color: colors.ink }}>{s.value}</Text>
              </View>
            ))}
          </View>
        </>
      )}
    </Card>
  );
}
