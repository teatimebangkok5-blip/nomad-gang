import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { FormFooter, FormSection, Stepper } from '@/components/form-parts';
import { GlossyFill } from '@/components/glossy';
import { Icon } from '@/components/icon';
import { ScreenHeader } from '@/components/screen-header';
import { Radius, Spacing, Type } from '@/constants/theme';
import { localized, useLanguage } from '@/i18n';
import { zoneAt } from '@/lib/bangkok-time';
import { useCurrentLocation } from '@/lib/location';
import { areaName, useMapSearch, type SearchResult } from '@/lib/map-search';
import { createPitstop, setMeetupVibe, type HangoutWhere, type MeetupErrorKey } from '@/lib/meetups';
import { placeName } from '@/lib/places';
import { makeStyles, useColors } from '@/lib/theme';
import { useVenues } from '@/lib/venues';

const ACTIVITIES = [
  { id: 'boba', emoji: '🧋' },
  { id: 'coffee', emoji: '☕' },
  { id: 'drinks', emoji: '🍻' },
  { id: 'food', emoji: '🍜' },
  { id: 'market', emoji: '🏮' },
  { id: 'tuktuk', emoji: '🛺' },
  { id: 'walk', emoji: '🚶' },
] as const;
type ActivityId = (typeof ACTIVITIES)[number]['id'];

const LEAVING = [0, 5, 10, 15, 30, 45, 60] as const;
const LENGTHS = [30, 45, 60, 90, 120] as const;

type Where = { where: HangoutWhere; label: string };

