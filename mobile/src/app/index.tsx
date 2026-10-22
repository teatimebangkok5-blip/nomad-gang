import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FavoriteButton } from '@/components/favorite-button';
import { GlossyFill, ToneFill } from '@/components/glossy';
import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { Icon, type IconName } from '@/components/icon';
import { LanguageToggle } from '@/components/language-toggle';
import { LevelBadge } from '@/components/level-badge';
import { Logo } from '@/components/logo';
import { MeetupCard } from '@/components/meetup-card';
import { PlaceTips } from '@/components/place-tips';
import { stopName } from '@/components/plan-timeline';
import { MapSearchBar, MapSearchResults } from '@/components/map-search';
import { PROMOTION_ICON } from '@/components/promo-filter';
import { RoundButton } from '@/components/round-button';
import { SlideUpPanel } from '@/components/slide-up-panel';
import { VenueMap, type MapFocus, type MapPin } from '@/components/venue-map';
import { AREA_ZOOM, PLACE_ZOOM, useMapSearch, type SearchResult } from '@/lib/map-search';
import { avatarColor, Radius, Raised, Spacing, Type } from '@/constants/theme';
import { localized, useLanguage } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { formatWhen } from '@/lib/bangkok-time';
import { FEED_FILTERS, matchesFilter, type FeedFilter } from '@/lib/feed';
import type { FavoriteTarget } from '@/lib/favorites';
import { isSafeLink, openLink } from '@/lib/links';
import { BANGKOK_CENTER, distanceMeters, useCurrentLocation } from '@/lib/location';
import { directionsUrl, meetupCoords, meetupLocationKey, useOpenMeetups, type OpenMeetup } from '@/lib/meetups';
import { PLACE_ICON_COLORS, placeCategory, placeIcon, placeName, usePlacesInView, type Place } from '@/lib/places';
import { skipLogin } from '@/lib/preview';
import { venuePhotoUrl } from '@/lib/supabase';
import { isHangoutVenue, useVenues, type Venue } from '@/lib/venues';
import { profilePhotoUrl } from '@/lib/photos';
import { usePlansForMeetups, type DayPlan } from '@/lib/plans';
import { useUserLevels } from '@/lib/levels';
import { useChats } from '@/lib/messages';
import { useNotifications } from '@/lib/notifications';
import { useMyName } from '@/lib/profiles';
import { onAppReopened, showLaunchAd, showOpenAd } from '@/lib/ads';
import { usePlus } from '@/lib/plus';
import { clearMyExpiredStories, groupStories, useStories } from '@/lib/stories';
import { makeStyles, useColors } from '@/lib/theme';

// What's open over the map: the place sheet for a partner venue or any Bangkok food place (OpenStreetMap) someone
// tapped, or the pop-up cards of the tables / hangouts at one pin.
type Selection = { type: 'venue'; venueId: string } | { type: 'place'; place: Place } | { type: 'pin'; key: string };

// Home: a full-screen map of the open tables (👥) and hangouts (🙌) people created, plus food place icons (partner
// venues and their Discount/Offer/Event/Party buttons are on the Create table map). My profile, the logo,
// language, Travellers, the bell, Settings, the search bar and a row of Plan my day + feed filters float on top;
// List and Messages, the pop-up card of a tapped pin, and "Create table" / "Create hangout" float at the bottom.
// The List shows tables and hangouts within this distance.
const NEARBY_METERS = 50_000;

