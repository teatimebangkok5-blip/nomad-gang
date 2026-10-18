import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Pressable, ScrollView, Share, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { GlossyFill } from '@/components/glossy';
import { Icon } from '@/components/icon';
import { MapSearchBar } from '@/components/map-search';
import { planShareText } from '@/components/plan-timeline';
import { MakeHangoutBox, PlanView } from '@/components/plan-view';
import { ScreenHeader } from '@/components/screen-header';
import { Radius, Raised, Spacing, Type } from '@/constants/theme';
import { localized, useLanguage } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { bangkokDay, bangkokMinutes, formatClock, formatDayLabel, parseClock, type BangkokDay } from '@/lib/bangkok-time';
import { useCurrentLocation } from '@/lib/location';
import { areaName, useMapSearch, type SearchResult } from '@/lib/map-search';
import { entryFilter, placeName } from '@/lib/places';
import {
  buildPlan,
  INTERESTS,
  retime,
  type Coords,
  type Interest,
  type PlanInput,
  type PlanStop,
  type TransitNetwork,
  type TravelMode,
} from '@/lib/planner';
import {
  isoDate,
  loadCandidates,
  loadTransitNetwork,
  makeFoodNear,
  makePlanHangout,
  planDay,
  planHangoutError,
  savePlan,
  useMyPlans,
} from '@/lib/plans';
import { makeStyles, useColors } from '@/lib/theme';
import { isHangoutVenue, useVenues } from '@/lib/venues';

// Well-known areas to start a day from.
const AREAS = {
  oldTown: { lat: 13.7515, lng: 100.4927 },
  siam: { lat: 13.7458, lng: 100.5341 },
  sukhumvit: { lat: 13.7376, lng: 100.5604 },
  chinatown: { lat: 13.7405, lng: 100.5096 },
  riverside: { lat: 13.7189, lng: 100.5141 },
  chatuchak: { lat: 13.7998, lng: 100.5509 },
  silom: { lat: 13.7286, lng: 100.5341 },
  khaosan: { lat: 13.759, lng: 100.4974 },
  ari: { lat: 13.7798, lng: 100.5446 },
} as const;
type AreaKey = keyof typeof AREAS;

type Start = { type: 'location' } | { type: 'area'; key: AreaKey } | { type: 'picked'; name: string; at: Coords };

const DAYS_AHEAD = 14;
const MAX_HOURS = 12; // a day hangout lasts at most 12 hours
const MODES: TravelMode[] = ['walk', 'taxi', 'transit'];
type EntryChoice = 'free' | 'ticket';
const ENTRY_CHOICES: EntryChoice[] = ['free', 'ticket'];

type Result = {
  input: PlanInput;
  stops: PlanStop[];
  network: TransitNetwork | null;
  areaLabel: string | null;
};

