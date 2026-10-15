import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Radius, Spacing, Type } from '@/constants/theme';
import { currentLanguage, localized } from '@/i18n';
import { venuePhotoUrl } from '@/lib/supabase';
import type { Venue } from '@/lib/venues';
import { makeStyles, useColors } from '@/lib/theme';

export function VenueCard({
  venue,
  distance,
  onPress,
  selected = false,
}: {
  venue: Venue;
  distance: number | null;
  // Makes the card tappable (used to pick a place when creating a table).
  onPress?: () => void;
  selected?: boolean;
}) {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  const language = currentLanguage();
  const name = localized(venue, 'name', language);
  const address = localized(venue, 'address', language);

  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityState={onPress ? { selected } : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.card, selected && styles.cardSelected, pressed && styles.pressed]}>
      <View style={styles.photoWrap}>
        {venue.photo_path ? (
          <Image
            source={venuePhotoUrl(venue.photo_path)}
            style={styles.photo}
            contentFit="cover"
            transition={200}
            accessibilityIgnoresInvertColors
          />
        ) : (
          <View style={[styles.photo, styles.photoPlaceholder]}>
            <Icon name={venue.category} size={40} color={Colors.accent} />
          </View>
        )}
        <View style={styles.categoryChip}>
          <Icon name={venue.category} size={14} color={Colors.text} />
          <Text style={styles.categoryText}>{t(`category.${venue.category}`)}</Text>
        </View>
      </View>

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          {distance !== null && <Text style={styles.distance}>{formatDistance(distance, t)}</Text>}
        </View>
        {address ? (
          <Text style={styles.address} numberOfLines={1}>
            {address}
          </Text>
        ) : null}

        {venue.deal && (
          <View style={styles.deal}>
            <Icon name="deal" size={18} color={Colors.accent} />
            <Text style={styles.dealText} numberOfLines={2}>
              {localized(venue.deal, 'title', language)}
            </Text>
            <View style={styles.groupBadge}>
              <Icon name="group" size={14} color={Colors.onBrand} />
              <Text style={styles.groupText}>{t('home.groupRule')}</Text>
            </View>
          </View>
        )}
      </View>
    </Pressable>
  );
}

function formatDistance(meters: number, t: ReturnType<typeof useTranslation>['t']): string {
  if (meters < 1000) {
    return t('home.distanceMeters', { count: Math.max(10, Math.round(meters / 10) * 10) });
  }
  return t('home.distanceKm', { km: (meters / 1000).toFixed(meters < 10000 ? 1 : 0) });
}

const useStyles = makeStyles((Colors) => ({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  cardSelected: { borderColor: Colors.pink, borderWidth: 2 },
  pressed: { opacity: 0.8 },
  photoWrap: { position: 'relative' },
  photo: { width: '100%', aspectRatio: 16 / 9, backgroundColor: Colors.surfaceRaised },
  photoPlaceholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.orangeTint },
  categoryChip: {
    position: 'absolute',
    top: Spacing.md,
    left: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.pill,
    backgroundColor: Colors.overlay,
  },
  categoryText: { ...Type.label, color: Colors.text },
  body: { padding: Spacing.lg, gap: Spacing.xs },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.sm },
  name: { ...Type.heading, color: Colors.text, flex: 1 },
  distance: { ...Type.small, color: Colors.textMuted },
  address: { ...Type.small, color: Colors.textSecondary },
  deal: {
    marginTop: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.orangeTint,
    borderWidth: 1,
    borderColor: 'rgba(255, 154, 27, 0.35)',
  },
  dealText: { ...Type.label, color: Colors.glow, flex: 1 },
  groupBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.pill,
    backgroundColor: Colors.pink,
  },
  groupText: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: Colors.onBrand },
}));
