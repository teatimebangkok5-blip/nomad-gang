import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, Text, View } from 'react-native';

import { GlossyFill } from '@/components/glossy';
import { Icon } from '@/components/icon';
import { SearchPicker, useProfileOptions } from '@/components/profile-fields';
import { Radius, Raised, RaisedSmall, Spacing, Type } from '@/constants/theme';
import { useLanguage } from '@/i18n';
import { bangkokMinutes, formatClock, formatUtcOffset } from '@/lib/bangkok-time';
import { clockCityName, MAX_CLOCKS } from '@/lib/profile-options';
import { saveWorldClocks } from '@/lib/profiles';
import { makeStyles, useColors } from '@/lib/theme';

// World clocks on a profile: the time now in up to 6 cities. The owner adds them with "Add world clock" and removes
// one by tapping its ×.
export function WorldClocks({ zones, editable, onChanged }: { zones: string[]; editable: boolean; onChanged: () => void }) {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  const language = useLanguage();
  const options = useProfileOptions();
  const [now, setNow] = useState(() => new Date());
  const [picking, setPicking] = useState(false);

  // Tick on the minute.
  useEffect(() => {
    if (zones.length === 0) return;
    const timer = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(timer);
  }, [zones.length]);

  async function save(next: string[]) {
    const error = await saveWorldClocks(next);
    if (error) Alert.alert(t(`profile.errors.${error}`));
    onChanged();
  }

  function add() {
    if (zones.length >= MAX_CLOCKS) {
      Alert.alert(t('profile.maxClocks', { max: MAX_CLOCKS }));
      return;
    }
    setPicking(true);
  }

  return (
    <View>
      <View style={styles.header}>
        <Text style={styles.title}>{t('profile.worldClocks')}</Text>
        {editable && (
          <Pressable
            accessibilityRole="button"
            onPress={add}
            style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}>
            <GlossyFill />
            <Icon name="plus" size={18} color={Colors.accent} />
            <Text style={styles.addText} numberOfLines={1}>
              {t('profile.addClock')}
            </Text>
          </Pressable>
        )}
      </View>

      {zones.length === 0 ? (
        <View style={styles.empty}>
          <GlossyFill />
          <Icon name="time" size={28} color={Colors.textMuted} />
          <Text style={styles.emptyText}>{editable ? t('profile.clocksEmpty') : t('profile.clocksEmptyOther')}</Text>
        </View>
      ) : (
        <View style={styles.grid}>
          {zones.map((zone) => {
            const city = clockCityName(zone, language);
            return (
              <View key={zone} style={styles.clock}>
                <GlossyFill />
                <Text style={styles.time}>{formatClock(bangkokMinutes(now, zone))}</Text>
                <Text style={styles.city} numberOfLines={1}>
                  {city}
                </Text>
                <Text style={styles.offset}>{formatUtcOffset(zone, now)}</Text>
                {editable && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('profile.removeClock', { city })}
                    hitSlop={10}
                    onPress={() => save(zones.filter((z) => z !== zone))}
                    style={styles.remove}>
                    <Icon name="close" size={16} color={Colors.textMuted} />
                  </Pressable>
                )}
              </View>
            );
          })}
        </View>
      )}

      <SearchPicker
        visible={picking}
        title={t('profile.chooseCity')}
        searchPlaceholder={t('profile.chooseCity')}
        options={options.cities.filter((city) => !zones.includes(city.key))}
        selected={[]}
        max={1}
        onClose={() => setPicking(false)}
        onDone={([zone]) => {
          setPicking(false);
          if (zone) save([...zones, zone]);
        }}
      />
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  title: { ...Type.heading, color: Colors.text, flexShrink: 1 },
  addButton: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 40,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.accent,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
    ...RaisedSmall,
  },
  addText: { ...Type.label, color: Colors.accent },
  pressed: { opacity: 0.75 },
  empty: {
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.md,
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
    ...Raised,
  },
  emptyText: { ...Type.body, color: Colors.textMuted, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.md },
  clock: {
    width: '31.5%',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    overflow: 'hidden',
    ...RaisedSmall,
  },
  time: { ...Type.title, color: Colors.text, fontVariant: ['tabular-nums'] },
  city: { ...Type.label, color: Colors.textSecondary },
  offset: { fontSize: 11, lineHeight: 14, color: Colors.textMuted },
  remove: { position: 'absolute', top: 4, right: 4, padding: 2 },
}));
