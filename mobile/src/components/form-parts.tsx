import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, TextInput, View, type TextInputProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlossyFill, ToneFill } from '@/components/glossy';
import { Icon, type IconName } from '@/components/icon';
import { Radius, Raised, Spacing, ToneShadow, Type } from '@/constants/theme';
import { makeStyles, useColors } from '@/lib/theme';

// Building blocks of the Create table / Create hangout forms (and other forms in the same style).

// A labelled block: "Time  06:00–23:30 · Bangkok time", "Title *", "Description  12/500".
export function FormSection({
  label,
  note,
  required = false,
  count,
  children,
}: {
  label: string;
  // Muted text after the label ("Optional", "Bangkok time").
  note?: string;
  required?: boolean;
  // Right-aligned counter ("12/80").
  count?: string;
  children: ReactNode;
}) {
  const styles = useStyles();
  return (
    <View style={styles.section}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>
          {label}
          {required ? <Text style={styles.required}> *</Text> : null}
          {note ? <Text style={styles.note}>{`  ${note}`}</Text> : null}
        </Text>
        {count ? <Text style={styles.count}>{count}</Text> : null}
      </View>
      {children}
    </View>
  );
}

// Text field: dark (or white) well with a soft border; `icon` in front (e.g. a pin for the meeting point).
export function FormInput({
  icon,
  tone = 'orange',
  highlight = false,
  multiline,
  style,
  ...rest
}: TextInputProps & { icon?: IconName; tone?: 'orange' | 'violet'; highlight?: boolean }) {
  const styles = useStyles();
  const Colors = useColors();
  return (
    <View
      style={[
        styles.field,
        multiline && styles.fieldMultiline,
        highlight && { borderWidth: 2, borderColor: tone === 'violet' ? Colors.violet : Colors.orange },
      ]}>
      {icon && <Icon name={icon} size={20} color={tone === 'violet' ? Colors.violetText : Colors.textMuted} />}
      <TextInput
        placeholderTextColor={Colors.textMuted}
        selectionColor={tone === 'violet' ? Colors.violet : Colors.orange}
        keyboardAppearance="dark"
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        style={[styles.input, multiline && styles.inputMultiline, style]}
        {...rest}
      />
    </View>
  );
}

// − value + in a glossy card. `stacked`: label on top (two side by side); otherwise label and hint on the left.
export function Stepper({
  label,
  hint,
  value,
  onDecrease,
  onIncrease,
  canDecrease,
  canIncrease,
  tone = 'orange',
  stacked = false,
}: {
  label: string;
  hint?: string;
  value: string;
  onDecrease: () => void;
  onIncrease: () => void;
  canDecrease: boolean;
  canIncrease: boolean;
  tone?: 'orange' | 'violet';
  stacked?: boolean;
}) {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  const minus = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${t('tables.decrease')}: ${label}`}
      accessibilityState={{ disabled: !canDecrease }}
      disabled={!canDecrease}
      onPress={onDecrease}
      style={({ pressed }) => [styles.stepMinus, !canDecrease && styles.stepDisabled, pressed && styles.pressed]}>
      <Icon name="minus" size={22} color={Colors.text} />
    </Pressable>
  );
  const plus = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${t('tables.increase')}: ${label}`}
      accessibilityState={{ disabled: !canIncrease }}
      disabled={!canIncrease}
      onPress={onIncrease}
      style={({ pressed }) => [
        styles.stepPlus,
        canIncrease && ToneShadow[tone],
        !canIncrease && styles.stepDisabled,
        pressed && styles.pressed,
      ]}>
      <ToneFill tone={tone} />
      <Icon name="plus" size={22} color={tone === 'violet' ? Colors.white : Colors.onBrand} />
    </Pressable>
  );
  const shown = (
    <Text style={styles.stepValue} accessibilityLiveRegion="polite">
      {value}
    </Text>
  );

  if (stacked) {
    return (
      <View style={[styles.card, styles.stepCardStacked]}>
        <GlossyFill />
        <Text style={styles.stepLabel}>
          {label}
          {hint ? <Text style={styles.stepRange}>{`  ${hint}`}</Text> : null}
        </Text>
        <View style={styles.stepRowSpread}>
          {minus}
          {shown}
          {plus}
        </View>
      </View>
    );
  }
  return (
    <View style={[styles.card, styles.stepCard]}>
      <GlossyFill />
      <View style={styles.flex}>
        <Text style={styles.stepLabel}>{label}</Text>
        {hint ? <Text style={styles.stepHint}>{hint}</Text> : null}
      </View>
      {minus}
      {shown}
      {plus}
    </View>
  );
}

