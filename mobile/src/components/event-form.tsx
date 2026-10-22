import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { FormFooter, FormInput, FormSection, IconBadge, PlaceSummary, Stepper } from '@/components/form-parts';
import { Icon } from '@/components/icon';
import { ScreenHeader } from '@/components/screen-header';
import { Radius, Spacing, Type } from '@/constants/theme';
import { localized, useLanguage } from '@/i18n';
import { useAuth } from '@/lib/auth';
import {
  bangkokDay,
  bangkokMinutes,
  deviceZone,
  formatClock,
  formatDayLabel,
  formatUtcOffset,
  fromBangkok,
  sameClock,
  timeSlots,
  zoneAt,
  type BangkokDay,
} from '@/lib/bangkok-time';
import { formatMoney, useRates } from '@/lib/currency';
import {
  createEvent,
  deleteEventPhotos,
  EVENT_CATEGORIES,
  EVENT_EMOJI,
  EVENT_LIMITS,
  EVENT_PHOTO_BUCKET,
  eventPhotoUrl,
  parsePrice,
  type EventCategory,
  type EventErrorKey,
  updateEvent,
} from '@/lib/events';
import { isSafeLink } from '@/lib/links';
import type { HangoutWhere, JoinMode, MeetupDetail } from '@/lib/meetups';
import { pickAndUploadPhoto } from '@/lib/photos';
import { placeEmoji, placeName, type Place } from '@/lib/places';
import { areaAt, setMeetupArea } from '@/lib/rewards';
import type { Venue } from '@/lib/venues';
import { useMyVerification } from '@/lib/verification';
import { makeStyles, useColors } from '@/lib/theme';

// Where the new hangout or event will be (step 2 of the Hangout map). When editing an event: 'current' keeps its
// partner venue or place as it is (even a venue hidden since), and a spot keeps its time zone.
export type ChosenPlace =
  | { type: 'venue'; venue: Venue }
  | { type: 'place'; place: Place }
  | { type: 'spot'; lat: number; lng: number; name: string; timeZone?: string }
  | {
      type: 'current';
      venueId: string | null;
      placeId: string | null;
      lat: number | null;
      lng: number | null;
      name: string;
      timeZone: string;
    };

// What's typed in the form, kept while the organiser goes back to the map to pick another place. Times are wall-clock
// (day + minutes) so they stay the same local time at a place in another time zone.
export type EventDraft = {
  photos: string[];
  removedPhotos: string[];
  title: string;
  category: EventCategory | null;
  description: string;
  paid: boolean;
  thbText: string;
  usdText: string;
  ticketText: string;
  meetingPoint: string;
  startDay: BangkokDay | null;
  startMinutes: number | null;
  endDay: BangkokDay | null;
  endMinutes: number | null;
  maxPeople: number;
  joinMode: JoinMode;
  womenOnly: boolean;
  announceOnly: boolean;
};

// The form's first values: what was typed before going back to the map, else the event being edited, else empty.
function initialDraft(draft: EventDraft | undefined, edit: MeetupDetail | undefined): EventDraft {
  if (draft) return draft;
  if (!edit) {
    return {
      photos: [],
      removedPhotos: [],
      title: '',
      category: null,
      description: '',
      paid: false,
      thbText: '',
      usdText: '',
      ticketText: '',
      meetingPoint: '',
      startDay: null,
      startMinutes: null,
      endDay: null,
      endMinutes: null,
      maxPeople: 30,
      joinMode: 'open',
      womenOnly: false,
      announceOnly: false,
    };
  }
  const zone = edit.time_zone;
  const start = new Date(edit.starts_at);
  const end = new Date(edit.ends_at);
  return {
    photos: edit.photo_paths,
    removedPhotos: [],
    title: edit.title,
    category: edit.event_category,
    description: edit.description,
    paid: edit.entry_fee_thb !== null || edit.entry_fee_usd !== null,
    thbText: edit.entry_fee_thb !== null ? String(Number(edit.entry_fee_thb)) : '',
    usdText: edit.entry_fee_usd !== null ? String(Number(edit.entry_fee_usd)) : '',
    ticketText: edit.ticket_url ?? '',
    meetingPoint: edit.meeting_point ?? '',
    startDay: bangkokDay(start, zone),
    startMinutes: bangkokMinutes(start, zone),
    endDay: bangkokDay(end, zone),
    endMinutes: bangkokMinutes(end, zone),
    maxPeople: edit.max_people,
    joinMode: edit.join_mode,
    womenOnly: edit.women_only,
    announceOnly: edit.announce_only,
  };
}

