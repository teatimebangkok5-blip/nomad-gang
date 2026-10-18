import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { GlossyFill, ToneFill } from '@/components/glossy';
import { Fonts, Radius, RaisedSmall, Spacing, ToneShadow } from '@/constants/theme';
import { makeStyles, useColors } from '@/lib/theme';

// primary: orange (tables, the main action). violet: the Hangout action. secondary: glossy surface. danger: outlined
// red text (Leave). text: a plain link-style button.
type Variant = 'primary' | 'violet' | 'secondary' | 'danger' | 'text';

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  icon,
  trailingIcon,
  compact = false,
}: {
  title: string;
  onPress: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  // After the label (an arrow on "Continue").
  trailingIcon?: ReactNode;
  // Less side padding and a label that shrinks to fit, for buttons that share a row.
  compact?: boolean;
}) {
  const styles = useStyles();
  const Colors = useColors();
  const inactive = disabled || loading;
  const brand = variant === 'primary' || variant === 'violet';
  const textColor =
    variant === 'primary'
      ? Colors.onBrand
      : variant === 'violet'
        ? Colors.white
        : variant === 'secondary'
          ? Colors.text
          : variant === 'danger'
            ? Colors.danger
            : Colors.accent;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      android_ripple={variant === 'text' ? undefined : { color: 'rgba(255,255,255,0.14)' }}
      style={({ pressed }) => [
        styles.base,
        compact && styles.compact,
        styles[variant],
        variant === 'primary' && !inactive && ToneShadow.orange,
        variant === 'violet' && !inactive && ToneShadow.violet,
        variant === 'secondary' && RaisedSmall,
        disabled && !loading && styles.disabled,
        pressed && styles.pressed,
      ]}>
      {variant === 'primary' && <ToneFill tone="orange" />}
      {variant === 'violet' && <ToneFill tone="violet" />}
      {variant === 'secondary' && <GlossyFill />}
      {loading ? (
        <ActivityIndicator color={brand ? textColor : Colors.accent} />
      ) : (
        <View style={[styles.content, compact && styles.contentCompact]}>
          {icon}
          <Text
            numberOfLines={compact ? 1 : undefined}
            adjustsFontSizeToFit={compact}
            minimumFontScale={0.8}
            style={[styles.label, compact && styles.labelCompact, { color: textColor }]}>
            {title}
          </Text>
          {trailingIcon}
        </View>
      )}
    </Pressable>
  );
}

const useStyles = makeStyles((Colors) => ({
  base: {
    minHeight: 56,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  compact: { paddingHorizontal: Spacing.md },
  primary: { backgroundColor: Colors.orange },
  violet: { backgroundColor: Colors.violet },
  secondary: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  danger: { borderWidth: 1, borderColor: Colors.borderStrong },
  text: { minHeight: 44, paddingHorizontal: Spacing.md },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.85 },
  content: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  contentCompact: { gap: 6, flexShrink: 1 },
  label: { fontFamily: Fonts.body, fontSize: 16, lineHeight: 21, fontWeight: '800' },
  labelCompact: { fontSize: 15, flexShrink: 1 },
}));
