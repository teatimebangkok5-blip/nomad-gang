import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { FormFooter, FormSection, Stepper } from '@/components/form-parts';
import { GlossyFill } from '@/components/glossy';
import { Icon } from '@/components/icon';
import { ScreenHeader } from '@/components/screen-header';
import { Radius, Spacing, Type } from '@/constants/theme';
import { useLanguage } from '@/i18n';
import { PLACE_ICON_COLORS, placeCategory, placeIcon } from '@/lib/places';
import { createSecondRound, useSecondRoundPlaces, type RoundPlace } from '@/lib/second-round';
import { makeStyles, useColors } from '@/lib/theme';

const LEAVING = [0, 15, 30] as const;
const LENGTHS = [60, 90, 120] as const;

// "Continuing the night?": bars, pubs, clubs and partner bars / rooftops within 1.5 km of the table, nearest first.
// Pick one and start the second round (a pit-stop there); the first chat gets an invite card.
export default function SecondRoundScreen() {
  const styles = useStyles();
  const Colors = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const language = useLanguage();
  const places = useSecondRoundPlaces(id, true);
  const [picked, setPicked] = useState<RoundPlace | null>(null);
  const [leaving, setLeaving] = useState<(typeof LEAVING)[number]>(15);
  const [length, setLength] = useState<(typeof LENGTHS)[number]>(90);
  const [maxPeople, setMaxPeople] = useState(6);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    if (!picked) return;
    setBusy(true);
    setError(null);
    const result = await createSecondRound({
      meetupId: id,
      title: t('round.defaultTitle'),
      place: picked,
      startsInMinutes: leaving,
      durationMinutes: length,
      maxPeople,
    });
    setBusy(false);
    if (result.error) {
      setError(result.error === 'too_many_open' ? t('pitstop.errors.too_many_open') : t('round.errors.generic'));
      return;
    }
    router.replace({ pathname: '/table/[id]', params: { id: result.id } });
  }

  const nameOf = (place: RoundPlace) => (language === 'th' ? place.name_th : place.name_en) || place.name;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScreenHeader title={t('round.title')} subtitle={t('round.subtitle')} />
      <ScrollView contentContainerStyle={styles.content}>
        <FormSection label={t('round.where')}>
          {places === null ? (
            <ActivityIndicator color={Colors.accent} />
          ) : places.length === 0 ? (
            <Text style={styles.hint}>{t('round.noPlaces')}</Text>
          ) : (
            places.map((place) => {
              const selected = picked?.place_id === place.place_id && picked?.venue_id === place.venue_id;
              const category = place.venue_id ? (place.kind as 'bar' | 'rooftop') : placeCategory(place.kind);
              const color = place.venue_id ? '#FE593B' : PLACE_ICON_COLORS[placeIcon(place.kind)];
              return (
                <Pressable
                  key={place.place_id ?? place.venue_id}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => setPicked(place)}
                  style={({ pressed }) => [styles.place, selected && styles.placeOn, pressed && styles.pressed]}>
                  <GlossyFill />
                  <View style={[styles.ball, { backgroundColor: color }]}>
                    <Icon name={category} size={20} color={Colors.white} />
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.placeName} numberOfLines={1}>
                      {nameOf(place)}
                    </Text>
                    <Text style={styles.placeMeta}>
                      {place.venue_id ? `${t('home.partner')} · ` : ''}
                      {place.distance_m < 1000 ? `${place.distance_m} m` : `${(place.distance_m / 1000).toFixed(1)} km`}
                    </Text>
                  </View>
                  <Icon name={selected ? 'checkCircle' : 'circle'} size={24} color={selected ? Colors.violetText : Colors.textMuted} />
                </Pressable>
              );
            })
          )}
        </FormSection>

        <FormSection label={t('pitstop.leaving')}>
          <View style={styles.chips}>
            {LEAVING.map((minutes) => (
              <Chip
                key={minutes}
                tone="violet"
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
                tone="violet"
                label={t('pitstop.minutes', { count: minutes })}
                selected={length === minutes}
                onPress={() => setLength(minutes)}
              />
            ))}
          </View>
        </FormSection>

        <Stepper
          tone="violet"
          label={t('tables.people')}
          value={String(maxPeople)}
          canDecrease={maxPeople > 2}
          canIncrease={maxPeople < 8}
          onDecrease={() => setMaxPeople((n) => Math.max(2, n - 1))}
          onIncrease={() => setMaxPeople((n) => Math.min(8, n + 1))}
        />
        <Text style={styles.hint}>{t('round.startHint')}</Text>
        {error && <Text style={styles.error}>{error}</Text>}
      </ScrollView>
      <FormFooter>
        <Button
          variant="violet"
          title={picked ? t('round.startAt', { place: nameOf(picked) }) : t('round.pickFirst')}
          disabled={!picked}
          loading={busy}
          onPress={start}
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
  hint: { ...Type.small, color: Colors.textSecondary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  place: {
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
  placeOn: { borderColor: Colors.violet, borderWidth: 2 },
  ball: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  placeName: { ...Type.label, fontSize: 15, fontWeight: '800', color: Colors.text },
  placeMeta: { ...Type.small, color: Colors.textSecondary },
  error: { ...Type.small, color: Colors.danger },
}));
