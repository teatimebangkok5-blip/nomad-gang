import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { Icon } from '@/components/icon';
import { Colors, Radius, Spacing, Type } from '@/constants/theme';
import { VENUE_CATEGORIES, type VenueCategory } from '@/lib/venues';

export type CategoryFilterValue = VenueCategory | 'all';

export function CategoryFilter({
  value,
  onChange,
}: {
  value: CategoryFilterValue;
  onChange: (value: CategoryFilterValue) => void;
}) {
  const { t } = useTranslation();
  const options: CategoryFilterValue[] = ['all', ...VENUE_CATEGORIES];

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {options.map((option) => {
        const selected = option === value;
        return (
          <Pressable
            key={option}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(option)}
            style={[styles.chip, selected && styles.chipSelected]}>
            {option !== 'all' && <Icon name={option} size={16} color={selected ? Colors.white : Colors.ink600} />}
            <Text style={[styles.label, selected && styles.labelSelected]}>{t(`category.${option}`)}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: Spacing.sm, paddingHorizontal: Spacing.lg },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.ink300,
    backgroundColor: Colors.white,
  },
  chipSelected: { backgroundColor: Colors.ink900, borderColor: Colors.ink900 },
  label: { ...Type.label, color: Colors.ink700 },
  labelSelected: { color: Colors.white },
});