// "Plan my day": choose a start, a day and hours, what you like, entry and how to get around; the app plans the day
// (rule-based, from TableMeet's places). The plan can be edited, saved, shared as a message or turned into a day
// hangout others join.
export default function PlanDayScreen() {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  const language = useLanguage();
  const { session } = useAuth();
  const venues = useVenues();
  const location = useCurrentLocation();
  const coords = location.state.status === 'granted' ? location.state.coords : null;
  const myPlans = useMyPlans(session?.user.id);
  const search = useMapSearch('hangout', venues.venues.filter(isHangoutVenue));

  const [now] = useState(() => new Date());
  const today = bangkokDay(now);
  const [start, setStart] = useState<Start | null>(coords ? { type: 'location' } : { type: 'area', key: 'oldTown' });
  const [day, setDay] = useState<BangkokDay>(today);
  const [fromText, setFromText] = useState('09:00');
  const [untilText, setUntilText] = useState('18:00');
  const [interests, setInterests] = useState<Interest[]>(['temples', 'sights', 'markets']);
  const [meals, setMeals] = useState(true);
  const [nightlife, setNightlife] = useState(false);
  const [entry, setEntry] = useState<EntryChoice[]>(['free', 'ticket']);
  const [modes, setModes] = useState<TravelMode[]>(['walk', 'transit']);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);


  function startCoords(): { at: Coords; label: string | null } | null {
    if (!start) return null;
    if (start.type === 'location') return coords ? { at: coords, label: null } : null;
    if (start.type === 'area') return { at: AREAS[start.key], label: t(`plan.areas.${start.key}`) };
    return { at: start.at, label: start.name };
  }

  async function generate(avoid?: Set<string>) {
    const s = startCoords();
    if (!s) return setProblem(t('plan.needStart'));
    const from = parseClock(fromText);
    const until = parseClock(untilText);
    if (from === null || from >= 24 * 60 || until === null) return setProblem(t('plan.badTime'));
    if (until - from < 60) return setProblem(t('plan.tooShort'));
    if (until - from > MAX_HOURS * 60) return setProblem(t('plan.tooLong'));
    if (day === today && from < bangkokMinutes(new Date()) - 30) return setProblem(t('plan.timePassed'));
    if (interests.length === 0) return setProblem(t('plan.needInterest'));
    setProblem(null);
    setBusy(true);
    const input: PlanInput = { start: s.at, startMinutes: from, endMinutes: until, modes, interests, meals, nightlife };
    const [candidates, network] = await Promise.all([
      loadCandidates(
        s.at,
        modes,
        interests,
        // Both picked = any place (also ones whose entry isn't confirmed).
        entry.length === 2 ? null : entryFilter(entry[0] === 'free' ? 'free_entry' : 'ticket', language),
        venues.venues,
      ),
      modes.includes('transit') ? loadTransitNetwork() : Promise.resolve(null),
    ]);
    if (!candidates) {
      setBusy(false);
      return setProblem(t('plan.errorLoad'));
    }
    const deps = { candidates, network, foodNear: makeFoodNear(venues.venues) };
    let stops = await buildPlan(input, { ...deps, avoid });
    // A shuffle that runs out of new places falls back to the full list.
    if (avoid && stops.filter((stop) => stop.type === 'sight').length === 0) stops = await buildPlan(input, deps);
    setBusy(false);
    if (stops.filter((stop) => stop.type === 'sight').length === 0) return setProblem(t('plan.empty'));
    setResult({ input, stops, network, areaLabel: s.label });
  }

  function pickSearch(found: SearchResult) {
    search.clear();
    if (found.type === 'venue') setStart({ type: 'picked', name: localized(found.venue, 'name', language), at: found.venue });
    else if (found.type === 'place') setStart({ type: 'picked', name: placeName(found.place, language), at: found.place });
    else if (found.type === 'area') setStart({ type: 'picked', name: areaName(found.area, language), at: found.area });
  }

  if (result) {
    return (
      <ResultScreen
        result={result}
        dayNumber={day}
        onChange={setResult}
        onStartOver={() => setResult(null)}
        onShuffle={() => generate(new Set(result.stops.filter((s) => s.type === 'sight').map((s) => s.key)))}
        shuffling={busy}
        onSaved={myPlans.reload}
      />
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <ScreenHeader title={t('plan.title')} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.intro}>{t('plan.intro')}</Text>

        <Text style={styles.label}>{t('plan.startPoint')}</Text>
        <View style={styles.wrapRow}>
          {coords && (
            <Chip label={`📍 ${t('plan.myLocation')}`} selected={start?.type === 'location'} onPress={() => setStart({ type: 'location' })} />
          )}
          {(Object.keys(AREAS) as AreaKey[]).map((key) => (
            <Chip
              key={key}
              label={t(`plan.areas.${key}`)}
              selected={start?.type === 'area' && start.key === key}
              onPress={() => setStart({ type: 'area', key })}
            />
          ))}
          {start?.type === 'picked' && <Chip label={`📍 ${start.name}`} selected onPress={() => {}} />}
        </View>
        <View style={styles.searchWrap}>
          <MapSearchBar value={search.query} onChangeText={search.setQuery} placeholder={t('plan.searchStart')} />
        </View>
        {search.active && (
          <View style={styles.results}>
            <GlossyFill />
            {search.searching && <ActivityIndicator color={Colors.accent} style={styles.spinner} />}
            {search.results.filter((found) => found.type !== 'world').slice(0, 8).map((found) => {
              const name =
                found.type === 'venue'
                  ? localized(found.venue, 'name', language)
                  : found.type === 'place'
                    ? placeName(found.place, language)
                    : found.type === 'area'
                      ? areaName(found.area, language)
                      : '';
              return (
                <Pressable
                  key={`${found.type}:${found.type === 'venue' ? found.venue.id : found.type === 'place' ? found.place.id : found.type === 'area' ? found.area.id : ''}`}
                  accessibilityRole="button"
                  onPress={() => pickSearch(found)}
                  style={({ pressed }) => [styles.resultRow, pressed && styles.pressed]}>
                  <Icon name={found.type === 'area' ? 'map' : 'location'} size={18} color={Colors.accent} />
                  <Text style={styles.resultText} numberOfLines={1}>
                    {name}
                  </Text>
                </Pressable>
              );
            })}
            {!search.searching && search.results.length === 0 && <Text style={styles.muted}>{t('search.noResults')}</Text>}
          </View>
        )}

        <Text style={styles.label}>{t('plan.day')}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {Array.from({ length: DAYS_AHEAD }, (_, i) => today + i).map((option) => (
            <Chip
              key={option}
              label={formatDayLabel(option, t, now)}
              selected={option === day}
              onPress={() => setDay(option)}
            />
          ))}
        </ScrollView>

        <View style={styles.timeRow}>
          <TimeField label={t('plan.from')} value={fromText} onChange={setFromText} />
          <TimeField label={t('plan.until')} value={untilText} onChange={setUntilText} />
        </View>
        <Text style={styles.hint}>{t('plan.timeHint')}</Text>

        <Text style={styles.label}>{t('plan.interests')}</Text>
        <View style={styles.wrapRow}>
          {INTERESTS.map((interest) => {
            const on = interests.includes(interest);
            return (
              <Chip
                key={interest}
                label={t(`plan.interest.${interest}`)}
                selected={on}
                onPress={() => setInterests((prev) => (on ? prev.filter((i) => i !== interest) : [...prev, interest]))}
              />
            );
          })}
        </View>

        <View style={styles.group}>
          <GlossyFill />
          <SwitchRow label={t('plan.mealsOption')} value={meals} onChange={setMeals} />
          <SwitchRow label={t('plan.nightlifeOption')} value={nightlife} onChange={setNightlife} />
        </View>

        <Text style={styles.label}>{t('plan.budget')}</Text>
        <Text style={styles.hint}>{t('plan.budgetHint')}</Text>
        <View style={styles.wrapRow}>
          {ENTRY_CHOICES.map((option) => {
            const on = entry.includes(option);
            return (
              <Chip
                key={option}
                label={option === 'free' ? `✓ ${t('plan.budgetFree')}` : `🎟️ ${t('plan.budgetTickets')}`}
                selected={on}
                // At least one stays picked.
                onPress={() =>
                  setEntry((prev) => (on ? (prev.length > 1 ? prev.filter((e) => e !== option) : prev) : [...prev, option]))
                }
              />
            );
          })}
        </View>

        <Text style={styles.label}>{t('plan.travel')}</Text>
        <Text style={styles.hint}>{t('plan.travelHint')}</Text>
        <View style={styles.wrapRow}>
          {MODES.map((option) => {
            const on = modes.includes(option);
            return (
              <Chip
                key={option}
                label={
                  option === 'walk'
                    ? `🚶 ${t('plan.travelWalk')}`
                    : option === 'taxi'
                      ? `🚕 ${t('plan.travelTaxi')}`
                      : `🚇 ${t('plan.travelTransit')}`
                }
                selected={on}
                // At least one stays picked.
                onPress={() =>
                  setModes((prev) => (on ? (prev.length > 1 ? prev.filter((m) => m !== option) : prev) : [...prev, option]))
                }
              />
            );
          })}
        </View>

        {problem && (
          <Text accessibilityRole="alert" style={styles.error}>
            {problem}
          </Text>
        )}
        <View style={styles.submit}>
          <Button
            title={t('plan.create')}
            icon={<Icon name="time" size={20} color={Colors.onBrand} />}
            loading={busy}
            onPress={() => generate()}
          />
        </View>

        {myPlans.plans && myPlans.plans.length > 0 && (
          <>
            <Text style={styles.label}>{t('plan.myPlans')}</Text>
            <View style={styles.planList}>
              {myPlans.plans.map((plan) => (
                <Pressable
                  key={plan.id}
                  accessibilityRole="button"
                  onPress={() => router.push({ pathname: '/plan/[id]', params: { id: plan.id } })}
                  style={({ pressed }) => [styles.planRow, pressed && styles.pressed]}>
                  <GlossyFill />
                  <Text style={styles.planTitle} numberOfLines={1}>
                    {plan.title}
                  </Text>
                  <Text style={styles.muted}>
                    {formatDayLabel(planDay(plan.day), t, now)} · {formatClock(plan.start_minutes)}–{formatClock(plan.end_minutes)} ·{' '}
                    {t('plan.stops', { count: plan.stops.length })}
                    {plan.meetup_id ? ` · 🙌 ${t('hangouts.hangout')}` : ''}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// A time typed as HH:MM ("9", "930", "9.30" and "21:00" work too); tidied to HH:MM when the field is left.
function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (next: string) => void }) {
  const styles = useStyles();
  const Colors = useColors();
  return (
    <View style={styles.timeField}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        onBlur={() => {
          const minutes = parseClock(value);
          if (minutes !== null) onChange(formatClock(minutes, true));
        }}
        placeholder="09:00"
        placeholderTextColor={Colors.textMuted}
        keyboardType="numbers-and-punctuation"
        maxLength={5}
        selectTextOnFocus
        selectionColor={Colors.orange}
        keyboardAppearance="dark"
        style={[styles.input, styles.timeInput]}
      />
    </View>
  );
}

function SwitchRow({ label, value, onChange }: { label: string; value: boolean; onChange: (next: boolean) => void }) {
  const styles = useStyles();
  const Colors = useColors();
  return (
    <View style={styles.switchRow}>
      <Text style={styles.switchLabel}>{label}</Text>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onChange}
        trackColor={{ false: Colors.borderStrong, true: Colors.orange }}
        thumbColor={Colors.white}
      />
    </View>
  );
}

function ResultScreen({
  result,
  dayNumber,
  onChange,
  onStartOver,
  onShuffle,
  shuffling,
  onSaved,
}: {
  result: Result;
  dayNumber: BangkokDay;
  onChange: (next: Result) => void;
  onStartOver: () => void;
  onShuffle: () => void;
  shuffling: boolean;
  onSaved: () => void;
}) {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  const language = useLanguage();
  const { session } = useAuth();
  const [title, setTitle] = useState(
    result.areaLabel ? t('plan.defaultTitle', { area: result.areaLabel }) : t('plan.defaultTitleNoArea'),
  );
  const [savedId, setSavedId] = useState<string | null>(null);
  const [working, setWorking] = useState<'save' | 'hangout' | null>(null);
  const dayLabel = formatDayLabel(dayNumber, t);

  async function ensureSaved(): Promise<string | null> {
    if (savedId) return savedId;
    if (!session) return null;
    const { id, error } = await savePlan({
      owner_id: session.user.id,
      title: title.trim() || t('plan.defaultTitleNoArea'),
      day: isoDate(dayNumber),
      start_minutes: result.input.startMinutes,
      end_minutes: result.input.endMinutes,
      travel_modes: result.input.modes,
      stops: result.stops,
    });
    if (error || !id) {
      Alert.alert(t(`plan.errors.${error === 'not_found' ? 'not_found' : 'generic'}`));
      return null;
    }
    setSavedId(id);
    onSaved();
    return id;
  }

  async function save() {
    setWorking('save');
    const id = await ensureSaved();
    setWorking(null);
    if (id) Alert.alert(t('plan.saved'));
  }

  async function makeHangout(people: number) {
    setWorking('hangout');
    const id = await ensureSaved();
    if (!id) return setWorking(null);
    const { meetupId, error } = await makePlanHangout(id, people);
    setWorking(null);
    if (error || !meetupId) return Alert.alert(planHangoutError(error, t));
    router.replace({ pathname: '/table/[id]', params: { id: meetupId } });
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <ScreenHeader
        title={t('plan.title')}
        right={
          <Pressable accessibilityRole="button" hitSlop={8} onPress={onStartOver} style={styles.headerLink}>
            <Text style={styles.link}>{t('plan.startOver')}</Text>
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>{t('plan.titleLabel')}</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          maxLength={80}
          selectionColor={Colors.orange}
          keyboardAppearance="dark"
          style={styles.input}
        />
        <Text style={styles.muted}>
          {dayLabel} · {formatClock(result.input.startMinutes)}–{formatClock(result.input.endMinutes)}
        </Text>

        <View style={styles.planWrap}>
          <PlanView
            start={result.input.start}
            stops={result.stops}
            onRemove={
              savedId
                ? undefined
                : (key) =>
                    onChange({ ...result, stops: retime(result.stops.filter((s) => s.key !== key), result.input, result.network) })
            }
          />
        </View>

        <View style={styles.actionsRow}>
          <View style={styles.flex}>
            <Button title={t('plan.shuffle')} variant="secondary" loading={shuffling} disabled={Boolean(savedId)} onPress={onShuffle} />
          </View>
          <View style={styles.flex}>
            <Button
              title={t('plan.share')}
              variant="secondary"
              onPress={() => Share.share({ message: planShareText(title, dayLabel, result.stops, t, language) })}
            />
          </View>
        </View>
        <View style={styles.actionsSingle}>
          <Button title={savedId ? t('plan.saved') : t('plan.save')} variant="secondary" loading={working === 'save'} disabled={Boolean(savedId)} onPress={save} />
        </View>

        <MakeHangoutBox loading={working === 'hangout'} onMake={makeHangout} />
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((Colors) => ({
  safe: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl * 2 },
  flex: { flex: 1 },
  intro: { ...Type.body, color: Colors.textSecondary },
  label: { ...Type.label, color: Colors.textSecondary, marginTop: Spacing.lg, marginBottom: Spacing.sm },
  muted: { ...Type.small, color: Colors.textMuted, marginTop: Spacing.xs },
  timeRow: { flexDirection: 'row', gap: Spacing.md },
  timeField: { flex: 1 },
  timeInput: { fontSize: 20, fontWeight: '700', textAlign: 'center', letterSpacing: 1 },
  hint: { ...Type.small, color: Colors.textMuted, marginTop: -Spacing.xs, marginBottom: Spacing.sm },
  row: { gap: Spacing.sm, paddingRight: Spacing.lg },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  searchWrap: { marginTop: Spacing.md, marginHorizontal: -Spacing.lg },
  results: {
    marginTop: Spacing.sm,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
    ...Raised,
  },
  spinner: { marginVertical: Spacing.md },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.md, minHeight: 48 },
  resultText: { ...Type.body, color: Colors.text, flex: 1 },
  pressed: { opacity: 0.7 },
  group: {
    marginTop: Spacing.lg,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
    ...Raised,
  },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, minHeight: 48 },
  switchLabel: { ...Type.body, color: Colors.text, flex: 1 },
  error: {
    ...Type.small,
    color: Colors.danger,
    backgroundColor: Colors.dangerBg,
    padding: Spacing.md,
    borderRadius: Radius.sm,
    marginTop: Spacing.lg,
  },
  submit: { marginTop: Spacing.xl },
  planList: { gap: Spacing.sm },
  planRow: {
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
    ...Raised,
  },
  planTitle: { ...Type.heading, color: Colors.text },
  headerLink: { paddingHorizontal: Spacing.md, minHeight: 44, justifyContent: 'center' },
  link: { ...Type.label, color: Colors.accent },
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
  planWrap: { marginTop: Spacing.lg },
  actionsRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.xl },
  actionsSingle: { marginTop: Spacing.sm },
}));
