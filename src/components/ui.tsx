import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import type { ClaimCategory, ClaimStatus } from '@/lib/types';

export const colors = {
  bg: '#F5F7F6',
  card: '#FFFFFF',
  ink: '#0E1A17',
  muted: '#5B6B66',
  faint: '#93A39E',
  line: '#E3E9E7',
  brand: '#0B7A5C',
  brandDark: '#075A44',
  brandSoft: '#E3F4EE',
  warn: '#B45309',
  warnSoft: '#FEF3E2',
  danger: '#B42318',
  dangerSoft: '#FDECEA',
  info: '#1D4ED8',
  infoSoft: '#E8EEFD',
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  style,
  accessibilityHint,
}: {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
}) {
  const v = buttonVariants[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: v.bg, borderColor: v.border },
        pressed && { opacity: 0.85 },
        (disabled || loading) && { opacity: 0.5 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={v.fg} /> : <Text style={[styles.buttonText, { color: v.fg }]}>{title}</Text>}
    </Pressable>
  );
}

const buttonVariants: Record<ButtonVariant, { bg: string; fg: string; border: string }> = {
  primary: { bg: colors.brand, fg: '#fff', border: colors.brand },
  secondary: { bg: colors.card, fg: colors.ink, border: colors.line },
  ghost: { bg: 'transparent', fg: colors.brand, border: 'transparent' },
  danger: { bg: colors.card, fg: colors.danger, border: colors.line },
};

export function Field({ label, hint, ...props }: TextInputProps & { label: string; hint?: string }) {
  return (
    <View style={{ marginBottom: space.md }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.faint}
        accessibilityLabel={label}
        {...props}
        style={[styles.input, props.multiline && { minHeight: 96, textAlignVertical: 'top' }, props.style]}
      />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.sectionTitle}>{children}</Text>
      {right}
    </View>
  );
}

const STATUS_STYLE: Record<ClaimStatus, { label: string; fg: string; bg: string }> = {
  draft: { label: 'Draft', fg: colors.muted, bg: colors.line },
  active: { label: 'In progress', fg: colors.info, bg: colors.infoSoft },
  recovered: { label: 'Recovered', fg: colors.brandDark, bg: colors.brandSoft },
  closed: { label: 'Closed', fg: colors.muted, bg: colors.line },
};

export function StatusPill({ status, overdue }: { status: ClaimStatus; overdue?: boolean }) {
  const s = overdue ? { label: 'Action needed', fg: colors.warn, bg: colors.warnSoft } : STATUS_STYLE[status];
  return (
    <View style={[styles.pill, { backgroundColor: s.bg }]}>
      <Text style={[styles.pillText, { color: s.fg }]}>{s.label}</Text>
    </View>
  );
}

export const CATEGORY_ICON: Record<ClaimCategory, string> = {
  deposit: '🔑',
  refund: '↩︎',
  reimbursement: '🧾',
  travel: '✈︎',
  subscription: '🔁',
  other: '💵',
};

export function CategoryBadge({ category, size = 40 }: { category: ClaimCategory; size?: number }) {
  return (
    <View style={[styles.badge, { width: size, height: size, borderRadius: size / 2.6 }]}>
      <Text style={{ fontSize: size * 0.45, color: colors.brandDark }}>{CATEGORY_ICON[category]}</Text>
    </View>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={[styles.chip, selected && { backgroundColor: colors.brand, borderColor: colors.brand }]}
    >
      <Text style={[styles.chipText, selected && { color: '#fff' }]}>{label}</Text>
    </Pressable>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg, paddingBottom: 48, gap: space.md },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: space.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  button: {
    minHeight: 48,
    borderRadius: 12,
    paddingHorizontal: space.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  buttonText: { fontSize: 16, fontWeight: '600' },
  label: { fontSize: 13, fontWeight: '600', color: colors.muted, marginBottom: 6 },
  hint: { fontSize: 12, color: colors.faint, marginTop: 4 },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: space.md,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.ink,
  },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.sm },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.6 },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, alignSelf: 'flex-start' },
  pillText: { fontSize: 12, fontWeight: '700' },
  badge: { backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  chipText: { fontSize: 14, color: colors.ink, fontWeight: '500' },
  h1: { fontSize: 28, fontWeight: '800', color: colors.ink, letterSpacing: -0.5 },
  h2: { fontSize: 20, fontWeight: '700', color: colors.ink },
  body: { fontSize: 15, color: colors.ink, lineHeight: 22 },
  muted: { fontSize: 14, color: colors.muted, lineHeight: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
});