export default function HomeScreen() {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { session } = useAuth();
  const venues = useVenues();
  const meetups = useOpenMeetups(Boolean(session));
  // Chats with unread messages (private, group, table and hangout chats; message requests too).
  const { unreadChats } = useChats(Boolean(session));
  const location = useCurrentLocation();
  const [selection, setSelection] = useState<Selection | null>(null);
  const { places: mapPlaces, dots: placeDots, dotsMinZoom, onBoundsChange } = usePlacesInView();
  const [listOpen, setListOpen] = useState(false);
  const [topHeight, setTopHeight] = useState(0);
  const [bottomHeight, setBottomHeight] = useState(0);

  const coords = location.state.status === 'granted' ? location.state.coords : null;
  const venueById = new Map(venues.venues.map((venue) => [venue.id, venue]));
  const diningVenueIds = new Set(venues.venues.filter((venue) => !isHangoutVenue(venue)).map((venue) => venue.id));
  // Partner venues live on the Create table map, so home search finds places and areas only.
  const search = useMapSearch('food', [], { near: coords });
  const me = useMyName(session?.user.id);
  const notifications = useNotifications(Boolean(session), coords);
  const [focus, setFocus] = useState<MapFocus | null>(null);
  // Feed filters (Today, Tonight, Food, Drinks, Explore, Budget-friendly) apply to the pins and the List.
  const [filter, setFilter] = useState<FeedFilter>('all');
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const visibleMeetups = meetups.meetups.filter((meetup) =>
    matchesFilter(meetup, filter, meetup.venue_id ? venueById.get(meetup.venue_id) : undefined, now),
  );
  // Hangouts can be anywhere in the world: the map pins them all, but the List only shows the ones near me (or near
  // central Bangkok without my location).
  const listCenter = coords ?? BANGKOK_CENTER;
  const nearbyMeetups = visibleMeetups.filter((meetup) => {
    const at = meetupCoords(meetup, venueById);
    return !at || distanceMeters(listCenter, at) <= NEARBY_METERS;
  });

  // Tables share a 👥 pin per venue or place (partner venues themselves aren't pinned on home), hangouts share a 🙌
  // pin per place or spot, pit-stops a ⚡ pin, events a 🎟️ pin. Pin keys: v:<venue id>, p:<place id>,
  // h:<location key>, k:<location key>, e:<location key>.
  const pinGroups = new Map<string, OpenMeetup[]>();
  for (const meetup of visibleMeetups) {
    const key = meetup.kind === 'event'
      ? `e:${meetupLocationKey(meetup)}`
      : meetup.pitstop
      ? `k:${meetupLocationKey(meetup)}`
      : meetup.venue_id && diningVenueIds.has(meetup.venue_id)
        ? `v:${meetup.venue_id}`
        : meetup.kind === 'hangout'
          ? `h:${meetupLocationKey(meetup)}`
          : meetup.place_id
            ? `p:${meetup.place_id}`
            : null;
    if (key) pinGroups.set(key, [...(pinGroups.get(key) ?? []), meetup]);
  }
  const selectedPinKey = selection?.type === 'pin' ? selection.key : null;
  const popMeetups = selectedPinKey ? (pinGroups.get(selectedPinKey) ?? []) : [];
  // Hangouts made from a day plan: tapping their pin draws the plan's route.
  const dayPlans = usePlansForMeetups(visibleMeetups.filter((meetup) => meetup.kind === 'hangout').map((meetup) => meetup.id));
  const selectedPlan = popMeetups.map((meetup) => dayPlans.get(meetup.id)).find((plan) => plan) ?? null;
  const plus = usePlus();
  const plusMember = plus.status === 'ready' && plus.member;
  const plusUnlocked = plus.status === 'ready' && plus.unlocked;
  // App open ad (people without Plus): when the app starts, and whenever it comes back to home after a while in the
  // background (src/lib/ads.ts). Google's close button returns to home.
  const homeFocused = useRef(false);
  useFocusEffect(
    useCallback(() => {
      homeFocused.current = true;
      return () => {
        homeFocused.current = false;
      };
    }, []),
  );
  useEffect(() => {
    if (!session || plus.status !== 'ready' || plusMember) return;
    showLaunchAd(false);
    return onAppReopened(() => {
      if (homeFocused.current) showOpenAd(false);
    });
  }, [session, plus.status, plusMember]);

  // Stories: one pin per person (their profile picture in a brand ring) at their latest story. Key s:<user id>.
  const { stories } = useStories(!!session);
  useEffect(() => {
    if (session) clearMyExpiredStories();
  }, [session]);
  const storyGroups = groupStories(stories ?? []);
  const storyLevels = useUserLevels(storyGroups.map((group) => group.userId));
  const storyPins: MapPin[] = storyGroups.map((group) => ({
    key: `s:${group.userId}`,
    lat: group.lat,
    lng: group.lng,
    emoji: initialsOf(group.name) || '📸',
    tone: 'story',
    image: group.avatarPath ? profilePhotoUrl(group.avatarPath) : null,
    count: group.stories.length > 1 ? group.stories.length : undefined,
    level: storyLevels.get(group.userId) ?? null,
    accessibilityLabel:
      group.userId === session?.user.id ? t('stories.pinLabelMine') : t('stories.pinLabel', { name: group.name }),
  }));

  const pins: MapPin[] = [...pinGroups].flatMap(([key, list]) => {
    const at = meetupCoords(list[0], venueById);
    if (!at) return [];
    const hangouts = key.startsWith('h:');
    const pitstops = key.startsWith('k:');
    const events = key.startsWith('e:');
    return [
      {
        key,
        ...at,
        emoji: events ? '🎟️' : pitstops ? '⚡' : hangouts ? '🙌' : '👥',
        tone: events ? ('event' as const) : pitstops ? ('amber' as const) : hangouts ? ('violet' as const) : ('orange' as const),
        count: list.reduce((sum, meetup) => sum + meetup.member_count, 0),
        selected: key === selectedPinKey,
      },
    ];
  });

  const sheetOpen = selection?.type === 'venue' || selection?.type === 'place';
  const cardWidth = Math.min(width - Spacing.md * 2 - Spacing.xl, 420);

  // The Android back button closes the place sheet or the pop-up first.
  useEffect(() => {
    if (!selection) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setSelection(null);
      return true;
    });
    return () => sub.remove();
  }, [selection]);

  // Search result: move the map there and open its sheet (areas just move the map).
  function handleSearchPick(result: SearchResult) {
    search.clear();
    if (result.type === 'venue') {
      setSelection({ type: 'venue', venueId: result.venue.id });
      setFocus({ lat: result.venue.lat, lng: result.venue.lng, zoom: PLACE_ZOOM, seq: Date.now() });
    } else if (result.type === 'place') {
      setSelection({ type: 'place', place: result.place });
      setFocus({ lat: result.place.lat, lng: result.place.lng, zoom: PLACE_ZOOM, seq: Date.now() });
    } else if (result.type === 'world') {
      setSelection(null);
      setFocus({ lat: result.world.lat, lng: result.world.lng, zoom: result.world.zoom, seq: Date.now() });
    } else {
      setSelection(null);
      setFocus({ lat: result.area.lat, lng: result.area.lng, zoom: AREA_ZOOM[result.area.kind], seq: Date.now() });
    }
  }

  // Tap on a place dot: a place linked to a partner venue opens as that venue.
  function handlePlacePress(place: Place) {
    const venue = venues.venues.find((v) => v.place_id === place.id);
    setSelection(venue ? { type: 'venue', venueId: venue.id } : { type: 'place', place });
  }

  const openTable = (meetup: OpenMeetup) => router.push({ pathname: '/table/[id]', params: { id: meetup.id } });
  // Plan my day, Hidden Gems and the Passport are for Plus members: others see the Plus page.
  const openPlus = (path: '/plan-day' | '/gems' | '/passport') => router.push(plusUnlocked ? path : '/plus');

  const renderMeetup = (meetup: OpenMeetup, compact = true) => (
    <MeetupCard
      meetup={meetup}
      compact={compact}
      venue={meetup.venue_id ? venueById.get(meetup.venue_id) : undefined}
      onPress={() => openTable(meetup)}
    />
  );

  const myInitials = me?.name
    ? me.name
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part.slice(0, 1).toUpperCase())
        .join('')
    : null;

  return (
    <View style={styles.root}>
      <VenueMap
        fullScreen
        pins={[...storyPins, ...pins]}
        userCoords={coords}
        onPinPress={(key) =>
          key.startsWith('s:')
            ? router.push({ pathname: '/story/[userId]', params: { userId: key.slice(2) } })
            : setSelection((current) => (current?.type === 'pin' && current.key === key ? null : { type: 'pin', key }))
        }
        onMapPress={() => selection?.type === 'pin' && setSelection(null)}
        places={mapPlaces}
        placeDots={placeDots}
        dotsMinZoom={dotsMinZoom}
        onPlacePress={handlePlacePress}
        onBoundsChange={onBoundsChange}
        mapPadding={{ top: topHeight, right: 0, bottom: bottomHeight, left: 0 }}
        focus={focus}
        route={selectedPlan?.stops}
        routeStops={selectedPlan?.stops.map((stop, index) => ({ lat: stop.lat, lng: stop.lng, label: String(index + 1) }))}
      />

      {sheetOpen ? (
        <PlaceSheet
          selection={selection}
          venue={selection.type === 'venue' ? venueById.get(selection.venueId) : undefined}
          meetups={meetups.meetups.filter((meetup) =>
            selection.type === 'venue'
              ? meetup.venue_id === selection.venueId
              : !meetup.venue_id && meetup.place_id === selection.place.id,
          )}
          renderMeetup={(meetup) => renderMeetup(meetup, false)}
          onClose={() => setSelection(null)}
        />
      ) : (
        <>
          {/* Top: profile, logo, header buttons, search, Plan my day + filters, over a fade. */}
          <View style={styles.top} pointerEvents="box-none" onLayout={(e) => setTopHeight(e.nativeEvent.layout.height)}>
            <LinearGradient colors={Colors.fade} locations={[0, 0.55, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />
            <View style={[styles.topBar, { paddingTop: insets.top + 6 }]}>
              {/* My profile, top left: photo or initials in the brand ring, my level on its corner. */}
              <View style={styles.profileWrap}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('profile.myProfile')}
                  hitSlop={6}
                  disabled={!session}
                  onPress={() => session && router.push({ pathname: '/profile/[userId]', params: { userId: session.user.id } })}
                  style={({ pressed }) => [styles.profileRing, pressed && styles.pressed]}>
                  <ToneFill tone="brand" shine={false} />
                  <View
                    style={[styles.profileInner, { backgroundColor: session ? avatarColor(session.user.id) : Colors.surfaceRaised }]}>
                    {me?.avatarPath ? (
                      <Image source={profilePhotoUrl(me.avatarPath)} style={StyleSheet.absoluteFill} contentFit="cover" />
                    ) : myInitials ? (
                      <Text style={styles.profileInitials}>{myInitials}</Text>
                    ) : (
                      <Icon name="person" size={20} color={Colors.onBrand} />
                    )}
                  </View>
                </Pressable>
                {session && <LevelBadge userId={session.user.id} size={44} />}
              </View>
              <View style={styles.logo}>
                <Logo size={21} />
              </View>
              <LanguageToggle />
              <RoundButton icon="explore" tone="violet" label={t('travellers.open')} onPress={() => router.push('/travellers')} />
              <RoundButton
                icon="notifications"
                label={
                  notifications.unreadCount > 0
                    ? t('notifications.openUnread', { count: notifications.unreadCount })
                    : t('notifications.open')
                }
                badge={notifications.unreadCount}
                onPress={() => router.push('/notifications')}
              />
              <RoundButton icon="settings" label={t('settings.open')} onPress={() => router.push('/settings')} />
            </View>

            <View style={styles.search}>
              <MapSearchBar value={search.query} onChangeText={search.setQuery} placeholder={t('search.foodPlaceholder')} />
            </View>

            {/* Plan my day, Hidden Gems and the Rewards Passport, then the feed filters. */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              <RoundButton
                size={40}
                icon="camera"
                iconColor={Colors.pinkText}
                label={t('stories.add')}
                onPress={() => router.push('/post-story')}
              />
              <RoundButton size={40} icon="route" tone="plan" star label={t('plan.open')} onPress={() => openPlus('/plan-day')} />
              <RoundButton size={40} label={t('gems.title')} onPress={() => openPlus('/gems')}>
                <Text style={styles.emojiButton}>💎</Text>
              </RoundButton>
              <RoundButton size={40} label={t('passport.title')} onPress={() => openPlus('/passport')}>
                <Text style={styles.emojiButton}>🎫</Text>
              </RoundButton>
              <View style={styles.divider} />
              {FEED_FILTERS.map((option) => (
                <Chip key={option} label={t(`feed.filters.${option}`)} selected={option === filter} onPress={() => setFilter(option)} />
              ))}
            </ScrollView>

            {skipLogin && (
              // Developer-only notice (English on purpose): reminds that this build skips sign-in.
              <Text style={styles.previewNotice}>Preview mode: sign-in is turned off</Text>
            )}

            {location.state.status === 'denied' && (
              <Pressable
                accessibilityRole="button"
                onPress={location.request}
                style={({ pressed }) => [styles.locationPill, pressed && styles.pressed]}>
                <Icon name="locationOff" size={16} color={Colors.violetText} />
                <Text style={styles.locationPillText}>
                  {location.state.canAskAgain ? t('home.locationOffTitle') : t('home.locationOpenSettings')}
                </Text>
              </Pressable>
            )}
          </View>

          {/* Bottom: List + Messages, the tapped pin's cards, Create table / Create hangout. */}
          <View
            style={[styles.bottom, { paddingBottom: insets.bottom + Spacing.lg }]}
            pointerEvents="box-none"
            onLayout={(e) => setBottomHeight(e.nativeEvent.layout.height)}>
            <LinearGradient
              colors={[Colors.fade[2], Colors.fade[1], Colors.fade[0]]}
              locations={[0, 0.4, 1]}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <View style={styles.cornerButtons} pointerEvents="box-none">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('pitstop.open')}
                onPress={() => router.push('/pitstop')}
                style={({ pressed }) => [styles.pitstopButton, pressed && styles.pressed]}>
                <LinearGradient
                  colors={['#FFE07A', '#FFB800', '#F59300']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
                <Icon name="bolt" size={22} color="#3A2300" />
                <Text style={styles.pitstopText}>{t('pitstop.button')}</Text>
              </Pressable>
              <RoundButton size={52} icon="listBulleted" label={t('tables.showList')} onPress={() => setListOpen(true)} />
              <RoundButton
                size={52}
                icon="chatBubble"
                label={unreadChats > 0 ? t('messages.openUnread', { count: unreadChats }) : t('messages.open')}
                badge={unreadChats}
                onPress={() => router.push('/messages')}
              />
            </View>

            {popMeetups.length > 0 && (
              <View style={styles.pop}>
                {popMeetups.length === 1 ? (
                  <View style={styles.popSingle}>{renderMeetup(popMeetups[0])}</View>
                ) : (
                  <FlatList
                    horizontal
                    data={popMeetups}
                    keyExtractor={(meetup) => meetup.id}
                    renderItem={({ item }) => <View style={{ width: cardWidth }}>{renderMeetup(item)}</View>}
                    showsHorizontalScrollIndicator={false}
                    snapToInterval={cardWidth + Spacing.md - 2}
                    decelerationRate="fast"
                    contentContainerStyle={styles.popRow}
                  />
                )}
                {selectedPlan && <PlanRow plan={selectedPlan} />}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('common.close')}
                  hitSlop={8}
                  onPress={() => setSelection(null)}
                  style={({ pressed }) => [styles.grabber, pressed && styles.pressed]}>
                  <GlossyFill />
                  <View style={styles.grabberBar} />
                </Pressable>
              </View>
            )}

            <View style={styles.actions}>
              <View style={styles.flex}>
                <Button
                  compact
                  title={t('tables.createTable')}
                  icon={<Icon name="addCircle" size={22} color={Colors.onBrand} />}
                  onPress={() => router.push('/create-table')}
                />
              </View>
              <View style={styles.flex}>
                <Button
                  compact
                  variant="violet"
                  title={t('hangouts.createHangout')}
                  icon={<Icon name="addCircle" size={22} color={Colors.white} />}
                  onPress={() => router.push('/create-hangout')}
                />
              </View>
            </View>
          </View>

          <MapSearchResults
            visible={search.active}
            searching={search.searching}
            results={search.results}
            top={Math.max(topHeight - Spacing.xxl * 2, insets.top + 100)}
            onPick={handleSearchPick}
            onClose={search.clear}
          />
        </>
      )}

      <SlideUpPanel
        open={listOpen}
        onClose={() => setListOpen(false)}
        title={t('home.openNearby')}
        subtitle={session && meetups.status === 'ready' ? t('home.openNearbySub', { count: nearbyMeetups.length }) : undefined}>
        <ListPanel
          filter={filter}
          onFilter={setFilter}
          meetups={nearbyMeetups}
          meetupsStatus={session ? meetups.status : 'ready'}
          renderMeetup={(meetup) => renderMeetup(meetup)}
          onRefresh={async () => {
            location.refresh();
            await Promise.all([venues.pullToRefresh(), meetups.reload()]);
          }}
        />
      </SlideUpPanel>
    </View>
  );
}

