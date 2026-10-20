import { router } from 'expo-router';
import { useRef } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { GlossyFill, ToneFill } from '@/components/glossy';
import { Icon } from '@/components/icon';
import { DealRow } from '@/components/reward-card';
import { Radius, Raised, RaisedSmall, Spacing, Type } from '@/constants/theme';
import { localized, useLanguage } from '@/i18n';
import {
  CHALLENGE_EMOJI,
  challengeRoute,
  useLevel,
  useLevelDeals,
  type LevelChallenge,
  type LevelHistoryItem,
  type LevelState,
} from '@/lib/levels';
import { makeStyles, useColors } from '@/lib/theme';

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'] as const;
const NODE_WIDTH = 52;
const CHART_HEIGHT = 96;


function challengeText(t: TFunction, challenge: Pick<LevelChallenge, 'kind' | 'target'>): string {
  return t(`levels.challenge.${challenge.kind}.${challenge.target === 1 ? 'one' : 'many'}`, { count: challenge.target });
}

// "13 Oct" from a Bangkok date (YYYY-MM-DD), without time zone maths.
function shortDate(t: TFunction, isoDay: string): string {
  const [, month, day] = isoDay.split('-').map(Number);
  return `${day} ${t(`month.${MONTHS[(month || 1) - 1]}`)}`;
}

// Levels on My rewards: the level and points to the next one, the road to the Plus level, points per week, how to
// earn points, the challenges (this level, earlier ones still open, the next level's locked), recent points and, at
// the Plus level, every travel deal.
export function LevelSection({ userId }: { userId: string }) {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  const { level, levelUp, reload } = useLevel(userId);

  if (level === null) return <ActivityIndicator color={Colors.accent} style={styles.spinner} />;
  if (level === 'error') {
    return (
      <View style={styles.card}>
        <GlossyFill />
        <Text style={styles.muted}>{t('levels.loadFailed')}</Text>
        <Pressable accessibilityRole="button" onPress={reload} hitSlop={8} style={styles.retry}>
          <Text style={styles.link}>{t('levels.retry')}</Text>
        </Pressable>
      </View>
    );
  }

  const current = level.challenges.filter((c) => c.level === level.level);
  const earlier = level.challenges.filter((c) => c.level < level.level && !c.done);
  const next = level.challenges.filter((c) => c.locked);
  const plusReached = level.level >= level.plus_level;

  return (
    <View style={styles.section}>
      {levelUp !== null && (
        <View style={styles.levelUp}>
          <ToneFill tone="violet" />
          <Text style={styles.levelUpText}>{t('levels.levelUp', { level: levelUp })}</Text>
        </View>
      )}

      <LevelHero level={level} />
      <LevelRoad level={level} />

      {plusReached && <PlusLevelRewards />}

      <View style={styles.card}>
        <GlossyFill />
        <Text style={styles.cardTitle}>{t('levels.chartTitle')}</Text>
        <WeeklyChart weekly={level.weekly} />
      </View>

      <View style={styles.card}>
        <GlossyFill />
        <Text style={styles.cardTitle}>{t('levels.howTitle')}</Text>
        <View style={styles.howRow}>
          <Text style={styles.howEmoji}>👥</Text>
          <Text style={styles.howText}>
            {t('levels.howMeetup', { points: level.meetup_points, count: level.meetups_per_day })}
          </Text>
        </View>
        <View style={styles.howRow}>
          <Text style={styles.howEmoji}>🏆</Text>
          <Text style={styles.howText}>{t('levels.howChallenge', { points: level.challenge_points })}</Text>
        </View>
        <View style={styles.howRow}>
          <Text style={styles.howEmoji}>👑</Text>
          <Text style={styles.howText}>{t('levels.howPlus', { level: level.plus_level, points: level.per_level })}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <GlossyFill />
        <Text style={styles.cardTitle}>{t('levels.challengesTitle', { level: level.level })}</Text>
        {current.length > 0 ? (
          current.map((challenge) => <ChallengeRow key={challenge.id} challenge={challenge} points={level.challenge_points} />)
        ) : (
          <Text style={styles.muted}>{t('levels.noChallenges')}</Text>
        )}
        {earlier.length > 0 && (
          <>
            <Text style={styles.subTitle}>{t('levels.earlierTitle')}</Text>
            {earlier.map((challenge) => (
              <ChallengeRow key={challenge.id} challenge={challenge} points={level.challenge_points} />
            ))}
          </>
        )}
        {next.length > 0 && (
          <>
            <Text style={styles.subTitle}>{t('levels.nextTitle', { level: level.level + 1 })}</Text>
            {next.map((challenge) => (
              <ChallengeRow key={challenge.id} challenge={challenge} points={level.challenge_points} />
            ))}
          </>
        )}
      </View>

      {level.history.length > 0 && (
        <View style={styles.card}>
          <GlossyFill />
          <Text style={styles.cardTitle}>{t('levels.historyTitle')}</Text>
          {level.history.slice(0, 10).map((item) => (
            <HistoryRow key={`${item.source}:${item.ref}`} item={item} challenges={level.challenges} />
          ))}
        </View>
      )}
    </View>
  );
}

