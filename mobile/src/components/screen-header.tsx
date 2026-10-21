import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { RoundButton } from '@/components/round-button';
import { Spacing, Type } from '@/constants/theme';
import { makeStyles } from '@/lib/theme';

// Back button + title (and an optional step line, e.g. "Step 2 of 2") for screens opened from home.
export function ScreenHeader({
  title,
  subtitle,
  right,
  onBack,
  avatar,
  divider = false,
}: {
  title?: string;
  subtitle?: string;
  right?: ReactNode;
  // A picture before the title (chat screens: the person, group or table).
  avatar?: ReactNode;
  // A line under the bar (chat screens).
  divider?: boolean;
  // Instead of going back (e.g. back to step 1 of the same screen).
  onBack?: () => void;
}) {
  const styles = useStyles();
  const { t } = useTranslation();

  return (
    <View style={[styles.bar, divider && styles.divider]}>
      <RoundButton
        icon="back"
        label={t('common.back')}
        onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')))}
      />
      {avatar}
      <View style={styles.titles}>
        {title ? (
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
        ) : null}
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
    minHeight: 60,
  },
  divider: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  titles: { flex: 1 },
  title: { ...Type.heading, fontSize: 18, fontWeight: '800', color: Colors.text },
  subtitle: { ...Type.small, fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
}));
