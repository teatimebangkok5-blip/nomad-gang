import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text } from 'react-native';

import { Colors, Radius, Spacing, Type } from '@/constants/theme';
import { currentLanguage, setLanguage } from '@/i18n';

// Shows the *other* language ("ไทย" while in English, "EN" while in Thai) and switches to it.
export function LanguageToggle() {
  const { t } = useTranslation();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('common.switchLanguageA11y')}
      hitSlop={8}
      onPress={() => setLanguage(currentLanguage() === 'th' ? 'en' : 'th')}
      style={({ pressed }) => [styles.toggle, pressed && styles.pressed]}>
      <Text style={styles.label}>{t('common.switchLanguage')}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  toggle: {
    minWidth: 48,
    minHeight: 36,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { backgroundColor: Colors.surfaceRaised },
  label: { ...Type.label, color: Colors.text },
});
