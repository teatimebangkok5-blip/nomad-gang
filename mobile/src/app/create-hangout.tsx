import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { FavoriteButton } from '@/components/favorite-button';
import { PlaceTips } from '@/components/place-tips';
import { GlossyFill } from '@/components/glossy';
import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { EventForm, type ChosenPlace, type EventDraft } from '@/components/event-form';
import { FormFooter, FormInput, FormSection, IconBadge, PlaceSummary, Stepper } from '@/components/form-parts';
import { Icon } from '@/components/icon';
import { MeetupExtras } from '@/components/meetup-extras';
import { MapHeader } from '@/components/map-header';
import { MapSearchBar, MapSearchResults } from '@/components/map-search';
import { MeetupCard } from '@/components/meetup-card';
import { PROMOTION_ICON, PromoFilter } from '@/components/promo-filter';
import { RoundButton } from '@/components/round-button';
import { ScreenHeader } from '@/components/screen-header';
import { SlideUpPanel } from '@/components/slide-up-panel';
import { VenueCard } from '@/components/venue-card';
import { CATEGORY_EMOJI, VenueMap, type MapFocus, type MapPin } from '@/components/venue-map';
import { Radius, Raised, Spacing, Type } from '@/constants/theme';
import { localized, useLanguage } from '@/i18n';
import { useAuth } from '@/lib/auth';
import {
  bangkokDay,
  deviceZone,
  formatClock,
  formatDayLabel,
  formatUtcOffset,
  formatWhenRange,
  fromBangkok,
  sameClock,
  timeSlots,
  zoneAt,
  type BangkokDay,
} from '@/lib/bangkok-time';
import { resolveMapsLink } from '@/lib/events';
import { isSafeLink, openLink, ticketLink } from '@/lib/links';
import { AREA_ZOOM, PLACE_ZOOM, useMapSearch, type SearchResult } from '@/lib/map-search';
import { distanceMeters, useCurrentLocation } from '@/lib/location';
import {
  createHangout,
  directionsUrl,
  fetchMeetup,
  meetupCoords,
  meetupLocationKey,
  meetupPlaceName,
  setMeetupDetails,
  setMeetupJoinMode,
  setMeetupVibe,
  useOpenMeetups,
  type CostLevel,
  type HangoutWhere,
  type JoinMode,
  type MeetupDetail,
  type MeetupErrorKey,
  type OpenMeetup,
  type Vibe,
} from '@/lib/meetups';
import { areaAt, setMeetupArea } from '@/lib/rewards';
import { COUPONS_ENABLED } from '@/lib/coupons';
import type { FavoriteTarget } from '@/lib/favorites';
import { entryFilter, fetchPlace, placeEmoji, placeName, usePlacesInView, type Place, type PlaceEntry } from '@/lib/places';
import {
  HANGOUT_PROMOTION_KINDS,
  isHangoutVenue,
  isHappeningNow,
  PROMOTION_EMOJI,
  useVenues,
  type PromotionKind,
  type Venue,
  type VenueDeal,
} from '@/lib/venues';
import { setMeetupChallenge } from '@/lib/passport';
import { makeStyles, useColors } from '@/lib/theme';

// Tapped on the hangout map: a partner venue, a place, a pin dropped anywhere (or set from a Google Maps link, maybe
// with the place's name), or a pin of hangouts / events at a spot.
type Selection =
  | { type: 'venue'; venueId: string }
  | { type: 'place'; place: Place }
  | { type: 'spot'; lat: number; lng: number; name?: string }
  | { type: 'group'; key: string };

// Where the new hangout or event will be (step 2).
type Chosen = ChosenPlace;
// Hangouts are never edited here, so their form never gets the event's 'current' place.
type HangoutChosen = Exclude<ChosenPlace, { type: 'current' }>;
type CreateKind = 'hangout' | 'event';

const DAYS_AHEAD = 14; // the server allows up to 14 days ahead
const MIN_PEOPLE = 2;
const MAX_PEOPLE = 30;
const MIN_DURATION = 60; // minutes; the length stepper goes up by the hour
const MAX_DURATION = 720;

