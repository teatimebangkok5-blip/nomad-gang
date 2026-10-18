import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { GlossyFill } from '@/components/glossy';
import { Radius, Raised, Spacing, Type } from '@/constants/theme';
import { currentLanguage, localized } from '@/i18n';
import { bangkokDay, bangkokMinutes, formatClock, formatDayLabel } from '@/lib/bangkok-time';
import { meetupStatus, pulseLine, statusLabel } from '@/lib/feed';
import { meetupPlaceName, type OpenMeetup } from '@/lib/meetups';
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
  const hangout = meetup.kind === 'hangout';
  const placeLabel = venue ? localized(venue, 'name', language) : meetupPlaceName(meetup, language);
  const [now] = useState(() => new Date());
  const status = meetupStatus(meetup, now);
  const statusText = statusLabel(status, t);
  const cost = typeof meetup.cost_level === 'number' ? t(`feed.cost.${meetup.cost_level}`) : null;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.card, hangout && styles.cardHangout, pressed && styles.pressed]}>
      <GlossyFill />
      <View style={[styles.when, hangout && styles.whenHangout]}>
        <Text style={[styles.day, hangout && styles.dayHangout]} numberOfLines={1}>
          {formatDayLabel(bangkokDay(start, meetup.time_zone), t, undefined, meetup.time_zone)}
        </Text>
        <Text style={styles.time}>{formatClock(bangkokMinutes(start, meetup.time_zone))}</Text>
      </View>

      <View style={styles.body}>
        {statusText && (
          <Text style={[styles.status, status?.type === 'live' && styles.statusLive]} numberOfLines={1}>
            {status?.type === 'live' ? '● ' : ''}
            {statusText}
          </Text>
        )}
        {hangout ? (
          // Hangouts lead with what's happening, then where.
          <>
            <Text style={styles.tag}>🙌 {t('hangouts.hangout')}</Text>
            <Text style={styles.venue} numberOfLines={1}>
              {meetup.title}
            </Text>
            <Text style={styles.title} numberOfLines={1}>
              {placeLabel}
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.venue} numberOfLines={1}>
              {placeLabel}
            </Text>
            {meetup.title ? (
              <Text style={styles.title} numberOfLines={1}>
                {meetup.title}
              </Text>
            ) : null}
          </>
        )}
        <Text style={styles.pulse} numberOfLines={1}>
          {pulseLine(meetup, venue, t, language)}
        </Text>
        <Text style={styles.people} numberOfLines={1}>
          {t('tables.peopleCount', { count: meetup.member_count, max: meetup.max_people })}
          {cost ? `  ·  ${cost}` : ''}
        </Text>
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
    overflow: 'hidden',
    ...Raised,
  },
  cardHangout: { borderColor: Colors.violet },
  pressed: { opacity: 0.75 },
  when: {
    width: 68,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    backgroundColor: Colors.orangeTint,
    alignItems: 'center',
  },
  whenHangout: { backgroundColor: Colors.violetTint },
  day: { ...Type.small, fontSize: 12, color: Colors.glow, fontWeight: '600' },
  dayHangout: { color: Colors.textSecondary },
  tag: { ...Type.small, fontSize: 11, fontWeight: '700', color: Colors.textSecondary },
  time: { ...Type.heading, color: Colors.text, fontWeight: '800' },
  body: { flex: 1, gap: 2 },
  venue: { ...Type.heading, color: Colors.text },
  title: { ...Type.small, color: Colors.textSecondary },
  people: { ...Type.small, color: Colors.textMuted },
  pulse: { ...Type.small, color: Colors.text, fontWeight: '600' },
  status: { ...Type.small, fontSize: 11, fontWeight: '800', color: Colors.accent, textTransform: 'uppercase' },
  statusLive: { color: Colors.danger },
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
