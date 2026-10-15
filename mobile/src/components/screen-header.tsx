import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Radius, Spacing, Type } from '@/constants/theme';
import { makeStyles, useColors } from '@/lib/theme';

// Back button + title for screens opened from home.
export function ScreenHeader({ title, right }: { title?: string; right?: ReactNode }) {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();

  return (
    <View style={styles.bar}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('common.back')}
        hitSlop={8}
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
        <Icon name="back" size={22} color={Colors.text} />
      </Pressable>
      {title ? (
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
      ) : (
        <View style={styles.spacer} />
      )}
      {right}
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    paddingTop: Spacing.sm,
    minHeight: 52,
  },
  back: { width: 44, height: 44, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center' },
  pressed: { backgroundColor: Colors.pressed },
  title: { ...Type.heading, color: Colors.text, flex: 1 },
  spacer: { flex: 1 },
}));
