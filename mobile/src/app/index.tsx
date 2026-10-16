import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlossyFill } from '@/components/glossy';
import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { LanguageToggle } from '@/components/language-toggle';
import { Logo } from '@/components/logo';
import { MeetupCard } from '@/components/meetup-card';
import { stopName } from '@/components/plan-timeline';
import { MapSearchBar, MapSearchResults } from '@/components/map-search';
import { SlideUpPanel } from '@/components/slide-up-panel';
import { VenueMap, type MapFocus, type MapPin } from '@/components/venue-map';
import { AREA_ZOOM, PLACE_ZOOM, useMapSearch, type SearchResult } from '@/lib/map-search';
import { Radius, Raised, RaisedSmall, Spacing, Type } from '@/constants/theme';
import { currentLanguage, localized } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { useThreads } from '@/lib/chat';
import { formatWhen } from '@/lib/bangkok-time';
import { useCurrentLocation } from '@/lib/location';
import {
  directionsUrl,
  joinMeetup,
  meetupCoords,
  meetupLocationKey,
  meetupPlaceName,
  useOpenMeetups,
  type OpenMeetup,
} from '@/lib/meetups';
import { placeName, usePlacesInView, type Place } from '@/lib/places';
import { skipLogin } from '@/lib/preview';
import { isHangoutVenue, PROMOTION_EMOJI, useVenues, type Venue } from '@/lib/venues';
import { profilePhotoUrl } from '@/lib/photos';
import { usePlansForMeetups, type DayPlan } from '@/lib/plans';
import { useNotifications } from '@/lib/notifications';
import { useMyName } from '@/lib/profiles';
import { makeStyles, useColors } from '@/lib/theme';

// What the bottom card shows: a partner venue, any Bangkok food place (OpenStreetMap) someone tapped, or the
// hangouts at one spot (when there are several; a single one opens straight away).
type Selection =
  | { type: 'venue'; venueId: string }
  | { type: 'place'; place: Place }
  | { type: 'hangouts'; key: string };

