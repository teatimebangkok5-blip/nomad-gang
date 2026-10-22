import { Image } from 'expo-image';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { SlideUpPanel } from '@/components/slide-up-panel';
import { Radius, Spacing, Type } from '@/constants/theme';
import { formatClock, formatDayLabel, type BangkokDay } from '@/lib/bangkok-time';
import { arrivalBuckets, arrivalSlots, eventPhotoUrl } from '@/lib/events';
import { makeStyles } from '@/lib/theme';

// An event's photos, side by side to swipe through (the hero of the event page).
export function EventPhotos({ paths, height }: { paths: string[]; height: number }) {
  const styles = useStyles();
  const { width } = useWindowDimensions();
  const [page, setPage] = useState(0);
  return (
    <View style={StyleSheet.absoluteFill}>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}>
        {paths.map((path) => (
          <Image key={path} source={eventPhotoUrl(path)} style={{ width, height }} contentFit="cover" />
        ))}
      </ScrollView>
      {paths.length > 1 && (
        <View style={styles.dots} pointerEvents="none">
          {paths.map((path, index) => (
            <View key={path} style={[styles.dot, index === page && styles.dotOn]} />
          ))}
        </View>
      )}
    </View>
  );
}

// Pick an arrival time within the event's hours (day chips when it spans several days), or "Not sure yet".
export function ArrivalSheet({
  open,
  onClose,
  startsAt,
  endsAt,
  zone,
  initial,
  confirmLabel,
  busy,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  startsAt: string;
  endsAt: string;
  zone: string;
  initial: string | null;
  confirmLabel: string;
  busy?: boolean;
  onPick: (at: Date | null) => void;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const [now] = useState(() => new Date());
  const slots = arrivalSlots(startsAt, endsAt, zone, now);
  const days = [...new Set(slots.map((slot) => slot.day))];
  const [picked, setPicked] = useState<number | null>(() => {
    const time = initial ? new Date(initial).getTime() : null;
    return slots.some((slot) => slot.at.getTime() === time) ? time : null;
  });
  const [day, setDay] = useState<BangkokDay | null>(() => slots.find((slot) => slot.at.getTime() === picked)?.day ?? days[0] ?? null);
  const shown = slots.filter((slot) => slot.day === day);

  return (
    <SlideUpPanel open={open} onClose={onClose} title={t('events.arrivalTitle')} subtitle={t('events.arrivalHint')}>
      <View style={styles.sheet}>
        {days.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {days.map((option) => (
              <Chip key={option} tall label={formatDayLabel(option, t, now, zone)} selected={option === day} onPress={() => setDay(option)} />
            ))}
          </ScrollView>
        )}
        <View style={styles.slots}>
          {shown.map((slot) => (
            <Chip
              key={slot.at.getTime()}
              shape="tile"
              label={formatClock(slot.minutes)}
              selected={picked === slot.at.getTime()}
              onPress={() => setPicked(picked === slot.at.getTime() ? null : slot.at.getTime())}
            />
          ))}
        </View>
        <Button title={confirmLabel} loading={busy} onPress={() => onPick(picked === null ? null : new Date(picked))} />
        <Button title={t('events.arrivalSkip')} variant="text" disabled={busy} onPress={() => onPick(null)} />
      </View>
    </SlideUpPanel>
  );
}

// "Who's coming when": members per hour of arrival, as bars, and how many aren't sure yet.
export function WhoWhen({ arrivals, zone, multiDay }: { arrivals: (string | null)[]; zone: string; multiDay: boolean }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const { buckets, unknown } = arrivalBuckets(arrivals, zone);
  if (buckets.length === 0) return null;
  const most = Math.max(...buckets.map((bucket) => bucket.count));
  return (
    <View style={styles.card}>
      <Text style={styles.heading}>{t('events.whoWhen')}</Text>
      {buckets.map((bucket) => (
        <View key={`${bucket.day}:${bucket.hour}`} style={styles.barRow}>
          <Text style={styles.barLabel} numberOfLines={1}>
            {multiDay ? `${formatDayLabel(bucket.day, t, undefined, zone)} ` : ''}
            {formatClock(bucket.hour * 60)}
          </Text>
          <View style={styles.barTrack}>
            <View style={[styles.bar, { width: `${Math.max(8, (bucket.count / most) * 100)}%` }]} />
          </View>
          <Text style={styles.barCount}>{bucket.count}</Text>
        </View>
      ))}
      {unknown > 0 && <Text style={styles.muted}>{t('events.notSure', { count: unknown })}</Text>}
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  dots: { position: 'absolute', bottom: 24, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: 'rgba(255, 255, 255, 0.5)' },
  dotOn: { backgroundColor: Colors.white, width: 18 },
  sheet: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xl, gap: Spacing.md },
  chipRow: { gap: Spacing.sm, paddingVertical: 2 },
  slots: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  card: {
    gap: Spacing.sm,
    padding: 14,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  heading: { ...Type.heading, fontWeight: '800', color: Colors.text },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  barLabel: { ...Type.small, fontWeight: '700', color: Colors.textSecondary, width: 96 },
  barTrack: { flex: 1, height: 12, borderRadius: 6, backgroundColor: Colors.surfaceRaised, overflow: 'hidden' },
  bar: { height: 12, borderRadius: 6, backgroundColor: Colors.pinkText },
  barCount: { ...Type.label, fontSize: 13, color: Colors.text, minWidth: 24, textAlign: 'right' },
  muted: { ...Type.small, color: Colors.textMuted },
}));
