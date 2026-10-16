import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { Icon } from '@/components/icon';
import { MapHeader } from '@/components/map-header';
import { MeetupCard } from '@/components/meetup-card';
import { PromoFilter } from '@/components/promo-filter';
import { ScreenHeader } from '@/components/screen-header';
import { SlideUpPanel } from '@/components/slide-up-panel';
import { VenueCard } from '@/components/venue-card';
import { CATEGORY_EMOJI, VenueMap, type MapPin } from '@/components/venue-map';
import { Radius, Spacing, Type } from '@/constants/theme';
import { currentLanguage, localized } from '@/i18n';
import { useAuth } from '@/lib/auth';
import {
  bangkokDay,
  formatClock,
  formatDayLabel,
  formatWhenRange,
  fromBangkok,
  timeSlots,
  type BangkokDay,
} from '@/lib/bangkok-time';
import { distanceMeters, useCurrentLocation } from '@/lib/location';
import {
  createHangout,
  directionsUrl,
  joinMeetup,
  meetupCoords,
  meetupLocationKey,
  meetupPlaceName,
  useOpenMeetups,
  type HangoutWhere,
  type MeetupErrorKey,
  type OpenMeetup,
} from '@/lib/meetups';
import { placeEmoji, placeName, usePlacesInView, type Place } from '@/lib/places';
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
import { makeStyles, useColors } from '@/lib/theme';

// Tapped on the hangout map: a partner venue, a place, a pin dropped anywhere, or a pin of hangouts at a spot.
type Selection =
  | { type: 'venue'; venueId: string }
  | { type: 'place'; place: Place }
  | { type: 'spot'; lat: number; lng: number }
  | { type: 'group'; key: string };

// Where the new hangout will be (step 2).
type Chosen =
  | { type: 'venue'; venue: Venue }
  | { type: 'place'; place: Place }
  | { type: 'spot'; lat: number; lng: number; name: string };

const DAYS_AHEAD = 14; // the server allows up to 14 days ahead
const MIN_PEOPLE = 2;
const MAX_PEOPLE = 30;
const DURATIONS = [60, 120, 180, 240, 360, 480, 720]; // minutes

