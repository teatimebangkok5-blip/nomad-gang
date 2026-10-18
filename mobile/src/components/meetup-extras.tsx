import { useTranslation } from 'react-i18next';
import { Text, TextInput, View } from 'react-native';

import { Chip } from '@/components/chip';
import { Radius, Spacing, Type } from '@/constants/theme';
import { COST_LEVELS, type CostLevel } from '@/lib/meetups';
import { makeStyles, useColors } from '@/lib/theme';

// Optional expected cost per person and meeting point, on the Create table / Create hangout forms.
export function MeetupExtras({
  cost,
  onCost,
  meetingPoint,
  onMeetingPoint,
  accent,
}: {
  cost: CostLevel | null;
  onCost: (cost: CostLevel | null) => void;
  meetingPoint: string;
  onMeetingPoint: (text: string) => void;
  accent: string;
}) {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();

  return (
    <View>
      <Text style={styles.label}>{t('feed.costLabel')}</Text>
      <View style={styles.chips}>
        {COST_LEVELS.map((level) => (
          <Chip
            key={level}
            label={t(`feed.cost.${level}`)}
            selected={cost === level}
            onPress={() => onCost(cost === level ? null : level)}
          />
        ))}
      </View>
      <Text style={styles.hint}>{t('feed.costHint')}</Text>

      <Text style={styles.label}>{t('feed.meetingPointLabel')}</Text>
      <TextInput
        value={meetingPoint}
        onChangeText={onMeetingPoint}
        placeholder={t('feed.meetingPointPlaceholder')}
        placeholderTextColor={Colors.textMuted}
        selectionColor={accent}
        keyboardAppearance="dark"
        maxLength={120}
        style={styles.input}
      />
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  label: { ...Type.label, color: Colors.textSecondary, marginTop: Spacing.lg, marginBottom: Spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  hint: { ...Type.small, color: Colors.textMuted, marginTop: Spacing.sm },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.lg,
    fontSize: 16,
    color: Colors.text,
  },
}));
