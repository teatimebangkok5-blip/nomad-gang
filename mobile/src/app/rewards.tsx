import { router } from 'expo-router';
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
import { REWARD_MIN_PEOPLE, useRewards } from '@/lib/rewards';
import { makeStyles, useColors } from '@/lib/theme';

// My rewards: travel deals unlocked by tables and hangouts I hosted that ended with 4+ people, newest first.
export default function RewardsScreen() {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  const language = currentLanguage();
  const { session } = useAuth();
  const { rewards, reload } = useRewards(Boolean(session));

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
          ListHeaderComponent={<Text style={styles.intro}>{t('rewards.intro', { count: REWARD_MIN_PEOPLE })}</Text>}
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