function LevelHero({ level }: { level: LevelState }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const progress = Math.min(1, Math.max(0, level.level_points / level.per_level));
  const levelsLeft = level.plus_level - level.level;

  return (
    <View style={styles.hero}>
      <ToneFill tone="brand" />
      <View style={styles.heroTop}>
        <View style={styles.badge}>
          <Text style={styles.badgeLabel}>{t('levels.levelShort')}</Text>
          <Text style={styles.badgeNumber}>{level.level}</Text>
        </View>
        <View style={styles.flex}>
          <Text style={styles.heroTitle}>{t('levels.level', { level: level.level })}</Text>
          <Text style={styles.heroText}>{t('levels.totalPoints', { count: level.points })}</Text>
        </View>
      </View>
      <View
        style={styles.bar}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={t('levels.progressLabel', { points: level.level_points, total: level.per_level })}
        accessibilityValue={{ min: 0, max: level.per_level, now: level.level_points }}>
        <View style={[styles.barFill, { width: `${progress * 100}%` }]} />
      </View>
      <View style={styles.heroRow}>
        <Text style={styles.heroText}>{`${level.level_points} / ${level.per_level}`}</Text>
        <Text style={styles.heroText}>
          {t('levels.toNext', { count: level.per_level - level.level_points, level: level.level + 1 })}
        </Text>
      </View>
      <Text style={styles.heroGoal}>
        {levelsLeft > 0 ? t('levels.plusGoal', { level: level.plus_level, count: levelsLeft }) : t('levels.plusUnlocked')}
      </Text>
    </View>
  );
}

// Levels 1 → the Plus level (further while past it): done, current, still to come.
function LevelRoad({ level }: { level: LevelState }) {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  const scroll = useRef<ScrollView>(null);
  const last = Math.max(level.plus_level, level.level + 1);
  const steps = Array.from({ length: last }, (_, i) => i + 1);

  return (
    <ScrollView
      ref={scroll}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.road}
      accessibilityLabel={t('levels.roadLabel', { level: level.level, plus: level.plus_level })}
      onContentSizeChange={() => scroll.current?.scrollTo({ x: Math.max(0, (level.level - 3) * NODE_WIDTH), animated: false })}>
      {steps.map((step) => {
        const done = step < level.level;
        const isCurrent = step === level.level;
        const isPlus = step === level.plus_level;
        return (
          <View key={step} style={styles.roadStep}>
            {step > 1 && <View style={[styles.roadLine, step <= level.level && styles.roadLineDone]} />}
            <View style={[styles.roadNode, done && styles.roadNodeDone, isCurrent && styles.roadNodeCurrent]}>
              {isCurrent && <ToneFill tone="brand" shine={false} />}
              {done ? (
                <Icon name="check" size={16} color={Colors.white} />
              ) : (
                <Text style={[styles.roadNumber, isCurrent && styles.roadNumberCurrent]}>{step}</Text>
              )}
            </View>
            <Text style={[styles.roadCaption, isPlus && styles.roadCaptionPlus]} numberOfLines={1}>
              {isPlus ? `👑 ${t('levels.plusShort')}` : ' '}
            </Text>
          </View>
        );
      })}
    </ScrollView>
  );
}