// The chosen place at the top of a form: photo or icon, name, a line under it (deal, area) and "Change".
export function PlaceSummary({
  leading,
  name,
  line,
  lineTone = 'accent',
  onChange,
  children,
}: {
  leading: ReactNode;
  name: string;
  line?: string | null;
  lineTone?: 'accent' | 'muted';
  onChange?: () => void;
  // Extra rows inside the card (a time-zone note).
  children?: ReactNode;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  return (
    <View style={[styles.card, styles.summary]}>
      <GlossyFill />
      <View style={styles.summaryRow}>
        {leading}
        <View style={styles.flex}>
          <Text style={styles.summaryName} numberOfLines={2}>
            {name}
          </Text>
          {line ? (
            <Text style={lineTone === 'accent' ? styles.summaryDeal : styles.summaryLine} numberOfLines={2}>
              {line}
            </Text>
          ) : null}
        </View>
        {onChange && (
          <Pressable accessibilityRole="button" hitSlop={8} onPress={onChange} style={styles.change}>
            <Text style={styles.changeText}>{t('tables.change')}</Text>
          </Pressable>
        )}
      </View>
      {children}
    </View>
  );
}

// Round icon on a tinted or colored circle (the place summary's leading icon, hint cards).
export function IconBadge({
  icon,
  tone = 'violet',
  size = 44,
}: {
  icon: IconName;
  tone?: 'violet' | 'orange' | 'violetBall' | 'orangeBall';
  size?: number;
}) {
  const styles = useStyles();
  const Colors = useColors();
  const ball = tone === 'violetBall' || tone === 'orangeBall';
  return (
    <View
      style={[
        styles.badge,
        { width: size, height: size, borderRadius: size / 2 },
        tone === 'violet' && { backgroundColor: Colors.violetTint },
        tone === 'orange' && { backgroundColor: Colors.orangeTint },
        ball && styles.ball,
      ]}>
      {tone === 'violetBall' && <ToneFill tone="lilac" />}
      {tone === 'orangeBall' && <ToneFill tone="orange" />}
      <Icon
        name={icon}
        size={Math.round(size * 0.52)}
        color={ball ? Colors.white : tone === 'violet' ? Colors.violetText : Colors.accent}
      />
    </View>
  );
}

// The bar at the bottom of a form with the main button.
export function FormFooter({ children }: { children: ReactNode }) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  return <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.md }]}>{children}</View>;
}

const useStyles = makeStyles((Colors) => ({
  flex: { flex: 1 },
  pressed: { opacity: 0.75 },
  section: { gap: Spacing.sm + 2 },
  labelRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: Spacing.sm },
  label: { ...Type.label, fontSize: 15, fontWeight: '800', color: Colors.text, flexShrink: 1 },
  required: { color: Colors.pinkText },
  note: { fontSize: 12, fontWeight: '500', color: Colors.textMuted },
  count: { fontSize: 12, fontWeight: '600', color: Colors.textMuted },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md - 2,
    minHeight: 52,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    backgroundColor: Colors.field,
  },
  fieldMultiline: { alignItems: 'flex-start', paddingVertical: Spacing.md },
  input: { ...Type.body, flex: 1, color: Colors.text, paddingVertical: Spacing.sm },
  inputMultiline: { minHeight: 90, paddingVertical: 0 },
  card: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
    ...Raised,
  },
  stepCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, paddingLeft: Spacing.lg },
  stepCardStacked: { flex: 1, padding: Spacing.md, gap: Spacing.sm },
  stepRowSpread: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepLabel: { ...Type.label, fontSize: 15, fontWeight: '800', color: Colors.text },
  stepRange: { fontWeight: '500', color: Colors.textMuted },
  stepHint: { ...Type.small, fontSize: 12, color: Colors.textMuted },
  stepMinus: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceRaised,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
  },
  stepPlus: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  stepDisabled: { opacity: 0.4 },
  stepValue: { ...Type.title, minWidth: 32, textAlign: 'center', color: Colors.text },
  summary: { padding: Spacing.md - 2, gap: Spacing.md - 2 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  summaryName: { ...Type.heading, fontSize: 16, fontWeight: '800', color: Colors.text },
  summaryDeal: { ...Type.small, fontSize: 12, fontWeight: '600', color: Colors.accent },
  summaryLine: { ...Type.small, fontSize: 12, color: Colors.textSecondary },
  change: { paddingVertical: Spacing.md, paddingHorizontal: Spacing.sm },
  changeText: { ...Type.label, fontWeight: '800', color: Colors.accent },
  badge: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  ball: { borderWidth: 2, borderColor: Colors.white },
  footer: {
    paddingTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.surface,
  },
}));