// "Somchai Jaidee" -> "SJ" (a story pin without a profile picture).
function initialsOf(name: string): string {
  return name
    .split(/s+/)
    .slice(0, 2)
    .map((part) => part.slice(0, 1).toUpperCase())
    .join('');
}

// A day hangout's plan under its pop-up card: tap to open the plan.
function PlanRow({ plan }: { plan: DayPlan }) {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  const language = useLanguage();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/plan/[id]', params: { id: plan.id } })}
      style={({ pressed }) => [styles.planRow, pressed && styles.pressed]}>
      <GlossyFill />
      <Icon name="route" size={20} color={Colors.violetText} />
      <View style={styles.flex}>
        <Text style={styles.planTitle}>
          {t('plan.dayPlan')} · {t('plan.stops', { count: plan.stops.length })}
        </Text>
        <Text style={styles.planStops} numberOfLines={1}>
          {plan.stops.map((stop, index) => `${index + 1} ${stopName(stop, language)}`).join('  →  ')}
        </Text>
      </View>
    </Pressable>
  );
}

// The place sheet over the map: photo (partner venues), name and type, Open in Maps / website, partner offers,
// what's happening there, "Create table here" and the heart.
function PlaceSheet({
  selection,
  venue,
  meetups,
  renderMeetup,
  onClose,
}: {
  selection: { type: 'venue'; venueId: string } | { type: 'place'; place: Place };
  venue: Venue | undefined;
  meetups: OpenMeetup[];
  renderMeetup: (meetup: OpenMeetup) => React.ReactNode;
  onClose: () => void;
}) {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const language = useLanguage();
  const place = selection.type === 'place' ? selection.place : null;
  const name = venue ? localized(venue, 'name', language) : place ? placeName(place, language) : '';
  const category = venue ? venue.category : placeCategory(place?.kind ?? 'restaurant');
  const iconColor = venue ? '#FE593B' : PLACE_ICON_COLORS[placeIcon(place?.kind ?? 'restaurant')];
  const target = venue ?? place;
  const website = place && isSafeLink(place.website) ? place.website : null;
  const hangoutVenue = venue ? isHangoutVenue(venue) : false;
  const favorite: FavoriteTarget | null = venue ? { venueId: venue.id } : place && !place.world ? { placeId: place.id } : null;

  function create() {
    if (venue) {
      router.push({ pathname: hangoutVenue ? '/create-hangout' : '/create-table', params: { venueId: venue.id } });
    } else if (place) {
      router.push({ pathname: '/create-table', params: { placeId: place.id } });
    }
  }

  return (
    <>
      <LinearGradient
        colors={Colors.fade}
        locations={[0, 0.55, 1]}
        style={[styles.sheetFade, { height: insets.top + 110 }]}
        pointerEvents="none"
      />
      <View style={[styles.sheetBack, { top: insets.top + 6 }]}>
        <RoundButton icon="back" label={t('common.back')} onPress={onClose} />
      </View>
      <View style={[styles.sheet, { top: insets.top + 150 }]}>
        <View style={styles.sheetHandle} />
        <ScrollView contentContainerStyle={styles.sheetContent}>
          {venue?.photo_path ? (
            <Image source={venuePhotoUrl(venue.photo_path)} style={styles.sheetPhoto} contentFit="cover" />
          ) : null}

          <View style={styles.sheetTitleRow}>
            <View style={[styles.placeBall, { backgroundColor: iconColor }]}>
              <Icon name={category} size={22} color={Colors.white} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.sheetName}>{name}</Text>
              <Text style={styles.sheetType}>
                {t(`category.${category}`)}
                {(venue?.entry ?? place?.entry) ? (
                  <Text style={styles.okText}>
                    {'  ·  '}
                    {(venue?.entry ?? place?.entry) === 'ticket' ? t('promoFilter.ticket') : t('promoFilter.free_entry')}
                  </Text>
                ) : null}
              </Text>
            </View>
            {venue && (
              <View style={styles.partnerBadge}>
                <ToneFill tone="brand" shine={false} />
                <Icon name="verified" size={16} color={Colors.onBrand} />
                <Text style={styles.partnerText}>{t('home.partner')}</Text>
              </View>
            )}
          </View>
          {venue && (venue.address_en || venue.address_th) ? (
            <Text style={styles.sheetBody}>{localized(venue, 'address', language)}</Text>
          ) : null}

          <View style={styles.linkRow}>
            {target && (
              <LinkChip
                icon="map"
                label={t('tables.openInMaps')}
                onPress={() => Linking.openURL(directionsUrl({ lat: target.lat, lng: target.lng, name }))}
              />
            )}
            {website && <LinkChip icon="language" label={t('hangouts.officialWebsite')} onPress={() => openLink(website)} />}
          </View>

          {venue && venue.promotions.length > 0 ? (
            <>
              <Text style={styles.sheetSection}>{t('home.partnerOffers')}</Text>
              <View style={styles.promoGrid}>
                {venue.promotions.map((promotion) => {
                  const violet = promotion.kind === 'event' || promotion.kind === 'party';
                  return (
                    <View key={promotion.id} style={[styles.promoBox, violet ? styles.promoViolet : styles.promoOrange]}>
                      <View style={styles.promoKind}>
                        <Icon
                          name={PROMOTION_ICON[promotion.kind]}
                          size={16}
                          color={violet ? Colors.violetText : Colors.accent}
                        />
                        <Text style={[styles.promoKindText, { color: violet ? Colors.violetText : Colors.accent }]}>
                          {t(`promo.${promotion.kind}`)}
                        </Text>
                      </View>
                      <Text style={styles.promoTitle}>{localized(promotion, 'title', language)}</Text>
                      <Text style={styles.promoMeta} numberOfLines={2}>
                        {promotion.starts_at
                          ? formatWhen(promotion.starts_at, t)
                          : promotion.kind === 'ticket'
                            ? t('hangouts.anyMember')
                            : promotion.kind === 'free_entry'
                              ? ''
                              : t('home.groupRule')}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </>
          ) : hangoutVenue ? null : (
            <Text style={styles.sheetBody}>{t('tables.noDealHere')}</Text>
          )}

          {favorite && (
            <View style={styles.tipsSpace}>
              <PlaceTips target={favorite} />
            </View>
          )}

          {meetups.length > 0 && (
            <>
              <Text style={styles.sheetSection}>{t('home.happeningHere')}</Text>
              {meetups.map((meetup) => (
                <View key={meetup.id}>{renderMeetup(meetup)}</View>
              ))}
            </>
          )}
        </ScrollView>

        <View style={[styles.sheetBar, { paddingBottom: insets.bottom + Spacing.lg }]}>
          <View style={styles.flex}>
            {hangoutVenue ? (
              <Button
                title={t('hangouts.createHangout')}
                variant="violet"
                icon={<Icon name="addCircle" size={22} color={Colors.white} />}
                onPress={create}
              />
            ) : (
              <Button
                title={t('tables.createHere')}
                icon={<Icon name="addCircle" size={22} color={Colors.onBrand} />}
                onPress={create}
              />
            )}
          </View>
          {favorite && <FavoriteButton target={favorite} size={56} />}
        </View>
      </View>
    </>
  );
}

function LinkChip({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const styles = useStyles();
  const Colors = useColors();
  return (
    <Pressable accessibilityRole="link" onPress={onPress} style={({ pressed }) => [styles.linkChip, pressed && styles.pressed]}>
      <GlossyFill />
      <Icon name={icon} size={18} color={Colors.text} />
      <Text style={styles.linkChipText}>{label}</Text>
    </Pressable>
  );
}

function ListPanel({
  filter,
  onFilter,
  meetups,
  meetupsStatus,
  renderMeetup,
  onRefresh,
}: {
  filter: FeedFilter;
  onFilter: (filter: FeedFilter) => void;
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
      contentContainerStyle={styles.listContent}
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
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.listFiltersOuter}
        contentContainerStyle={styles.listFilters}>
        {FEED_FILTERS.map((option) => (
          <Chip key={option} label={t(`feed.filters.${option}`)} selected={option === filter} onPress={() => onFilter(option)} />
        ))}
      </ScrollView>
      {meetupsStatus === 'loading' ? (
        <ActivityIndicator color={Colors.accent} style={styles.spinner} />
      ) : meetups.length === 0 ? (
        <View style={styles.emptyCard}>
          <GlossyFill />
          <Text style={styles.emptyTitle}>
            {meetupsStatus === 'error' ? t('tables.errorLoad') : filter === 'all' ? t('tables.noTablesTitle') : t('feed.noMatch')}
          </Text>
          {meetupsStatus !== 'error' && filter === 'all' && <Text style={styles.emptyBody}>{t('tables.noTablesBody')}</Text>}
          {meetupsStatus !== 'error' && filter === 'all' && <Text style={styles.tip}>{t('tables.pickAnyPlace')}</Text>}
        </View>
      ) : (
        meetups.map((meetup) => <View key={meetup.id}>{renderMeetup(meetup)}</View>)
      )}
    </ScrollView>
  );
}

const useStyles = makeStyles((Colors) => ({
  root: { flex: 1, backgroundColor: Colors.bg },
  flex: { flex: 1 },
  pressed: { opacity: 0.75 },
  top: { position: 'absolute', top: 0, left: 0, right: 0, paddingBottom: Spacing.xl },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing.md },
  profileWrap: { width: 44, height: 44 },
  profileRing: {
    width: 44,
    height: 44,
    borderRadius: 22,
    padding: 2,
    overflow: 'hidden',
    ...Raised,
  },
  profileInner: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: Colors.bg,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileInitials: { fontSize: 14, fontWeight: '800', color: Colors.onBrand },
  logo: { flex: 1, marginLeft: 6, minWidth: 0 },
  search: { marginTop: Spacing.md - 2 },
  chipRow: { alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingTop: Spacing.md, paddingBottom: Spacing.sm },
  emojiButton: { fontSize: 18 },
  divider: { width: 1, alignSelf: 'stretch', marginVertical: 6, marginHorizontal: 2, backgroundColor: Colors.borderStrong },
  previewNotice: {
    ...Type.small,
    fontSize: 12,
    color: Colors.textSecondary,
    backgroundColor: Colors.surfaceRaised,
    marginHorizontal: Spacing.md,
    marginTop: Spacing.xs,
    paddingVertical: 2,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.pill,
    alignSelf: 'flex-start',
    overflow: 'hidden',
  },
  locationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    alignSelf: 'flex-start',
    marginLeft: Spacing.md,
    marginTop: Spacing.xs,
    paddingHorizontal: Spacing.md,
    minHeight: 36,
    borderRadius: Radius.pill,
    backgroundColor: Colors.violetTint,
  },
  locationPillText: { ...Type.label, fontSize: 13, color: Colors.text },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: Spacing.xl, gap: Spacing.sm + 2 },
  cornerButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.sm, paddingHorizontal: 14 },
  pitstopButton: {
    marginRight: 'auto',
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.lg,
    borderRadius: 26,
    overflow: 'hidden',
    elevation: 6,
    shadowColor: '#FFB800',
    shadowOpacity: 0.4,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 5 },
  },
  tipsSpace: { marginTop: Spacing.lg },
  pitstopText: { ...Type.label, fontSize: 15, fontWeight: '800', color: '#3A2300' },
  pop: { paddingTop: 14, gap: Spacing.sm },
  popSingle: { paddingHorizontal: 14 },
  popRow: { gap: Spacing.md - 2, paddingHorizontal: 14 },
  grabber: {
    position: 'absolute',
    top: 0,
    alignSelf: 'center',
    width: 64,
    height: 24,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    elevation: 8,
  },
  grabberBar: { width: 28, height: 4, borderRadius: 2, backgroundColor: Colors.borderStrong },
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginHorizontal: 14,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
    ...Raised,
  },
  planTitle: { ...Type.label, color: Colors.text },
  planStops: { ...Type.small, fontSize: 12, color: Colors.textSecondary },
  actions: { flexDirection: 'row', gap: Spacing.md - 2, paddingHorizontal: 14 },
  // Place sheet.
  sheetFade: { position: 'absolute', top: 0, left: 0, right: 0 },
  sheetBack: { position: 'absolute', left: Spacing.md },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: Radius.sheet,
    borderTopRightRadius: Radius.sheet,
    backgroundColor: Colors.overlay,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: Colors.border,
    overflow: 'hidden',
    elevation: 16,
  },
  sheetHandle: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: Colors.borderStrong,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: Spacing.sm,
  },
  sheetContent: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.lg, gap: Spacing.md },
  sheetPhoto: { height: 132, borderRadius: 20, backgroundColor: Colors.surfaceRaised },
  sheetTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md - 2 },
  placeBall: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...Raised,
  },
  sheetName: { ...Type.title, color: Colors.text },
  sheetType: { ...Type.small, fontWeight: '600', color: Colors.textSecondary },
  okText: { color: Colors.ok },
  partnerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 28,
    paddingHorizontal: Spacing.md - 2,
    borderRadius: Radius.pill,
    overflow: 'hidden',
  },
  partnerText: { fontSize: 12, fontWeight: '800', color: Colors.onBrand },
  sheetBody: { ...Type.body, fontSize: 14, color: Colors.textSecondary },
  linkRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  linkChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 40,
    paddingHorizontal: 14,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
    ...Raised,
  },
  linkChipText: { ...Type.label, color: Colors.text },
  sheetSection: { ...Type.heading, fontSize: 16, fontWeight: '800', color: Colors.text, paddingTop: Spacing.xs },
  promoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md - 2 },
  promoBox: { flexGrow: 1, flexBasis: '45%', padding: Spacing.md, borderRadius: Radius.md, gap: 6 },
  promoOrange: { backgroundColor: Colors.orangeTint },
  promoViolet: { backgroundColor: Colors.violetTint },
  promoKind: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  promoKindText: { fontSize: 12, fontWeight: '800' },
  promoTitle: { ...Type.label, color: Colors.text },
  promoMeta: { ...Type.small, fontSize: 12, color: Colors.textSecondary },
  sheetBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md - 2,
    paddingTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  // List panel.
  listContent: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xxl * 2, gap: Spacing.md },
  listFiltersOuter: { marginHorizontal: -Spacing.lg, flexGrow: 0 },
  listFilters: { gap: Spacing.sm, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.xs },
  emptyCard: {
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.xs,
    overflow: 'hidden',
    ...Raised,
  },
  emptyTitle: { ...Type.heading, color: Colors.text },
  emptyBody: { ...Type.body, color: Colors.textSecondary },
  tip: { ...Type.small, color: Colors.accent, marginTop: Spacing.xs },
  spinner: { marginVertical: Spacing.lg },
}));