// Create a hangout or an event anywhere in the world: 1) a full-screen map of places to hang out (Bangkok: temples,
// parks, malls, markets, museums, attractions from the database, partner venues with ticket discounts, free entry and
// events; elsewhere: world places from the map tiles), and open hangouts and events. Tap a place, anywhere to drop a
// pin, or paste a Google Maps link; then "Create hangout" or "Create event" (`?mode=event` lists that one first).
// 2) The hangout form below, or the event form (components/event-form.tsx).
// `?editEventId=`: the organiser edits that event; it opens on the form at its current place, and "Change" picks
// another place here.
export default function CreateHangoutScreen() {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const language = useLanguage();
  const { session } = useAuth();
  const venues = useVenues();
  const meetups = useOpenMeetups(Boolean(session));
  const location = useCurrentLocation();
  const coords = location.state.status === 'granted' ? location.state.coords : null;
  const [promo, setPromo] = useState<PromotionKind | null>(null);
  // Tickets / Free entry also filter the map's places by entry (Event / Party only filter partner venues).
  const entry = promo === 'ticket' || promo === 'free_entry' ? entryFilter(promo, language) : null;
  const venuesOnly = promo !== null && entry === null;
  const { places: mapPlaces, dots: placeDots, dotsMinZoom, onBoundsChange } = usePlacesInView('hangout', entry);
  // Opened for a venue (e.g. from a notification about its deal) or a place (from Favorites): its card shows first and
  // the map moves there.
  // From a Hidden Gem: its place or its pin, with the gem's activity as the title (straight to the form).
  const params = useLocalSearchParams<{
    venueId?: string;
    placeId?: string;
    title?: string;
    spotLat?: string;
    spotLng?: string;
    spotName?: string;
    mode?: string;
    editEventId?: string;
  }>();
  const [kind, setKind] = useState<CreateKind>(params.mode === 'event' || params.editEventId ? 'event' : 'hangout');
  // Editing an event: it, loaded once ('missing' = not found or not mine to edit), and what's typed in its form.
  const [editing, setEditing] = useState<MeetupDetail | 'loading' | 'missing' | null>(params.editEventId ? 'loading' : null);
  const [draft, setDraft] = useState<EventDraft | undefined>(undefined);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(params.venueId ? { type: 'venue', venueId: params.venueId } : null);
  const [chosen, setChosen] = useState<Chosen | null>(() =>
    params.spotLat && params.spotLng && Number.isFinite(Number(params.spotLat)) && Number.isFinite(Number(params.spotLng))
      ? { type: 'spot', lat: Number(params.spotLat), lng: Number(params.spotLng), name: params.spotName ?? '' }
      : null,
  );
  const [listOpen, setListOpen] = useState(false);
  const [topHeight, setTopHeight] = useState(0);
  const [bottomHeight, setBottomHeight] = useState(0);

  const venueById = new Map(venues.venues.map((venue) => [venue.id, venue]));
  // A venue matches a button when it has that promotion, or (Tickets / Free entry) when its entry fits.
  const venueMatches = (venue: Venue | undefined) =>
    Boolean(venue) &&
    (promo === null ||
      Boolean(venue?.promotions.some((p) => p.kind === promo)) ||
      Boolean(entry && venue?.entry && entry.includes(venue.entry)));
  const hangoutVenues = venues.venues.filter((venue) => isHangoutVenue(venue) && venueMatches(venue));
  // Search finds every hangout venue and place, whatever filter button is on.
  const search = useMapSearch('hangout', venues.venues.filter(isHangoutVenue), { near: coords });
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const paramVenue = params.venueId ? venueById.get(params.venueId) : undefined;
  const paramFocus: MapFocus | null = paramVenue ? { lat: paramVenue.lat, lng: paramVenue.lng, zoom: PLACE_ZOOM, seq: 0 } : null;
  useEffect(() => {
    if (!params.editEventId) return;
    fetchMeetup(params.editEventId).then((found) => {
      if (!found || found === 'error' || found.kind !== 'event' || found.host_id !== session?.user.id) {
        setEditing('missing');
        return;
      }
      setEditing(found);
      setChosen(currentPlaceOf(found));
    });
  }, [params.editEventId, session?.user.id]);
  useEffect(() => {
    if (!params.placeId) return;
    fetchPlace(params.placeId).then((found) => {
      if (!found) return;
      if (params.title) {
        setChosen({ type: 'place', place: found });
        return;
      }
      setSelection({ type: 'place', place: found });
      setFocus({ lat: found.lat, lng: found.lng, zoom: PLACE_ZOOM, seq: Date.now() });
    });
  }, [params.placeId, params.title]);
  const shownVenueIds = new Set(hangoutVenues.map((venue) => venue.id));
  // Hangouts and events (with a filter on, only those at venues that have that promotion).
  const hangouts = meetups.meetups.filter(
    (meetup) =>
      (meetup.kind === 'hangout' || meetup.kind === 'event') &&
      (promo === null || venueMatches(venueById.get(meetup.venue_id ?? ''))),
  );

  // Hangouts at a partner venue on this map count on its pin; all others share one 🙌 pin per place or spot.
  const hangoutsAtVenue = new Map<string, number>();
  const groups = new Map<string, OpenMeetup[]>();
  for (const hangout of hangouts) {
    if (hangout.venue_id && shownVenueIds.has(hangout.venue_id)) {
      hangoutsAtVenue.set(hangout.venue_id, (hangoutsAtVenue.get(hangout.venue_id) ?? 0) + 1);
    } else {
      const key = meetupLocationKey(hangout);
      groups.set(key, [...(groups.get(key) ?? []), hangout]);
    }
  }

  const selectedKey =
    selection?.type === 'venue'
      ? `v:${selection.venueId}`
      : selection?.type === 'group'
        ? selection.key
        : selection?.type === 'place'
          ? `p:${selection.place.id}`
          : null;

  const pins: MapPin[] = [
    ...hangoutVenues.map((venue) => {
      const shown = (promo && venue.promotions.find((p) => p.kind === promo)) || venue.promotions[0];
      return {
        key: `v:${venue.id}`,
        lat: venue.lat,
        lng: venue.lng,
        emoji: shown ? PROMOTION_EMOJI[shown.kind] : CATEGORY_EMOJI[venue.category],
        label: localized(venue, 'name', language),
        count: hangoutsAtVenue.get(venue.id),
        selected: selectedKey === `v:${venue.id}`,
      };
    }),
    ...[...groups].flatMap(([key, list]) => {
      const at = meetupCoords(list[0], venueById);
      // Only events there: a pink 🎟️ pin.
      const events = list.every((meetup) => meetup.kind === 'event');
      return at
        ? [
            {
              key: `h:${key}`,
              ...at,
              emoji: events ? '🎟️' : '🙌',
              tone: events ? ('event' as const) : ('violet' as const),
              count: list.length,
              selected: selectedKey === key,
            },
          ]
        : [];
    }),
    ...(selection?.type === 'spot'
      ? [{ key: 'spot', lat: selection.lat, lng: selection.lng, emoji: '📍', selected: true }]
      : []),
  ];

  function handlePinPress(key: string) {
    if (key === 'spot') return;
    if (key.startsWith('v:')) {
      setSelection({ type: 'venue', venueId: key.slice(2) });
      return;
    }
    const groupKey = key.slice(2);
    const first = groups.get(groupKey)?.[0];
    if (!first) return;
    if (first.venue_id) {
      setSelection({ type: 'venue', venueId: first.venue_id });
    } else if (first.place_id && first.place_name && first.place_lat !== null && first.place_lng !== null) {
      setSelection({
        type: 'place',
        place: {
          id: first.place_id,
          name: first.place_name,
          name_en: first.place_name_en,
          name_th: first.place_name_th,
          kind: '',
          lat: first.place_lat,
          lng: first.place_lng,
        },
      });
    } else {
      setSelection({ type: 'group', key: groupKey });
    }
  }

  // A place linked to a partner venue opens as that venue.
  // Search result: move the map there and open its card (areas just move the map).
  function handleSearchPick(result: SearchResult) {
    search.clear();
    if (result.type === 'venue') {
      setSelection({ type: 'venue', venueId: result.venue.id });
      setFocus({ lat: result.venue.lat, lng: result.venue.lng, zoom: PLACE_ZOOM, seq: Date.now() });
    } else if (result.type === 'place') {
      setSelection({ type: 'place', place: result.place });
      setFocus({ lat: result.place.lat, lng: result.place.lng, zoom: PLACE_ZOOM, seq: Date.now() });
    } else if (result.type === 'world') {
      // Anywhere in the world: places to hang out open their card; cities, areas and streets just move the map.
      const { world } = result;
      setSelection(world.place ? { type: 'place', place: world.place } : null);
      setFocus({ lat: world.lat, lng: world.lng, zoom: world.zoom, seq: Date.now() });
    } else {
      setSelection(null);
      setFocus({ lat: result.area.lat, lng: result.area.lng, zoom: AREA_ZOOM[result.area.kind], seq: Date.now() });
    }
  }

  function handlePlacePress(place: Place) {
    const venue = venues.venues.find((v) => v.place_id === place.id);
    setSelection(venue ? { type: 'venue', venueId: venue.id } : { type: 'place', place });
  }

  function hangoutsAt(s: Selection): OpenMeetup[] {
    if (s.type === 'venue') return hangouts.filter((m) => m.venue_id === s.venueId);
    if (s.type === 'place' && s.place.world) return groups.get(spotKey(s.place)) ?? [];
    if (s.type === 'place') return hangouts.filter((m) => !m.venue_id && m.place_id === s.place.id);
    if (s.type === 'group') return groups.get(s.key) ?? [];
    return [];
  }

  function createAt(s: Selection, what: CreateKind) {
    setKind(what);
    if (s.type === 'venue') {
      const venue = venueById.get(s.venueId);
      if (venue) setChosen({ type: 'venue', venue });
    } else if (s.type === 'place') {
      setChosen({ type: 'place', place: s.place });
    } else if (s.type === 'spot') {
      setChosen({ type: 'spot', lat: s.lat, lng: s.lng, name: s.name ?? '' });
    } else {
      const first = groups.get(s.key)?.[0];
      if (first?.place_lat != null && first.place_lng != null) {
        setChosen({ type: 'spot', lat: first.place_lat, lng: first.place_lng, name: first.place_name ?? '' });
      }
    }
  }

  const renderHangout = (meetup: OpenMeetup) => (
    <MeetupCard
      meetup={meetup}
      venue={meetup.venue_id ? venueById.get(meetup.venue_id) : undefined}
      onPress={() => router.push({ pathname: '/table/[id]', params: { id: meetup.id } })}
    />
  );

  const editEvent = editing && typeof editing === 'object' ? editing : undefined;
  if (editing === 'loading' || editing === 'missing') {
    return (
      <View style={[styles.safe, { paddingTop: insets.top }]}>
        <ScreenHeader />
        {editing === 'loading' ? (
          <ActivityIndicator color={Colors.accent} size="large" style={styles.spinner} />
        ) : (
          <Text style={[styles.emptyBody, styles.missing]}>{t('events.cantEdit')}</Text>
        )}
      </View>
    );
  }

  if (chosen) {
    // An event's own venue: its name, once venues have loaded.
    const shownChosen: ChosenPlace =
      chosen.type === 'current' && chosen.venueId && venueById.get(chosen.venueId)
        ? { ...chosen, name: localized(venueById.get(chosen.venueId)!, 'name', language) }
        : chosen;
    return kind === 'event' || shownChosen.type === 'current' ? (
      <EventForm
        chosen={shownChosen}
        draft={draft}
        edit={editEvent}
        onChange={(typed) => {
          setDraft(typed);
          setChosen(null);
        }}
      />
    ) : (
      <HangoutForm chosen={shownChosen} initialTitle={params.title} onChange={() => setChosen(null)} />
    );
  }

  // A pasted Google Maps link becomes a dropped pin (with the place's name when the link has one).
  function handleMapsLink(found: { lat: number; lng: number; name: string | null }) {
    setPasteOpen(false);
    setSelection({ type: 'spot', lat: found.lat, lng: found.lng, name: found.name ?? undefined });
    setFocus({ lat: found.lat, lng: found.lng, zoom: PLACE_ZOOM, seq: Date.now() });
  }

  const partnerList = hangoutVenues
    .map((venue) => ({ venue, distance: coords ? distanceMeters(coords, venue) : null }))
    .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));

  return (
    <View style={styles.root}>
      <VenueMap
        fullScreen
        pins={pins}
        userCoords={coords}
        onPinPress={handlePinPress}
        // Event / Party are partner-venue promotions only, so they hide the plain places.
        places={venuesOnly ? [] : mapPlaces}
        placeDots={venuesOnly ? [] : placeDots}
        dotsMinZoom={dotsMinZoom}
        onPlacePress={handlePlacePress}
        worldPlaces={promo === null}
        onMapPress={(at) => setSelection({ type: 'spot', ...at })}
        onBoundsChange={onBoundsChange}
        mapPadding={{ top: topHeight, right: 0, bottom: bottomHeight, left: 0 }}
        focus={focus ?? paramFocus}
      />

      <MapHeader
        title={t('hangouts.pickSpot')}
        hint={t('common.stepOf', { step: 1, total: 2 })}
        onHeight={setTopHeight}
        right={<RoundButton icon="listBulleted" label={t('tables.showList')} onPress={() => setListOpen(true)} />}>
        <MapSearchBar value={search.query} onChangeText={search.setQuery} placeholder={t('search.hangoutPlaceholder')} />
        <PromoFilter
          tone="violet"
          kinds={HANGOUT_PROMOTION_KINDS}
          value={promo}
          onChange={(value) => {
            setPromo(value);
            setSelection(null);
          }}
        />
      </MapHeader>

      <View
        style={[styles.bottom, { paddingBottom: insets.bottom + Spacing.lg }]}
        pointerEvents="box-none"
        onLayout={(e) => setBottomHeight(e.nativeEvent.layout.height)}>
        {selection ? (
          <SelectionCard
            selection={selection}
            venue={selection.type === 'venue' ? venueById.get(selection.venueId) : undefined}
            hangouts={hangoutsAt(selection)}
            renderHangout={renderHangout}
            first={kind}
            editingEvent={Boolean(params.editEventId)}
            onCreate={(what) => createAt(selection, what)}
            onClose={() => setSelection(null)}
          />
        ) : (
          // Nothing tapped yet: hangout or event, how to start, or set the pin from a Google Maps link.
          <View style={[styles.card, styles.hintCard, styles.inset]}>
            <GlossyFill />
            {!params.editEventId && (
            <View style={styles.kindRow}>
              <Chip
                tone="violet"
                label={`🙌 ${t('hangouts.createHangout')}`}
                selected={kind === 'hangout'}
                onPress={() => setKind('hangout')}
              />
              <Chip label={`🎟️ ${t('events.createEvent')}`} selected={kind === 'event'} onPress={() => setKind('event')} />
            </View>
            )}
            <View style={styles.hintRow}>
              <IconBadge icon="touch" />
              <View style={styles.flex}>
                <Text style={styles.cardTitle}>{kind === 'event' ? t('events.pickSpot') : t('hangouts.dropHint')}</Text>
                <Text style={styles.cardSub}>{t('events.mapHint')}</Text>
              </View>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => setPasteOpen(true)}
              style={({ pressed }) => [styles.pasteButton, pressed && styles.pressed]}>
              <Icon name="link" size={18} color={Colors.violetText} />
              <Text style={styles.pasteText}>{t('events.pasteLink')}</Text>
            </Pressable>
          </View>
        )}
      </View>

      <MapSearchResults
        visible={search.active}
        searching={search.searching}
        results={search.results}
        top={Math.max(topHeight - Spacing.xxl * 2, insets.top + 100)}
        onPick={handleSearchPick}
        onClose={search.clear}
      />

      <MapsLinkPanel open={pasteOpen} onClose={() => setPasteOpen(false)} onFound={handleMapsLink} />

      <SlideUpPanel open={listOpen} onClose={() => setListOpen(false)} title={t('hangouts.openHangouts')}>
        <ScrollView contentContainerStyle={styles.sheetContent}>
          {hangouts.length === 0 ? (
            <View style={styles.emptyCard}>
              <GlossyFill />
              <Text style={styles.emptyTitle}>{t('hangouts.noHangoutsTitle')}</Text>
              <Text style={styles.emptyBody}>{t('hangouts.noHangoutsBody')}</Text>
            </View>
          ) : (
            <View style={styles.list}>
              {hangouts.map((meetup) => (
                <View key={meetup.id}>{renderHangout(meetup)}</View>
              ))}
            </View>
          )}

          <Text style={[styles.sectionTitle, styles.sectionSpacing]}>{t('hangouts.hangoutPlaces')}</Text>
          {partnerList.length === 0 ? (
            <View style={styles.emptyCard}>
              <GlossyFill />
              <Text style={styles.emptyTitle}>{t('hangouts.noPlacesTitle')}</Text>
              <Text style={styles.emptyBody}>{t('hangouts.noPlacesBody')}</Text>
            </View>
          ) : (
            <View style={styles.list}>
              {partnerList.map(({ venue, distance }) => (
                <VenueCard
                  key={venue.id}
                  venue={venue}
                  distance={distance}
                  onPress={() => {
                    setListOpen(false);
                    setSelection({ type: 'venue', venueId: venue.id });
                  }}
                />
              ))}
            </View>
          )}
        </ScrollView>
      </SlideUpPanel>
    </View>
  );
}

