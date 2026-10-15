import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, Radius, Spacing, Type } from '@/constants/theme';

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
  const textColor = variant === 'primary' ? Colors.white : variant === 'secondary' ? Colors.ink900 : Colors.brand700;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      android_ripple={variant === 'text' ? undefined : { color: 'rgba(0,0,0,0.08)' }}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        inactive && variant === 'primary' && styles.primaryDisabled,
        pressed && variant !== 'primary' && styles.pressed,
      ]}>
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <View style={styles.content}>
          {icon}
          <Text style={[styles.label, { color: textColor }, inactive && variant !== 'primary' && styles.labelDisabled]}>
            {title}
          </Text>
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
  primary: { backgroundColor: Colors.brand600 },
  primaryDisabled: { backgroundColor: Colors.brand200 },
  secondary: { backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.ink300 },
  text: { minHeight: 44, paddingHorizontal: Spacing.md },
  pressed: { opacity: 0.6 },
  content: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  label: { ...Type.heading },
  labelDisabled: { color: Colors.ink400 },
});
