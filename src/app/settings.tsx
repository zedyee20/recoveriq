import { router } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Button, Card, Chip, CurrencyPicker, Field, SectionTitle, colors, space, styles } from '@/components/ui';
import { REGION_LABELS } from '@/lib/ladders';
import type { Region } from '@/lib/types';
import { confirm } from '@/lib/dialog';
import { PLANS, SUCCESS_FEE_RATE } from '@/lib/plans';
import { useStore } from '@/lib/store';

export default function Settings() {
  const { profile, setProfile, resetAll } = useStore();

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <SectionTitle>Your details</SectionTitle>
      <Card>
        <Field label="Full name" value={profile.fullName} onChangeText={(v) => setProfile({ fullName: v })} autoComplete="name" />
        <Field
          label="Email"
          value={profile.email}
          onChangeText={(v) => setProfile({ email: v })}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          hint="Used to sign the requests you send."
        />
        <CurrencyPicker label="Default currency" value={profile.currency} onChange={(c) => setProfile({ currency: c })} />
        <Text style={styles.label}>Use rules and escalation steps for</Text>
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          {(Object.keys(REGION_LABELS) as Region[]).map((r) => (
            <Chip key={r} label={REGION_LABELS[r]} selected={profile.region === r} onPress={() => setProfile({ region: r })} />
          ))}
        </View>
        <Text style={styles.hint}>Applies to new claims. You can change it for a single claim with “Edit details”.</Text>
      </Card>

      <SectionTitle>Plan</SectionTitle>
      {PLANS.map((p) => {
        const selected = profile.plan === p.id;
        return (
          <Pressable
            key={p.id}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            onPress={() => setProfile({ plan: p.id })}
          >
            <Card style={{ borderColor: selected ? colors.brand : colors.line, borderWidth: selected ? 1.5 : undefined, gap: 4 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={[styles.h2, { fontSize: 17 }]}>{p.name}</Text>
                {selected && <Text style={{ color: colors.brand, fontWeight: '700' }}>Current</Text>}
              </View>
              <Text style={{ color: colors.brandDark, fontWeight: '700' }}>{p.price}</Text>
              {p.points.map((pt) => (
                <Text key={pt} style={styles.muted}>
                  • {pt}
                </Text>
              ))}
            </Card>
          </Pressable>
        );
      })}
      <Text style={[styles.muted, { fontSize: 12 }]}>
        Prototype: plans can be switched freely and no payment is taken. On the pay-on-success plan the fee is{' '}
        {Math.round(SUCCESS_FEE_RATE * 100)}% of money you actually receive. It’s shown before you confirm any recovery, and it’s only offered where
        such fees are legally permitted.
      </Text>

      <SectionTitle>Privacy & disclosures</SectionTitle>
      <Card style={{ gap: space.sm }}>
        <Text style={styles.body}>• Your claims, documents, and details are stored only on this device.</Text>
        <Text style={styles.body}>• RecoverIQ never contacts a business without you. You review and send every request yourself.</Text>
        <Text style={styles.body}>• RecoverIQ is not a law firm and does not provide legal advice. Deadlines and rights vary by location.</Text>
      </Card>

      <SectionTitle>Data</SectionTitle>
      <Button
        title="Delete all claims & data"
        variant="danger"
        onPress={async () => {
          if (await confirm('Delete everything?', 'All claims, evidence, and settings will be removed from this device.', 'Delete', true)) {
            resetAll();
            router.replace('/');
          }
        }}
      />
    </ScrollView>
  );
}