// Bottom card for what was tapped: name, the venue's promotions, hangouts and events there, and "Create hangout" /
// "Create event" (`first` comes first).
function SelectionCard({
  selection,
  venue,
  hangouts,
  renderHangout,
  first,
  editingEvent = false,
  onCreate,
  onClose,
}: {
  selection: Selection;
  venue: Venue | undefined;
  hangouts: OpenMeetup[];
  renderHangout: (meetup: OpenMeetup) => React.ReactNode;
  first: CreateKind;
  // Picking a new place for an event being edited: one "Use this place" button.
  editingEvent?: boolean;
  onCreate: (what: CreateKind) => void;
  onClose: () => void;
}) {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  const language = useLanguage();
  const [showTips, setShowTips] = useState(false);

  let name = '';
  let note: string | null = null;
  let sub: string | null = null;
  let leading = <IconBadge icon="pushPin" />;
  let target: { lat: number; lng: number } | null = null;
  if (selection.type === 'venue' && venue) {
    name = localized(venue, 'name', language);
    leading = <IconBadge icon={venue.category} tone="violetBall" />;
    target = venue;
  } else if (selection.type === 'place') {
    name = placeName(selection.place, language);
    leading = <EmojiBadge emoji={placeEmoji(selection.place.kind)} />;
    note = t('hangouts.noDealHere');
    target = selection.place;
  } else if (selection.type === 'spot') {
    name = selection.name || t('hangouts.droppedPin');
    sub = `${selection.lat.toFixed(4)}, ${selection.lng.toFixed(4)}`;
    note = t('hangouts.pinnedSpotBody');
  } else if (hangouts[0]) {
    name = meetupPlaceName(hangouts[0], language);
    leading = <EmojiBadge emoji="🙌" />;
    target =
      hangouts[0].place_lat !== null && hangouts[0].place_lng !== null
        ? { lat: hangouts[0].place_lat, lng: hangouts[0].place_lng }
        : null;
  }
  // "Buy tickets" only where the founder added an official ticket link; otherwise the place's official website from
  // OpenStreetMap, if it has one. Neither for most places.
  const tickets = venue ? ticketLink(venue) : null;
  const website = !tickets && selection.type === 'place' && isSafeLink(selection.place.website) ? selection.place.website : null;
  const entry: PlaceEntry | null | undefined = venue ? venue.entry : selection.type === 'place' ? selection.place.entry : null;
  // Partner venues and Bangkok places can be saved (world places from the map tiles aren't stored).
  const favorite: FavoriteTarget | null =
    selection.type === 'venue' && venue
      ? { venueId: venue.id }
      : selection.type === 'place' && !selection.place.world
        ? { placeId: selection.place.id }
        : null;

  return (
    <View style={[styles.card, styles.placeCard, styles.inset]}>
      <GlossyFill />
      <View style={styles.placeHeader}>
        {leading}
        <View style={styles.flex}>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {name}
          </Text>
          {sub ? <Text style={styles.cardSub}>{sub}</Text> : null}
        </View>
        {favorite && <FavoriteButton target={favorite} size={36} />}
        <RoundButton size={36} icon="close" label={t('common.back')} onPress={onClose} />
      </View>

      {entry && (
        <View style={styles.entryRow}>
          <Icon name={entry === 'free' ? 'doorOpen' : 'ticket'} size={16} color={entry === 'free' ? Colors.ok : Colors.accent} />
          <Text style={[styles.entryText, entry === 'free' && { color: Colors.ok }]}>
            {entry === 'free'
              ? t('hangouts.entryFree')
              : entry === 'ticket'
                ? t('hangouts.entryTicket')
                : t('hangouts.entryFreeThai')}
          </Text>
        </View>
      )}

      {venue ? (
        venue.promotions.length > 0 ? (
          <View style={styles.promoList}>
            {venue.promotions.map((promotion) => (
              <PromotionRow key={promotion.id} promotion={promotion} />
            ))}
          </View>
        ) : (
          <Text style={styles.placeNote}>{t('hangouts.noDealHere')}</Text>
        )
      ) : note ? (
        <Text style={styles.placeNote}>{note}</Text>
      ) : null}

      {favorite &&
        (showTips ? (
          <ScrollView style={styles.tipsScroll} nestedScrollEnabled>
            <PlaceTips target={favorite} />
          </ScrollView>
        ) : (
          <Pressable accessibilityRole="button" onPress={() => setShowTips(true)} style={({ pressed }) => [styles.tipsToggle, pressed && styles.pressed]}>
            <Text style={styles.tipsToggleText}>💡 {t('tips.title')}</Text>
            <Icon name="chevronRight" size={18} color={Colors.violetText} />
          </Pressable>
        ))}

      {hangouts.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.placeHangouts}>
          {hangouts.map((meetup) => (
            <View key={meetup.id} style={styles.placeHangout}>
              {renderHangout(meetup)}
            </View>
          ))}
        </ScrollView>
      )}

      {tickets ? (
        <Button
          title={t('hangouts.buyTickets')}
          variant="secondary"
          icon={<Icon name="ticket" size={20} color={Colors.accent} />}
          onPress={() => openLink(tickets)}
        />
      ) : website ? (
        <Button
          title={t('hangouts.officialWebsite')}
          variant="secondary"
          icon={<Icon name="website" size={20} color={Colors.text} />}
          onPress={() => openLink(website)}
        />
      ) : null}

      <View style={styles.placeActions}>
        {editingEvent ? (
          <View style={styles.flex}>
            <Button
              title={t('events.useThisPlace')}
              trailingIcon={<Icon name="forward" size={20} color={Colors.white} />}
              onPress={() => onCreate('event')}
            />
          </View>
        ) : (first === 'event' ? (['event', 'hangout'] as const) : (['hangout', 'event'] as const)).map((what) => (
          <View key={what} style={styles.flex}>
            <Button
              compact
              title={what === 'event' ? t('events.createEvent') : t('hangouts.createHangout')}
              variant={what === 'event' ? 'primary' : 'violet'}
              icon={<Icon name={what === 'event' ? 'ticket' : 'addCircle'} size={20} color={Colors.white} />}
              onPress={() => onCreate(what)}
            />
          </View>
        ))}
        {target && (
          <RoundButton
            size={56}
            icon="map"
            label={t('tables.openInMaps')}
            onPress={() => target && Linking.openURL(directionsUrl({ ...target, name }))}
          />
        )}
      </View>
    </View>
  );
}