// Home: a full-screen map of the open tables and hangouts people created, plus food place icons (partner venues
// and their Discount/Offer/Event/Party buttons are on the Create table map). My profile, the logo, language,
// Travellers, Settings and the search bar float on top; a swipeable row of cards, "Create table", "Create hangout"
// and a "List" button (everything open) float at the bottom.
export default function HomeScreen() {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { session } = useAuth();
  const venues = useVenues();
  const meetups = useOpenMeetups(Boolean(session));
  const { threads } = useThreads(Boolean(session));
  const incomingRequests = (threads ?? []).filter(
    (thread) => thread.status === 'pending' && thread.requested_by !== session?.user.id,
  ).length;
  const location = useCurrentLocation();
  const [selection, setSelection] = useState<Selection | null>(null);
  const { places: mapPlaces, onBoundsChange } = usePlacesInView();
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [topHeight, setTopHeight] = useState(0);
  const [bottomHeight, setBottomHeight] = useState(0);

  const coords = location.state.status === 'granted' ? location.state.coords : null;
  const venueById = new Map(venues.venues.map((venue) => [venue.id, venue]));
  const diningVenues = venues.venues.filter((venue) => !isHangoutVenue(venue));
  const diningVenueIds = new Set(diningVenues.map((venue) => venue.id));
  // Partner venues live on the Create table map, so home search finds places and areas only.
  const search = useMapSearch('food', []);
  const me = useMyName(session?.user.id);
  const notifications = useNotifications(Boolean(session));
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const visibleMeetups = meetups.meetups;

  // Home shows what people created: tables share a 👥 pin per venue or place (partner venues themselves aren't
  // pinned on home), hangouts share a 🙌 pin per place or spot.
  const tablesAtVenue = new Map<string, number>();
  const tablesAtPlace = new Map<string, OpenMeetup[]>();
  const hangoutGroups = new Map<string, OpenMeetup[]>();
  for (const meetup of visibleMeetups) {
    if (meetup.venue_id && diningVenueIds.has(meetup.venue_id)) {
      tablesAtVenue.set(meetup.venue_id, (tablesAtVenue.get(meetup.venue_id) ?? 0) + 1);
    } else if (meetup.kind === 'hangout') {
      const key = meetupLocationKey(meetup);
      hangoutGroups.set(key, [...(hangoutGroups.get(key) ?? []), meetup]);
    } else if (meetup.place_id) {
      tablesAtPlace.set(meetup.place_id, [...(tablesAtPlace.get(meetup.place_id) ?? []), meetup]);
    }
  }
  const meetupsAtSelection = (s: Selection) =>
    s.type === 'hangouts'
      ? (hangoutGroups.get(s.key) ?? [])
      : meetups.meetups.filter((meetup) =>
          s.type === 'venue' ? meetup.venue_id === s.venueId : !meetup.venue_id && meetup.place_id === s.place.id,
        );
  // Hangouts made from a day plan: tapping their pin draws the plan's route.
  const dayPlans = usePlansForMeetups(visibleMeetups.filter((meetup) => meetup.kind === 'hangout').map((meetup) => meetup.id));
  const selectedPlan =
    selection?.type === 'hangouts'
      ? (meetupsAtSelection(selection)
          .map((meetup) => dayPlans.get(meetup.id))
          .find((plan) => plan) ?? null)
      : null;
  const selectedVenueId = selection?.type === 'venue' ? selection.venueId : null;
  const selectedPlaceId = selection?.type === 'place' ? selection.place.id : null;
  const selectedHangoutsKey = selection?.type === 'hangouts' ? selection.key : null;
  const pins: MapPin[] = [
    ...[...tablesAtVenue].flatMap(([venueId, count]) => {
      const venue = venueById.get(venueId);
      return venue
        ? [{ key: `v:${venueId}`, lat: venue.lat, lng: venue.lng, emoji: '👥', tone: 'violet' as const, count, selected: venueId === selectedVenueId }]
        : [];
    }),
    ...[...tablesAtPlace].flatMap(([placeId, list]) => {
      const first = list[0];
      return first.place_lat !== null && first.place_lng !== null
        ? [{ key: `p:${placeId}`, lat: first.place_lat, lng: first.place_lng, emoji: '👥', tone: 'violet' as const, count: list.length, selected: placeId === selectedPlaceId }]
        : [];
    }),
    ...[...hangoutGroups].flatMap(([key, list]) => {
      const at = meetupCoords(list[0], venueById);
      return at
        ? [{ key: `h:${key}`, ...at, emoji: '🙌', tone: 'violet' as const, count: list.length, selected: key === selectedHangoutsKey }]
        : [];
    }),
  ];

  const cardWidth = Math.min(width - Spacing.lg * 2 - Spacing.xl, 420);

  function handlePinPress(key: string) {
    if (key.startsWith('h:')) {
      const group = hangoutGroups.get(key.slice(2)) ?? [];
      // A single hangout opens straight away, unless it's a day plan: then the card and its route show first.
      if (group.length === 1 && !dayPlans.has(group[0].id)) openTable(group[0]);
      else if (group.length > 1) setSelection({ type: 'hangouts', key: key.slice(2) });
      return;
    }
    if (key.startsWith('v:')) {
      const venueId = key.slice(2);
      setSelection((current) => (current?.type === 'venue' && current.venueId === venueId ? null : { type: 'venue', venueId }));
      return;
    }
    const placeId = key.slice(2);
    const first = tablesAtPlace.get(placeId)?.[0];
    if (first?.place_name && first.place_lat !== null && first.place_lng !== null) {
      setSelection({
        type: 'place',
        place: {
          id: placeId,
          name: first.place_name,
          name_en: first.place_name_en,
          name_th: first.place_name_th,
          kind: 'restaurant',
          lat: first.place_lat,
          lng: first.place_lng,
        },
      });
    }
  }

  // Tap on a place dot: a place linked to a partner venue opens as that venue.
  // Search result: move the map there and open its card (areas just move the map).
  function handleSearchPick(result: SearchResult) {
    search.clear();
    if (result.type === 'venue') {
      setSelection({ type: 'venue', venueId: result.venue.id });
      setFocus({ lat: result.venue.lat, lng: result.venue.lng, zoom: PLACE_ZOOM, seq: Date.now() });
    } else if (result.type === 'place') {
      setSelection({ type: 'place', place: result.place });
      setFocus({ lat: result.place.lat, lng: result.place.lng, zoom: PLACE_ZOOM, seq: Date.now() });
    } else {
      setSelection(null);
      setFocus({ lat: result.area.lat, lng: result.area.lng, zoom: AREA_ZOOM[result.area.kind], seq: Date.now() });
    }
  }

  function handlePlacePress(place: Place) {
    const venue = venues.venues.find((v) => v.place_id === place.id);
    setSelection(venue ? { type: 'venue', venueId: venue.id } : { type: 'place', place });
  }

  function createAt(s: Selection) {
    if (s.type === 'venue') {
      router.push({ pathname: '/create-table', params: { venueId: s.venueId } });
    } else if (s.type === 'place') {
      router.push({ pathname: '/create-table', params: { placeId: s.place.id } });
    } else {
      router.push('/create-hangout');
    }
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
        places={mapPlaces}
        onPlacePress={handlePlacePress}
        onBoundsChange={onBoundsChange}
        mapPadding={{ top: topHeight, right: 0, bottom: bottomHeight, left: 0 }}
        focus={focus}
        route={selectedPlan?.stops}
        routeStops={selectedPlan?.stops.map((stop, index) => ({ lat: stop.lat, lng: stop.lng, label: String(index + 1) }))}
      />

      {/* Top: logo, language, chips. A fade keeps it readable over the map. */}
      <View style={styles.top} pointerEvents="box-none" onLayout={(e) => setTopHeight(e.nativeEvent.layout.height)}>
        <LinearGradient
          colors={Colors.fade}
          locations={[0, 0.7, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <View style={[styles.topBar, { paddingTop: insets.top + Spacing.sm }]}>
          <View style={styles.brand}>
            {/* My profile, top left. */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('profile.myProfile')}
              hitSlop={8}
              disabled={!session}
              onPress={() => session && router.push({ pathname: '/profile/[userId]', params: { userId: session.user.id } })}
              style={({ pressed }) => [styles.profileButton, pressed && styles.roundButtonPressed]}>
              <GlossyFill />
              {me?.avatarPath ? (
                <Image source={profilePhotoUrl(me.avatarPath)} style={StyleSheet.absoluteFill} contentFit="cover" />
              ) : me ? (
                <Text style={styles.profileInitial}>{me.name.slice(0, 1).toUpperCase()}</Text>
              ) : (
                <Icon name="person" size={20} color={Colors.text} />
              )}
            </Pressable>
            <Logo size={20} />
          </View>
          <View style={styles.topActions}>
            <LanguageToggle />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('travellers.open')}
              hitSlop={8}
              onPress={() => router.push('/travellers')}
              style={({ pressed }) => [styles.roundButton, pressed && styles.roundButtonPressed]}>
              <GlossyFill />
              <Icon name="travellers" size={20} color={Colors.accent} />
              {incomingRequests > 0 && <View style={styles.dot} />}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                notifications.unreadCount > 0
                  ? t('notifications.openUnread', { count: notifications.unreadCount })
                  : t('notifications.open')
              }
              hitSlop={8}
              onPress={() => router.push('/notifications')}
              style={({ pressed }) => [styles.roundButton, pressed && styles.roundButtonPressed]}>
              <GlossyFill />
              <Icon name="notifications" size={20} color={Colors.accent} />
              {notifications.unreadCount > 0 && (
                <View style={styles.countBadge}>
                  <Text style={styles.countBadgeText}>{notifications.unreadCount > 9 ? '9+' : notifications.unreadCount}</Text>
                </View>
              )}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('settings.open')}
              hitSlop={8}
              onPress={() => router.push('/settings')}
              style={({ pressed }) => [styles.roundButton, pressed && styles.roundButtonPressed]}>
              <GlossyFill />
              <Icon name="settings" size={20} color={Colors.textSecondary} />
            </Pressable>
          </View>
        </View>

        <View style={styles.search}>
          <MapSearchBar value={search.query} onChangeText={search.setQuery} placeholder={t('search.foodPlaceholder')} />
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/plan-day')}
          style={({ pressed }) => [styles.planPill, pressed && styles.roundButtonPressed]}>
          <GlossyFill />
          <Icon name="route" size={16} color={Colors.violet} />
          <Text style={styles.locationPillText}>{t('plan.open')}</Text>
        </Pressable>

        {skipLogin && (
          // Developer-only notice (English on purpose): reminds that this build skips sign-in.
          <Text style={styles.previewNotice}>Preview mode: sign-in is turned off</Text>
        )}

        {location.state.status === 'denied' && (
          <Pressable
            accessibilityRole="button"
            onPress={location.request}
            style={({ pressed }) => [styles.locationPill, pressed && styles.roundButtonPressed]}>
            <Icon name="locationOff" size={16} color={Colors.accent} />
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
            venue={
              selection.type === 'venue'
                ? venueById.get(selection.venueId)
                : selection.type === 'hangouts'
                  ? venueById.get(meetupsAtSelection(selection)[0]?.venue_id ?? '')
                  : undefined
            }
            tables={meetupsAtSelection(selection)}
            dayPlan={selectedPlan}
            renderMeetup={renderMeetup}
            onCreate={() => createAt(selection)}
            onClose={() => setSelection(null)}
          />
        ) : !session ? null : meetups.status === 'loading' ? (
          <ActivityIndicator color={Colors.accent} style={styles.cardsSpinner} />
        ) : visibleMeetups.length === 0 ? (
          <View style={[styles.emptyCard, { marginHorizontal: Spacing.lg }]}>
            <GlossyFill />
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
              compact
              title={t('tables.createTable')}
              icon={<Icon name="add" size={18} color={Colors.onBrand} />}
              onPress={() => router.push('/create-table')}
            />
          </View>
          <View style={styles.createButton}>
            <Button
              compact
              variant="violet"
              title={t('hangouts.createHangout')}
              icon={<Icon name="hangout" size={18} color={Colors.white} />}
              onPress={() => router.push('/create-hangout')}
            />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('tables.showList')}
            onPress={() => setListOpen(true)}
            style={({ pressed }) => [styles.listButton, pressed && styles.roundButtonPressed]}>
            <GlossyFill />
            <Icon name="list" size={22} color={Colors.text} />
          </Pressable>
        </View>
      </View>

      <MapSearchResults
        visible={search.active}
        searching={search.searching}
        results={search.results}
        top={Math.max(topHeight - Spacing.lg, insets.top + 100)}
        onPick={handleSearchPick}
        onClose={search.clear}
      />

      <SlideUpPanel open={listOpen} onClose={() => setListOpen(false)}>
        <ListPanel
          meetups={visibleMeetups}
          meetupsStatus={session ? meetups.status : 'ready'}
          renderMeetup={renderMeetup}
          onRefresh={async () => {
            location.refresh();
            await Promise.all([venues.pullToRefresh(), meetups.reload()]);
          }}
        />
      </SlideUpPanel>
    </View>
  );
}