const HALF_HOUR = 30 * 60_000;
const DAY_MS = 24 * 60 * 60_000;
const DEFAULT_LENGTH_MS = 3 * 60 * 60_000;

// People stepper: by 1 up to 10, by 5 up to 50, then by 10.
function stepUp(n: number) {
  return Math.min(EVENT_LIMITS.maxPeople, n < 10 ? n + 1 : n < 50 ? n + 5 : n + 10);
}
function stepDown(n: number) {
  return Math.max(EVENT_LIMITS.minPeople, n <= 10 ? n - 1 : n <= 50 ? n - 5 : n - 10);
}

// Step 2 of "Create event": photos, name, category, description, free or paid (price in ฿ and / or $, optional ticket
// link; paid needs a verified organiser), start and end ("open hours": people pick their arrival time), meeting point,
// how many people (2–150), who can join and the chat mode. Times are local time at the place.
// With `edit`, the organiser changes their event (who can join and women-only stay as they are; once it has started,
// so does the start). "Change" goes back to the map with what's typed (`onChange(draft)`, given back as `draft`).
export function EventForm({
  chosen,
  onChange,
  draft,
  edit,
}: {
  chosen: ChosenPlace;
  onChange: (draft: EventDraft) => void;
  draft?: EventDraft;
  edit?: MeetupDetail;
}) {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  const language = useLanguage();
  const { session } = useAuth();
  const { verification } = useMyVerification();

  const at =
    chosen.type === 'venue'
      ? chosen.venue
      : chosen.type === 'place'
        ? chosen.place
        : chosen.type === 'current'
          ? { lat: chosen.lat ?? 13.75, lng: chosen.lng ?? 100.5 }
          : chosen;
  const isSpot = chosen.type === 'spot' || (chosen.type === 'place' && Boolean(chosen.place.world));
  const [zone] = useState(() =>
    chosen.type === 'current'
      ? chosen.timeZone
      : chosen.type === 'spot' && chosen.timeZone
        ? chosen.timeZone
        : isSpot
          ? zoneAt(at.lat, at.lng)
          : 'Asia/Bangkok',
  );
  const outsideBangkok = !(at.lat >= 13.45 && at.lat <= 14.1 && at.lng >= 100.25 && at.lng <= 100.95);
  const [area] = useState(() => (isSpot && outsideBangkok ? areaAt(at.lat, at.lng) : Promise.resolve(null)));
  const [now] = useState(() => new Date());
  const today = bangkokDay(now, zone);
  const otherZone = !sameClock(zone, deviceZone(), now);

  const [init] = useState(() => initialDraft(draft, edit));
  // Photos of the event as saved: removing one only deletes the file once the changes are saved.
  const [savedPhotos] = useState(() => edit?.photo_paths ?? []);
  const [photos, setPhotos] = useState<string[]>(init.photos);
  const [removedPhotos, setRemovedPhotos] = useState<string[]>(init.removedPhotos);
  const [uploading, setUploading] = useState(false);
  const [photoError, setPhotoError] = useState(false);
  const [title, setTitle] = useState(init.title);
  const [category, setCategory] = useState<EventCategory | null>(init.category);
  const [description, setDescription] = useState(init.description);
  const [paid, setPaid] = useState(init.paid);
  const [thbText, setThbText] = useState(init.thbText);
  const [usdText, setUsdText] = useState(init.usdText);
  const [ticketText, setTicketText] = useState(init.ticketText);
  const [spotName, setSpotName] = useState(chosen.type === 'spot' ? chosen.name : '');
  const [meetingPoint, setMeetingPoint] = useState(init.meetingPoint);
  // Once an event has started, its start stays.
  const startLocked = Boolean(edit && new Date(edit.starts_at).getTime() <= now.getTime());
  const [startDay, setStartDay] = useState<BangkokDay>(
    () => init.startDay ?? (timeSlots(today, now, zone).length ? today : today + 1),
  );
  const [startMinutes, setStartMinutes] = useState<number | null>(init.startMinutes);
  const [end, setEnd] = useState<Date | null>(() =>
    init.endDay !== null && init.endMinutes !== null ? fromBangkok(init.endDay, init.endMinutes, zone) : null,
  );
  const [maxPeople, setMaxPeople] = useState(init.maxPeople);
  const [joinMode, setJoinMode] = useState<JoinMode>(init.joinMode);
  const [womenOnly, setWomenOnly] = useState(init.womenOnly);
  const [announceOnly, setAnnounceOnly] = useState(init.announceOnly);
  // Not below the people already in.
  const minPeople = Math.max(EVENT_LIMITS.minPeople, edit?.members.length ?? 0);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<EventErrorKey | null>(null);
  const usdRate = useRates(paid ? 'THB' : null)?.USD ?? null;

  const startDays = Array.from({ length: EVENT_LIMITS.daysAhead }, (_, i) => today + i);
  const startSlots = timeSlots(startDay, now, zone);
  const start = startLocked && edit ? new Date(edit.starts_at) : startMinutes !== null ? fromBangkok(startDay, startMinutes, zone) : null;
  // End: from 30 minutes after the start (and after now) up to 7 days later, on the half hour.
  const firstEndDay = start ? bangkokDay(start, zone) : startDay;
  const endDays = start
    ? Array.from({ length: EVENT_LIMITS.maxDays + 1 }, (_, i) => firstEndDay + i).filter((day) => day >= today)
    : [];
  const endDay = end ? bangkokDay(end, zone) : null;
  const endSlots =
    start && endDay !== null
      ? Array.from({ length: 48 }, (_, i) => i * 30).filter((minutes) => {
          const time = fromBangkok(endDay, minutes, zone).getTime();
          return (
            time >= start.getTime() + HALF_HOUR && time <= start.getTime() + EVENT_LIMITS.maxDays * DAY_MS && time > now.getTime()
          );
        })
      : [];
  const endMinutes = end ? Math.round((end.getTime() - fromBangkok(endDay ?? 0, 0, zone).getTime()) / 60_000) : null;
  const lengthMs = start && end ? end.getTime() - start.getTime() : 0;
  const lengthHours = Math.round((lengthMs / 3_600_000) * 2) / 2;
  const lengthLabel =
    lengthHours >= 24
      ? t('events.lengthDays', { days: Math.floor(lengthHours / 24), hours: lengthHours % 24 })
      : t('events.lengthHours', { hours: lengthHours });

  const thb = paid ? parsePrice(thbText) : null;
  const usd = paid ? parsePrice(usdText) : null;
  const priceBad = paid && (Number.isNaN(thb) || Number.isNaN(usd));
  const priceMissing = paid && !priceBad && thb === null && usd === null;
  const ticket = paid ? ticketText.trim() : '';
  const ticketBad = ticket.length > 0 && !isSafeLink(ticket);
  const verified = Boolean(verification?.verified);
  const usdSuggestion = paid && thb !== null && !Number.isNaN(thb) && !usdText.trim() && usdRate ? Math.round(thb * usdRate * 100) / 100 : null;

  const canCreate =
    title.trim().length > 0 &&
    category !== null &&
    start !== null &&
    end !== null &&
    end.getTime() - start.getTime() >= HALF_HOUR &&
    maxPeople >= minPeople &&
    (chosen.type !== 'spot' || spotName.trim().length > 0) &&
    !priceBad &&
    !priceMissing &&
    !ticketBad &&
    (!paid || verified) &&
    !uploading &&
    !creating;

  function pickStart(day: BangkokDay, minutes: number | null) {
    setStartDay(day);
    setStartMinutes(minutes);
    if (minutes === null) {
      setEnd(null);
      return;
    }
    // Keep the same length when the start moves (3 hours at first), within the limits.
    const newStart = fromBangkok(day, minutes, zone).getTime();
    const keep = end && start ? end.getTime() - start.getTime() : DEFAULT_LENGTH_MS;
    setEnd(new Date(newStart + Math.min(Math.max(keep, HALF_HOUR), EVENT_LIMITS.maxDays * DAY_MS)));
  }

  function pickEndDay(day: BangkokDay) {
    if (!start) return;
    // The same clock time that day if it fits, else the first time that fits.
    const minutes = endMinutes ?? 0;
    const options = Array.from({ length: 48 }, (_, i) => fromBangkok(day, i * 30, zone).getTime()).filter(
      (time) =>
        time >= start.getTime() + HALF_HOUR && time <= start.getTime() + EVENT_LIMITS.maxDays * DAY_MS && time > now.getTime(),
    );
    const same = fromBangkok(day, minutes, zone).getTime();
    const next = options.includes(same) ? same : options[0];
    if (next) setEnd(new Date(next));
  }

  async function addPhoto() {
    if (!session || uploading) return;
    setPhotoError(false);
    setUploading(true);
    const path = await pickAndUploadPhoto(session.user.id, 'cover', EVENT_PHOTO_BUCKET);
    setUploading(false);
    if (path === 'error') setPhotoError(true);
    else if (path) setPhotos((list) => [...list, path].slice(0, EVENT_LIMITS.maxPhotos));
  }

  function removePhoto(path: string) {
    setPhotos((list) => list.filter((p) => p !== path));
    // A saved photo stays until the changes are saved; a new one goes now.
    if (savedPhotos.includes(path)) setRemovedPhotos((list) => [...list, path]);
    else deleteEventPhotos([path]);
  }

  // Back to the map with what's typed.
  function changePlace() {
    onChange({
      photos,
      removedPhotos,
      title,
      category,
      description,
      paid,
      thbText,
      usdText,
      ticketText,
      meetingPoint,
      startDay: start ? bangkokDay(start, zone) : null,
      startMinutes: start ? bangkokMinutes(start, zone) : null,
      endDay,
      endMinutes,
      maxPeople,
      joinMode,
      womenOnly,
      announceOnly,
    });
  }

  async function handleCreate() {
    if (!start || !end || !category) return;
    const where: HangoutWhere =
      chosen.type === 'current'
        ? chosen.venueId
          ? { type: 'venue', venueId: chosen.venueId }
          : { type: 'place', placeId: chosen.placeId ?? '' }
        : chosen.type === 'venue'
        ? { type: 'venue', venueId: chosen.venue.id }
        : chosen.type === 'place' && chosen.place.world
          ? {
              type: 'spot',
              lat: chosen.place.lat,
              lng: chosen.place.lng,
              name: (chosen.place.name_en || chosen.place.name).slice(0, 80),
              timeZone: zone,
            }
          : chosen.type === 'place'
            ? { type: 'place', placeId: chosen.place.id }
            : { type: 'spot', lat: chosen.lat, lng: chosen.lng, name: spotName.trim(), timeZone: zone };
    setError(null);
    setCreating(true);
    const details = {
      where,
      title: title.trim(),
      description: description.trim(),
      category,
      startsAt: start,
      endsAt: end,
      maxPeople,
      meetingPoint,
      feeThb: thb !== null && !Number.isNaN(thb) ? thb : null,
      feeUsd: usd !== null && !Number.isNaN(usd) ? usd : null,
      ticketUrl: ticket || null,
      photoPaths: photos,
      announceOnly,
    };
    if (edit) {
      const saved = await updateEvent(edit.id, details);
      if (saved.error) {
        setCreating(false);
        setError(saved.error);
        return;
      }
      deleteEventPhotos(removedPhotos);
      // A new place outside Bangkok: its city, for the host's travel deals (the server cleared the old one).
      const found = chosen.type === 'current' ? null : await area;
      if (found) await setMeetupArea(edit.id, found);
      setCreating(false);
      router.back();
      return;
    }
    const result = await createEvent({ ...details, joinMode, womenOnly });
    if (result.error) {
      setCreating(false);
      setError(result.error);
      return;
    }
    const found = await area;
    if (found) await setMeetupArea(result.data, found);
    setCreating(false);
    router.replace({ pathname: '/table/[id]', params: { id: result.data } });
  }

  const placeLabel =
    chosen.type === 'current'
      ? chosen.name || t('events.currentPlace')
      : chosen.type === 'venue'
      ? localized(chosen.venue, 'name', language)
      : chosen.type === 'place'
        ? placeName(chosen.place, language)
        : spotName.trim() || t('hangouts.droppedPin');
  const placeLeading =
    chosen.type === 'venue' ? (
      <IconBadge icon={chosen.venue.category} tone="violetBall" />
    ) : chosen.type === 'place' ? (
      <View style={styles.emojiBadge}>
        <Text style={styles.emoji}>{placeEmoji(chosen.place.kind)}</Text>
      </View>
    ) : (
      <IconBadge icon="pushPin" tone="violetBall" />
    );
  const placeLine =
    chosen.type === 'venue'
      ? localized(chosen.venue, 'address', language) || t(`category.${chosen.venue.category}`)
      : chosen.type === 'spot'
        ? `${t('hangouts.droppedPin')} · ${chosen.lat.toFixed(4)}, ${chosen.lng.toFixed(4)}`
        : null;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScreenHeader
        title={edit ? t('events.edit') : t('events.newEvent')}
        subtitle={edit ? undefined : t('common.stepOf', { step: 2, total: 2 })}
        onBack={edit ? () => router.back() : changePlace}
      />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          <PlaceSummary leading={placeLeading} name={placeLabel} line={placeLine} lineTone="muted" onChange={changePlace}>
            {otherZone && (
              <View style={styles.zoneNote}>
                <Icon name="time" size={18} color={Colors.violetText} />
                <Text style={styles.zoneText}>{t('hangouts.localTime', { offset: formatUtcOffset(zone, now) })}</Text>
              </View>
            )}
          </PlaceSummary>

          <FormSection label={t('events.photosLabel')} note={t('common.optional')} count={`${photos.length}/${EVENT_LIMITS.maxPhotos}`}>
            <View style={styles.photos}>
              {photos.map((path, index) => (
                <View key={path} style={styles.photo}>
                  <Image source={eventPhotoUrl(path)} style={styles.photoImage} contentFit="cover" />
                  {index === 0 && photos.length > 1 && <Text style={styles.coverTag}>★</Text>}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('events.removePhoto')}
                    hitSlop={8}
                    onPress={() => removePhoto(path)}
                    style={({ pressed }) => [styles.photoRemove, pressed && styles.pressed]}>
                    <Icon name="close" size={16} color={Colors.white} />
                  </Pressable>
                </View>
              ))}
              {photos.length < EVENT_LIMITS.maxPhotos && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('events.addPhoto')}
                  disabled={uploading}
                  onPress={addPhoto}
                  style={({ pressed }) => [styles.photo, styles.photoAdd, pressed && styles.pressed]}>
                  <Icon name="photo" size={28} color={Colors.pinkText} />
                  <Text style={styles.photoAddText}>{uploading ? '…' : t('events.addPhoto')}</Text>
                </Pressable>
              )}
            </View>
            <Text style={styles.hint}>{photoError ? t('events.photoError') : t('events.photosHint')}</Text>
          </FormSection>

          <FormSection label={t('events.titleLabel')} required count={`${title.length}/80`}>
            <FormInput highlight value={title} onChangeText={setTitle} placeholder={t('events.titlePlaceholder')} maxLength={80} />
          </FormSection>

          <FormSection label={t('events.categoryLabel')} required>
            <View style={styles.chips}>
              {EVENT_CATEGORIES.map((item) => (
                <Chip
                  key={item}
                  label={`${EVENT_EMOJI[item]} ${t(`events.categories.${item}`)}`}
                  selected={category === item}
                  onPress={() => setCategory(item)}
                />
              ))}
            </View>
          </FormSection>

          <FormSection label={t('events.descriptionLabel')} note={t('common.optional')} count={`${description.length}/2000`}>
            <FormInput
              value={description}
              onChangeText={setDescription}
              placeholder={t('events.descriptionPlaceholder')}
              maxLength={2000}
              multiline
            />
          </FormSection>

          {chosen.type === 'spot' && (
            <FormSection label={t('hangouts.spotNameLabel')} required>
              <FormInput icon="pin" value={spotName} onChangeText={setSpotName} placeholder={t('hangouts.spotNamePlaceholder')} maxLength={80} />
            </FormSection>
          )}

          <FormSection label={t('feed.meetingPointLabel')} note={t('common.optional')}>
            <FormInput
              icon="pin"
              value={meetingPoint}
              onChangeText={setMeetingPoint}
              placeholder={t('events.meetingPointPlaceholder')}
              maxLength={120}
            />
          </FormSection>

          <FormSection label={t('events.entryLabel')}>
            <View style={styles.chips}>
              <Chip icon="doorOpen" label={t('events.free')} selected={!paid} onPress={() => setPaid(false)} />
              <Chip icon="ticket" label={t('events.paid')} selected={paid} onPress={() => setPaid(true)} />
            </View>
            {paid && !verified && verification && (
              <Pressable accessibilityRole="link" onPress={() => router.push('/verify')} style={({ pressed }) => [styles.verifyNote, pressed && styles.pressed]}>
                <Icon name="verified" size={20} color={Colors.pinkText} />
                <Text style={styles.verifyText}>
                  {t('events.paidNeedsVerified')} <Text style={styles.verifyLink}>{t('events.getVerified')}</Text>
                </Text>
              </Pressable>
            )}
            {paid && (
              <>
                <View style={styles.prices}>
                  <View style={styles.flex}>
                    <Text style={styles.priceLabel}>{t('events.priceThb')}</Text>
                    <FormInput value={thbText} onChangeText={setThbText} placeholder="500" keyboardType="decimal-pad" maxLength={10} />
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.priceLabel}>{t('events.priceUsd')}</Text>
                    <FormInput value={usdText} onChangeText={setUsdText} placeholder="15" keyboardType="decimal-pad" maxLength={9} />
                  </View>
                </View>
                {usdSuggestion !== null && (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setUsdText(usdSuggestion.toFixed(2))}
                    style={({ pressed }) => [styles.suggest, pressed && styles.pressed]}>
                    <Text style={styles.suggestText}>
                      {t('events.usdSuggest', { amount: formatMoney(usdSuggestion, 'USD', language) })}{' '}
                      <Text style={styles.verifyLink}>{t('events.useSuggestion')}</Text>
                    </Text>
                  </Pressable>
                )}
                <Text style={[styles.hint, (priceBad || priceMissing) && styles.bad]}>
                  {priceBad ? t('events.priceInvalid') : priceMissing ? t('events.priceRequired') : t('events.priceHint')}
                </Text>
                <Text style={styles.priceLabel}>
                  {t('events.ticketLabel')}
                  <Text style={styles.hint}>{`  ${t('common.optional')}`}</Text>
                </Text>
                <FormInput
                  icon="link"
                  value={ticketText}
                  onChangeText={setTicketText}
                  placeholder={t('events.ticketPlaceholder')}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  maxLength={500}
                />
                {ticketBad && <Text style={[styles.hint, styles.bad]}>{t('events.ticketInvalid')}</Text>}
              </>
            )}
          </FormSection>

          {startLocked && start ? (
            <FormSection label={t('events.startsLabel')}>
              <Text style={styles.hint}>{t('events.startLocked', { when: formatDayLabel(bangkokDay(start, zone), t, now, zone) + ' ' + formatClock(bangkokMinutes(start, zone)) })}</Text>
            </FormSection>
          ) : (
          <FormSection label={t('events.startsLabel')} required>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bleed} contentContainerStyle={styles.chipRow}>
              {startDays.map((option) => (
                <Chip
                  key={option}
                  tall
                  label={formatDayLabel(option, t, now, zone)}
                  selected={option === startDay}
                  onPress={() => pickStart(option, null)}
                />
              ))}
            </ScrollView>
            {startSlots.length === 0 ? (
              <Text style={styles.hint}>{t('tables.noTimesLeft')}</Text>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bleed} contentContainerStyle={styles.chipRow}>
                {startSlots.map((slot) => (
                  <Chip
                    key={slot}
                    shape="tile"
                    label={formatClock(slot)}
                    selected={slot === startMinutes}
                    onPress={() => pickStart(startDay, slot)}
                  />
                ))}
              </ScrollView>
            )}
          </FormSection>
          )}

          {start && end && endDay !== null && (
            <FormSection label={t('events.endsLabel')} note={t('events.openFor', { length: lengthLabel })}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bleed} contentContainerStyle={styles.chipRow}>
                {endDays.map((option) => (
                  <Chip
                    key={option}
                    tall
                    label={formatDayLabel(option, t, now, zone)}
                    selected={option === endDay}
                    onPress={() => pickEndDay(option)}
                  />
                ))}
              </ScrollView>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bleed} contentContainerStyle={styles.chipRow}>
                {endSlots.map((slot) => (
                  <Chip
                    key={slot}
                    shape="tile"
                    label={formatClock(slot)}
                    selected={slot === endMinutes}
                    onPress={() => setEnd(fromBangkok(endDay, slot, zone))}
                  />
                ))}
              </ScrollView>
              <Text style={styles.hint}>{t('events.hoursHint')}</Text>
            </FormSection>
          )}

          <Stepper
            label={t('events.peopleLabel')}
            hint={`${minPeople}–${EVENT_LIMITS.maxPeople}`}
            value={String(maxPeople)}
            canDecrease={maxPeople > minPeople}
            canIncrease={maxPeople < EVENT_LIMITS.maxPeople}
            onDecrease={() => setMaxPeople((n) => Math.max(minPeople, stepDown(n)))}
            onIncrease={() => setMaxPeople(stepUp)}
          />

          {!edit && (
          <FormSection label={t('privacy.whoCanJoin')}>
            <View style={styles.chips}>
              {(['open', 'private'] as const).map((mode) => (
                <Chip
                  key={mode}
                  icon={mode === 'private' ? 'lock' : 'lockOpen'}
                  label={t(`privacy.${mode}`)}
                  selected={joinMode === mode}
                  onPress={() => setJoinMode(mode)}
                />
              ))}
            </View>
            <Text style={styles.hint}>{t(`privacy.${joinMode}Hint`)}</Text>
            {verification?.woman && (
              <Toggle on={womenOnly} onPress={() => setWomenOnly(!womenOnly)} emoji="♀" title={t('women.only')} body={t('women.onlyHint')} />
            )}
          </FormSection>
          )}

          <FormSection label={t('events.chatLabel')}>
            <Toggle
              on={announceOnly}
              onPress={() => setAnnounceOnly(!announceOnly)}
              emoji="📣"
              title={t('events.announceOnly')}
              body={t('events.announceOnlyHint')}
            />
          </FormSection>

          {error && (
            <Text accessibilityRole="alert" style={styles.error}>
              {t(`events.errors.${error}`)}
            </Text>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
      <FormFooter>
        <Button title={edit ? t('events.saveChanges') : t('events.create')} onPress={handleCreate} loading={creating} disabled={!canCreate} />
      </FormFooter>
    </SafeAreaView>
  );
}

