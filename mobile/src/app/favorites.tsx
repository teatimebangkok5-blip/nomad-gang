import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, FlatList, Linking, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GlossyFill } from '@/components/glossy';
import { Icon } from '@/components/icon';
import { ScreenHeader } from '@/components/screen-header';
import { CATEGORY_EMOJI } from '@/components/venue-map';
import { Radius, RaisedSmall, Spacing, Type } from '@/constants/theme';
import { localized, useLanguage } from '@/i18n';
import { removeFavorite, useFavorites, type Favorite } from '@/lib/favorites';
import { directionsUrl } from '@/lib/meetups';
import { placeCategory, placeEmoji, placeName } from '@/lib/places';
import { makeStyles, useColors } from '@/lib/theme';
import { isHangoutVenue, type VenueCategory } from '@/lib/venues';

// My favourite places and partner venues (saved with the heart on a place card). Each opens Create table (food and
// drink) or Create hangout (places to hang out) there, or the phone's maps app.
export default function FavoritesScreen() {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  const { favorites } = useFavorites();

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <ScreenHeader title={t('favorites.title')} />
      {favorites === null ? (
        <ActivityIndicator color={Colors.accent} size="large" style={styles.spinner} />
      ) : favorites === 'error' ? (
        <Text style={styles.emptyBody}>{t('profile.loadFailed')}</Text>
      ) : (
        <FlatList
          data={favorites}
          keyExtractor={(favorite) => favorite.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Icon name="heartOutline" size={44} color={Colors.pink} />
              <Text style={styles.emptyTitle}>{t('favorites.empty')}</Text>
              <Text style={styles.emptyBody}>{t('favorites.emptyBody')}</Text>
            </View>
          }
          renderItem={({ item }) => <FavoriteRow favorite={item} />}
        />
      )}
    </SafeAreaView>
  );
}

function FavoriteRow({ favorite }: { favorite: Favorite }) {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  const language = useLanguage();
  const { place, venue } = favorite;
  if (!place && !venue) return null;

  const name = venue ? localized(venue, 'name', language) : placeName(place!, language);
  const lat = venue ? venue.lat : place!.lat;
  const lng = venue ? venue.lng : place!.lng;
  const hangout = venue ? isHangoutVenue({ category: venue.category as VenueCategory }) : place!.purpose === 'hangout';
  const emoji = venue
    ? CATEGORY_EMOJI[venue.category as VenueCategory]
    : hangout
      ? placeEmoji(place!.kind)
      : CATEGORY_EMOJI[placeCategory(place!.kind)];
  const kindLabel = venue
    ? t(`category.${venue.category as VenueCategory}`)
    : hangout
      ? t('hangouts.hangout')
      : t('messages.table');

  function create() {
    if (hangout) {
      router.push({ pathname: '/create-hangout', params: venue ? { venueId: venue.id } : { placeId: place!.id } });
    } else {
      router.push({ pathname: '/create-table', params: venue ? { venueId: venue.id } : { placeId: place!.id } });
    }
  }

  function remove() {
    Alert.alert(t('favorites.removeConfirm', { name }), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('favorites.removeButton'), style: 'destructive', onPress: () => removeFavorite(favorite.id) },
    ]);
  }

  return (
    <View style={styles.row}>
      <GlossyFill />
      <Text style={styles.emoji}>{emoji}</Text>
      <View style={styles.rowText}>
        <Text style={styles.name} numberOfLines={2}>
          {name}
        </Text>
        <Text style={styles.meta}>{venue ? `⭐ ${kindLabel}` : kindLabel}</Text>
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            onPress={create}
            style={({ pressed }) => [styles.action, hangout ? styles.actionViolet : styles.actionOrange, pressed && styles.pressed]}>
            <Icon name={hangout ? 'hangout' : 'add'} size={16} color={hangout ? Colors.white : Colors.onBrand} />
            <Text style={[styles.actionText, { color: hangout ? Colors.white : Colors.onBrand }]} numberOfLines={1}>
              {hangout ? t('hangouts.createHangout') : t('tables.createHere')}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={t('tables.openInMaps')}
            onPress={() => Linking.openURL(directionsUrl({ lat, lng, name }))}
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
            <Icon name="map" size={18} color={Colors.text} />
          </Pressable>
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('favorites.remove')}
        hitSlop={10}
        onPress={remove}
        style={({ pressed }) => [styles.heart, pressed && styles.pressed]}>
        <Icon name="heart" size={24} color={Colors.pink} />
      </Pressable>
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  safe: { flex: 1, backgroundColor: Colors.bg },
  spinner: { marginTop: Spacing.xxl * 2 },
  list: { padding: Spacing.lg, gap: Spacing.md, flexGrow: 1 },
  empty: { alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.xxl * 2, paddingHorizontal: Spacing.xl },
  emptyTitle: { ...Type.heading, color: Colors.text },
  emptyBody: { ...Type.body, color: Colors.textMuted, textAlign: 'center', marginTop: Spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
    ...RaisedSmall,
  },
  emoji: { fontSize: 30, marginTop: 2 },
  rowText: { flex: 1 },
  name: { ...Type.heading, color: Colors.text },
  meta: { ...Type.small, color: Colors.textSecondary },
  actions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.sm },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 36,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.pill,
    flexShrink: 1,
  },
  actionOrange: { backgroundColor: Colors.orange },
  actionViolet: { backgroundColor: Colors.violet },
  actionText: { ...Type.label },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.borderStrong,
  },
  heart: { padding: Spacing.xs },
  pressed: { opacity: 0.75 },
}));
