import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { GlossyFill, Shine } from '@/components/glossy';
import { ScreenHeader } from '@/components/screen-header';
import { BrandGradient, Radius, Raised, Spacing, Type } from '@/constants/theme';
import { localized, useLanguage } from '@/i18n';
import { formatWhen } from '@/lib/bangkok-time';
import { useGems } from '@/lib/gems';
import { openLink } from '@/lib/links';
import {
  PASSPORT_MILESTONES,
  PASSPORT_PEOPLE,
  useChallenges,
  useMyPassport,
  type Passport,
  type PassportReward,
} from '@/lib/passport';
import { makeStyles, useColors } from '@/lib/theme';

// Bangkok has 50 districts (khet); the stamps collect them.
const BANGKOK_DISTRICTS = 50;

// Rewards Passport: points, progress to the 3 / 5 / 10 milestones, district stamps, milestone rewards, challenges
// and the verified meetups behind them.
export default function PassportScreen() {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  const { state, reload } = useMyPassport();
  const [refreshing, setRefreshing] = useState(false);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <ScreenHeader title={t('passport.title')} />
      {state.status === 'loading' ? (
        <ActivityIndicator color={Colors.accent} size="large" style={styles.spinner} />
      ) : state.status === 'error' ? (
        <View style={styles.center}>
          <Text style={styles.muted}>{t('passport.errorLoad')}</Text>
          <Button title={t('common.tryAgain')} variant="secondary" onPress={reload} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                await reload();
                setRefreshing(false);
              }}
              colors={[Colors.orange]}
              progressBackgroundColor={Colors.surfaceRaised}
              tintColor={Colors.orange}
            />
          }>
          <PassportBody passport={state.passport} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function PassportBody({ passport }: { passport: Passport }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const language = useLanguage();
  const challenges = useChallenges();
  const { gems } = useGems();
  const top = PASSPORT_MILESTONES[PASSPORT_MILESTONES.length - 1];
  const progress = Math.min(1, passport.verified / top);

  return (
    <>
      <View style={styles.hero}>
        <LinearGradient colors={BrandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <Shine onColor />
        <Text style={styles.heroLabel}>{t('passport.points')}</Text>
        <Text style={styles.heroPoints}>{passport.points}</Text>
        <Text style={styles.heroSub}>
          {t('passport.verifiedCount', { count: passport.verified })}
          {passport.next_milestone ? `  ·  ${t('passport.nextMilestone', { count: passport.next_milestone - passport.verified })}` : `  ·  ${t('passport.allMilestones')}`}
        </Text>
        <View style={styles.track}>
          <View style={[styles.trackFill, { width: `${progress * 100}%` }]} />
          {PASSPORT_MILESTONES.map((milestone) => (
            <View
              key={milestone}
              style={[styles.marker, { left: `${(milestone / top) * 100}%` }, passport.verified >= milestone && styles.markerOn]}>
              <Text style={styles.markerText}>{milestone}</Text>
            </View>
          ))}
        </View>
      </View>

      {passport.pending_reviews > 0 && <Text style={styles.note}>{t('passport.pendingCount', { count: passport.pending_reviews })}</Text>}

      <Text style={styles.heading}>{t('passport.stampsTitle')}</Text>
      <Text style={styles.muted}>{t('passport.stampsCount', { count: passport.stamps.length, total: BANGKOK_DISTRICTS })}</Text>
      {passport.stamps.length === 0 ? (
        <Text style={styles.empty}>{t('passport.noStamps')}</Text>
      ) : (
        <View style={styles.stamps}>
          {passport.stamps.map((stamp) => (
            <View key={stamp.name} style={styles.stamp}>
              <Text style={styles.stampEmoji}>🏮</Text>
              <Text style={styles.stampName} numberOfLines={2}>
                {(language === 'th' ? stamp.name_th : stamp.name_en) || stamp.name}
              </Text>
              {stamp.count > 1 && <Text style={styles.stampCount}>×{stamp.count}</Text>}
            </View>
          ))}
        </View>
      )}

      <Pressable accessibilityRole="button" onPress={() => router.push('/gems')} style={({ pressed }) => [styles.card, styles.gems, pressed && styles.pressed]}>
        <GlossyFill />
        <Text style={styles.cardTitle}>💎 {t('gems.title')}</Text>
        <Text style={styles.cardBody}>
          {t('gems.visitedCount', { count: gems?.filter((gem) => gem.visited).length ?? 0, total: gems?.length ?? 0 })}
        </Text>
      </Pressable>

      <Text style={styles.heading}>{t('passport.rewardsTitle')}</Text>
      {passport.rewards.length === 0 ? (
        <Text style={styles.empty}>{t('passport.noRewards')}</Text>
      ) : (
        <View style={styles.list}>
          {passport.rewards.map((reward) => (
            <RewardRow key={reward.id} reward={reward} />
          ))}
        </View>
      )}

      <Text style={styles.heading}>{t('passport.challengesTitle')}</Text>
      <Text style={styles.muted}>{t('passport.challengeHint')}</Text>
      <View style={styles.list}>
        {challenges.map((challenge) => (
          <View key={challenge.id} style={styles.card}>
            <GlossyFill />
            <Text style={styles.cardTitle}>
              {challenge.emoji} {localized(challenge, 'title', language)}
            </Text>
            <Text style={styles.cardBody}>{localized(challenge, 'description', language)}</Text>
            <Text style={styles.cardPoints}>{t('passport.bonusPoints', { count: challenge.points })}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.heading}>{t('passport.meetupsTitle')}</Text>
      {passport.meetups.length === 0 ? (
        <Text style={styles.empty}>{t('passport.noMeetups', { count: PASSPORT_PEOPLE })}</Text>
      ) : (
        <View style={styles.list}>
          {passport.meetups.map((meetup) => (
            <Pressable
              key={meetup.id}
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/table/[id]', params: { id: meetup.id } })}
              style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
              <GlossyFill />
              <Text style={styles.cardTitle} numberOfLines={1}>
                {meetup.kind === 'hangout' ? '🙌 ' : '👥 '}
                {meetup.title || meetup.place_name}
              </Text>
              <Text style={styles.cardBody} numberOfLines={1}>
                {formatWhen(meetup.starts_at, t)}
                {meetup.place_name && meetup.title ? `  ·  ${meetup.place_name}` : ''}
              </Text>
              <Text style={meetup.counted ? styles.cardPoints : styles.cardBody}>
                {meetup.counted
                  ? t('passport.meetupPoints', { count: meetup.points })
                  : t('passport.oncePerDay')}
                {`  ·  ${meetup.method === 'gps' ? t('passport.byGps') : t('passport.byCode')}`}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      <Text style={styles.heading}>{t('passport.howTitle')}</Text>
      <Text style={styles.muted}>{t('passport.how', { count: PASSPORT_PEOPLE })}</Text>
    </>
  );
}

function RewardRow({ reward }: { reward: PassportReward }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const language = useLanguage();
  const [copied, setCopied] = useState(false);

  return (
    <View style={[styles.card, !reward.unlocked && styles.locked]}>
      <GlossyFill />
      <Text style={styles.cardTitle}>
        {reward.unlocked ? '🎁 ' : '🔒 '}
        {localized(reward, 'title', language)}
      </Text>
      {localized(reward, 'details', language) ? <Text style={styles.cardBody}>{localized(reward, 'details', language)}</Text> : null}
      {reward.unlocked ? (
        <>
          {reward.coupon_code && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('passport.copyCode')}
              onPress={async () => {
                await Clipboard.setStringAsync(reward.coupon_code ?? '');
                setCopied(true);
              }}
              style={styles.codeBox}>
              <Text style={styles.code}>{reward.coupon_code}</Text>
              <Text style={styles.cardPoints}>{copied ? t('passport.copied') : t('passport.copyCode')}</Text>
            </Pressable>
          )}
          {reward.link && (
            <Pressable accessibilityRole="link" onPress={() => openLink(reward.link)}>
              <Text style={styles.cardPoints}>{t('passport.openOffer')}</Text>
            </Pressable>
          )}
        </>
      ) : (
        <Text style={styles.cardBody}>{t('passport.unlocksAt', { count: reward.milestone })}</Text>
      )}
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  safe: { flex: 1, backgroundColor: Colors.bg },
  spinner: { marginTop: Spacing.xxl },
  center: { alignItems: 'center', gap: Spacing.md, padding: Spacing.xl },
  content: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xxl * 2 },
  hero: {
    padding: Spacing.xl,
    paddingBottom: Spacing.xl + 8,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    gap: Spacing.xs,
    ...Raised,
  },
  heroLabel: { ...Type.label, color: Colors.onBrand, opacity: 0.85 },
  heroPoints: { fontSize: 48, lineHeight: 54, fontWeight: '900', color: Colors.onBrand },
  heroSub: { ...Type.small, color: Colors.onBrand, fontWeight: '600' },
  track: {
    marginTop: Spacing.lg,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  trackFill: { height: 10, borderRadius: 5, backgroundColor: '#FFFFFF' },
  marker: {
    position: 'absolute',
    top: -7,
    width: 24,
    height: 24,
    marginLeft: -12,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerOn: { backgroundColor: '#FFC83D' },
  markerText: { fontSize: 11, fontWeight: '800', color: '#FFFFFF' },
  note: { ...Type.small, color: Colors.textSecondary, marginTop: Spacing.md },
  heading: { ...Type.heading, color: Colors.text, marginTop: Spacing.xl, marginBottom: Spacing.xs },
  muted: { ...Type.small, color: Colors.textSecondary, marginBottom: Spacing.sm },
  empty: { ...Type.body, color: Colors.textMuted },
  stamps: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  stamp: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: Colors.accent,
    backgroundColor: Colors.orangeTint,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.sm,
  },
  stampEmoji: { fontSize: 22 },
  stampName: { ...Type.small, fontSize: 11, color: Colors.text, fontWeight: '700', textAlign: 'center' },
  stampCount: { ...Type.small, fontSize: 10, color: Colors.textSecondary },
  list: { gap: Spacing.sm },
  card: {
    padding: Spacing.md,
    gap: 2,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
  },
  locked: { opacity: 0.75 },
  gems: { marginTop: Spacing.lg },
  pressed: { opacity: 0.8 },
  cardTitle: { ...Type.body, color: Colors.text, fontWeight: '700' },
  cardBody: { ...Type.small, color: Colors.textSecondary },
  cardPoints: { ...Type.small, color: Colors.accent, fontWeight: '700' },
  codeBox: {
    marginTop: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Colors.accent,
    alignItems: 'center',
    gap: 2,
  },
  code: { ...Type.heading, color: Colors.text, letterSpacing: 2 },
}));
