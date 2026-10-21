import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { ToneFill } from '@/components/glossy';
import { Icon } from '@/components/icon';
import { Radius, Spacing, ToneShadow, Type } from '@/constants/theme';
import { useLanguage } from '@/i18n';
import { formatClock, bangkokMinutes } from '@/lib/bangkok-time';
import { inviteTable, useSecondRoundTargets, type RoundTarget } from '@/lib/second-round';
import { makeStyles, useColors } from '@/lib/theme';

// "Continuing the night? 🍻" on a table / hangout around its end (members only): opens the second-round screen.
export function SecondRoundPrompt({ meetupId }: { meetupId: string }) {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/second-round/[id]', params: { id: meetupId } })}
      style={({ pressed }) => [styles.prompt, pressed && styles.pressed]}>
      <ToneFill tone="violet" />
      <Text style={styles.promptEmoji}>🍻</Text>
      <View style={styles.flex}>
        <Text style={styles.promptTitle}>{t('round.title')}</Text>
        <Text style={styles.promptBody}>{t('round.body')}</Text>
      </View>
      <Icon name="chevronRight" size={22} color={Colors.white} />
    </Pressable>
  );
}

// The host of a second round invites other groups nearby (max 3 per 12 hours); their members get a notification.
export function RoundInvites({ roundId }: { roundId: string }) {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  const language = useLanguage();
  const { targets, reload } = useSecondRoundTargets(roundId, true);
  const [busy, setBusy] = useState<string | null>(null);
  const [now] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);

  async function invite(target: RoundTarget) {
    setBusy(target.id);
    setError(null);
    const result = await inviteTable(roundId, target.id);
    setBusy(null);
    if (result) setError(t(`round.errors.${result === 'too_many_invites' || result === 'already_invited' || result === 'too_far' ? result : 'generic'}`));
    reload();
  }

  return (
    <View style={styles.invites}>
      <Text style={styles.heading}>{t('round.inviteTitle')}</Text>
      <Text style={styles.hint}>{t('round.inviteHint')}</Text>
      {targets === null ? (
        <ActivityIndicator color={Colors.accent} />
      ) : targets.length === 0 ? (
        <Text style={styles.hint}>{t('round.noneNearby')}</Text>
      ) : (
        targets.map((target) => {
          const place = (language === 'th' ? target.place_name_th : target.place_name_en) || target.place_name;
          const name = target.title || place || (target.kind === 'hangout' ? t('hangouts.hangout') : t('tables.table'));
          const ended = new Date(target.ends_at).getTime() <= now;
          return (
            <View key={target.id} style={styles.target}>
              <Text style={styles.targetEmoji}>{target.kind === 'hangout' ? '🙌' : '👥'}</Text>
              <View style={styles.flex}>
                <Text style={styles.targetName} numberOfLines={1}>
                  {name}
                </Text>
                <Text style={styles.targetMeta} numberOfLines={1}>
                  {t('round.targetMeta', {
                    count: target.member_count,
                    distance: target.distance_m < 1000 ? `${target.distance_m} m` : `${(target.distance_m / 1000).toFixed(1)} km`,
                  })}
                  {ended
                    ? ` · ${t('round.justEnded')}`
                    : ` · ${t('round.until', { time: formatClock(bangkokMinutes(new Date(target.ends_at))) })}`}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                disabled={target.invited || busy !== null}
                onPress={() => invite(target)}
                style={({ pressed }) => [styles.inviteButton, target.invited && styles.invited, pressed && styles.pressed]}>
                {busy === target.id ? (
                  <ActivityIndicator color={Colors.white} size="small" />
                ) : (
                  <Text style={[styles.inviteText, target.invited && styles.invitedText]}>
                    {target.invited ? `✓ ${t('round.invited')}` : t('round.invite')}
                  </Text>
                )}
              </Pressable>
            </View>
          );
        })
      )}
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  flex: { flex: 1 },
  pressed: { opacity: 0.8 },
  prompt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    ...ToneShadow.violet,
  },
  promptEmoji: { fontSize: 30 },
  promptTitle: { ...Type.heading, fontSize: 17, color: Colors.white },
  promptBody: { ...Type.small, color: 'rgba(255, 255, 255, 0.85)' },
  invites: { gap: Spacing.sm },
  heading: { ...Type.heading, fontSize: 17, color: Colors.text },
  hint: { ...Type.small, color: Colors.textSecondary },
  target: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  targetEmoji: { fontSize: 24 },
  targetName: { ...Type.label, fontSize: 15, fontWeight: '800', color: Colors.text },
  targetMeta: { ...Type.small, color: Colors.textSecondary },
  inviteButton: {
    minHeight: 36,
    minWidth: 76,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.violet,
  },
  invited: { backgroundColor: Colors.surfaceRaised },
  inviteText: { ...Type.label, color: Colors.white },
  invitedText: { color: Colors.textSecondary },
  error: { ...Type.small, color: Colors.danger },
}));