function PlaceCard({
  selection,
  venue,
  tables,
  dayPlan,
  renderMeetup,
  onCreate,
  onClose,
}: {
  selection: Selection;
  venue: Venue | undefined;
  tables: OpenMeetup[];
  dayPlan: DayPlan | null;
  renderMeetup: (meetup: OpenMeetup) => React.ReactNode;
  onCreate: () => void;
  onClose: () => void;
}) {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  const language = currentLanguage();
  const hangouts = selection.type === 'hangouts';
  const first = tables[0];
  const name = venue
    ? localized(venue, 'name', language)
    : selection.type === 'place'
      ? placeName(selection.place, language)
      : first
        ? meetupPlaceName(first, language)
        : '';
  const mapsTarget =
    selection.type === 'place'
      ? { lat: selection.place.lat, lng: selection.place.lng, name }
      : venue
        ? { lat: venue.lat, lng: venue.lng, name }
        : first && first.place_lat !== null && first.place_lng !== null
          ? { lat: first.place_lat, lng: first.place_lng, name }
          : null;

  return (
    <View style={styles.placeCard}>
      <GlossyFill />
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
                  {promotion.starts_at
                    ? ` · ${formatWhen(promotion.starts_at, t)}`
                    : promotion.kind === 'ticket'
                      ? ` · ${t('hangouts.anyMember')}`
                      : promotion.kind === 'free_entry'
                        ? ''
                        : ` · ${t('home.groupRule')}`}
                </Text>
              </View>
            </View>
          ))}
        </View>
      ) : hangouts ? null : (
        <Text style={styles.placeNote}>{t('tables.noDealHere')}</Text>
      )}

      {dayPlan && (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/plan/[id]', params: { id: dayPlan.id } })}
          style={({ pressed }) => [styles.planRow, pressed && styles.roundButtonPressed]}>
          <Icon name="route" size={20} color={Colors.violet} />
          <View style={styles.promoBody}>
            <Text style={styles.promoTitle}>
              {t('plan.dayPlan')} · {t('plan.stops', { count: dayPlan.stops.length })}
            </Text>
            <Text style={styles.promoMeta} numberOfLines={2}>
              {dayPlan.stops.map((stop, index) => `${index + 1} ${stopName(stop, language)}`).join('  →  ')}
            </Text>
          </View>
        </Pressable>
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
          {hangouts ? (
            <Button
              title={t('hangouts.createHangout')}
              variant="violet"
              icon={<Icon name="hangout" size={20} color={Colors.white} />}
              onPress={onCreate}
            />
          ) : (
            <Button
              title={t('tables.createHere')}
              icon={<Icon name="add" size={20} color={Colors.onBrand} />}
              onPress={onCreate}
            />
          )}
        </View>
        {mapsTarget && (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={t('tables.openInMaps')}
            onPress={() => Linking.openURL(directionsUrl(mapsTarget))}
            style={({ pressed }) => [styles.listButton, pressed && styles.roundButtonPressed]}>
            <GlossyFill />
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
  onRefresh,
}: {
  meetups: OpenMeetup[];
  meetupsStatus: 'loading' | 'ready' | 'error';
  renderMeetup: (meetup: OpenMeetup) => React.ReactNode;
  onRefresh: () => Promise<void>;
}) {
  const styles = useStyles();
  const Colors = useColors();
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
        <ActivityIndicator color={Colors.accent} style={styles.cardsSpinner} />
      ) : meetups.length === 0 ? (
        <View style={styles.emptyCard}>
          <GlossyFill />
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

    </ScrollView>
  );
}

const useStyles = makeStyles((Colors) => ({
  root: { flex: 1, backgroundColor: Colors.bg },
  top: { position: 'absolute', top: 0, left: 0, right: 0, paddingBottom: Spacing.xl },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
  },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  brand: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  profileButton: {
    width: 40,
    height: 40,
    overflow: 'hidden',
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.violetTint,
    borderWidth: 2,
    borderColor: Colors.violet,
    ...RaisedSmall,
  },
  profileInitial: { ...Type.heading, fontWeight: '800', color: Colors.text },
  roundButton: {
    width: 40,
    height: 40,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
    overflow: 'hidden',
    ...RaisedSmall,
  },
  roundButtonPressed: { opacity: 0.7 },
  // New message requests waiting on the Travellers button.
  countBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 4,
    borderRadius: 10,
    backgroundColor: Colors.pink,
    borderWidth: 2,
    borderColor: Colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadgeText: { fontSize: 11, lineHeight: 13, fontWeight: '800', color: Colors.white },
  dot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.pink,
    borderWidth: 2,
    borderColor: Colors.bg,
  },
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
  search: { marginTop: Spacing.md },
  chips: { marginTop: Spacing.md, gap: Spacing.sm },
  tip: { ...Type.small, color: Colors.glow, marginTop: Spacing.xs },
  placeCard: {
    marginHorizontal: Spacing.lg,
    padding: Spacing.md,
    gap: Spacing.md,
    borderRadius: Radius.lg,
    backgroundColor: Colors.overlay,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    ...Raised,
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
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.sm,
    borderRadius: Radius.md,
    backgroundColor: Colors.violetTint,
    borderWidth: 1,
    borderColor: Colors.violet,
  },
  planPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    alignSelf: 'flex-start',
    marginLeft: Spacing.lg,
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.md,
    minHeight: 36,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    ...RaisedSmall,
  },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, gap: Spacing.md },
  cards: { gap: Spacing.md, paddingHorizontal: Spacing.lg },
  cardsSpinner: { marginVertical: Spacing.lg },
  actions: { flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.lg },
  createButton: { flex: 1 },
  // Square icon button (List, Open in Maps) next to the wide action buttons.
  listButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    minWidth: 52,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    overflow: 'hidden',
    ...RaisedSmall,
  },
  sheetContent: { padding: Spacing.lg, paddingBottom: Spacing.xxl * 2 },
  sectionTitle: { ...Type.heading, color: Colors.text, marginBottom: Spacing.md },
  sectionSpacing: { marginTop: Spacing.xl },
  list: { gap: Spacing.md },
  emptyCard: {
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    backgroundColor: Colors.overlay,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.xs,
    overflow: 'hidden',
    ...Raised,
  },
  emptyTitle: { ...Type.heading, color: Colors.text },
  emptyBody: { ...Type.body, color: Colors.textSecondary },
  retry: { marginTop: Spacing.md },
}));