// Create a hangout: 1) a full-screen map of places to hang out (temples, parks, malls, markets, museums,
// attractions), partner venues with ticket discounts, free entry and events, and open hangouts. Tap a place, or
// anywhere to drop a pin. 2) Title, description, day, time, how long and how many people.
export default function CreateHangoutScreen() {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { session } = useAuth();
  const venues = useVenues();
  const meetups = useOpenMeetups(Boolean(session));
  const location = useCurrentLocation();
  const coords = location.state.status === 'granted' ? location.state.coords : null;
  const { places: mapPlaces, onBoundsChange } = usePlacesInView('hangout');

  const [promo, setPromo] = useState<PromotionKind | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [chosen, setChosen] = useState<Chosen | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [topHeight, setTopHeight] = useState(0);
  const [bottomHeight, setBottomHeight] = useState(0);

  const venueById = new Map(venues.venues.map((venue) => [venue.id, venue]));
  const venueMatches = (venue: Venue | undefined) =>
    Boolean(venue) && (promo === null || Boolean(venue?.promotions.some((p) => p.kind === promo)));
  const hangoutVenues = venues.venues.filter((venue) => isHangoutVenue(venue) && venueMatches(venue));
  const shownVenueIds = new Set(hangoutVenues.map((venue) => venue.id));
  // With a filter on, only hangouts at venues that have that promotion.
  const hangouts = meetups.meetups.filter(
    (meetup) => meetup.kind === 'hangout' && (promo === null || venueMatches(venueById.get(meetup.venue_id ?? ''))),
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
        count: hangoutsAtVenue.get(venue.id),
        selected: selectedKey === `v:${venue.id}`,
      };
    }),
    ...[...groups].flatMap(([key, list]) => {
      const at = meetupCoords(list[0], venueById);
      return at
        ? [{ key: `h:${key}`, ...at, emoji: '🙌', tone: 'violet' as const, count: list.length, selected: selectedKey === key }]
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
  function handlePlacePress(place: Place) {
    const venue = venues.venues.find((v) => v.place_id === place.id);
    setSelection(venue ? { type: 'venue', venueId: venue.id } : { type: 'place', place });
  }

  function hangoutsAt(s: Selection): OpenMeetup[] {
    if (s.type === 'venue') return hangouts.filter((m) => m.venue_id === s.venueId);
    if (s.type === 'place') return hangouts.filter((m) => !m.venue_id && m.place_id === s.place.id);
    if (s.type === 'group') return groups.get(s.key) ?? [];
    return [];
  }

  function createAt(s: Selection) {
    if (s.type === 'venue') {
      const venue = venueById.get(s.venueId);
      if (venue) setChosen({ type: 'venue', venue });
    } else if (s.type === 'place') {
      setChosen({ type: 'place', place: s.place });
    } else if (s.type === 'spot') {
      setChosen({ type: 'spot', lat: s.lat, lng: s.lng, name: '' });
    } else {
      const first = groups.get(s.key)?.[0];
      if (first?.place_lat != null && first.place_lng != null) {
        setChosen({ type: 'spot', lat: first.place_lat, lng: first.place_lng, name: first.place_name ?? '' });
      }
    }
  }

  async function handleJoin(id: string) {
    setJoiningId(id);
    const { error } = await joinMeetup(id);
    setJoiningId(null);
    if (error) Alert.alert(t(`hangouts.errors.${error}`));
    else meetups.reload();
  }

  const renderHangout = (meetup: OpenMeetup) => (
    <MeetupCard
      meetup={meetup}
      venue={meetup.venue_id ? venueById.get(meetup.venue_id) : undefined}
      joining={joiningId === meetup.id}
      onJoin={() => handleJoin(meetup.id)}
      onPress={() => router.push({ pathname: '/table/[id]', params: { id: meetup.id } })}
    />
  );

  if (chosen) {
    return <HangoutForm chosen={chosen} onChange={() => setChosen(null)} />;
  }

  const cardWidth = Math.min(width - Spacing.lg * 2 - Spacing.xl, 420);
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
        places={mapPlaces}
        placeTone="violet"
        onPlacePress={handlePlacePress}
        onMapPress={(at) => setSelection({ type: 'spot', ...at })}
        onBoundsChange={onBoundsChange}
        mapPadding={{ top: topHeight, right: 0, bottom: bottomHeight, left: 0 }}
      />

      <MapHeader title={t('hangouts.mapTitle')} hint={t('hangouts.mapHint')} onHeight={setTopHeight}>
        <PromoFilter
          kinds={HANGOUT_PROMOTION_KINDS}
          value={promo}
          onChange={(value) => {
            setPromo(value);
            setSelection(null);
          }}
        />
      </MapHeader>

      <View
        style={[styles.bottom, { paddingBottom: insets.bottom + Spacing.md }]}
        pointerEvents="box-none"
        onLayout={(e) => setBottomHeight(e.nativeEvent.layout.height)}>
        {selection ? (
          <SelectionCard
            selection={selection}
            venue={selection.type === 'venue' ? venueById.get(selection.venueId) : undefined}
            hangouts={hangoutsAt(selection)}
            renderHangout={renderHangout}
            onCreate={() => createAt(selection)}
            onClose={() => setSelection(null)}
          />
        ) : !session ? null : meetups.status === 'loading' ? (
          <ActivityIndicator color={Colors.accent} style={styles.spinner} />
        ) : hangouts.length === 0 ? (
          <View style={[styles.emptyCard, styles.inset]}>
            <Text style={styles.emptyTitle}>
              {meetups.status === 'error' ? t('tables.errorLoad') : t('hangouts.noHangoutsTitle')}
            </Text>
            {meetups.status !== 'error' && <Text style={styles.emptyBody}>{t('hangouts.noHangoutsBody')}</Text>}
          </View>
        ) : (
          <FlatList
            horizontal
            data={hangouts}
            keyExtractor={(meetup) => meetup.id}
            renderItem={({ item }) => <View style={{ width: cardWidth }}>{renderHangout(item)}</View>}
            showsHorizontalScrollIndicator={false}
            snapToInterval={cardWidth + Spacing.md}
            decelerationRate="fast"
            contentContainerStyle={styles.cards}
          />
        )}

        {!selection && (
          <View style={[styles.listRow, styles.inset]}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setListOpen(true)}
              style={({ pressed }) => [styles.listButton, pressed && styles.pressed]}>
              <Icon name="list" size={20} color={Colors.text} />
              <Text style={styles.listButtonText}>{t('tables.showList')}</Text>
            </Pressable>
          </View>
        )}
      </View>

      <SlideUpPanel open={listOpen} onClose={() => setListOpen(false)}>
        <ScrollView contentContainerStyle={styles.sheetContent}>
          <Text style={styles.sectionTitle}>{t('hangouts.openHangouts')}</Text>
          {hangouts.length === 0 ? (
            <View style={styles.emptyCard}>
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

// Bottom card for what was tapped: name, the venue's promotions, hangouts there, and "Create hangout here".
function SelectionCard({
  selection,
  venue,
  hangouts,
  renderHangout,
  onCreate,
  onClose,
}: {
  selection: Selection;
  venue: Venue | undefined;
  hangouts: OpenMeetup[];
  renderHangout: (meetup: OpenMeetup) => React.ReactNode;
  onCreate: () => void;
  onClose: () => void;
}) {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  const language = currentLanguage();

  let name = '';
  let note: string | null = null;
  let target: { lat: number; lng: number } | null = null;
  if (selection.type === 'venue' && venue) {
    name = `${CATEGORY_EMOJI[venue.category]} ${localized(venue, 'name', language)}`;
    target = venue;
  } else if (selection.type === 'place') {
    name = `${placeEmoji(selection.place.kind)} ${placeName(selection.place, language)}`;
    note = t('hangouts.noDealHere');
    target = selection.place;
  } else if (selection.type === 'spot') {
    name = `📍 ${t('hangouts.pinnedSpot')}`;
    note = t('hangouts.pinnedSpotBody');
  } else if (hangouts[0]) {
    name = `📍 ${meetupPlaceName(hangouts[0], language)}`;
    target =
      hangouts[0].place_lat !== null && hangouts[0].place_lng !== null
        ? { lat: hangouts[0].place_lat, lng: hangouts[0].place_lng }
        : null;
  }

  return (
    <View style={[styles.placeCard, styles.inset]}>
      <View style={styles.placeHeader}>
        <Text style={styles.placeName} numberOfLines={2}>
          {name}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          hitSlop={10}
          onPress={onClose}
          style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}>
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
      </View>

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

      {hangouts.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.placeHangouts}>
          {hangouts.map((meetup) => (
            <View key={meetup.id} style={styles.placeHangout}>
              {renderHangout(meetup)}
            </View>
          ))}
        </ScrollView>
      )}

      <View style={styles.placeActions}>
        <View style={styles.flex}>
          <Button
            title={t('hangouts.createHere')}
            variant="violet"
            icon={<Icon name="add" size={20} color={Colors.white} />}
            onPress={onCreate}
          />
        </View>
        {target && (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={t('tables.openInMaps')}
            onPress={() => Linking.openURL(directionsUrl({ ...target, name }))}
            style={({ pressed }) => [styles.listButton, pressed && styles.pressed]}>
            <Icon name="map" size={20} color={Colors.text} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

function PromotionRow({ promotion }: { promotion: VenueDeal }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const language = currentLanguage();
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
      <Text style={styles.promoEmoji}>{PROMOTION_EMOJI[promotion.kind]}</Text>
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
    </View>
  );
}

// Step 2: what, when, how long and how many people.
function HangoutForm({ chosen, onChange }: { chosen: Chosen; onChange: () => void }) {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  const language = currentLanguage();

  const [now] = useState(() => new Date());
  const today = bangkokDay(now);
  const days = Array.from({ length: DAYS_AHEAD }, (_, i) => today + i);
  const [day, setDay] = useState<BangkokDay>(() => (timeSlots(today, now).length ? today : today + 1));
  const slots = timeSlots(day, now);
  const [minutes, setMinutes] = useState<number | null>(null);
  const [duration, setDuration] = useState(120);
  const [maxPeople, setMaxPeople] = useState(6);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [spotName, setSpotName] = useState(chosen.type === 'spot' ? chosen.name : '');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<MeetupErrorKey | null>(null);

  const placeLabel =
    chosen.type === 'venue'
      ? `${CATEGORY_EMOJI[chosen.venue.category]} ${localized(chosen.venue, 'name', language)}`
      : chosen.type === 'place'
        ? `${placeEmoji(chosen.place.kind)} ${placeName(chosen.place, language)}`
        : `📍 ${t('hangouts.pinnedSpot')}`;
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
        : chosen.type === 'place'
          ? { type: 'place', placeId: chosen.place.id }
          : { type: 'spot', lat: chosen.lat, lng: chosen.lng, name: spotName.trim() };
    setError(null);
    setCreating(true);
    const result = await createHangout({
      where,
      startsAt: fromBangkok(day, minutes),
      durationMinutes: duration,
      maxPeople,
      title: title.trim(),
      description: description.trim(),
    });
    setCreating(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.replace({ pathname: '/table/[id]', params: { id: result.data } });
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <ScreenHeader title={t('hangouts.createHangout')} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.pad}>
            <View style={styles.placeRow}>
              <Text style={styles.formPlace} numberOfLines={2}>
                {placeLabel}
              </Text>
              <Pressable accessibilityRole="button" hitSlop={8} onPress={onChange}>
                <Text style={styles.link}>{t('tables.change')}</Text>
              </Pressable>
            </View>
            {deals.length > 0 && (
              <View style={[styles.promoList, styles.formDeals]}>
                {deals.map((promotion) => (
                  <PromotionRow key={promotion.id} promotion={promotion} />
                ))}
                {deals.some((p) => p.kind === 'ticket') && <Text style={styles.hint}>{t('hangouts.ticketNote')}</Text>}
              </View>
            )}

            <Text style={styles.heading}>{t('hangouts.detailsTitle')}</Text>

            {chosen.type === 'spot' && (
              <>
                <Text style={styles.label}>{t('hangouts.spotNameLabel')}</Text>
                <TextInput
                  value={spotName}
                  onChangeText={setSpotName}
                  placeholder={t('hangouts.spotNamePlaceholder')}
                  placeholderTextColor={Colors.textMuted}
                  selectionColor={Colors.violet}
                  keyboardAppearance="dark"
                  maxLength={80}
                  style={styles.input}
                />
              </>
            )}

            <Text style={styles.label}>{t('hangouts.titleLabel')}</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder={t('hangouts.titlePlaceholder')}
              placeholderTextColor={Colors.textMuted}
              selectionColor={Colors.violet}
              keyboardAppearance="dark"
              maxLength={80}
              style={styles.input}
            />

            <Text style={styles.label}>{t('hangouts.descriptionLabel')}</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder={t('hangouts.descriptionPlaceholder')}
              placeholderTextColor={Colors.textMuted}
              selectionColor={Colors.violet}
              keyboardAppearance="dark"
              maxLength={500}
              multiline
              textAlignVertical="top"
              style={[styles.input, styles.multiline]}
            />

            <Text style={styles.label}>{t('tables.day')}</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {days.map((option) => (
              <Chip
                key={option}
                label={formatDayLabel(option, t, now)}
                selected={option === day}
                onPress={() => {
                  setDay(option);
                  setMinutes(null);
                }}
              />
            ))}
          </ScrollView>

          <View style={styles.pad}>
            <Text style={styles.label}>{t('tables.time')}</Text>
            {slots.length === 0 ? (
              <Text style={styles.hint}>{t('tables.noTimesLeft')}</Text>
            ) : (
              <View style={styles.slotGrid}>
                {slots.map((slot) => (
                  <Chip key={slot} label={formatClock(slot)} selected={slot === minutes} onPress={() => setMinutes(slot)} />
                ))}
              </View>
            )}

            <Text style={styles.label}>{t('hangouts.duration')}</Text>
            <View style={styles.slotGrid}>
              {DURATIONS.map((option) => (
                <Chip
                  key={option}
                  label={t('hangouts.durationHours', { hours: option / 60 })}
                  selected={option === duration}
                  onPress={() => setDuration(option)}
                />
              ))}
            </View>

            <Text style={styles.label}>{t('tables.groupSize')}</Text>
            <View style={styles.stepper}>
              <StepButton
                icon="minus"
                label={t('tables.decrease')}
                disabled={maxPeople <= MIN_PEOPLE}
                onPress={() => setMaxPeople((n) => Math.max(MIN_PEOPLE, n - 1))}
              />
              <Text style={styles.stepValue} accessibilityLiveRegion="polite">
                {maxPeople}
              </Text>
              <StepButton
                icon="plus"
                label={t('tables.increase')}
                disabled={maxPeople >= MAX_PEOPLE}
                onPress={() => setMaxPeople((n) => Math.min(MAX_PEOPLE, n + 1))}
              />
            </View>
            <Text style={styles.hint}>{t('hangouts.groupSizeHint')}</Text>

            {error && (
              <Text accessibilityRole="alert" style={styles.error}>
                {t(`hangouts.errors.${error}`)}
              </Text>
            )}
            <View style={styles.submit}>
              <Button
                title={t('hangouts.create')}
                variant="violet"
                onPress={handleCreate}
                loading={creating}
                disabled={!canCreate}
              />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function StepButton({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: 'plus' | 'minus';
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const styles = useStyles();
  const Colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.stepButton, pressed && styles.stepPressed, disabled && styles.stepDisabled]}>
      <Icon name={icon} size={22} color={disabled ? Colors.textMuted : Colors.text} />
    </Pressable>
  );
}

const useStyles = makeStyles((Colors) => ({
  root: { flex: 1, backgroundColor: Colors.bg },
  safe: { flex: 1, backgroundColor: Colors.bg },
  flex: { flex: 1 },
  inset: { marginHorizontal: Spacing.lg },
  pressed: { opacity: 0.7 },
  spinner: { marginVertical: Spacing.lg },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, gap: Spacing.md },
  cards: { gap: Spacing.md, paddingHorizontal: Spacing.lg },
  listRow: { flexDirection: 'row', justifyContent: 'flex-end' },
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
  emptyCard: {
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    backgroundColor: Colors.overlay,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.xs,
  },
  emptyTitle: { ...Type.heading, color: Colors.text },
  emptyBody: { ...Type.body, color: Colors.textSecondary },
  placeCard: {
    padding: Spacing.md,
    gap: Spacing.md,
    borderRadius: Radius.lg,
    backgroundColor: Colors.overlay,
    borderWidth: 1,
    borderColor: Colors.violet,
  },
  placeHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  placeName: { ...Type.heading, color: Colors.text, flex: 1 },
  placeNote: { ...Type.body, color: Colors.textSecondary },
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
  promoTitle: { ...Type.label, color: Colors.glow },
  promoMeta: { ...Type.small, color: Colors.textSecondary },
  liveBadge: {
    ...Type.small,
    fontSize: 11,
    fontWeight: '800',
    color: Colors.onBrand,
    backgroundColor: Colors.pink,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.pill,
    overflow: 'hidden',
  },
  placeHangouts: { gap: Spacing.sm },
  placeHangout: { width: 300 },
  placeActions: { flexDirection: 'row', gap: Spacing.sm },
  sheetContent: { padding: Spacing.lg, paddingBottom: Spacing.xxl * 2 },
  sectionTitle: { ...Type.heading, color: Colors.text, marginBottom: Spacing.md },
  sectionSpacing: { marginTop: Spacing.xl },
  list: { gap: Spacing.md },
  // Step 2
  content: { paddingBottom: Spacing.xxl * 2 },
  pad: { paddingHorizontal: Spacing.lg },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.sm },
  formPlace: { ...Type.title, color: Colors.text, flex: 1 },
  formDeals: { marginTop: Spacing.md },
  link: { ...Type.label, color: Colors.accent },
  heading: { ...Type.heading, color: Colors.text, marginTop: Spacing.xl },
  label: { ...Type.label, color: Colors.textSecondary, marginTop: Spacing.lg, marginBottom: Spacing.sm },
  chipRow: { gap: Spacing.sm, paddingHorizontal: Spacing.lg },
  slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  hint: { ...Type.small, color: Colors.textMuted, marginTop: Spacing.sm },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: Spacing.lg },
  stepButton: {
    width: 48,
    height: 48,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepPressed: { backgroundColor: Colors.surfaceRaised },
  stepDisabled: { opacity: 0.5 },
  stepValue: { ...Type.title, color: Colors.text, minWidth: 32, textAlign: 'center' },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.lg,
    fontSize: 16,
    color: Colors.text,
  },
  multiline: { minHeight: 110, paddingTop: Spacing.md, paddingBottom: Spacing.md },
  error: {
    ...Type.small,
    color: Colors.danger,
    backgroundColor: Colors.dangerBg,
    padding: Spacing.md,
    borderRadius: Radius.sm,
    marginTop: Spacing.lg,
  },
  submit: { marginTop: Spacing.xl },
}));
