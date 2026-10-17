import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { GlossyFill } from '@/components/glossy';
import { Icon } from '@/components/icon';
import { DateField, FieldLabel } from '@/components/profile-fields';
import { ScreenHeader } from '@/components/screen-header';
import { Radius, RaisedSmall, Spacing, Type } from '@/constants/theme';
import { flagEmoji, fromIsoDate } from '@/lib/profile-options';
import type { ProfileErrorKey } from '@/lib/profiles';
import { makeStyles, useColors } from '@/lib/theme';
import { deleteTrip, fetchTrip, saveTrip, searchCities, type CityResult } from '@/lib/trips';

type PickedCity = { city: string; context: string; countryCode: string | null; lat: number | null; lng: number | null };

// Add or edit a trip (?id=… edits): a city found with Photon, from / until dates and an optional note.
export default function TripFormScreen() {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [loading, setLoading] = useState(Boolean(id));
  const [city, setCity] = useState<PickedCity | null>(null);
  const [startsOn, setStartsOn] = useState<string | null>(null);
  const [endsOn, setEndsOn] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ProfileErrorKey | null>(null);

  useEffect(() => {
    if (!id) return;
    fetchTrip(id).then((trip) => {
      setLoading(false);
      if (!trip) return;
      setCity({ city: trip.city, context: '', countryCode: trip.country_code, lat: trip.lat, lng: trip.lng });
      setStartsOn(trip.starts_on);
      setEndsOn(trip.ends_on);
      setNote(trip.note ?? '');
    });
  }, [id]);

  async function save() {
    if (!city || !startsOn || !endsOn) return;
    setSaving(true);
    setError(null);
    const result = await saveTrip({
      id: id ?? null,
      city: city.city,
      country_code: city.countryCode,
      lat: city.lat,
      lng: city.lng,
      starts_on: startsOn,
      ends_on: endsOn,
      note: note.trim() || null,
    });
    setSaving(false);
    if (result) setError(result);
    else router.back();
  }

  function confirmDelete() {
    if (!id) return;
    Alert.alert(t('trips.deleteConfirm'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('trips.delete'),
        style: 'destructive',
        onPress: async () => {
          const result = await deleteTrip(id);
          if (result) setError(result);
          else router.back();
        },
      },
    ]);
  }

  const today = new Date();
  const tenYears = 10 * 365 * 24 * 60 * 60 * 1000;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <ScreenHeader title={id ? t('trips.edit') : t('trips.newTitle')} />
      {loading ? (
        <ActivityIndicator color={Colors.accent} size="large" style={styles.spinner} />
      ) : (
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <FieldLabel>{t('trips.city')}</FieldLabel>
            {city ? (
              <View style={styles.picked}>
                <GlossyFill />
                <Text style={styles.pickedFlag}>{flagEmoji(city.countryCode)}</Text>
                <View style={styles.flex}>
                  <Text style={styles.pickedCity}>{city.city}</Text>
                  {city.context ? <Text style={styles.pickedContext}>{city.context}</Text> : null}
                </View>
                <Pressable accessibilityRole="button" onPress={() => setCity(null)} hitSlop={8}>
                  <Text style={styles.change}>{t('trips.change')}</Text>
                </Pressable>
              </View>
            ) : (
              <CitySearch onPick={(result) => setCity(result)} />
            )}

            <FieldLabel>{t('trips.from')}</FieldLabel>
            <DateField
              value={startsOn}
              placeholder={t('trips.from')}
              minimumDate={new Date(today.getTime() - tenYears)}
              maximumDate={new Date(today.getTime() + tenYears)}
              onChange={(iso) => {
                setStartsOn(iso);
                if (!endsOn || endsOn < iso) setEndsOn(iso);
              }}
            />
            <FieldLabel>{t('trips.until')}</FieldLabel>
            <DateField
              value={endsOn}
              placeholder={t('trips.until')}
              minimumDate={startsOn ? fromIsoDate(startsOn) : new Date(today.getTime() - tenYears)}
              maximumDate={startsOn ? new Date(fromIsoDate(startsOn).getTime() + 366 * 86400000) : undefined}
              initialDate={startsOn ? fromIsoDate(startsOn) : undefined}
              onChange={setEndsOn}
            />

            <FieldLabel>{t('trips.note')}</FieldLabel>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder={t('trips.notePlaceholder')}
              placeholderTextColor={Colors.textMuted}
              maxLength={200}
              multiline
              selectionColor={Colors.orange}
              keyboardAppearance="dark"
              style={[styles.input, styles.noteInput]}
            />

            {error && (
              <Text accessibilityRole="alert" style={styles.error}>
                {t(`profile.errors.${error}`)}
              </Text>
            )}
            {id && (
              <View style={styles.deleteRow}>
                <Button title={t('trips.delete')} variant="text" onPress={confirmDelete} />
              </View>
            )}
          </ScrollView>
          <View style={styles.footer}>
            <Button title={t('trips.save')} loading={saving} disabled={!city || !startsOn || !endsOn} onPress={save} />
          </View>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

// Type a city; results from Photon appear below (a moment after typing stops).
function CitySearch({ onPick }: { onPick: (city: PickedCity) => void }) {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CityResult[] | null>(null);
  const [failed, setFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function search(text: string) {
    setQuery(text);
    if (timer.current) clearTimeout(timer.current);
    if (text.trim().length < 2) {
      setResults(null);
      return;
    }
    timer.current = setTimeout(() => {
      searchCities(text)
        .then((found) => {
          setFailed(false);
          setResults(found);
        })
        .catch(() => setFailed(true));
    }, 350);
  }

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return (
    <View>
      <View style={styles.searchBox}>
        <Icon name="search" size={20} color={Colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={search}
          placeholder={t('trips.searchCity')}
          placeholderTextColor={Colors.textMuted}
          autoCorrect={false}
          selectionColor={Colors.orange}
          keyboardAppearance="dark"
          style={styles.searchInput}
        />
      </View>
      {failed && <Text style={styles.hint}>{t('trips.searchFailed')}</Text>}
      {results?.length === 0 && <Text style={styles.hint}>{t('about.noResults')}</Text>}
      {results?.map((result) => (
        <Pressable
          key={result.key}
          accessibilityRole="button"
          onPress={() =>
            onPick({ city: result.city, context: result.context, countryCode: result.countryCode, lat: result.lat, lng: result.lng })
          }
          style={({ pressed }) => [styles.result, pressed && styles.pressed]}>
          <Text style={styles.pickedFlag}>{flagEmoji(result.countryCode)}</Text>
          <View style={styles.flex}>
            <Text style={styles.pickedCity}>{result.city}</Text>
            {result.context ? <Text style={styles.pickedContext}>{result.context}</Text> : null}
          </View>
        </Pressable>
      ))}
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  safe: { flex: 1, backgroundColor: Colors.bg },
  flex: { flex: 1 },
  spinner: { marginTop: Spacing.xxl * 2 },
  content: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xxl },
  pressed: { opacity: 0.75 },
  picked: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
    ...RaisedSmall,
  },
  pickedFlag: { fontSize: 26 },
  pickedCity: { ...Type.heading, color: Colors.text },
  pickedContext: { ...Type.small, color: Colors.textSecondary },
  change: { ...Type.label, color: Colors.accent },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    minHeight: 52,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    backgroundColor: Colors.surface,
  },
  searchInput: { flex: 1, color: Colors.text, fontSize: 16 },
  result: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    minHeight: 56,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  hint: { ...Type.small, color: Colors.textMuted, marginTop: Spacing.sm },
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
  noteInput: { minHeight: 88, paddingTop: Spacing.md, textAlignVertical: 'top' },
  error: {
    ...Type.small,
    color: Colors.danger,
    backgroundColor: Colors.dangerBg,
    padding: Spacing.md,
    borderRadius: Radius.sm,
    marginTop: Spacing.lg,
  },
  deleteRow: { marginTop: Spacing.lg },
  footer: { padding: Spacing.lg, borderTopWidth: 1, borderTopColor: Colors.border },
}));