// "Heading to X in 15 min": a short, spontaneous hangout (pit-stop) starting within the hour, 30–120 minutes long,
// 2–8 people. Pick what (boba, a tuk-tuk ride, a night market…), where (a place, partner venue or area from the
// search, or near me) and when.
export default function PitstopScreen() {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  const language = useLanguage();
  const venues = useVenues();
  const location = useCurrentLocation();
  const food = useMapSearch('food', venues.venues);
  const hangout = useMapSearch('hangout', []);
  const [activity, setActivity] = useState<ActivityId | null>('boba');
  const [title, setTitle] = useState(() => `🧋 ${t('pitstop.activities.boba')}`);
  const [place, setPlace] = useState<Where | null>(null);
  const [leaving, setLeaving] = useState<(typeof LEAVING)[number]>(15);
  const [length, setLength] = useState<(typeof LENGTHS)[number]>(45);
  const [maxPeople, setMaxPeople] = useState(4);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MeetupErrorKey | null>(null);

  const coords = location.state.status === 'granted' ? location.state.coords : null;
  const results = food.active ? [...food.results, ...hangout.results.filter((r) => r.type === 'place')].slice(0, 8) : [];

  function pickActivity(id: ActivityId) {
    const item = ACTIVITIES.find((a) => a.id === id)!;
    setActivity(id);
    setTitle(`${item.emoji} ${t(`pitstop.activities.${id}`)}`);
  }

  function pickResult(result: SearchResult) {
    food.clear();
    hangout.clear();
    if (result.type === 'venue') {
      setPlace({ where: { type: 'venue', venueId: result.venue.id }, label: localized(result.venue, 'name', language) });
    } else if (result.type === 'place') {
      setPlace({ where: { type: 'place', placeId: result.place.id }, label: placeName(result.place, language) });
    } else if (result.type === 'area') {
      const name = areaName(result.area, language);
      setPlace({
        where: { type: 'spot', lat: result.area.lat, lng: result.area.lng, name, timeZone: zoneAt(result.area.lat, result.area.lng) },
        label: name,
      });
    } else {
      const { world } = result;
      setPlace({
        where: { type: 'spot', lat: world.lat, lng: world.lng, name: world.name, timeZone: zoneAt(world.lat, world.lng) },
        label: world.name,
      });
    }
  }

  // Near me, rounded to about 100 m so the pin doesn't show exactly where I am.
  function nearMe() {
    if (!coords) {
      location.request();
      return;
    }
    const lat = Math.round(coords.lat * 1000) / 1000;
    const lng = Math.round(coords.lng * 1000) / 1000;
    setPlace({ where: { type: 'spot', lat, lng, name: t('pitstop.nearMeSpot'), timeZone: zoneAt(lat, lng) }, label: t('pitstop.nearMe') });
  }

  async function create() {
    if (!place || !title.trim()) return;
    setBusy(true);
    setError(null);
    const result = await createPitstop({
      where: place.where,
      title: title.trim(),
      startsInMinutes: leaving,
      durationMinutes: length,
      maxPeople,
    });
    if (result.error) {
      setBusy(false);
      setError(result.error);
      return;
    }
    if (activity === 'drinks') await setMeetupVibe(result.data, 'party');
    setBusy(false);
    router.replace({ pathname: '/table/[id]', params: { id: result.data } });
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScreenHeader title={`⚡ ${t('pitstop.title')}`} subtitle={t('pitstop.subtitle')} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <FormSection label={t('pitstop.what')}>
            <View style={styles.chips}>
              {ACTIVITIES.map((item) => (
                <Chip
                  key={item.id}
                  label={`${item.emoji} ${t(`pitstop.activities.${item.id}`)}`}
                  selected={activity === item.id}
                  onPress={() => pickActivity(item.id)}
                />
              ))}
            </View>
            <TextInput
              value={title}
              onChangeText={(text) => {
                setTitle(text);
                setActivity(null);
              }}
              maxLength={80}
              placeholder={t('pitstop.titlePlaceholder')}
              placeholderTextColor={Colors.textMuted}
              style={styles.input}
            />
          </FormSection>

          <FormSection label={t('pitstop.where')}>
            {place ? (
              <View style={styles.picked}>
                <GlossyFill />
                <Icon name="pin" size={22} color={Colors.amberText} />
                <Text style={styles.pickedName} numberOfLines={1}>
                  {place.label}
                </Text>
                <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setPlace(null)}>
                  <Text style={styles.change}>{t('common.change')}</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <Pressable
                  accessibilityRole="button"
                  onPress={nearMe}
                  style={({ pressed }) => [styles.nearMe, pressed && styles.pressed]}>
                  <GlossyFill />
                  <Icon name="myLocation" size={22} color={Colors.amberText} />
                  <Text style={styles.nearMeText}>{t('pitstop.nearMe')}</Text>
                </Pressable>
                <TextInput
                  value={food.query}
                  onChangeText={(text) => {
                    food.setQuery(text);
                    hangout.setQuery(text);
                  }}
                  placeholder={t('pitstop.searchPlaceholder')}
                  placeholderTextColor={Colors.textMuted}
                  style={styles.input}
                />
                {food.active && food.searching && results.length === 0 && <ActivityIndicator color={Colors.accent} />}
                {results.map((result, index) => {
                  const label =
                    result.type === 'venue'
                      ? localized(result.venue, 'name', language)
                      : result.type === 'place'
                        ? placeName(result.place, language)
                        : result.type === 'area'
                          ? areaName(result.area, language)
                          : result.world.name;
                  return (
                    <Pressable
                      key={`${result.type}-${index}`}
                      accessibilityRole="button"
                      onPress={() => pickResult(result)}
                      style={({ pressed }) => [styles.result, pressed && styles.pressed]}>
                      <Icon name={result.type === 'area' ? 'map' : 'pin'} size={18} color={Colors.textSecondary} />
                      <Text style={styles.resultText} numberOfLines={1}>
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </>
            )}
          </FormSection>

          <FormSection label={t('pitstop.leaving')}>
            <View style={styles.chips}>
              {LEAVING.map((minutes) => (
                <Chip
                  key={minutes}
                  label={minutes === 0 ? t('pitstop.now') : t('pitstop.inMinutes', { count: minutes })}
                  selected={leaving === minutes}
                  onPress={() => setLeaving(minutes)}
                />
              ))}
            </View>
          </FormSection>

          <FormSection label={t('pitstop.length')}>
            <View style={styles.chips}>
              {LENGTHS.map((minutes) => (
                <Chip
                  key={minutes}
                  label={t('pitstop.minutes', { count: minutes })}
                  selected={length === minutes}
                  onPress={() => setLength(minutes)}
                />
              ))}
            </View>
          </FormSection>

          <Stepper
            label={t('tables.people')}
            hint={t('pitstop.peopleHint')}
            value={String(maxPeople)}
            canDecrease={maxPeople > 2}
            canIncrease={maxPeople < 8}
            onDecrease={() => setMaxPeople((n) => Math.max(2, n - 1))}
            onIncrease={() => setMaxPeople((n) => Math.min(8, n + 1))}
          />

          {error && (
            <Text accessibilityRole="alert" style={styles.error}>
              {error === 'too_many_open' ? t('pitstop.errors.too_many_open') : t(`hangouts.errors.${error}`)}
            </Text>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
      <FormFooter>
        <Button
          title={
            place
              ? leaving === 0
                ? t('pitstop.createNow', { place: place.label })
                : t('pitstop.create', { place: place.label, count: leaving })
              : t('pitstop.pickPlace')
          }
          icon={<Icon name="bolt" size={22} color={Colors.onBrand} />}
          disabled={!place || !title.trim()}
          loading={busy}
          onPress={create}
        />
      </FormFooter>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((Colors) => ({
  safe: { flex: 1, backgroundColor: Colors.bg },
  flex: { flex: 1 },
  pressed: { opacity: 0.8 },
  content: { padding: Spacing.lg, gap: Spacing.lg, paddingBottom: Spacing.xxl },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  input: {
    minHeight: 48,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.field,
    color: Colors.text,
    fontSize: 16,
  },
  picked: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 2,
    borderColor: Colors.amber,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
  },
  pickedName: { ...Type.label, fontSize: 15, fontWeight: '800', color: Colors.text, flex: 1 },
  change: { ...Type.label, color: Colors.accent },
  nearMe: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
  },
  nearMeText: { ...Type.label, fontSize: 15, fontWeight: '700', color: Colors.text },
  result: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceRaised,
  },
  resultText: { ...Type.body, color: Colors.text, flex: 1 },
  error: { ...Type.small, color: Colors.danger },
}));
