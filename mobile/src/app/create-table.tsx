import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlossyFill } from '@/components/glossy';
import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { FormFooter, FormInput, FormSection, IconBadge, PlaceSummary, Stepper } from '@/components/form-parts';
import { Icon } from '@/components/icon';
import { COWORK_HOURS, MeetupExtras } from '@/components/meetup-extras';
import { MapHeader } from '@/components/map-header';
import { MapSearchBar, MapSearchResults } from '@/components/map-search';
import { PromoFilter } from '@/components/promo-filter';
import { RoundButton } from '@/components/round-button';
import { ScreenHeader } from '@/components/screen-header';
import { SlideUpPanel } from '@/components/slide-up-panel';
import { VenueCard } from '@/components/venue-card';
import { CATEGORY_EMOJI, VenueMap, type MapFocus } from '@/components/venue-map';
import { Radius, Raised, Spacing, Type } from '@/constants/theme';
import { localized, useLanguage } from '@/i18n';
import { bangkokDay, formatClock, formatDayLabel, fromBangkok, timeSlots, type BangkokDay } from '@/lib/bangkok-time';
import { BANGKOK_CENTER, distanceMeters, inBangkok, useCurrentLocation } from '@/lib/location';
import { AREA_ZOOM, PLACE_ZOOM, useMapSearch, type SearchResult } from '@/lib/map-search';
import {
  createMeetup,
  createMeetupAtPlace,
  createWomenOnlyTable,
  setMeetupDetails,
  setMeetupJoinMode,
  setMeetupVibe,
  type CostLevel,
  type JoinMode,
  type MeetupErrorKey,
  type Vibe,
} from '@/lib/meetups';
import { COUPONS_ENABLED } from '@/lib/coupons';
import { fetchPlace, placeCategory, placeName, usePlacesInView, type Place } from '@/lib/places';
import { venuePhotoUrl } from '@/lib/supabase';
import { isHangoutVenue, PROMOTION_EMOJI, useVenues, type PromotionKind, type Venue } from '@/lib/venues';
import { setMeetupChallenge } from '@/lib/passport';
import { makeStyles, useColors } from '@/lib/theme';

// Picked on the step-1 map: a partner venue, or any Bangkok food place (OpenStreetMap).
type Picked = { type: 'venue'; venueId: string } | { type: 'place'; place: Place };

const DAYS_AHEAD = 7; // today + 6 more days (the server allows up to 7 days ahead)
const MIN_PEOPLE = 3;
const MAX_PEOPLE = 12;

