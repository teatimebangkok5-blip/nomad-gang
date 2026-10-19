import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { Chip } from '@/components/chip';
import { FormInput, FormSection } from '@/components/form-parts';
import { Radius, Spacing, Type } from '@/constants/theme';
import { localized, useLanguage } from '@/i18n';
import { COST_LEVELS, type CostLevel, type JoinMode } from '@/lib/meetups';
import { useChallenges } from '@/lib/passport';
import { makeStyles, useColors } from '@/lib/theme';

// Optional expected cost per person, meeting point and group challenge (Rewards Passport bonus), on the Create
// table / Create hangout forms. `tone`: orange for tables, violet for hangouts.
export function MeetupExtras({
  cost,
  onCost,
  meetingPoint,
  onMeetingPoint,
  challengeId,
  onChallenge,
  joinMode,
  onJoinMode,
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
  tone: 'orange' | 'violet';
}) {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  const language = useLanguage();
  const challenges = useChallenges();

  return (
    <>
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
  challengeEmoji: { fontSize: 26 },
  challengeTitle: { ...Type.label, fontSize: 15, fontWeight: '800', color: Colors.text },
  challengeBody: { ...Type.small, color: Colors.textSecondary },
  challengePoints: { ...Type.label, fontSize: 13, fontWeight: '800', color: Colors.violetText },
}));
