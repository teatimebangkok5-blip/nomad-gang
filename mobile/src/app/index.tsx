import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { CategoryFilter, type CategoryFilterValue } from '@/components/category-filter';
import { Icon } from '@/components/icon';
import { LanguageToggle } from '@/components/language-toggle';
import { Logo } from '@/components/logo';
import { MeetupCard } from '@/components/meetup-card';
import { VenueCard } from '@/components/venue-card';
import { VenueMap, type MapPin } from '@/components/venue-map';
import { Colors, Radius, Spacing, Type } from '@/constants/theme';
import { currentLanguage, localized } from '@/i18n';
import { signOut, useAuth } from '@/lib/auth';
import { PromoFilter } from '@/components/promo-filter';
import { CATEGORY_EMOJI } from '@/components/venue-map';
import { formatWhen } from '@/lib/bangkok-time';
import { checkPlace, type PlaceCheck } from '@/lib/google-places';
import { distanceMeters, useCurrentLocation } from '@/lib/location';
import { googleMapsUrl, joinMeetup, useOpenMeetups, type GooglePlace, type OpenMeetup } from '@/lib/meetups';
import { skipLogin } from '@/lib/preview';
import { PROMOTION_EMOJI, useVenues, type PromotionKind, type Venue } from '@/lib/venues';

// What the bottom card shows: a partner venue, or any Google place someone tapped (checked for food/Bangkok).
type Selection =
  | { type: 'venue'; venueId: string }
  | { type: 'place'; place: GooglePlace; check: PlaceCheck | 'checking' };

