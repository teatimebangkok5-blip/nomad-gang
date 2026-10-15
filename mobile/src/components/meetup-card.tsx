import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { Radius, Spacing, Type } from '@/constants/theme';
import { currentLanguage, localized } from '@/i18n';
import { bangkokDay, bangkokMinutes, formatClock, formatDayLabel } from '@/lib/bangkok-time';
import type { OpenMeetup } from '@/lib/meetups';
import type { Venue } from '@/lib/venues';
import { makeStyles, useColors } from '@/lib/theme';

export function MeetupCard({
  meetup,
  venue,
  onPress,
  onJoin,
  joining,
}: {
  meetup: OpenMeetup;
  venue: Venue | undefined;
  onPress: () => void;
  onJoin: () => void;
  joining: boolean;
}) {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  const language = currentLanguage();
  const start = new Date(meetup.starts_at);
  const full = meetup.member_count >= meetup.max_people;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={styles.when}>
        <Text style={styles.day} numberOfLines={1}>
          {formatDayLabel(bangkokDay(start), t)}
        </Text>
        <Text style={styles.time}>{formatClock(bangkokMinutes(start))}</Text>
      </View>

      <View style={styles.body}>
        <Text style={styles.venue} numberOfLines={1}>
          {venue ? localized(venue, 'name', language) : (meetup.place_name ?? '—')}
        </Text>
        {meetup.title ? (
          <Text style={styles.title} numberOfLines={1}>
            {meetup.title}
          </Text>
        ) : null}
        <Text style={styles.people}>{t('tables.peopleCount', { count: meetup.member_count, max: meetup.max_people })}</Text>
        {venue?.deal && (
          <Text style={styles.deal} numberOfLines={1}>
            {localized(venue.deal, 'title', language)}
          </Text>
        )}
      </View>

      {meetup.joined ? (
        <View style={[styles.action, styles.joined]}>
          <Text style={styles.joinedText}>{t('tables.joined')}</Text>
        </View>
      ) : full ? (
        <View style={[styles.action, styles.full]}>
          <Text style={styles.fullText}>{t('tables.full')}</Text>
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ busy: joining }}
          disabled={joining}
          onPress={onJoin}
          hitSlop={6}
          style={({ pressed }) => [styles.action, styles.join, pressed && styles.pressed]}>
          {joining ? <ActivityIndicator color={Colors.onBrand} /> : <Text style={styles.joinText}>{t('tables.join')}</Text>}
        </Pressable>
      )}
    </Pressable>
  );
}

const useStyles = makeStyles((Colors) => ({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pressed: { opacity: 0.75 },
  when: {
    width: 68,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    backgroundColor: Colors.orangeTint,
    alignItems: 'center',
  },
  day: { ...Type.small, fontSize: 12, color: Colors.glow, fontWeight: '600' },
  time: { ...Type.heading, color: Colors.text, fontWeight: '800' },
  body: { flex: 1, gap: 2 },
  venue: { ...Type.heading, color: Colors.text },
  title: { ...Type.small, color: Colors.textSecondary },
  people: { ...Type.small, color: Colors.textMuted },
  deal: { ...Type.small, color: Colors.accent, fontWeight: '600' },
  action: {
    minWidth: 72,
    minHeight: 40,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  join: { backgroundColor: Colors.orange },
  joinText: { ...Type.label, color: Colors.onBrand, fontWeight: '800' },
  joined: { backgroundColor: Colors.violetTint, borderWidth: 1, borderColor: Colors.violet },
  joinedText: { ...Type.label, color: Colors.text },
  full: { backgroundColor: Colors.surfaceRaised },
  fullText: { ...Type.label, color: Colors.textMuted },
}));