// Create a table: 1) pick a partner venue or any Bangkok food place on a full-screen map, 2) day, time, size and a
// title. Opened with ?venueId=… or ?placeId=… (from "Create table here"), step 1 is skipped.
export default function CreateTableScreen() {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const language = useLanguage();
  const venues = useVenues();
  const location = useCurrentLocation();
  const coords = location.state.status === 'granted' ? location.state.coords : null;
  const [listOpen, setListOpen] = useState(false);
  const [topHeight, setTopHeight] = useState(0);
  const [bottomHeight, setBottomHeight] = useState(0);

  const params = useLocalSearchParams<{ venueId?: string; placeId?: string }>();
  const [picked, setPicked] = useState<Picked | null>(null);
  const [venueId, setVenueId] = useState<string | null>(params.venueId ?? null);
  const [place, setPlace] = useState<Place | null>(null);
  const { places: mapPlaces, dots: placeDots, dotsMinZoom, onBoundsChange } = usePlacesInView();

  // Opened from "Create table here" on a place: load it.
  useEffect(() => {
    if (!params.placeId) return;
    fetchPlace(params.placeId).then((found) => found && setPlace(found));
  }, [params.placeId]);

  const [now] = useState(() => new Date());
  const today = bangkokDay(now);
  const days = Array.from({ length: DAYS_AHEAD }, (_, i) => today + i);
  const [day, setDay] = useState<BangkokDay>(() => (timeSlots(today, now).length ? today : today + 1));
  const slots = timeSlots(day, now);
  const [minutes, setMinutes] = useState<number | null>(null);
  const [maxPeople, setMaxPeople] = useState(6);
  const [title, setTitle] = useState('');
  const [cost, setCost] = useState<CostLevel | null>(null);
  const [meetingPoint, setMeetingPoint] = useState('');
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [joinMode, setJoinMode] = useState<JoinMode>('open');
  const [vibe, setVibe] = useState<Vibe | null>(null);
  const [hours, setHours] = useState(COWORK_HOURS.start);
  const [womenOnly, setWomenOnly] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<MeetupErrorKey | null>(null);

  // Tables are for food and drink, so hangout venues (parks, museums, …) aren't offered. The Discount / Offer /
  // Event / Party buttons show only the partner venues with that promotion.
  const [promo, setPromo] = useState<PromotionKind | null>(null);
  const places = venues.venues
    .filter((venue) => !isHangoutVenue(venue))
    .filter((venue) => promo === null || venue.promotions.some((p) => p.kind === promo))
    .map((venue) => ({ venue, distance: coords ? distanceMeters(coords, venue) : null }))
    .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));
  const search = useMapSearch('food', venues.venues.filter((venue) => !isHangoutVenue(venue)));
  const [focus, setFocus] = useState<MapFocus | null>(null);

  // Search result: move the map there and pick it (areas just move the map).
  function handleSearchPick(result: SearchResult) {
    search.clear();
    if (result.type === 'venue') {
      setPicked({ type: 'venue', venueId: result.venue.id });
      setFocus({ lat: result.venue.lat, lng: result.venue.lng, zoom: PLACE_ZOOM, seq: Date.now() });
    } else if (result.type === 'place') {
      setPicked({ type: 'place', place: result.place });
      setFocus({ lat: result.place.lat, lng: result.place.lng, zoom: PLACE_ZOOM, seq: Date.now() });
    } else if (result.type === 'area') {
      setFocus({ lat: result.area.lat, lng: result.area.lng, zoom: AREA_ZOOM[result.area.kind], seq: Date.now() });
    }
  }

  const pickedVenue = picked?.type === 'venue' ? venues.venues.find((venue) => venue.id === picked.venueId) : undefined;
  const chosen = venueId ? venues.venues.find((venue) => venue.id === venueId) : undefined;
  const chosenName = chosen ? localized(chosen, 'name', language) : place ? placeName(place, language) : '';

  function handlePlacePress(tapped: Place) {
    const linked = venues.venues.find((venue) => venue.place_id === tapped.id);
    setPicked(linked ? { type: 'venue', venueId: linked.id } : { type: 'place', place: tapped });
  }

  function choosePicked() {
    if (picked?.type === 'venue') setVenueId(picked.venueId);
    else if (picked?.type === 'place') setPlace(picked.place);
  }

  function changePlace() {
    setVenueId(null);
    setPlace(null);
  }

  async function handleCreate() {
    if ((!chosen && !place) || minutes === null) return;
    setError(null);
    setCreating(true);
    const common = { startsAt: fromBangkok(day, minutes), maxPeople, title: title.trim() };
    const result = womenOnly
      ? await createWomenOnlyTable({ venueId: chosen?.id ?? null, placeId: chosen ? null : (place as Place).id, ...common })
      : chosen
        ? await createMeetup({ venueId: chosen.id, ...common })
        : await createMeetupAtPlace({ placeId: (place as Place).id, ...common });
    if (result.error) {
      setCreating(false);
      setError(result.error);
      return;
    }
    await Promise.all([
      setMeetupDetails(result.data, cost, meetingPoint),
      setMeetupChallenge(result.data, challengeId),
      setMeetupJoinMode(result.data, joinMode),
      setMeetupVibe(result.data, vibe, vibe === 'cowork' ? hours : undefined),
    ]);
    setCreating(false);
    router.replace({ pathname: '/table/[id]', params: { id: result.data } });
  }

  // Step 1: choose the place on a full-screen map (partner places also in the List panel).
  if (!chosen && !place && !params.placeId) {
    const pickedName = pickedVenue
      ? localized(pickedVenue, 'name', language)
      : picked?.type === 'place'
        ? placeName(picked.place, language)
        : '';
    const pickedCategory = pickedVenue ? pickedVenue.category : picked?.type === 'place' ? placeCategory(picked.place.kind) : null;
    return (
      <View style={styles.root}>
        <VenueMap
          fullScreen
          userCoords={coords}
          // Tables are Bangkok-only: someone outside Bangkok starts on Bangkok, not on their own location.
          center={coords && !inBangkok(coords) ? BANGKOK_CENTER : null}
          pins={places.map(({ venue }) => ({
            key: venue.id,
            lat: venue.lat,
            lng: venue.lng,
            emoji: venue.deal ? PROMOTION_EMOJI[venue.deal.kind] : CATEGORY_EMOJI[venue.category],
            label: localized(venue, 'name', language),
            selected: picked?.type === 'venue' && venue.id === picked.venueId,
          }))}
          onPinPress={(id) => setPicked({ type: 'venue', venueId: id })}
          onMapPress={() => setPicked(null)}
          // Only partner venues have promotions, so a promotion filter hides the plain places.
          places={promo ? [] : mapPlaces}
          placeDots={promo ? [] : placeDots}
          dotsMinZoom={dotsMinZoom}
          onPlacePress={handlePlacePress}
          onBoundsChange={onBoundsChange}
          mapPadding={{ top: topHeight, right: 0, bottom: bottomHeight, left: 0 }}
          focus={focus}
        />

        <MapHeader
          title={t('tables.pickPlace')}
          hint={t('common.stepOf', { step: 1, total: 2 })}
          onHeight={setTopHeight}
          right={<RoundButton icon="listBulleted" label={t('tables.partnerPlaces')} onPress={() => setListOpen(true)} />}>
          <MapSearchBar value={search.query} onChangeText={search.setQuery} placeholder={t('search.foodPlaceholder')} />
          <PromoFilter
            value={promo}
            onChange={(value) => {
              setPromo(value);
              setPicked(null);
              // Move to the nearest partner place with that promotion, which may be off screen.
              const nearest = value
                ? venues.venues
                    .filter((venue) => !isHangoutVenue(venue) && venue.promotions.some((p) => p.kind === value))
                    .map((venue) => ({ venue, distance: coords ? distanceMeters(coords, venue) : 0 }))
                    .sort((a, b) => a.distance - b.distance)[0]?.venue
                : undefined;
              if (nearest) setFocus({ lat: nearest.lat, lng: nearest.lng, zoom: PLACE_ZOOM, seq: Date.now() });
            }}
          />
        </MapHeader>

        <View
          style={[styles.bottom, { paddingBottom: insets.bottom + Spacing.lg }]}
          pointerEvents="box-none"
          onLayout={(e) => setBottomHeight(e.nativeEvent.layout.height)}>
          {picked ? (
            <View style={styles.choose}>
              <GlossyFill />
              <View style={styles.chooseRow}>
                <PlaceThumb venue={pickedVenue} category={pickedCategory ?? 'restaurant'} size={64} />
                <View style={styles.flex}>
                  <Text style={styles.chooseName} numberOfLines={2}>
                    {pickedName}
                  </Text>
                  {pickedCategory && <Text style={styles.chooseSub}>{t(`category.${pickedCategory}`)}</Text>}
                  {pickedVenue?.deal ? (
                    <Text style={styles.dealPill} numberOfLines={2}>
                      {localized(pickedVenue.deal, 'title', language)}
                    </Text>
                  ) : (
                    <Text style={styles.chooseNote}>{t('tables.noDealHere')}</Text>
                  )}
                </View>
              </View>
              <Button
                title={t('tables.choosePlace')}
                trailingIcon={<Icon name="forward" size={20} color={Colors.onBrand} />}
                onPress={choosePicked}
              />
            </View>
          ) : (
            <View style={styles.hintCard}>
              <GlossyFill />
              <IconBadge icon="touch" tone="orange" />
              <Text style={styles.hintText}>
                {promo === null ? t('tables.pickAnyPlace') : places.length > 0 ? t('tables.pickPromoPlace') : t('tables.noPromoPlaces')}
              </Text>
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

        <SlideUpPanel
          open={listOpen}
          onClose={() => setListOpen(false)}
          title={t('tables.partnerPlaces')}
          subtitle={t('tables.chooseBody')}>
          <ScrollView contentContainerStyle={styles.sheetContent}>
            {places.map(({ venue, distance }) => (
              <VenueCard key={venue.id} venue={venue} distance={distance} onPress={() => setVenueId(venue.id)} />
            ))}
          </ScrollView>
        </SlideUpPanel>
      </View>
    );
  }

  // Step 2: when, how many, and a title.
  const canCreate = minutes !== null && slots.includes(minutes) && !creating;
  const whenLabel = minutes !== null ? `${formatDayLabel(day, t, now)} ${formatClock(minutes)}` : null;
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScreenHeader title={t('tables.newTable')} subtitle={t('common.stepOf', { step: 2, total: 2 })} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          <PlaceSummary
            leading={<PlaceThumb venue={chosen} category={chosen ? chosen.category : placeCategory(place?.kind ?? '')} size={52} />}
            name={chosenName}
            line={chosen?.deal ? localized(chosen.deal, 'title', language) : t('tables.noDealHere')}
            lineTone={chosen?.deal ? 'accent' : 'muted'}
            onChange={changePlace}
          />

          <FormSection label={t('tables.day')}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.bleed}
              contentContainerStyle={styles.chipRow}>
              {days.map((option) => (
                <Chip
                  key={option}
                  tall
                  label={formatDayLabel(option, t, now)}
                  selected={option === day}
                  onPress={() => {
                    setDay(option);
                    setMinutes(null);
                  }}
                />
              ))}
            </ScrollView>
          </FormSection>

          <FormSection label={t('tables.time')} note={`06:00–23:30 · ${t('tables.bangkokTime')}`}>
            {slots.length === 0 ? (
              <Text style={styles.hint}>{t('tables.noTimesLeft')}</Text>
            ) : (
              <ScrollView style={styles.slotBox} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                <View style={styles.slotGrid}>
                  {slots.map((slot) => (
                    <View key={slot} style={styles.slot}>
                      <Chip shape="tile" label={formatClock(slot)} selected={slot === minutes} onPress={() => setMinutes(slot)} />
                    </View>
                  ))}
                </View>
              </ScrollView>
            )}
          </FormSection>

          <Stepper
            label={t('tables.people')}
            hint={t('tables.peopleHint')}
            value={String(maxPeople)}
            canDecrease={maxPeople > MIN_PEOPLE}
            canIncrease={maxPeople < MAX_PEOPLE}
            onDecrease={() => setMaxPeople((n) => Math.max(MIN_PEOPLE, n - 1))}
            onIncrease={() => setMaxPeople((n) => Math.min(MAX_PEOPLE, n + 1))}
          />
          {COUPONS_ENABLED && <Text style={styles.hintTight}>{t('tables.groupSizeHint')}</Text>}

          <FormSection label={t('tables.titleLabel')} note={t('common.optional')} count={`${title.length}/80`}>
            <FormInput value={title} onChangeText={setTitle} placeholder={t('tables.notePlaceholder')} maxLength={80} />
          </FormSection>

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
            hours={hours}
            onHours={setHours}
            womenOnly={womenOnly}
            onWomenOnly={setWomenOnly}
            tone="orange"
          />

          {error && (
            <Text accessibilityRole="alert" style={styles.error}>
              {t(`tables.errors.${error}`)}
            </Text>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
      <FormFooter>
        <Button
          title={whenLabel ? t('tables.createAt', { when: whenLabel }) : t('tables.create')}
          onPress={handleCreate}
          loading={creating}
          disabled={!canCreate}
        />
      </FormFooter>
    </SafeAreaView>
  );
}

// A partner venue's photo, else its category icon on an orange ball.
function PlaceThumb({ venue, category, size }: { venue: Venue | undefined; category: Venue['category']; size: number }) {
  const styles = useStyles();
  if (venue?.photo_path) {
    return (
      <Image
        source={venuePhotoUrl(venue.photo_path)}
        style={[styles.thumb, { width: size, height: size, borderRadius: size / 4 }]}
        contentFit="cover"
      />
    );
  }
  return <IconBadge icon={category} tone="orangeBall" size={size * 0.75} />;
}

const useStyles = makeStyles((Colors) => ({
  root: { flex: 1, backgroundColor: Colors.bg },
  safe: { flex: 1, backgroundColor: Colors.bg },
  flex: { flex: 1 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 14 },
  choose: {
    padding: Spacing.md,
    gap: Spacing.md,
    borderRadius: 24,
    backgroundColor: Colors.overlay,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    ...Raised,
  },
  chooseRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  chooseName: { ...Type.heading, fontWeight: '800', color: Colors.text },
  chooseSub: { ...Type.small, color: Colors.textSecondary },
  chooseNote: { ...Type.small, fontSize: 12, color: Colors.textMuted },
  dealPill: {
    alignSelf: 'flex-start',
    marginTop: 3,
    paddingVertical: 3,
    paddingHorizontal: 9,
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: Colors.orangeTint,
    color: Colors.accent,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
  },
  hintCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: 14,
    paddingHorizontal: Spacing.lg,
    borderRadius: 24,
    backgroundColor: Colors.overlay,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    ...Raised,
  },
  hintText: { ...Type.label, flex: 1, color: Colors.text },
  thumb: { backgroundColor: Colors.surfaceRaised },
  sheetContent: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xxl * 2, gap: Spacing.md },
  // Step 2
  form: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.xs, paddingBottom: Spacing.xl, gap: Spacing.lg + 2 },
  bleed: { marginHorizontal: -Spacing.lg },
  chipRow: { gap: Spacing.sm, paddingHorizontal: Spacing.lg, paddingVertical: 2 },
  slotBox: { maxHeight: 150 },
  slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, padding: 2 },
  // Four time slots per row.
  slot: { width: '23%' },
  hint: { ...Type.small, color: Colors.textMuted },
  hintTight: { ...Type.small, color: Colors.textMuted, marginTop: -Spacing.md },
  error: {
    ...Type.small,
    color: Colors.danger,
    backgroundColor: Colors.dangerBg,
    padding: Spacing.md,
    borderRadius: Radius.sm,
    overflow: 'hidden',
  },
}));