// An on / off row with an emoji, a title and a line of help.
function Toggle({ on, onPress, emoji, title, body }: { on: boolean; onPress: () => void; emoji: string; title: string; body: string }) {
  const styles = useStyles();
  const Colors = useColors();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      onPress={onPress}
      style={({ pressed }) => [styles.toggle, on && styles.toggleOn, pressed && styles.pressed]}>
      <Text style={styles.toggleEmoji}>{emoji}</Text>
      <View style={styles.flex}>
        <Text style={styles.toggleTitle}>{title}</Text>
        <Text style={styles.toggleBody}>{body}</Text>
      </View>
      <Icon name={on ? 'checkCircle' : 'circle'} size={24} color={on ? Colors.pinkText : Colors.textMuted} />
    </Pressable>
  );
}

const useStyles = makeStyles((Colors) => ({
  safe: { flex: 1, backgroundColor: Colors.bg },
  flex: { flex: 1 },
  pressed: { opacity: 0.75 },
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
  emojiBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.violetTint,
  },
  emoji: { fontSize: 22 },
  photos: { flexDirection: 'row', gap: Spacing.md },
  photo: { flex: 1, aspectRatio: 4 / 3, borderRadius: Radius.md, overflow: 'hidden', backgroundColor: Colors.surfaceRaised },
  photoImage: { width: '100%', height: '100%' },
  photoAdd: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Colors.borderStrong,
    backgroundColor: Colors.pinkTint,
  },
  photoAddText: { ...Type.label, fontSize: 13, color: Colors.pinkText },
  photoRemove: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  coverTag: {
    position: 'absolute',
    left: 6,
    top: 6,
    paddingHorizontal: 6,
    borderRadius: Radius.pill,
    overflow: 'hidden',
    fontSize: 12,
    fontWeight: '800',
    color: Colors.white,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  bleed: { marginHorizontal: -Spacing.lg },
  chipRow: { gap: Spacing.sm, paddingHorizontal: Spacing.lg, paddingVertical: 2 },
  hint: { ...Type.small, color: Colors.textMuted },
  bad: { color: Colors.danger },
  prices: { flexDirection: 'row', gap: Spacing.md },
  priceLabel: { ...Type.small, fontWeight: '700', color: Colors.textSecondary, marginBottom: 4 },
  suggest: { alignSelf: 'flex-start', paddingVertical: 2 },
  suggestText: { ...Type.small, color: Colors.textSecondary },
  verifyNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.pinkTint,
  },
  verifyText: { ...Type.small, color: Colors.text, flex: 1 },
  verifyLink: { fontWeight: '800', color: Colors.pinkText, textDecorationLine: 'underline' },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  toggleOn: { borderColor: Colors.pinkText, backgroundColor: Colors.pinkTint },
  toggleEmoji: { fontSize: 22 },
  toggleTitle: { ...Type.label, fontSize: 15, fontWeight: '800', color: Colors.text },
  toggleBody: { ...Type.small, color: Colors.textSecondary },
  error: {
    ...Type.small,
    color: Colors.danger,
    backgroundColor: Colors.dangerBg,
    padding: Spacing.md,
    borderRadius: Radius.sm,
    overflow: 'hidden',
  },
}));
