import { useTranslation } from 'react-i18next';
import { ScrollView } from 'react-native';

import { Chip } from '@/components/chip';
import type { IconName } from '@/components/icon';
import { Spacing } from '@/constants/theme';
import { DINING_PROMOTION_KINDS, type PromotionKind } from '@/lib/venues';
import { makeStyles } from '@/lib/theme';

export const PROMOTION_ICON: Record<PromotionKind, IconName> = {
  discount: 'percent',
  offer: 'deal',
  event: 'event',
  party: 'nightlife',
  ticket: 'ticket',
  free_entry: 'doorOpen',
};

// Floating "what's on" buttons: Discount, Offer, Event, Party on the food map (orange); Tickets, Free entry, Event,
// Party on the Hangout map (violet). Tap to filter, tap again to clear.
export function PromoFilter({
  value,
  onChange,
  kinds = DINING_PROMOTION_KINDS,
  tone = 'orange',
}: {
  value: PromotionKind | null;
  onChange: (value: PromotionKind | null) => void;
  kinds?: readonly PromotionKind[];
  tone?: 'orange' | 'violet';
}) {
  const styles = useStyles();
  const { t } = useTranslation();

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {kinds.map((kind) => (
        <Chip
          key={kind}
          tone={tone}
          icon={PROMOTION_ICON[kind]}
          label={t(`promoFilter.${kind}`)}
          selected={kind === value}
          onPress={() => onChange(kind === value ? null : kind)}
        />
      ))}
    </ScrollView>
  );
}

const useStyles = makeStyles(() => ({
  row: { gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm },
}));
