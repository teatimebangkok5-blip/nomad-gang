import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { BrandGradient, Colors, Radius, Spacing, Type } from '@/constants/theme';

type Variant = 'primary' | 'secondary' | 'text';

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  icon,
}: {
  title: string;
  onPress: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
}) {
  const inactive = disabled || loading;
  const textColor = variant === 'primary' ? Colors.onBrand : variant === 'secondary' ? Colors.text : Colors.orange;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      android_ripple={variant === 'text' ? undefined : { color: 'rgba(255,255,255,0.12)' }}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        inactive && variant === 'primary' && styles.primaryDisabled,
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
        <ActivityIndicator color={variant === 'primary' ? Colors.textSecondary : textColor} />
      ) : (
        <View style={styles.content}>
          {icon}
          <Text style={[styles.label, { color: textColor }, inactive && styles.labelDisabled]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 52,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  primary: { backgroundColor: Colors.orange },
  primaryDisabled: { backgroundColor: Colors.surfaceRaised },
  secondary: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.borderStrong },
  text: { minHeight: 44, paddingHorizontal: Spacing.md },
  pressed: { opacity: 0.6 },
  content: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  label: { ...Type.heading, fontWeight: '700' },
  labelDisabled: { color: Colors.textMuted },
});