function PromotionRow({ promotion }: { promotion: VenueDeal }) {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  const language = useLanguage();
  const live = isHappeningNow(promotion);
  const meta = promotion.starts_at && promotion.ends_at
    ? formatWhenRange(promotion.starts_at, promotion.ends_at, t)
    : promotion.kind === 'ticket'
      ? t('hangouts.anyMember')
      : promotion.kind === 'discount' || promotion.kind === 'offer'
        ? t('home.groupRule')
        : null;

  return (
    <View style={styles.promoRow}>
      <Icon name={PROMOTION_ICON[promotion.kind]} size={20} color={Colors.accent} />
      <View style={styles.flex}>
        <Text style={styles.promoTitle} numberOfLines={1}>
          {localized(promotion, 'title', language)}
        </Text>
        <Text style={styles.promoMeta} numberOfLines={1}>
          {t(`promo.${promotion.kind}`)}
          {meta ? ` · ${meta}` : ''}
        </Text>
      </View>
      {live && <Text style={styles.liveBadge}>{t('hangouts.happeningNow')}</Text>}
      {isSafeLink(promotion.ticket_url) && (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`${t('hangouts.buyTickets')}: ${localized(promotion, 'title', language)}`}
          hitSlop={8}
          onPress={() => openLink(promotion.ticket_url)}
          style={({ pressed }) => [styles.rowLink, pressed && styles.pressed]}>
          <Icon name="ticket" size={16} color={Colors.accent} />
          <Text style={styles.rowLinkText}>{t('hangouts.buyTickets')}</Text>
        </Pressable>
      )}
    </View>
  );
}

