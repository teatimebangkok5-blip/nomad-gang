import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { BrandGradient, Radius, Spacing, Type } from '@/constants/theme';
import { makeStyles, useColors } from '@/lib/theme';

// violet: the Hangout action, next to the orange "Create table".
type Variant = 'primary' | 'violet' | 'secondary' | 'text';

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  icon,
  compact = false,
}: {
  title: string;
  onPress: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  // Less side padding and a label that shrinks to fit, for buttons that share a row.
  compact?: boolean;
}) {
  const styles = useStyles();
  const Colors = useColors();
  const inactive = disabled || loading;
  const textColor =
    variant === 'primary'
      ? Colors.onBrand
      : variant === 'violet'
        ? Colors.white
        : variant === 'secondary'
          ? Colors.text
          : Colors.accent;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      android_ripple={variant === 'text' ? undefined : { color: 'rgba(255,255,255,0.12)' }}
      style={({ pressed }) => [
        styles.base,
        compact && styles.compact,
        styles[variant],
        inactive && (variant === 'primary' || variant === 'violet') && styles.primaryDisabled,
        pressed && variant !== 'primary' && styles.pressed,
      ]}>
      {variant === 'primary' && !inactive && (
        // The orange → pink gradient from the icon's location pin.
        <LinearGradient
          colors={BrandGradient}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      )}
      {loading ? (
        <ActivityIndicator color={variant === 'primary' || variant === 'violet' ? Colors.textSecondary : textColor} />
      ) : (
        <View style={[styles.content, compact && styles.contentCompact]}>
          {icon}
          <Text
            numberOfLines={compact ? 1 : undefined}
            adjustsFontSizeToFit={compact}
            minimumFontScale={0.8}
            style={[styles.label, compact && styles.labelCompact, { color: textColor }, inactive && styles.labelDisabled]}>
            {title}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const useStyles = makeStyles((Colors) => ({
  base: {
    minHeight: 52,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  compact: { paddingHorizontal: Spacing.md },
  primary: { backgroundColor: Colors.orange },
  violet: { backgroundColor: Colors.violet },
  primaryDisabled: { backgroundColor: Colors.surfaceRaised },
  secondary: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.borderStrong },
  text: { minHeight: 44, paddingHorizontal: Spacing.md },
  pressed: { opacity: 0.6 },
  content: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  contentCompact: { gap: Spacing.xs, flexShrink: 1 },
  label: { ...Type.heading, fontWeight: '700' },
  labelCompact: { fontSize: 15, flexShrink: 1 },
  labelDisabled: { color: Colors.textMuted },
}));
