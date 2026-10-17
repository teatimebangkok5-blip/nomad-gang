import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GlossyFill } from '@/components/glossy';
import { RewardCard } from '@/components/reward-card';
import { ScreenHeader } from '@/components/screen-header';
import { Radius, Raised, Spacing, Type } from '@/constants/theme';
import { currentLanguage, localized } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { formatDayLabel, bangkokDay, deviceZone } from '@/lib/bangkok-time';
import { EXAMPLE_REWARD, REWARD_MIN_PEOPLE, useRewards } from '@/lib/rewards';
import { makeStyles, useColors } from '@/lib/theme';

// My rewards: travel deals unlocked by tables and hangouts I hosted that ended with 4+ people, newest first, and a
// sample reward ("See an example") showing what hosting unlocks.
export default function RewardsScreen() {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  const language = currentLanguage();
  const { session } = useAuth();
  const { rewards, reload } = useRewards(Boolean(session));
  const [showExample, setShowExample] = useState(false);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <ScreenHeader title={t('rewards.title')} />
      {rewards === null ? (
        <ActivityIndicator color={Colors.accent} style={styles.spinner} />
      ) : (
        <FlatList
          data={rewards}
          keyExtractor={(reward) => reward.meetup_id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <View style={styles.header}>
              <Text style={styles.intro}>{t('rewards.intro', { count: REWARD_MIN_PEOPLE })}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: showExample }}
                onPress={() => setShowExample((on) => !on)}
                style={({ pressed }) => [styles.exampleButton, pressed && styles.pressed]}>
                <GlossyFill />
                <Text style={styles.exampleButtonText}>
                  {showExample ? t('rewards.hideExample') : `🎁 ${t('rewards.seeExample')}`}
                </Text>
              </Pressable>
              {showExample && (
                <View style={styles.item}>
                  <Text style={styles.itemTitle}>{t('rewards.exampleIntro', { count: EXAMPLE_REWARD.member_count })}</Text>
                  <RewardCard reward={EXAMPLE_REWARD} onChanged={() => {}} example />
                </View>
              )}
            </View>
          }
          ListEmptyComponent={
            <View style={styles.emptyCard}>
              <GlossyFill />
              <Text style={styles.emptyTitle}>{t('rewards.emptyTitle')}</Text>
              <Text style={styles.muted}>{t('rewards.emptyBody', { count: REWARD_MIN_PEOPLE })}</Text>
            </View>
          }
          renderItem={({ item }) => {
            const name =
              item.meetup_kind === 'hangout'
                ? item.title
                : item.title ||
                  (item.venue_name_en ? localized({ name_en: item.venue_name_en, name_th: item.venue_name_th ?? '' }, 'name', language) : item.place_name);
            return (
              <View style={styles.item}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push({ pathname: '/table/[id]', params: { id: item.meetup_id } })}>
                  <Text style={styles.itemTitle} numberOfLines={1}>
                    {item.meetup_kind === 'hangout' ? '🙌' : '👥'} {name} ·{' '}
                    {formatDayLabel(bangkokDay(new Date(item.ended_at), deviceZone()), t, undefined, deviceZone())}
                  </Text>
                </Pressable>
                <RewardCard reward={item} onChanged={reload} />
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const useStyles = makeStyles((Colors) => ({
  safe: { flex: 1, backgroundColor: Colors.bg },
  spinner: { marginTop: Spacing.xxl },
  list: { padding: Spacing.lg, gap: Spacing.xl, flexGrow: 1 },
  intro: { ...Type.body, color: Colors.textSecondary },
  header: { gap: Spacing.md, marginBottom: Spacing.md },
  pressed: { opacity: 0.7 },
  exampleButton: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.accent,
    overflow: 'hidden',
    ...Raised,
  },
  exampleButtonText: { ...Type.label, color: Colors.text, fontWeight: '800' },
  item: { gap: Spacing.sm },
  itemTitle: { ...Type.label, color: Colors.textSecondary },
  emptyCard: {
    padding: Spacing.lg,
    gap: Spacing.xs,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    ...Raised,
  },
  emptyTitle: { ...Type.heading, color: Colors.text },
  muted: { ...Type.body, color: Colors.textSecondary },
}));