function WeeklyChart({ weekly }: { weekly: LevelState['weekly'] }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const max = Math.max(20, ...weekly.map((w) => w.points));
  const total = weekly.reduce((sum, w) => sum + w.points, 0);

  return (
    <View accessible accessibilityLabel={t('levels.chartLabel', { count: total })}>
      <View style={styles.chart}>
        {weekly.map((week, i) => {
          const height = week.points > 0 ? Math.max(6, (week.points / max) * CHART_HEIGHT) : 2;
          const thisWeek = i === weekly.length - 1;
          return (
            <View key={week.week} style={styles.chartColumn}>
              <Text style={styles.chartValue}>{week.points > 0 ? week.points : ''}</Text>
              <View style={[styles.chartBar, { height }, week.points > 0 && styles.chartBarFilled, thisWeek && styles.chartBarNow]}>
                {week.points > 0 && <ToneFill tone={thisWeek ? 'brand' : 'violet'} shine={false} />}
              </View>
              <Text style={styles.chartLabel} numberOfLines={1}>
                {thisWeek ? t('levels.thisWeek') : shortDate(t, week.week)}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function ChallengeRow({ challenge, points }: { challenge: LevelChallenge; points: number }) {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  const progress = Math.min(1, challenge.progress / challenge.target);
  const text = challengeText(t, challenge);
  const canGo = !challenge.done && !challenge.locked;

  const content = (
    <>
      <Text style={[styles.challengeEmoji, challenge.locked && styles.lockedText]}>{CHALLENGE_EMOJI[challenge.kind]}</Text>
      <View style={styles.flex}>
        <Text style={[styles.challengeTitle, challenge.locked && styles.lockedText]}>{text}</Text>
        {!challenge.locked && (
          <View style={styles.challengeProgressRow}>
            <View style={styles.smallBar}>
              <View
                style={[styles.smallBarFill, { width: `${progress * 100}%` }, challenge.done && styles.smallBarDone]}
              />
            </View>
            <Text style={styles.challengeCount}>{`${challenge.progress}/${challenge.target}`}</Text>
          </View>
        )}
      </View>
      {challenge.done ? (
        <View style={styles.donePill}>
          <Icon name="check" size={14} color={Colors.white} />
          <Text style={styles.donePillText}>{`+${points}`}</Text>
        </View>
      ) : challenge.locked ? (
        <Icon name="lock" size={18} color={Colors.textMuted} />
      ) : (
        <View style={styles.pointsPill}>
          <Text style={styles.pointsPillText}>{`+${points}`}</Text>
          <Icon name="chevronRight" size={16} color={Colors.textMuted} />
        </View>
      )}
    </>
  );

  if (!canGo) {
    return (
      <View
        style={styles.challenge}
        accessible
        accessibilityLabel={`${text}. ${challenge.done ? t('levels.done') : t('levels.locked')}`}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${text}. ${challenge.progress}/${challenge.target}`}
      accessibilityHint={t('levels.goHint')}
      onPress={() => router.push(challengeRoute(challenge.kind))}
      style={({ pressed }) => [styles.challenge, pressed && styles.pressed]}>
      {content}
    </Pressable>
  );
}

function HistoryRow({ item, challenges }: { item: LevelHistoryItem; challenges: LevelChallenge[] }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const language = useLanguage();
  let label: string;
  if (item.source === 'meetup') {
    const place = item.place_name_en
      ? localized({ name_en: item.place_name_en, name_th: item.place_name_th ?? item.place_name_en }, 'name', language)
      : item.place_name;
    const what = item.meetup_kind === 'hangout' ? t('levels.historyHangout') : t('levels.historyTable');
    label = `${what}: ${item.title || place || ''}`;
  } else {
    const challenge = challenges.find((c) => c.id === item.ref);
    label = challenge ? `${t('levels.historyChallenge')}: ${challengeText(t, challenge)}` : t('levels.historyChallenge');
  }
  const day = new Date(item.at).toLocaleDateString(language === 'th' ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'short' });

  return (
    <View style={styles.historyRow}>
      <Text style={styles.historyPoints}>{`+${item.points}`}</Text>
      <Text style={styles.historyText} numberOfLines={2}>
        {label}
      </Text>
      <Text style={styles.historyDay}>{day}</Text>
    </View>
  );
}

// At the Plus level: Plus is unlocked, and every travel deal shows here.
function PlusLevelRewards() {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  const { deals, reload } = useLevelDeals(true);

  return (
    <View style={styles.card}>
      <GlossyFill />
      <Text style={styles.cardTitle}>👑 {t('levels.plusRewardsTitle')}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/plus')}
        style={({ pressed }) => [styles.plusRow, pressed && styles.pressed]}>
        <Text style={styles.flexText}>{t('levels.plusRewardsPlus')}</Text>
        <Icon name="chevronRight" size={18} color={Colors.textMuted} />
      </Pressable>
      <Text style={styles.subTitle}>{t('levels.dealsTitle')}</Text>
      {deals === null ? (
        <ActivityIndicator color={Colors.accent} />
      ) : deals.length === 0 ? (
        <Text style={styles.muted}>{t('levels.noDeals')}</Text>
      ) : (
        deals.map((deal) => <DealRow key={deal.id} deal={deal} example={false} onReported={reload} />)
      )}
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  section: { gap: Spacing.lg },
  flex: { flex: 1 },
  flexText: { ...Type.body, color: Colors.text, flex: 1 },
  spinner: { marginVertical: Spacing.xl },
  pressed: { opacity: 0.7 },
  muted: { ...Type.small, color: Colors.textSecondary },
  link: { ...Type.label, color: Colors.accent },
  retry: { minHeight: 44, justifyContent: 'center' },
  card: {
    padding: Spacing.lg,
    gap: Spacing.sm,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    ...Raised,
  },
  cardTitle: { ...Type.heading, color: Colors.text },
  subTitle: { ...Type.label, color: Colors.textSecondary, marginTop: Spacing.sm },
  levelUp: { padding: Spacing.md, borderRadius: Radius.lg, overflow: 'hidden', ...Raised },
  levelUpText: { ...Type.heading, color: Colors.white, textAlign: 'center' },

  hero: { padding: Spacing.lg, gap: Spacing.sm, borderRadius: Radius.lg, overflow: 'hidden', ...Raised },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  badge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.8)',
  },
  badgeLabel: { ...Type.small, fontSize: 10, lineHeight: 12, fontWeight: '800', color: Colors.onBrand },
  badgeNumber: { ...Type.display, fontSize: 28, lineHeight: 32, color: Colors.onBrand },
  heroTitle: { ...Type.title, color: Colors.onBrand },
  heroText: { ...Type.small, fontWeight: '700', color: Colors.onBrand },
  heroRow: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.sm },
  heroGoal: { ...Type.label, color: Colors.onBrand },
  bar: { height: 12, borderRadius: 6, backgroundColor: 'rgba(255, 255, 255, 0.35)', overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 6, backgroundColor: Colors.white },

  road: { paddingVertical: Spacing.xs, paddingRight: Spacing.lg },
  roadStep: { width: NODE_WIDTH, alignItems: 'center' },
  roadLine: {
    position: 'absolute',
    top: 17,
    right: NODE_WIDTH / 2 + 17,
    width: NODE_WIDTH - 34,
    height: 3,
    borderRadius: 2,
    backgroundColor: Colors.border,
  },
  roadLineDone: { backgroundColor: Colors.violet },
  roadNode: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 2,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  roadNodeDone: { backgroundColor: Colors.violet, borderColor: Colors.violet },
  roadNodeCurrent: { borderColor: Colors.white, ...RaisedSmall },
  roadNumber: { ...Type.label, color: Colors.textSecondary },
  roadNumberCurrent: { color: Colors.onBrand, fontWeight: '800' },
  roadCaption: { ...Type.small, fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  roadCaptionPlus: { color: Colors.accent, fontWeight: '800' },

  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.xs, marginTop: Spacing.sm },
  chartColumn: { flex: 1, alignItems: 'center', gap: 2 },
  chartValue: { ...Type.small, fontSize: 11, color: Colors.textSecondary, fontWeight: '700' },
  chartBar: { width: '70%', borderRadius: 6, backgroundColor: Colors.border, overflow: 'hidden' },
  chartBarFilled: { backgroundColor: Colors.violet },
  chartBarNow: { ...RaisedSmall },
  chartLabel: { ...Type.small, fontSize: 10, color: Colors.textMuted },

  howRow: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start' },
  howEmoji: { fontSize: 18, width: 26, textAlign: 'center' },
  howText: { ...Type.small, color: Colors.textSecondary, flex: 1 },

  challenge: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, minHeight: 56, paddingVertical: Spacing.xs },
  challengeEmoji: { fontSize: 22, width: 30, textAlign: 'center' },
  challengeTitle: { ...Type.label, color: Colors.text },
  lockedText: { color: Colors.textMuted, opacity: 0.8 },
  challengeProgressRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: 4 },
  smallBar: { flex: 1, height: 6, borderRadius: 3, backgroundColor: Colors.border, overflow: 'hidden' },
  smallBarFill: { height: '100%', borderRadius: 3, backgroundColor: Colors.violet },
  smallBarDone: { backgroundColor: Colors.ok },
  challengeCount: { ...Type.small, fontSize: 12, color: Colors.textSecondary, minWidth: 34, textAlign: 'right' },
  donePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: Spacing.sm,
    minHeight: 28,
    borderRadius: Radius.pill,
    backgroundColor: Colors.ok,
  },
  donePillText: { ...Type.small, fontWeight: '800', color: Colors.white },
  pointsPill: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  pointsPillText: { ...Type.label, color: Colors.violetText },

  historyRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, minHeight: 36 },
  historyPoints: { ...Type.label, color: Colors.violetText, width: 40 },
  historyText: { ...Type.small, color: Colors.text, flex: 1 },
  historyDay: { ...Type.small, fontSize: 12, color: Colors.textMuted },

  plusRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, minHeight: 44 },
}));
