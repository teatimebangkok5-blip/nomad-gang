import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text } from 'react-native';

import { GlossyFill, Shine } from '@/components/glossy';
import { Radius, RaisedSmall, Spacing, Type } from '@/constants/theme';
import { DINING_PROMOTION_KINDS, PROMOTION_EMOJI, type PromotionKind } from '@/lib/venues';
import { makeStyles } from '@/lib/theme';

// Floating "what's on" buttons: Discount, Offer, Event, Party on the food map; Tickets, Free entry, Event, Party on
// the Hangout map. Tap to filter, tap again to clear.
export function PromoFilter({
  value,
  onChange,
  kinds = DINING_PROMOTION_KINDS,
}: {
  value: PromotionKind | null;
  onChange: (value: PromotionKind | null) => void;
  kinds?: readonly PromotionKind[];
}) {
  const styles = useStyles();
  const { t } = useTranslation();

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {kinds.map((kind) => {
        const selected = kind === value;
        return (
          <Pressable
            key={kind}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(selected ? null : kind)}
            style={({ pressed }) => [styles.button, selected && styles.selected, pressed && !selected && styles.pressed]}>
            {selected ? <Shine onColor /> : <GlossyFill />}
            <Text style={styles.emoji}>{PROMOTION_EMOJI[kind]}</Text>
            <Text style={[styles.label, selected && styles.labelSelected]}>{t(`promoFilter.${kind}`)}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const useStyles = makeStyles((Colors) => ({
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
    backgroundColor: Colors.overlay,
    overflow: 'hidden',
    ...RaisedSmall,
  },
  selected: { backgroundColor: Colors.pink, borderColor: Colors.pink },
  pressed: { backgroundColor: Colors.surfaceRaised },
  emoji: { fontSize: 16 },
  label: { ...Type.label, color: Colors.text },
  labelSelected: { color: Colors.onBrand, fontWeight: '800' },
}));
