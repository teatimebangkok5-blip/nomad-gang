import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { Colors, Radius, Spacing, Type } from '@/constants/theme';
import { PROMOTION_EMOJI, PROMOTION_KINDS, type PromotionKind } from '@/lib/venues';

// Floating "what's on" buttons: Discount, Offer, Event, Party. Tap to filter, tap again to clear.
export function PromoFilter({
  value,
  onChange,
}: {
  value: PromotionKind | null;
  onChange: (value: PromotionKind | null) => void;
}) {
  const { t } = useTranslation();

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {PROMOTION_KINDS.map((kind) => {
        const selected = kind === value;
        return (
          <Pressable
            key={kind}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(selected ? null : kind)}
            style={({ pressed }) => [styles.button, selected && styles.selected, pressed && !selected && styles.pressed]}>
            <Text style={styles.emoji}>{PROMOTION_EMOJI[kind]}</Text>
            <Text style={[styles.label, selected && styles.labelSelected]}>{t(`promo.${kind}`)}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: Spacing.sm, paddingHorizontal: Spacing.lg },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.violet,
    backgroundColor: 'rgba(22, 13, 36, 0.92)',
  },
  selected: { backgroundColor: Colors.pink, borderColor: Colors.pink },
  pressed: { backgroundColor: Colors.surfaceRaised },
  emoji: { fontSize: 16 },
  label: { ...Type.label, color: Colors.text },
  labelSelected: { color: Colors.onBrand, fontWeight: '800' },
});
