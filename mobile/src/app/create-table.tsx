import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { Icon } from '@/components/icon';
import { ScreenHeader } from '@/components/screen-header';
import { VenueCard } from '@/components/venue-card';
import { CATEGORY_EMOJI, VenueMap } from '@/components/venue-map';
import { Radius, Spacing, Type } from '@/constants/theme';
import { currentLanguage, localized } from '@/i18n';
import { bangkokDay, bangkokMinutes, formatClock, formatDayLabel, fromBangkok, type BangkokDay } from '@/lib/bangkok-time';
import { distanceMeters, useCurrentLocation } from '@/lib/location';
import { createMeetup, createMeetupAtPlace, type MeetupErrorKey } from '@/lib/meetups';
import { fetchPlace, placeName, usePlacesInView, type Place } from '@/lib/places';
import { PROMOTION_EMOJI, useVenues } from '@/lib/venues';
import { makeStyles, useColors } from '@/lib/theme';

// Picked on the step-1 map: a partner venue, or any Bangkok food place (OpenStreetMap).
type Picked = { type: 'venue'; venueId: string } | { type: 'place'; place: Place };

const DAYS_AHEAD = 7; // today + 6 more days (the server allows up to 7 days ahead)
const FIRST_SLOT = 6 * 60; // 06:00
const LAST_SLOT = 23 * 60 + 30; // 23:30
const MIN_PEOPLE = 3;
const MAX_PEOPLE = 12;

// Half-hour start times for a day; for today, only times at least 15 minutes from now.
function timeSlots(day: BangkokDay, now: Date): number[] {
  const earliest = day === bangkokDay(now) ? bangkokMinutes(now) + 15 : 0;
  const slots: number[] = [];
  for (let minutes = FIRST_SLOT; minutes <= LAST_SLOT; minutes += 30) {
    if (minutes >= earliest) slots.push(minutes);
  }
  return slots;
}

// Create a table: 1) pick a partner venue or any Bangkok food place on the map, 2) day, time, size and a title.
// Opened with ?venueId=… or ?placeId=… (from "Create table here"), step 1 is skipped.
export default function CreateTableScreen() {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  const language = currentLanguage();
  const venues = useVenues();
  const location = useCurrentLocation();
  const coords = location.state.status === 'granted' ? location.state.coords : null;

  const params = useLocalSearchParams<{ venueId?: string; placeId?: string }>();
  const [picked, setPicked] = useState<Picked | null>(null);
  const [venueId, setVenueId] = useState<string | null>(params.venueId ?? null);
  const [place, setPlace] = useState<Place | null>(null);
  const { places: mapPlaces, onBoundsChange } = usePlacesInView();

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
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<MeetupErrorKey | null>(null);

  const places = venues.venues
    .map((venue) => ({ venue, distance: coords ? distanceMeters(coords, venue) : null }))
    .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));
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
    const result = chosen
      ? await createMeetup({ venueId: chosen.id, ...common })
      : await createMeetupAtPlace({ placeId: (place as Place).id, ...common });
    setCreating(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.replace({ pathname: '/table/[id]', params: { id: result.data } });
  }

  // Step 1: choose the place.
  if (!chosen && !place && !params.placeId) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <ScreenHeader />
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.pad}>
            <Text style={styles.title}>{t('tables.chooseTitle')}</Text>
            <Text style={styles.subtitle}>{t('tables.chooseBody')}</Text>
          </View>
          <View style={[styles.pad, styles.mapSection]}>
            <VenueMap
              height={340}
              userCoords={coords}
              pins={places.map(({ venue }) => ({
                key: venue.id,
                lat: venue.lat,
                lng: venue.lng,
                emoji: venue.deal ? PROMOTION_EMOJI[venue.deal.kind] : CATEGORY_EMOJI[venue.category],
                selected: picked?.type === 'venue' && venue.id === picked.venueId,
              }))}
              onPinPress={(id) => setPicked({ type: 'venue', venueId: id })}
              places={mapPlaces}
              onPlacePress={handlePlacePress}
              onBoundsChange={onBoundsChange}
            />
            <Text style={styles.hint}>{t('tables.pickAnyPlace')}</Text>
            {picked && (
              <View style={styles.choose}>
                <Text style={styles.chooseName} numberOfLines={2}>
                  {pickedVenue
                    ? localized(pickedVenue, 'name', language)
                    : picked.type === 'place'
                      ? placeName(picked.place, language)
                      : ''}
                </Text>
                <Button title={t('tables.choosePlace')} onPress={choosePicked} />
              </View>
            )}
            <View style={styles.list}>
              {places.map(({ venue, distance }) => (
                <VenueCard
                  key={venue.id}
                  venue={venue}
                  distance={distance}
                  selected={picked?.type === 'venue' && venue.id === picked.venueId}
                  onPress={() => setVenueId(venue.id)}
                />
              ))}
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Step 2: when, how many, and a title.
  const canCreate = minutes !== null && slots.includes(minutes) && !creating;
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <ScreenHeader title={t('tables.createTable')} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.pad}>
            <View style={styles.placeRow}>
              <Icon name={chosen ? chosen.category : 'store'} size={20} color={Colors.accent} />
              <Text style={styles.placeName} numberOfLines={1}>
                {chosenName}
              </Text>
              <Pressable accessibilityRole="button" hitSlop={8} onPress={changePlace}>
                <Text style={styles.link}>{t('tables.change')}</Text>
              </Pressable>
            </View>
            {chosen?.deal ? (
              <Text style={styles.deal} numberOfLines={2}>
                {localized(chosen.deal, 'title', language)}
              </Text>
            ) : (
              <Text style={styles.hint}>{t('tables.noDealHere')}</Text>
            )}

            <Text style={styles.heading}>{t('tables.detailsTitle')}</Text>

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
            <Text style={styles.hint}>{t('tables.groupSizeHint')}</Text>

            <Text style={styles.label}>{t('tables.note')}</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder={t('tables.notePlaceholder')}
              placeholderTextColor={Colors.textMuted}
              selectionColor={Colors.orange}
              keyboardAppearance="dark"
              maxLength={80}
              style={styles.input}
            />

            {error && (
              <Text accessibilityRole="alert" style={styles.error}>
                {t(`tables.errors.${error}`)}
              </Text>
            )}
            <View style={styles.submit}>
              <Button title={t('tables.create')} onPress={handleCreate} loading={creating} disabled={!canCreate} />
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
  safe: { flex: 1, backgroundColor: Colors.bg },
  flex: { flex: 1 },
  content: { paddingBottom: Spacing.xxl * 2 },
  pad: { paddingHorizontal: Spacing.lg },
  title: { ...Type.title, color: Colors.text },
  subtitle: { ...Type.body, color: Colors.textSecondary, marginTop: Spacing.xs },
  mapSection: { marginTop: Spacing.lg },
  choose: {
    marginTop: Spacing.md,
    padding: Spacing.md,
    gap: Spacing.md,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surfaceRaised,
    borderWidth: 1,
    borderColor: Colors.pink,
  },
  chooseName: { ...Type.heading, color: Colors.text },
  list: { gap: Spacing.md, marginTop: Spacing.lg },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.sm },
  placeName: { ...Type.title, color: Colors.text, flex: 1 },
  link: { ...Type.label, color: Colors.accent },
  deal: { ...Type.body, color: Colors.glow, marginTop: Spacing.xs },
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