// Home: a full-screen map of open tables. Logo and category chips float on top; a swipeable row of table cards,
// "Create table" and a "List" button float at the bottom. "List" slides up a panel with all tables and places.
export default function HomeScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { session } = useAuth();
  const venues = useVenues();
  const meetups = useOpenMeetups(Boolean(session));
  const location = useCurrentLocation();
  const [category, setCategory] = useState<CategoryFilterValue>('all');
  const [promo, setPromo] = useState<PromotionKind | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [topHeight, setTopHeight] = useState(0);
  const [bottomHeight, setBottomHeight] = useState(0);

  // Android back button closes the list panel before leaving the app.
  useEffect(() => {
    if (!listOpen) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setListOpen(false);
      return true;
    });
    return () => sub.remove();
  }, [listOpen]);

  const coords = location.state.status === 'granted' ? location.state.coords : null;
  const venueById = new Map(venues.venues.map((venue) => [venue.id, venue]));
  const filtersOn = category !== 'all' || promo !== null;
  const venueMatches = (venue: Venue | undefined) =>
    Boolean(venue) &&
    (category === 'all' || venue?.category === category) &&
    (promo === null || Boolean(venue?.promotions.some((p) => p.kind === promo)));
  // Tables at Google places have no category or promotions, so they only show when no filter is on.
  const meetupMatches = (meetup: OpenMeetup) =>
    meetup.venue_id ? venueMatches(venueById.get(meetup.venue_id)) : !filtersOn;

  const visibleMeetups = meetups.meetups.filter(meetupMatches);
  const meetupsAtSelection = (s: Selection) =>
    meetups.meetups.filter((meetup) =>
      s.type === 'venue' ? meetup.venue_id === s.venueId : !meetup.venue_id && meetup.google_place_id === s.place.placeId,
    );

  // Partner venues: pin shows the promotion type (or the place type), badge = open tables there.
  const tablesAtVenue = new Map<string, number>();
  const tablesAtPlace = new Map<string, OpenMeetup[]>();
  for (const meetup of visibleMeetups) {
    if (meetup.venue_id) tablesAtVenue.set(meetup.venue_id, (tablesAtVenue.get(meetup.venue_id) ?? 0) + 1);
    else if (meetup.google_place_id) tablesAtPlace.set(meetup.google_place_id, [...(tablesAtPlace.get(meetup.google_place_id) ?? []), meetup]);
  }
  const selectedVenueId = selection?.type === 'venue' ? selection.venueId : null;
  const selectedPlaceId = selection?.type === 'place' ? selection.place.placeId : null;
  const pins: MapPin[] = [
    ...venues.venues.filter(venueMatches).map((venue) => {
      const shown = (promo && venue.promotions.find((p) => p.kind === promo)) || venue.deal || venue.promotions[0];
      return {
        key: `v:${venue.id}`,
        lat: venue.lat,
        lng: venue.lng,
        emoji: shown ? PROMOTION_EMOJI[shown.kind] : CATEGORY_EMOJI[venue.category],
        count: tablesAtVenue.get(venue.id),
        selected: venue.id === selectedVenueId,
      };
    }),
    ...[...tablesAtPlace].flatMap(([placeId, list]) => {
      const first = list[0];
      return first.place_lat !== null && first.place_lng !== null
        ? [{ key: `p:${placeId}`, lat: first.place_lat, lng: first.place_lng, emoji: '👥', tone: 'violet' as const, count: list.length, selected: placeId === selectedPlaceId }]
        : [];
    }),
  ];

  const places = venues.venues
    .filter(venueMatches)
    .map((venue) => ({ venue, distance: coords ? distanceMeters(coords, venue) : null }))
    .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));

  const cardWidth = Math.min(width - Spacing.lg * 2 - Spacing.xl, 420);

  function handlePinPress(key: string) {
    if (key.startsWith('v:')) {
      const venueId = key.slice(2);
      setSelection((current) => (current?.type === 'venue' && current.venueId === venueId ? null : { type: 'venue', venueId }));
      return;
    }
    const placeId = key.slice(2);
    const first = tablesAtPlace.get(placeId)?.[0];
    if (first?.place_name && first.place_lat !== null && first.place_lng !== null) {
      // A table already exists here, so the place was checked when it was created.
      setSelection({ type: 'place', place: { placeId, name: first.place_name, lat: first.place_lat, lng: first.place_lng }, check: 'food' });
    }
  }

  // Tap on one of Google's places: a linked partner venue opens as that venue; anything else is checked
  // (Bangkok, food or drink) before "Create table here" is offered.
  async function handlePlacePress(place: GooglePlace) {
    const venue = venues.venues.find((v) => v.google_place_id === place.placeId);
    if (venue) {
      setSelection({ type: 'venue', venueId: venue.id });
      return;
    }
    setSelection({ type: 'place', place, check: 'checking' });
    const check = await checkPlace(place);
    setSelection((current) =>
      current?.type === 'place' && current.place.placeId === place.placeId ? { ...current, check } : current,
    );
  }

  function createAt(s: Selection) {
    if (s.type === 'venue') {
      router.push({ pathname: '/create-table', params: { venueId: s.venueId } });
    } else {
      const { placeId, name, lat, lng } = s.place;
      router.push({ pathname: '/create-table', params: { placeId, name, lat: String(lat), lng: String(lng) } });
    }
  }

  function confirmSignOut() {
    Alert.alert(t('home.signOutConfirm'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('home.signOut'), style: 'destructive', onPress: () => signOut() },
    ]);
  }

  async function handleJoin(id: string) {
    setJoiningId(id);
    const { error } = await joinMeetup(id);
    setJoiningId(null);
    if (error) Alert.alert(t(`tables.errors.${error}`));
    else meetups.reload();
  }

  const openTable = (meetup: OpenMeetup) => router.push({ pathname: '/table/[id]', params: { id: meetup.id } });

  const renderMeetup = (meetup: OpenMeetup) => (
    <MeetupCard
      meetup={meetup}
      venue={meetup.venue_id ? venueById.get(meetup.venue_id) : undefined}
      joining={joiningId === meetup.id}
      onJoin={() => handleJoin(meetup.id)}
      onPress={() => openTable(meetup)}
    />
  );

  return (
    <View style={styles.root}>
      <VenueMap
        fullScreen
        pins={pins}
        userCoords={coords}
        onPinPress={handlePinPress}
        onPlacePress={handlePlacePress}
        mapPadding={{ top: topHeight, right: 0, bottom: bottomHeight, left: 0 }}
      />

      {/* Top: logo, language, chips. A fade keeps it readable over the map. */}
      <View style={styles.top} pointerEvents="box-none" onLayout={(e) => setTopHeight(e.nativeEvent.layout.height)}>
        <LinearGradient
          colors={['rgba(10, 6, 18, 0.95)', 'rgba(10, 6, 18, 0.75)', 'rgba(10, 6, 18, 0)']}
          locations={[0, 0.7, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <View style={[styles.topBar, { paddingTop: insets.top + Spacing.sm }]}>
          <Logo size={20} />
          <View style={styles.topActions}>
            <LanguageToggle />
            {!skipLogin && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('home.signOut')}
                hitSlop={8}
                onPress={confirmSignOut}
                style={({ pressed }) => [styles.roundButton, pressed && styles.roundButtonPressed]}>
                <Icon name="logout" size={20} color={Colors.textSecondary} />
              </Pressable>
            )}
          </View>
        </View>

        {skipLogin && (
          // Developer-only notice (English on purpose): reminds that this build skips sign-in.
          <Text style={styles.previewNotice}>Preview mode: sign-in is turned off</Text>
        )}

        <View style={styles.chips}>
          <PromoFilter
            value={promo}
            onChange={(value) => {
              setPromo(value);
              setSelection(null);
            }}
          />
          <CategoryFilter
            value={category}
            onChange={(value) => {
              setCategory(value);
              setSelection(null);
            }}
          />
        </View>

        {location.state.status === 'denied' && (
          <Pressable
            accessibilityRole="button"
            onPress={location.request}
            style={({ pressed }) => [styles.locationPill, pressed && styles.roundButtonPressed]}>
            <Icon name="locationOff" size={16} color={Colors.orange} />
            <Text style={styles.locationPillText}>
              {location.state.canAskAgain ? t('home.locationOffTitle') : t('home.locationOpenSettings')}
            </Text>
          </Pressable>
        )}
      </View>

      {/* Bottom: table cards row + actions. */}
      <View
        style={[styles.bottom, { paddingBottom: insets.bottom + Spacing.md }]}
        pointerEvents="box-none"
        onLayout={(e) => setBottomHeight(e.nativeEvent.layout.height)}>
        {selection ? (
          <PlaceCard
            selection={selection}
            venue={selection.type === 'venue' ? venueById.get(selection.venueId) : undefined}
            tables={meetupsAtSelection(selection)}
            renderMeetup={renderMeetup}
            onCreate={() => createAt(selection)}
            onClose={() => setSelection(null)}
          />
        ) : !session ? null : meetups.status === 'loading' ? (
          <ActivityIndicator color={Colors.orange} style={styles.cardsSpinner} />
        ) : visibleMeetups.length === 0 ? (
          <View style={[styles.emptyCard, { marginHorizontal: Spacing.lg }]}>
            <Text style={styles.emptyTitle}>
              {meetups.status === 'error' ? t('tables.errorLoad') : t('tables.noTablesTitle')}
            </Text>
            {meetups.status !== 'error' && <Text style={styles.emptyBody}>{t('tables.noTablesBody')}</Text>}
            {meetups.status !== 'error' && <Text style={styles.tip}>{t('tables.pickAnyPlace')}</Text>}
          </View>
        ) : (
          <FlatList
            horizontal
            data={visibleMeetups}
            keyExtractor={(meetup) => meetup.id}
            renderItem={({ item }) => <View style={{ width: cardWidth }}>{renderMeetup(item)}</View>}
            showsHorizontalScrollIndicator={false}
            snapToInterval={cardWidth + Spacing.md}
            decelerationRate="fast"
            contentContainerStyle={styles.cards}
          />
        )}

        <View style={styles.actions}>
          <View style={styles.createButton}>
            <Button
              title={t('tables.createTable')}
              icon={<Icon name="add" size={20} color={Colors.onBrand} />}
              onPress={() => router.push('/create-table')}
            />
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => setListOpen(true)}
            style={({ pressed }) => [styles.listButton, pressed && styles.roundButtonPressed]}>
            <Icon name="list" size={20} color={Colors.text} />
            <Text style={styles.listButtonText}>{t('tables.showList')}</Text>
          </Pressable>
        </View>
      </View>

      {listOpen && (
        <>
          <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.scrim}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setListOpen(false)} accessibilityLabel={t('tables.showMap')} />
          </Animated.View>
          <Animated.View
            entering={SlideInDown.duration(260)}
            exiting={SlideOutDown.duration(200)}
            style={[styles.sheet, { top: insets.top + 72, paddingBottom: insets.bottom }]}>
            <View style={styles.sheetHeader}>
              <View style={styles.handle} />
              <Pressable
                accessibilityRole="button"
                onPress={() => setListOpen(false)}
                hitSlop={8}
                style={({ pressed }) => [styles.mapButton, pressed && styles.roundButtonPressed]}>
                <Icon name="map" size={18} color={Colors.text} />
                <Text style={styles.listButtonText}>{t('tables.showMap')}</Text>
              </Pressable>
            </View>
            <ListPanel
              meetups={visibleMeetups}
              meetupsStatus={session ? meetups.status : 'ready'}
              renderMeetup={renderMeetup}
              places={places}
              venuesStatus={venues.status}
              onRetryVenues={venues.retry}
              onRefresh={async () => {
                location.refresh();
                await Promise.all([venues.pullToRefresh(), meetups.reload()]);
              }}
            />
          </Animated.View>
        </>
      )}
    </View>
  );
}

