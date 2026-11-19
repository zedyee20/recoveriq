import * as Clipboard from 'expo-clipboard';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { Button, Card, Field, SectionTitle, colors, space, styles } from '@/components/ui';
import { buildNchComplaint, isAtNchStep, NCH, nchFiling, saveNchDocket } from '@/lib/complaint';
import { notify } from '@/lib/dialog';
import { formatDate, markStageSent, stageSentAt } from '@/lib/escalation';
import { useStore } from '@/lib/store';

export default function NchComplaintScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getClaim, updateClaim, profile } = useStore();
  const claim = getClaim(id);
  const complaint = useMemo(() => (claim ? buildNchComplaint(claim, profile) : null), [claim, profile]);
  const filing = claim ? nchFiling(claim) : undefined;
  const [docket, setDocket] = useState(filing?.reference ?? '');
  const [editingDocket, setEditingDocket] = useState(!filing);
  const [copied, setCopied] = useState<string | null>(null);

  if (!claim || !complaint) {
    return (
      <View style={[styles.screen, styles.content]}>
        <Text style={styles.h2}>Claim not found</Text>
        <Button title="Back" variant="secondary" onPress={() => router.back()} />
      </View>
    );
  }

  async function copy(key: string, value: string) {
    await Clipboard.setStringAsync(value);
    setCopied(key);
    setTimeout(() => setCopied((k) => (k === key ? null : k)), 1500);
  }

  async function open(url: string, what: string) {
    try {
      await Linking.openURL(url);
    } catch {
      notify(`Couldn’t open ${what}`, url);
    }
  }

  function saveDocket() {
    const ref = docket.trim();
    if (!ref) return notify('Enter the docket number', 'You get it on screen, by SMS, or by email after registering your grievance.');
    updateClaim(claim!.id, (c) => {
      let next = saveNchDocket(c, ref);
      // Filing is the helpline step: start its waiting time and keep a copy of what was filed.
      if (isAtNchStep(next) && !stageSentAt(next, next.stage)) {
        next = markStageSent(next, undefined, { subject: `National Consumer Helpline grievance · docket ${ref}`, body: complaint!.fullText });
      }
      return next;
    });
    setEditingDocket(false);
  }

  const missingName = !profile.fullName.trim();

  return (
    <>
      <Stack.Screen options={{ title: 'Consumer complaint' }} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Card style={{ gap: space.sm, borderColor: colors.brand, borderWidth: 1.5 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.brand, letterSpacing: 0.4 }}>NATIONAL CONSUMER HELPLINE · FREE</Text>
          <Text style={styles.h2}>Complaint against {claim.merchant}</Text>
          <Text style={styles.muted}>
            The helpline sends your grievance to the company and follows up. Everything below is filled in from your claim. Copy it into the
            helpline, and submit it there.
          </Text>
          <Text style={[styles.muted, { fontSize: 12 }]}>
            RecoverIQ can’t submit it for you: the helpline needs your own login and an OTP sent to your phone.
          </Text>
        </Card>

        {filing && !editingDocket && (
          <Card style={{ gap: space.sm, backgroundColor: colors.brandSoft, borderColor: colors.brand }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.brandDark }}>✓ FILED · {formatDate(filing.filedAt).toUpperCase()}</Text>
            <Text style={styles.h2} selectable>
              Docket {filing.reference}
            </Text>
            <Text style={styles.muted}>Your docket number now appears in your letters. Track progress on the helpline website.</Text>
            <Button title="Track your grievance" onPress={() => open(NCH.website, 'the helpline website')} />
            <Button title="Copy docket number" variant="secondary" onPress={() => copy('docket', filing.reference)} />
            <Button title="Change docket number" variant="ghost" onPress={() => setEditingDocket(true)} />
          </Card>
        )}

        <SectionTitle>1 · Choose how to file</SectionTitle>
        <Card style={{ gap: space.md }}>
          <Channel
            icon="🌐"
            title="Website"
            desc="Best for long complaints and uploading documents. Sign up once with your email, then register a grievance."
            action="Open consumerhelpline.gov.in"
            onPress={() => open(NCH.website, 'the helpline website')}
          />
          <Channel
            icon="💬"
            title={`WhatsApp · ${NCH.whatsappNumber}`}
            desc="Send “Hi”, choose English or Hindi, tap “Register Grievance”, then paste the details when asked."
            action="Open WhatsApp chat"
            onPress={() => open(NCH.whatsappUrl, 'WhatsApp')}
          />
          <Channel
            icon="📞"
            title={`Call ${NCH.phone}`}
            desc="Toll-free. Keep this screen open and read out the details."
            action={`Call ${NCH.phone}`}
            onPress={() => open(NCH.phoneUrl, 'the phone app')}
          />
        </Card>

        <SectionTitle right={<CopyButton label={copied === 'all' ? 'Copied ✓' : 'Copy all'} onPress={() => copy('all', complaint.fullText)} />}>
          2 · Your complaint details
        </SectionTitle>
        {missingName && (
          <Text style={{ color: colors.warn, fontSize: 13 }}>Add your name in Settings so it’s filled in here.</Text>
        )}
        <Card style={{ gap: space.lg }}>
          {complaint.fields.map((f) => (
            <View key={f.key} style={{ gap: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={styles.label}>{f.label}</Text>
                {f.value ? <CopyButton label={copied === f.key ? 'Copied ✓' : 'Copy'} onPress={() => copy(f.key, f.value)} /> : null}
              </View>
              <Text style={[styles.body, { fontSize: 14, color: f.value ? colors.ink : colors.faint }]} selectable>
                {f.value || (f.key === 'name' || f.key === 'email' ? 'Not set. Add it in Settings, or type it on the portal.' : 'Not in your claim. Fill this in on the portal.')}
              </Text>
              {f.hint ? <Text style={styles.hint}>{f.hint}</Text> : null}
            </View>
          ))}
        </Card>

        <SectionTitle>Documents to upload</SectionTitle>
        <Card style={{ gap: 6 }}>
          {complaint.documents.map((d) => (
            <Text key={d} style={styles.body}>
              • {d}
            </Text>
          ))}
          <Text style={[styles.hint, { marginTop: 4 }]}>On WhatsApp you can send photos of these. On the website, upload them as files.</Text>
        </Card>

        {(!filing || editingDocket) && (
          <>
            <SectionTitle>3 · After filing</SectionTitle>
            <Card>
              <Field
                label="Docket number"
                value={docket}
                onChangeText={setDocket}
                placeholder="e.g. 1234567"
                autoCapitalize="characters"
                hint="The helpline gives you this when your grievance is registered. Saving it starts the 30-day wait and adds it to your letters."
              />
              <Button title="Save docket number" onPress={saveDocket} disabled={!docket.trim()} />
              {filing && <Button title="Cancel" variant="ghost" onPress={() => setEditingDocket(false)} />}
            </Card>
          </>
        )}

        <Text style={[styles.muted, { fontSize: 12, textAlign: 'center' }]}>
          The helpline is a free pre-litigation step. If it doesn’t resolve your complaint, the next step is the Consumer Commission on e-Jagriti.
        </Text>
      </ScrollView>
    </>
  );
}

function Channel({ icon, title, desc, action, onPress }: { icon: string; title: string; desc: string; action: string; onPress: () => void }) {
  return (
    <View style={{ gap: space.sm }}>
      <View style={[styles.row, { alignItems: 'flex-start' }]}>
        <Text style={{ fontSize: 22, width: 30 }}>{icon}</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '700', fontSize: 16, color: colors.ink }}>{title}</Text>
          <Text style={[styles.muted, { fontSize: 13 }]}>{desc}</Text>
        </View>
      </View>
      <Button title={action} variant="secondary" onPress={onPress} />
    </View>
  );
}

function CopyButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} hitSlop={10} onPress={onPress}>
      <Text style={{ color: colors.brand, fontWeight: '700', fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}
