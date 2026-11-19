import { Link, Stack, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import {
  Button,
  Card,
  CategoryBadge,
  Chip,
  CurrencyPicker,
  Field,
  SectionTitle,
  StatusPill,
  colors,
  space,
  styles,
} from '@/components/ui';
import { CATEGORY_LABELS } from '@/lib/analyzer';
import { formatMoney, nextStep } from '@/lib/escalation';
import { useStore } from '@/lib/store';
import type { Claim } from '@/lib/types';

type Filter = 'all' | 'open' | 'recovered' | 'closed';

export default function Home() {
  const { ready, onboarded, claims, profile } = useStore();
  const [filter, setFilter] = useState<Filter>('all');

  const stats = useMemo(() => {
    const open = claims.filter((c) => c.status === 'draft' || c.status === 'active');
    // Amounts in different currencies can't be added, so totals cover the default currency only.
    const currency = profile.currency;
    const same = (c: Claim) => c.currency === currency;
    return {
      currency,
      otherCurrencies: claims.some((c) => !same(c)),
      inPlay: open.filter(same).reduce((s, c) => s + c.amount, 0),
      recovered: claims.filter(same).reduce((s, c) => s + (c.status === 'recovered' ? (c.recoveredAmount ?? c.amount) : 0), 0),
      openCount: open.length,
      attention: open.filter((c) => {
        const n = nextStep(c);
        return n.kind === 'prepare' || n.kind === 'overdue';
      }),
    };
  }, [claims, profile.currency]);

  const visible = claims.filter((c) =>
    filter === 'all' ? true : filter === 'open' ? c.status === 'draft' || c.status === 'active' : c.status === filter,
  );

  if (!ready) {
    return (
      <View style={[styles.screen, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  if (!onboarded) return <Welcome />;

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Link href="/settings" asChild>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Settings"
                hitSlop={12}
                style={{ marginRight: Platform.OS === 'web' ? space.lg : 0 }}
              >
                <Text style={{ color: colors.brand, fontSize: 16, fontWeight: '600' }}>Settings</Text>
              </Pressable>
            </Link>
          ),
        }}
      />
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic">
        <View style={{ flexDirection: 'row', gap: space.md }}>
          <Card style={{ flex: 1, backgroundColor: colors.brand, borderColor: colors.brand }}>
            <Text style={{ color: '#CDEDE2', fontSize: 13, fontWeight: '600' }}>Money in play</Text>
            <Text style={{ color: '#fff', fontSize: 26, fontWeight: '800', marginTop: 4 }} adjustsFontSizeToFit numberOfLines={1}>
              {formatMoney(stats.inPlay, stats.currency, true)}
            </Text>
            <Text style={{ color: '#CDEDE2', fontSize: 13, marginTop: 2 }}>
              {stats.openCount} open {stats.openCount === 1 ? 'claim' : 'claims'}
            </Text>
          </Card>
          <Card style={{ flex: 1 }}>
            <Text style={{ color: colors.muted, fontSize: 13, fontWeight: '600' }}>Recovered</Text>
            <Text style={{ color: colors.brandDark, fontSize: 26, fontWeight: '800', marginTop: 4 }} adjustsFontSizeToFit numberOfLines={1}>
              {formatMoney(stats.recovered, stats.currency, true)}
            </Text>
            <Text style={{ color: colors.muted, fontSize: 13, marginTop: 2 }}>all time</Text>
          </Card>
        </View>
        {stats.otherCurrencies && (
          <Text style={[styles.muted, { fontSize: 12 }]}>Totals show {stats.currency} claims only. Change your default currency in Settings.</Text>
        )}

        <Button title="+  Find money from a receipt or email" onPress={() => router.push('/new')} />

        {stats.attention.length > 0 && (
          <>
            <SectionTitle>Needs your attention</SectionTitle>
            {stats.attention.map((c) => (
              <ClaimRow key={c.id} claim={c} />
            ))}
          </>
        )}

        <SectionTitle>Your claims</SectionTitle>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
          {(['all', 'open', 'recovered', 'closed'] as Filter[]).map((f) => (
            <Chip key={f} label={f[0].toUpperCase() + f.slice(1)} selected={filter === f} onPress={() => setFilter(f)} />
          ))}
        </ScrollView>

        {visible.length === 0 ? (
          <Card style={{ alignItems: 'center', paddingVertical: 32 }}>
            <Text style={{ fontSize: 36 }}>🔍</Text>
            <Text style={[styles.h2, { marginTop: space.sm }]}>
              {claims.length === 0 ? 'No claims yet' : 'Nothing here'}
            </Text>
            <Text style={[styles.muted, { textAlign: 'center', marginTop: 4 }]}>
              {claims.length === 0
                ? 'Add a receipt, a refund email, or a screenshot. We’ll spot money you’re owed and prepare the request.'
                : 'No claims match this filter.'}
            </Text>
          </Card>
        ) : (
          visible.map((c) => <ClaimRow key={c.id} claim={c} />)
        )}
      </ScrollView>
    </>
  );
}

function ClaimRow({ claim }: { claim: Claim }) {
  const step = nextStep(claim);
  const subtitle =
    step.kind === 'prepare'
      ? `Next: ${step.stage.title}`
      : step.kind === 'waiting'
        ? `Waiting for reply · ${step.daysLeft}d left`
        : step.kind === 'overdue'
          ? step.canEscalate
            ? 'No reply — ready to escalate'
            : 'No reply — final stage reached'
          : claim.status === 'recovered'
            ? 'Money recovered'
            : 'Closed';
  return (
    <Link href={{ pathname: '/claim/[id]', params: { id: claim.id } }} asChild>
      <Pressable accessibilityRole="button" accessibilityLabel={`${claim.title}, ${formatMoney(claim.amount, claim.currency)}`}>
        {({ pressed }) => (
          <Card style={[{ flexDirection: 'row', alignItems: 'center', gap: space.md }, pressed && { opacity: 0.8 }]}>
            <CategoryBadge category={claim.category} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: colors.ink }} numberOfLines={1}>
                {claim.merchant || CATEGORY_LABELS[claim.category]}
              </Text>
              <Text style={[styles.muted, { fontSize: 13 }]} numberOfLines={1}>
                {subtitle}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 6 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: colors.ink }}>{formatMoney(claim.amount, claim.currency)}</Text>
              <StatusPill status={claim.status} overdue={step.kind === 'overdue'} />
            </View>
          </Card>
        )}
      </Pressable>
    </Link>
  );
}