function PlaceCard({
  selection,
  venue,
  tables,
  renderMeetup,
  onCreate,
  onClose,
}: {
  selection: Selection;
  venue: Venue | undefined;
  tables: OpenMeetup[];
  renderMeetup: (meetup: OpenMeetup) => React.ReactNode;
  onCreate: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const language = currentLanguage();
  const name = venue ? localized(venue, 'name', language) : selection.type === 'place' ? selection.place.name : '';
  const check = selection.type === 'place' ? selection.check : 'food';
  const canCreate = check === 'food' || check === 'unknown';
  const mapsTarget =
    selection.type === 'place'
      ? selection.place
      : venue
        ? { lat: venue.lat, lng: venue.lng, placeId: venue.google_place_id, name: venue.name_en }
        : null;

  return (
    <View style={styles.placeCard}>
      <View style={styles.placeHeader}>
        <Text style={styles.placeName} numberOfLines={2}>
          {name}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          hitSlop={10}
          onPress={onClose}
          style={({ pressed }) => [styles.closeButton, pressed && styles.roundButtonPressed]}>
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
      </View>

      {venue && venue.promotions.length > 0 ? (
        <View style={styles.promoList}>
          {venue.promotions.map((promotion) => (
            <View key={promotion.id} style={styles.promoRow}>
              <Text style={styles.promoEmoji}>{PROMOTION_EMOJI[promotion.kind]}</Text>
              <View style={styles.promoBody}>
                <Text style={styles.promoTitle} numberOfLines={1}>
                  {localized(promotion, 'title', language)}
                </Text>
                <Text style={styles.promoMeta} numberOfLines={1}>
                  {t(`promo.${promotion.kind}`)}
                  {promotion.starts_at ? ` · ${formatWhen(promotion.starts_at, t)}` : ` · ${t('home.groupRule')}`}
                </Text>
              </View>
            </View>
          ))}
        </View>
      ) : check === 'checking' ? (
        <Text style={styles.placeNote}>{t('tables.checkingPlace')}</Text>
      ) : check === 'not_food' ? (
        <Text style={styles.placeWarning}>{t('tables.notFood')}</Text>
      ) : check === 'outside_bangkok' ? (
        <Text style={styles.placeWarning}>{t('tables.outsideBangkok')}</Text>
      ) : (
        <Text style={styles.placeNote}>{t('tables.noDealHere')}</Text>
      )}

      {tables.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.placeTables}>
          {tables.map((meetup) => (
            <View key={meetup.id} style={styles.placeTable}>
              {renderMeetup(meetup)}
            </View>
          ))}
        </ScrollView>
      )}

      <View style={styles.placeActions}>
        <View style={styles.createButton}>
          <Button
            title={t('tables.createHere')}
            icon={<Icon name="add" size={20} color={canCreate ? Colors.onBrand : Colors.textMuted} />}
            disabled={!canCreate}
            onPress={onCreate}
          />
        </View>
        {mapsTarget && (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={t('tables.openInMaps')}
            onPress={() => Linking.openURL(googleMapsUrl(mapsTarget))}
            style={({ pressed }) => [styles.listButton, pressed && styles.roundButtonPressed]}>
            <Icon name="map" size={20} color={Colors.text} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

function ListPanel({
  meetups,
  meetupsStatus,
  renderMeetup,
  places,
  venuesStatus,
  onRetryVenues,
  onRefresh,
}: {
  meetups: OpenMeetup[];
  meetupsStatus: 'loading' | 'ready' | 'error';
  renderMeetup: (meetup: OpenMeetup) => React.ReactNode;
  places: { venue: Venue; distance: number | null }[];
  venuesStatus: 'loading' | 'ready' | 'error';
  onRetryVenues: () => void;
  onRefresh: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [refreshing, setRefreshing] = useState(false);

  return (
    <ScrollView
      contentContainerStyle={styles.sheetContent}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await onRefresh();
            setRefreshing(false);
          }}
          colors={[Colors.orange]}
          progressBackgroundColor={Colors.surfaceRaised}
          tintColor={Colors.orange}
        />
      }>
      <Text style={styles.sectionTitle}>{t('tables.openTables')}</Text>
      {meetupsStatus === 'loading' ? (
        <ActivityIndicator color={Colors.orange} style={styles.cardsSpinner} />
      ) : meetups.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>{meetupsStatus === 'error' ? t('tables.errorLoad') : t('tables.noTablesTitle')}</Text>
          {meetupsStatus !== 'error' && <Text style={styles.emptyBody}>{t('tables.noTablesBody')}</Text>}
        </View>
      ) : (
        <View style={styles.list}>
          {meetups.map((meetup) => (
            <View key={meetup.id}>{renderMeetup(meetup)}</View>
          ))}
        </View>
      )}

      <Text style={[styles.sectionTitle, styles.sectionSpacing]}>{t('tables.partnerPlaces')}</Text>
      {places.length === 0 ? (
        venuesStatus === 'loading' ? (
          <ActivityIndicator color={Colors.orange} style={styles.cardsSpinner} />
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>{venuesStatus === 'error' ? t('home.errorTitle') : t('home.emptyTitle')}</Text>
            <Text style={styles.emptyBody}>{venuesStatus === 'error' ? t('home.errorBody') : t('home.emptyBody')}</Text>
            {venuesStatus === 'error' && (
              <View style={styles.retry}>
                <Button title={t('common.tryAgain')} variant="secondary" onPress={onRetryVenues} />
              </View>
            )}
          </View>
        )
      ) : (
        <View style={styles.list}>
          {places.map(({ venue, distance }) => (
            <VenueCard key={venue.id} venue={venue} distance={distance} />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  top: { position: 'absolute', top: 0, left: 0, right: 0, paddingBottom: Spacing.xl },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
  },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  roundButton: {
    width: 40,
    height: 40,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
  },
  roundButtonPressed: { opacity: 0.7 },
  previewNotice: {
    ...Type.small,
    fontSize: 12,
    color: Colors.textSecondary,
    backgroundColor: Colors.surfaceRaised,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    paddingVertical: 2,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.pill,
    alignSelf: 'flex-start',
    overflow: 'hidden',
  },
  chips: { marginTop: Spacing.md, gap: Spacing.sm },
  tip: { ...Type.small, color: Colors.glow, marginTop: Spacing.xs },
  placeCard: {
    marginHorizontal: Spacing.lg,
    padding: Spacing.md,
    gap: Spacing.md,
    borderRadius: Radius.lg,
    backgroundColor: 'rgba(22, 13, 36, 0.97)',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  placeHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  placeName: { ...Type.heading, color: Colors.text, flex: 1 },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceRaised,
  },
  closeText: { ...Type.label, color: Colors.textSecondary },
  promoList: { gap: Spacing.sm },
  promoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.sm,
    borderRadius: Radius.md,
    backgroundColor: Colors.orangeTint,
  },
  promoEmoji: { fontSize: 20 },
  promoBody: { flex: 1 },
  promoTitle: { ...Type.label, color: Colors.glow },
  promoMeta: { ...Type.small, color: Colors.textSecondary },
  placeNote: { ...Type.body, color: Colors.textSecondary },
  placeWarning: { ...Type.body, color: Colors.danger },
  placeTables: { gap: Spacing.sm },
  placeTable: { width: 300 },
  placeActions: { flexDirection: 'row', gap: Spacing.sm },
  locationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    alignSelf: 'flex-start',
    marginLeft: Spacing.lg,
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.md,
    minHeight: 34,
    borderRadius: Radius.pill,
    backgroundColor: Colors.violetTint,
    borderWidth: 1,
    borderColor: Colors.violet,
  },
  locationPillText: { ...Type.label, color: Colors.text },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, gap: Spacing.md },
  cards: { gap: Spacing.md, paddingHorizontal: Spacing.lg },
  cardsSpinner: { marginVertical: Spacing.lg },
  actions: { flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.lg },
  createButton: { flex: 1 },
  listButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    minHeight: 52,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
  },
  listButtonText: { ...Type.label, color: Colors.text },
  scrim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0, 0, 0, 0.45)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.bg,
    borderTopLeftRadius: Radius.lg + 8,
    borderTopRightRadius: Radius.lg + 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sheetHeader: {
    alignItems: 'center',
    paddingTop: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.borderStrong },
  mapButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    alignSelf: 'flex-end',
    minHeight: 36,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
  },
  sheetContent: { padding: Spacing.lg, paddingBottom: Spacing.xxl * 2 },
  sectionTitle: { ...Type.heading, color: Colors.text, marginBottom: Spacing.md },
  sectionSpacing: { marginTop: Spacing.xl },
  list: { gap: Spacing.md },
  emptyCard: {
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    backgroundColor: 'rgba(22, 13, 36, 0.94)',
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.xs,
  },
  emptyTitle: { ...Type.heading, color: Colors.text },
  emptyBody: { ...Type.body, color: Colors.textSecondary },
  retry: { marginTop: Spacing.md },
});
