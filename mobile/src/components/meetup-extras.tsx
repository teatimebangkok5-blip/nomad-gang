import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { Chip } from '@/components/chip';
import { FormInput, FormSection, Stepper } from '@/components/form-parts';
import { Icon } from '@/components/icon';
import { Radius, Spacing, Type } from '@/constants/theme';
import { localized, useLanguage } from '@/i18n';
import { COST_LEVELS, VIBE_EMOJI, VIBES, type CostLevel, type JoinMode, type Vibe } from '@/lib/meetups';
import { useChallenges } from '@/lib/passport';
import { makeStyles, useColors } from '@/lib/theme';
import { useMyVerification } from '@/lib/verification';

export const COWORK_HOURS = { min: 1, max: 8, start: 3 };

// Vibe, who can join (open / private, and women-only for verified women), optional expected cost per person, meeting
// point and group challenge (Rewards Passport bonus), on the Create table / Create hangout forms. A "Work & coffee"
// table also gets its length (`hours`; tables only). `tone`: orange for tables, violet for hangouts.
export function MeetupExtras({
  cost,
  onCost,
  meetingPoint,
  onMeetingPoint,
  challengeId,
  onChallenge,
  joinMode,
  onJoinMode,
  vibe,
  onVibe,
  hours,
  onHours,
  womenOnly,
  onWomenOnly,
  tone,
}: {
  cost: CostLevel | null;
  onCost: (cost: CostLevel | null) => void;
  meetingPoint: string;
  onMeetingPoint: (text: string) => void;
  challengeId: string | null;
  onChallenge: (id: string | null) => void;
  joinMode: JoinMode;
  onJoinMode: (mode: JoinMode) => void;
  vibe: Vibe | null;
  onVibe: (vibe: Vibe | null) => void;
  // Tables only: the length of a "Work & coffee" table.
  hours?: number;
  onHours?: (hours: number) => void;
  womenOnly: boolean;
  onWomenOnly: (on: boolean) => void;
  tone: 'orange' | 'violet';
}) {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  const language = useLanguage();
  const challenges = useChallenges();
  const { verification } = useMyVerification();

  return (
    <>
      <FormSection label={t('vibes.label')} note={t('common.optional')}>
        <View style={styles.chips}>
          {VIBES.map((item) => (
            <Chip
              key={item}
              tone={tone}
              label={`${VIBE_EMOJI[item]} ${t(`vibes.${item}`)}`}
              selected={vibe === item}
              onPress={() => onVibe(vibe === item ? null : item)}
            />
          ))}
        </View>
        {vibe && <Text style={styles.hint}>{t(`vibes.${vibe}Hint`)}</Text>}
      </FormSection>

      {vibe === 'cowork' && hours !== undefined && onHours && (
        <Stepper
          tone={tone}
          label={t('vibes.coworkLength')}
          hint={t('vibes.coworkLengthHint')}
          value={t('vibes.hours', { count: hours })}
          canDecrease={hours > COWORK_HOURS.min}
          canIncrease={hours < COWORK_HOURS.max}
          onDecrease={() => onHours(Math.max(COWORK_HOURS.min, hours - 1))}
          onIncrease={() => onHours(Math.min(COWORK_HOURS.max, hours + 1))}
        />
      )}

      <FormSection label={t('privacy.whoCanJoin')}>
        <View style={styles.chips}>
          {(['open', 'private'] as const).map((mode) => (
            <Chip
              key={mode}
              tone={tone}
              icon={mode === 'private' ? 'lock' : 'lockOpen'}
              label={t(`privacy.${mode}`)}
              selected={joinMode === mode}
              onPress={() => onJoinMode(mode)}
            />
          ))}
        </View>
        <Text style={styles.hint}>{t(`privacy.${joinMode}Hint`)}</Text>
        {verification?.woman ? (
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: womenOnly }}
            onPress={() => onWomenOnly(!womenOnly)}
            style={({ pressed }) => [styles.women, womenOnly && styles.womenOn, pressed && styles.pressed]}>
            <Text style={styles.womenEmoji}>♀</Text>
            <View style={styles.flex}>
              <Text style={styles.womenTitle}>{t('women.only')}</Text>
              <Text style={styles.womenBody}>{t('women.onlyHint')}</Text>
            </View>
            <Icon name={womenOnly ? 'checkCircle' : 'circle'} size={24} color={womenOnly ? Colors.pinkText : Colors.textMuted} />
          </Pressable>
        ) : verification && !verification.verified ? (
          <Pressable accessibilityRole="link" onPress={() => router.push('/verify')} style={({ pressed }) => pressed && styles.pressed}>
            <Text style={styles.womenLink}>♀ {t('women.getVerified')}</Text>
          </Pressable>
        ) : null}
      </FormSection>

      <FormSection label={t('feed.costLabel')} note={t('common.optional')}>
        <View style={styles.chips}>
          {COST_LEVELS.map((level) => (
            <Chip
              key={level}
              tone={tone}
              label={t(`feed.cost.${level}`)}
              selected={cost === level}
              onPress={() => onCost(cost === level ? null : level)}
            />
          ))}
        </View>
      </FormSection>

      <FormSection label={t('feed.meetingPointLabel')} note={t('common.optional')}>
        <FormInput
          icon="pin"
          tone={tone}
          value={meetingPoint}
          onChangeText={onMeetingPoint}
          placeholder={t('feed.meetingPointPlaceholder')}
          maxLength={120}
        />
      </FormSection>

      {challenges.length > 0 && (
        <FormSection label={t('passport.challengeLabel')} note={t('common.optional')}>
          <Text style={styles.hint}>{t('passport.challengeHint')}</Text>
          {challenges.map((challenge) => {
            const selected = challenge.id === challengeId;
            return (
              <Pressable
                key={challenge.id}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => onChallenge(selected ? null : challenge.id)}
                style={({ pressed }) => [
                  styles.challenge,
                  selected && { borderStyle: 'solid', borderWidth: 2, borderColor: tone === 'violet' ? Colors.violet : Colors.orange },
                  pressed && styles.pressed,
                ]}>
                <Text style={styles.challengeEmoji}>{challenge.emoji}</Text>
                <View style={styles.flex}>
                  <Text style={styles.challengeTitle}>{localized(challenge, 'title', language)}</Text>
                  <Text style={styles.challengeBody}>{localized(challenge, 'description', language)}</Text>
                </View>
                <Text style={styles.challengePoints}>+{challenge.points}</Text>
              </Pressable>
            );
          })}
        </FormSection>
      )}
    </>
  );
}

const useStyles = makeStyles((Colors) => ({
  flex: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  hint: { ...Type.small, color: Colors.textMuted, marginTop: -Spacing.xs },
  challenge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: 14,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Colors.borderStrong,
    backgroundColor: Colors.violetTint,
  },
  pressed: { opacity: 0.8 },
  women: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  womenOn: { borderColor: Colors.pinkText, backgroundColor: Colors.pinkTint },
  womenEmoji: { fontSize: 22, color: Colors.pinkText, fontWeight: '800' },
  womenTitle: { ...Type.label, fontSize: 15, fontWeight: '800', color: Colors.text },
  womenBody: { ...Type.small, color: Colors.textSecondary },
  womenLink: { ...Type.small, fontWeight: '700', color: Colors.pinkText },
  challengeEmoji: { fontSize: 26 },
  challengeTitle: { ...Type.label, fontSize: 15, fontWeight: '800', color: Colors.text },
  challengeBody: { ...Type.small, color: Colors.textSecondary },
  challengePoints: { ...Type.label, fontSize: 13, fontWeight: '800', color: Colors.violetText },
}));