function Welcome() {
  const { setOnboarded, setProfile, profile } = useStore();
  const [name, setName] = useState(profile.fullName);
  const [email, setEmail] = useState(profile.email);
  const [currency, setCurrency] = useState(profile.currency);

  const steps = [
    ['📸', 'Upload', 'A receipt, refund email, or screenshot.'],
    ['🔎', 'Identify', 'We spot the claim and pull out the amount, dates, and references.'],
    ['✉️', 'Request', 'You approve a ready-to-send request with your evidence attached.'],
    ['📈', 'Escalate', 'We track deadlines and prepare the next step if they don’t pay.'],
  ];

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingTop: 72 }]}>
        <Text style={{ color: colors.brand, fontWeight: '800', fontSize: 15, letterSpacing: 1 }}>RECOVERIQ</Text>
        <Text style={[styles.h1, { fontSize: 32 }]}>Get back the money you’re owed.</Text>
        <Text style={styles.muted}>
          Forgotten deposits, rejected refunds, missing reimbursements. We do the tedious part so small claims don’t go unclaimed.
        </Text>

        <Card style={{ gap: space.lg, marginTop: space.sm }}>
          {steps.map(([icon, title, desc]) => (
            <View key={title} style={[styles.row, { alignItems: 'flex-start' }]}>
              <Text style={{ fontSize: 22, width: 30 }}>{icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '700', fontSize: 16, color: colors.ink }}>{title}</Text>
                <Text style={styles.muted}>{desc}</Text>
              </View>
            </View>
          ))}
        </Card>

        <SectionTitle>Your details for letters</SectionTitle>
        <Card>
          <Field label="Full name" value={name} onChangeText={setName} placeholder="Jordan Lee" autoComplete="name" textContentType="name" />
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="emailAddress"
            hint="Used only to sign your requests. Your data stays on this device."
          />
          <CurrencyPicker label="Your currency" value={currency} onChange={setCurrency} />
        </Card>

        <Button
          title="Get started"
          onPress={() => {
            setProfile({ fullName: name.trim(), email: email.trim(), currency });
            setOnboarded(true);
          }}
        />
        <Text style={[styles.muted, { fontSize: 12, textAlign: 'center' }]}>
          RecoverIQ is not a law firm and does not give legal advice. You review and send every request yourself.
        </Text>
      </ScrollView>
    </>
  );
}
