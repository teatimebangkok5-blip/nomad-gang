import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Colors, Radius, Spacing, Type } from '@/constants/theme';
import { currentLanguage, localized } from '@/i18n';
import { venuePhotoUrl } from '@/lib/supabase';
import type { Venue } from '@/lib/venues';

export function VenueCard({ venue, distance }: { venue: Venue; distance: number | null }) {
  const { t } = useTranslation();
  const language = currentLanguage();
  const name = localized(venue, 'name', language);
  const address = localized(venue, 'address', language);

  return (
    <View style={styles.card}>
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
            <Icon name={venue.category} size={40} color={Colors.brand300} />
          </View>
        )}
        <View style={styles.categoryChip}>
          <Icon name={venue.category} size={14} color={Colors.ink700} />
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
            <Icon name="deal" size={18} color={Colors.brand600} />
            <Text style={styles.dealText} numberOfLines={2}>
              {localized(venue.deal, 'title', language)}
            </Text>
            <View style={styles.groupBadge}>
              <Icon name="group" size={14} color={Colors.brand700} />
              <Text style={styles.groupText}>{t('home.groupRule')}</Text>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

function formatDistance(meters: number, t: ReturnType<typeof useTranslation>['t']): string {
  if (meters < 1000) {
    return t('home.distanceMeters', { count: Math.max(10, Math.round(meters / 10) * 10) });
  }
  return t('home.distanceKm', { km: (meters / 1000).toFixed(meters < 10000 ? 1 : 0) });
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.ink200,
    overflow: 'hidden',
  },
  photoWrap: { position: 'relative' },
  photo: { width: '100%', aspectRatio: 16 / 9, backgroundColor: Colors.ink100 },
  photoPlaceholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.brand50 },
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
    backgroundColor: 'rgba(255,255,255,0.94)',
  },
  categoryText: { ...Type.label, color: Colors.ink700 },
  body: { padding: Spacing.lg, gap: Spacing.xs },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.sm },
  name: { ...Type.heading, color: Colors.ink900, flex: 1 },
  distance: { ...Type.small, color: Colors.ink500 },
  address: { ...Type.small, color: Colors.ink600 },
  deal: {
    marginTop: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.brand50,
  },
  dealText: { ...Type.label, color: Colors.brand700, flex: 1 },
  groupBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.pill,
    backgroundColor: Colors.brand100,
  },
  groupText: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: Colors.brand700 },
});