// The pin key of spot hangouts at this point (as meetupLocationKey makes it).
function spotKey(at: { lat: number; lng: number }) {
  return `s:${at.lat.toFixed(5)},${at.lng.toFixed(5)}`;
}

// An event's place as it is: a spot (name and time zone kept), or its venue / place left unchanged.
function currentPlaceOf(event: MeetupDetail): ChosenPlace {
  if (!event.venue_id && !event.place_id && event.place_lat !== null && event.place_lng !== null) {
    return { type: 'spot', lat: event.place_lat, lng: event.place_lng, name: event.place_name ?? '', timeZone: event.time_zone };
  }
  return {
    type: 'current',
    venueId: event.venue_id,
    placeId: event.place_id,
    lat: event.place_lat,
    lng: event.place_lng,
    name: event.place_name ?? '',
    timeZone: event.time_zone,
  };
}

// Paste a Google Maps share link (or "lat, lng") to drop the pin there. Short links are opened to see where they lead.
function MapsLinkPanel({
  open,
  onClose,
  onFound,
}: {
  open: boolean;
  onClose: () => void;
  onFound: (found: { lat: number; lng: number; name: string | null }) => void;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [notFound, setNotFound] = useState(false);

  async function find() {
    setNotFound(false);
    setBusy(true);
    const found = await resolveMapsLink(text);
    setBusy(false);
    if (!found) {
      setNotFound(true);
      return;
    }
    setText('');
    onFound(found);
  }

  return (
    <SlideUpPanel open={open} onClose={onClose} title={t('events.pasteTitle')} subtitle={t('events.pasteHint')}>
      <View style={styles.pasteBody}>
        <FormInput
          tone="violet"
          icon="link"
          value={text}
          onChangeText={(value) => {
            setText(value);
            setNotFound(false);
          }}
          placeholder={t('events.pastePlaceholder')}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          onSubmitEditing={find}
        />
        {notFound && (
          <Text accessibilityRole="alert" style={styles.error}>
            {t('events.pasteNotFound')}
          </Text>
        )}
        <Button title={t('events.pasteFind')} variant="violet" loading={busy} disabled={!text.trim()} onPress={find} />
      </View>
    </SlideUpPanel>
  );
}

// Step 2: what, when, how long and how many people.
function HangoutForm({ chosen, initialTitle, onChange }: { chosen: HangoutChosen; initialTitle?: string; onChange: () => void }) {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  const language = useLanguage();

  // Days and times are local time at the place: Bangkok for venues and places, the pin's zone for spots and world
  // places.
  const at = chosen.type === 'venue' ? chosen.venue : chosen.type === 'place' ? chosen.place : chosen;
  const isSpot = chosen.type === 'spot' || (chosen.type === 'place' && Boolean(chosen.place.world));
  const [zone] = useState(() => (isSpot ? zoneAt(at.lat, at.lng) : 'Asia/Bangkok'));
  // The city / country, for the host's travel deals (Bangkok is set by the server).
  const outsideBangkok = !(at.lat >= 13.45 && at.lat <= 14.1 && at.lng >= 100.25 && at.lng <= 100.95);
  const [area] = useState(() => (isSpot && outsideBangkok ? areaAt(at.lat, at.lng) : Promise.resolve(null)));
  const [now] = useState(() => new Date());
  const today = bangkokDay(now, zone);
  const days = Array.from({ length: DAYS_AHEAD }, (_, i) => today + i);
  const [day, setDay] = useState<BangkokDay>(() => (timeSlots(today, now, zone).length ? today : today + 1));
  const slots = timeSlots(day, now, zone);
  // Tell people when the place's clock differs from their phone's.
  const otherZone = !sameClock(zone, deviceZone(), now);
  const [minutes, setMinutes] = useState<number | null>(null);
  const [duration, setDuration] = useState(120);
  const [maxPeople, setMaxPeople] = useState(6);
  const [title, setTitle] = useState((initialTitle ?? '').slice(0, 80));
  const [description, setDescription] = useState('');
  const [cost, setCost] = useState<CostLevel | null>(null);
  const [meetingPoint, setMeetingPoint] = useState('');
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [joinMode, setJoinMode] = useState<JoinMode>('open');
  const [vibe, setVibe] = useState<Vibe | null>(null);
  const [womenOnly, setWomenOnly] = useState(false);
  const [spotName, setSpotName] = useState(chosen.type === 'spot' ? chosen.name : '');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<MeetupErrorKey | null>(null);

  const placeLabel =
    chosen.type === 'venue'
      ? localized(chosen.venue, 'name', language)
      : chosen.type === 'place'
        ? placeName(chosen.place, language)
        : spotName.trim() || t('hangouts.droppedPin');
  const placeLeading =
    chosen.type === 'venue' ? (
      <IconBadge icon={chosen.venue.category} tone="violetBall" />
    ) : chosen.type === 'place' ? (
      <EmojiBadge emoji={placeEmoji(chosen.place.kind)} />
    ) : (
      <IconBadge icon="pushPin" tone="violetBall" />
    );
  const placeLine =
    chosen.type === 'venue'
      ? localized(chosen.venue, 'address', language) || t(`category.${chosen.venue.category}`)
      : chosen.type === 'spot'
        ? `${t('hangouts.droppedPin')} · ${chosen.lat.toFixed(4)}, ${chosen.lng.toFixed(4)}`
        : null;
  const deals = chosen.type === 'venue' ? chosen.venue.promotions : [];

  const canCreate =
    minutes !== null &&
    slots.includes(minutes) &&
    title.trim().length > 0 &&
    (chosen.type !== 'spot' || spotName.trim().length > 0) &&
    !creating;

  async function handleCreate() {
    if (minutes === null) return;
    const where: HangoutWhere =
      chosen.type === 'venue'
        ? { type: 'venue', venueId: chosen.venue.id }
        : chosen.type === 'place' && chosen.place.world
          ? { type: 'spot', lat: chosen.place.lat, lng: chosen.place.lng, name: (chosen.place.name_en || chosen.place.name).slice(0, 80), timeZone: zone }
          : chosen.type === 'place'
          ? { type: 'place', placeId: chosen.place.id }
          : { type: 'spot', lat: chosen.lat, lng: chosen.lng, name: spotName.trim(), timeZone: zone };
    setError(null);
    setCreating(true);
    const result = await createHangout({
      where,
      startsAt: fromBangkok(day, minutes, zone),
      durationMinutes: duration,
      maxPeople,
      title: title.trim(),
      description: description.trim(),
      womenOnly,
    });
    if (result.error) {
      setCreating(false);
      setError(result.error);
      return;
    }
    await Promise.all([
      setMeetupDetails(result.data, cost, meetingPoint),
      setMeetupChallenge(result.data, challengeId),
      setMeetupJoinMode(result.data, joinMode),
      setMeetupVibe(result.data, vibe),
    ]);
    setCreating(false);
    const found = await area;
    if (found) await setMeetupArea(result.data, found);
    router.replace({ pathname: '/table/[id]', params: { id: result.data } });
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScreenHeader
        title={t('hangouts.newHangout')}
        subtitle={t('common.stepOf', { step: 2, total: 2 })}
        onBack={onChange}
      />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          <PlaceSummary leading={placeLeading} name={placeLabel} line={placeLine} lineTone="muted" onChange={onChange}>
            {otherZone && (
              <View style={styles.zoneNote}>
                <Icon name="time" size={18} color={Colors.violetText} />
                <Text style={styles.zoneText}>{t('hangouts.localTime', { offset: formatUtcOffset(zone, now) })}</Text>
              </View>
            )}
          </PlaceSummary>
          {deals.length > 0 && (
            <View style={styles.promoList}>
              {deals.map((promotion) => (
                <PromotionRow key={promotion.id} promotion={promotion} />
              ))}
              {deals.some((p) => p.kind === 'ticket') && (
                <Text style={styles.hint}>{COUPONS_ENABLED ? t('hangouts.ticketNote') : t('coupon.comingSoon')}</Text>
              )}
            </View>
          )}

          <FormSection label={t('hangouts.titleLabel')} required count={`${title.length}/80`}>
            <FormInput
              tone="violet"
              highlight
              value={title}
              onChangeText={setTitle}
              placeholder={t('hangouts.titlePlaceholder')}
              maxLength={80}
            />
          </FormSection>

          <FormSection label={t('hangouts.descriptionLabel')} note={t('common.optional')} count={`${description.length}/500`}>
            <FormInput
              tone="violet"
              value={description}
              onChangeText={setDescription}
              placeholder={t('hangouts.descriptionPlaceholder')}
              maxLength={500}
              multiline
            />
          </FormSection>

          {chosen.type === 'spot' && (
            <FormSection label={t('hangouts.spotNameLabel')} required>
              <FormInput
                tone="violet"
                icon="pin"
                value={spotName}
                onChangeText={setSpotName}
                placeholder={t('hangouts.spotNamePlaceholder')}
                maxLength={80}
              />
            </FormSection>
          )}

          <FormSection label={t('tables.day')}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bleed} contentContainerStyle={styles.chipRow}>
              {days.map((option) => (
                <Chip
                  key={option}
                  tall
                  tone="violet"
                  label={formatDayLabel(option, t, now, zone)}
                  selected={option === day}
                  onPress={() => {
                    setDay(option);
                    setMinutes(null);
                  }}
                />
              ))}
            </ScrollView>
            {slots.length === 0 ? (
              <Text style={styles.hint}>{t('tables.noTimesLeft')}</Text>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bleed} contentContainerStyle={styles.chipRow}>
                {slots.map((slot) => (
                  <Chip
                    key={slot}
                    shape="tile"
                    tone="violet"
                    label={formatClock(slot)}
                    selected={slot === minutes}
                    onPress={() => setMinutes(slot)}
                  />
                ))}
              </ScrollView>
            )}
          </FormSection>

          <View style={styles.steppers}>
            <Stepper
              stacked
              tone="violet"
              label={t('hangouts.length')}
              hint="1–12"
              value={t('hangouts.durationHours', { hours: duration / 60 })}
              canDecrease={duration > MIN_DURATION}
              canIncrease={duration < MAX_DURATION}
              onDecrease={() => setDuration((d) => Math.max(MIN_DURATION, d - 60))}
              onIncrease={() => setDuration((d) => Math.min(MAX_DURATION, d + 60))}
            />
            <Stepper
              stacked
              tone="violet"
              label={t('tables.people')}
              hint={`${MIN_PEOPLE}–${MAX_PEOPLE}`}
              value={String(maxPeople)}
              canDecrease={maxPeople > MIN_PEOPLE}
              canIncrease={maxPeople < MAX_PEOPLE}
              onDecrease={() => setMaxPeople((n) => Math.max(MIN_PEOPLE, n - 1))}
              onIncrease={() => setMaxPeople((n) => Math.min(MAX_PEOPLE, n + 1))}
            />
          </View>

          <MeetupExtras
            cost={cost}
            onCost={setCost}
            meetingPoint={meetingPoint}
            onMeetingPoint={setMeetingPoint}
            challengeId={challengeId}
            onChallenge={setChallengeId}
            joinMode={joinMode}
            onJoinMode={setJoinMode}
            vibe={vibe}
            onVibe={setVibe}
            womenOnly={womenOnly}
            onWomenOnly={setWomenOnly}
            tone="violet"
          />

          {error && (
            <Text accessibilityRole="alert" style={styles.error}>
              {t(`hangouts.errors.${error}`)}
            </Text>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
      <FormFooter>
        <Button title={t('hangouts.create')} variant="violet" onPress={handleCreate} loading={creating} disabled={!canCreate} />
      </FormFooter>
    </SafeAreaView>
  );
}

// A place's emoji on a violet tint (hangout places have no icon of their own).
function EmojiBadge({ emoji }: { emoji: string }) {
  const styles = useStyles();
  return (
    <View style={styles.emojiBadge}>
      <Text style={styles.emoji}>{emoji}</Text>
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  root: { flex: 1, backgroundColor: Colors.bg },
  spinner: { marginTop: Spacing.xxl * 2 },
  missing: { textAlign: 'center', padding: Spacing.xxl },
  safe: { flex: 1, backgroundColor: Colors.bg },
  flex: { flex: 1 },
  inset: { marginHorizontal: 14 },
  pressed: { opacity: 0.7 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, gap: Spacing.md },
  card: {
    borderRadius: 24,
    backgroundColor: Colors.overlay,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    ...Raised,
  },
  hintCard: { gap: Spacing.sm, paddingVertical: 14, paddingHorizontal: Spacing.lg },
  hintRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  kindRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  pasteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    minHeight: 36,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.pill,
    backgroundColor: Colors.violetTint,
  },
  pasteText: { ...Type.label, fontSize: 13, color: Colors.violetText },
  pasteBody: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xxl, gap: Spacing.md },
  cardTitle: { ...Type.heading, fontSize: 16, fontWeight: '800', color: Colors.text },
  cardSub: { ...Type.small, fontSize: 12, color: Colors.textMuted },
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
  placeCard: { padding: Spacing.md, gap: Spacing.md },
  placeHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  placeNote: { ...Type.small, color: Colors.textSecondary },
  tipsScroll: { maxHeight: 260 },
  tipsToggle: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingVertical: 4 },
  tipsToggleText: { ...Type.label, color: Colors.violetText },
  emojiBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.violetTint,
  },
  emoji: { fontSize: 22 },
  promoList: { gap: Spacing.sm },
  promoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md - 2,
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.orangeTint,
  },
  promoTitle: { ...Type.label, color: Colors.text },
  promoMeta: { ...Type.small, fontSize: 12, color: Colors.textSecondary },
  liveBadge: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.onBrand,
    backgroundColor: Colors.pink,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.pill,
    overflow: 'hidden',
  },
  entryRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginTop: -Spacing.xs },
  entryText: { ...Type.label, fontSize: 13, color: Colors.textSecondary, flex: 1 },
  rowLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    minHeight: 32,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surface,
  },
  rowLinkText: { ...Type.label, fontSize: 13, color: Colors.accent },
  placeHangouts: { gap: Spacing.sm },
  placeHangout: { width: 300 },
  placeActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md - 2 },
  sheetContent: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xxl * 2 },
  sectionTitle: { ...Type.heading, fontWeight: '800', color: Colors.text, marginBottom: Spacing.md },
  sectionSpacing: { marginTop: Spacing.xl },
  list: { gap: Spacing.md },
  // Step 2
  form: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.xs, paddingBottom: Spacing.xl, gap: Spacing.lg },
  zoneNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: 14,
    backgroundColor: Colors.violetTint,
  },
  zoneText: { ...Type.label, fontSize: 13, color: Colors.violetText, flex: 1 },
  bleed: { marginHorizontal: -Spacing.lg },
  chipRow: { gap: Spacing.sm, paddingHorizontal: Spacing.lg, paddingVertical: 2 },
  steppers: { flexDirection: 'row', gap: Spacing.md - 2 },
  hint: { ...Type.small, color: Colors.textMuted },
  error: {
    ...Type.small,
    color: Colors.danger,
    backgroundColor: Colors.dangerBg,
    padding: Spacing.md,
    borderRadius: Radius.sm,
    overflow: 'hidden',
  },
}));
