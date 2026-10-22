import type { TFunction } from 'i18next';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { GlossyFill, ToneFill } from '@/components/glossy';
import { Icon } from '@/components/icon';
import { Radius, Raised, Spacing, Type } from '@/constants/theme';
import { localized, useLanguage } from '@/i18n';
import { bangkokDay, bangkokMinutes, formatClock, formatDayLabel } from '@/lib/bangkok-time';
import { areaName, meetupStatus, pulseLine, statusLabel, type MeetupStatus } from '@/lib/feed';
import { EVENT_EMOJI, eventPriceLabel, type EventCategory } from '@/lib/events';
import { meetupPlaceName, VIBE_EMOJI, type MeetupKind, type OpenMeetup, type Vibe } from '@/lib/meetups';
import { useChallenges } from '@/lib/passport';
import type { Venue, VenueDeal } from '@/lib/venues';
import { makeStyles, useColors } from '@/lib/theme';
import { useMyVibes } from '@/lib/vibes';

// A table or hangout in the home pop-up, the List and on place cards. Tapping it opens the table screen (join
// there). Compact (default): kind, status, deal, title, one line of where / when / cost and the live "pulse".
// Full (`compact={false}`): the title can wrap and where / when get a line each.
export function MeetupCard({
  meetup,
  venue,
  onPress,
  compact = true,
}: {
  meetup: OpenMeetup;
  venue: Venue | undefined;
  onPress: () => void;
  compact?: boolean;
}) {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  const language = useLanguage();
  const start = new Date(meetup.starts_at);
  const placeLabel = venue ? localized(venue, 'name', language) : meetupPlaceName(meetup, language);
  const [now] = useState(() => new Date());
  const status = meetupStatus(meetup, now);
  const challenge = useChallenges().find((c) => c.id === meetup.challenge_id);
  // Events show their entry price ("Free", "฿500 · US$15"); tables and hangouts the expected cost.
  const cost =
    meetup.kind === 'event'
      ? eventPriceLabel({ entry_fee_thb: meetup.entry_fee_thb ?? null, entry_fee_usd: meetup.entry_fee_usd ?? null }, language, t('events.free'))
      : typeof meetup.cost_level === 'number'
        ? t(`feed.cost.${meetup.cost_level}`)
        : null;
  const area = areaName(meetup, language);
  const when = `${formatDayLabel(bangkokDay(start, meetup.time_zone), t, undefined, meetup.time_zone)} ${formatClock(
    bangkokMinutes(start, meetup.time_zone),
  )}`;
  // Tables without a title lead with the place.
  const title = meetup.title || placeLabel;
  const where = [meetup.title ? placeLabel : null, area ? t('feed.near', { area }) : null].filter(Boolean).join(' · ');
  const badge = venue?.deal ? dealBadge(venue.deal, t) : null;
  const count = `${meetup.member_count}/${meetup.max_people}`;
  const myVibes = useMyVibes();
  const yourVibe = Boolean(meetup.vibe && myVibes.includes(meetup.vibe));

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.card, compact ? styles.cardCompact : styles.cardFull, pressed && styles.pressed]}>
      <GlossyFill />
      <View style={styles.tags}>
        <KindTag kind={meetup.kind} category={meetup.event_category} pitstop={meetup.pitstop} small={compact} />
        <StatusTag status={status} joined={meetup.joined} small={compact} />
        {meetup.vibe && <VibeTag vibe={meetup.vibe} small={compact} short={compact} />}
        {badge && <DealTag label={badge} small={compact} />}
        {meetup.women_only && <WomenOnlyTag small={compact} short />}
        {meetup.join_mode === 'private' && (
          <Text style={styles.lock} accessibilityLabel={t('privacy.private')}>
            🔒
          </Text>
        )}
      </View>

      <Text style={compact ? styles.titleCompact : styles.titleFull} numberOfLines={compact ? 1 : 2}>
        {title}
      </Text>

      {compact ? (
        <Text style={styles.metaCompact} numberOfLines={1}>
          {where ? `${where} · ` : ''}
          <Text style={styles.metaStrong}>{when}</Text>
          {cost ? ` · ${cost}` : ''}
        </Text>
      ) : (
        <View style={styles.metaFull}>
          <View style={styles.metaRow}>
            <Icon name="location" size={16} color={Colors.textMuted} />
            <Text style={styles.metaText}>{where || placeLabel}</Text>
          </View>
          <View style={styles.metaRow}>
            <Icon name="time" size={16} color={Colors.textMuted} />
            <Text style={styles.metaText}>
              {when}
              {cost ? <Text style={styles.metaMuted}>{'  ·  '}</Text> : null}
              {cost ?? ''}
            </Text>
          </View>
          {challenge && (
            <Text style={styles.metaText} numberOfLines={1}>
              {challenge.emoji} {localized(challenge, 'title', language)}
            </Text>
          )}
        </View>
      )}

      <View style={styles.pulseRow}>
        <Icon name="group" size={compact ? 14 : 16} color={Colors.textMuted} />
        <Text style={compact ? styles.countCompact : styles.countFull}>{count}</Text>
        <View style={styles.pulseDot} />
        <Text style={styles.pulse} numberOfLines={1}>
          {pulseLine(meetup, venue, t, language)}
        </Text>
        {yourVibe && <Text style={styles.yourVibe}>✨ {t('vibes.yours')}</Text>}
      </View>
    </Pressable>
  );
}

// "−20%" when the deal's title has a percentage, else the promotion kind ("Offer", "Tickets").
export function dealBadge(deal: Pick<VenueDeal, 'kind' | 'title_en'>, t: TFunction) {
  const percent = /(\d{1,2})\s*%/.exec(deal.title_en)?.[1];
  return percent ? `−${percent}%` : t(`promoFilter.${deal.kind}`);
}

// 👥 Table / 🙌 Hangout / ⚡ Pit-stop / 🎵 Event (its category's emoji).
export function KindTag({
  kind,
  category,
  pitstop = false,
  small = false,
}: {
  kind: MeetupKind;
  category?: EventCategory | null;
  pitstop?: boolean;
  small?: boolean;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const hangout = kind === 'hangout';
  if (kind === 'event') {
    return (
      <View style={[styles.tag, small && styles.tagSmall, styles.tagPink]}>
        <Text style={[styles.tagText, small && styles.tagTextSmall, styles.pinkText]}>
          {`${EVENT_EMOJI[category ?? 'other']} ${t('events.event')}`}
        </Text>
      </View>
    );
  }
  if (pitstop) {
    return (
      <View style={[styles.tag, small && styles.tagSmall, styles.tagPitstop]}>
        <Text style={[styles.tagText, small && styles.tagTextSmall, styles.pitstopText]}>⚡ {t('pitstop.tag')}</Text>
      </View>
    );
  }
  return (
    <View style={[styles.tag, small && styles.tagSmall, hangout ? styles.tagViolet : styles.tagOrange]}>
      <Text style={[styles.tagText, small && styles.tagTextSmall, hangout ? styles.violetText : styles.orangeText]}>
        {hangout ? `🙌 ${t('hangouts.hangout')}` : `👥 ${t('tables.table')}`}
      </Text>
    </View>
  );
}

// 🍻 Party & pre-game (short: just the emoji, for compact cards).
export function VibeTag({ vibe, small = false, short = false }: { vibe: Vibe; small?: boolean; short?: boolean }) {
  const styles = useStyles();
  const { t } = useTranslation();
  return (
    <View
      style={[styles.tag, small && styles.tagSmall, styles.tagNeutral]}
      accessibilityLabel={t(`vibes.${vibe}`)}>
      <Text style={[styles.tagText, small && styles.tagTextSmall, styles.neutralText]} numberOfLines={1}>
        {short ? VIBE_EMOJI[vibe] : `${VIBE_EMOJI[vibe]} ${t(`vibes.${vibe}`)}`}
      </Text>
    </View>
  );
}

// ♀ Women only.
export function WomenOnlyTag({ small = false, short = false }: { small?: boolean; short?: boolean }) {
  const styles = useStyles();
  const { t } = useTranslation();
  return (
    <View style={[styles.tag, small && styles.tagSmall, styles.tagPink]} accessibilityLabel={t('women.only')}>
      <Text style={[styles.tagText, small && styles.tagTextSmall, styles.pinkText]}>
        {short ? '♀' : `♀ ${t('women.only')}`}
      </Text>
    </View>
  );
}

// ● Starts in 25 min / Happening now / 2 seats left / Full, or ✓ Joined.
export function StatusTag({ status, joined, small = false }: { status: MeetupStatus; joined?: boolean; small?: boolean }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const label = statusLabel(status, t) ?? (joined ? t('tables.joined') : null);
  if (!label) return null;
  // Starting soon is orange; happening now, few seats and full are pink; joined is violet.
  const tone = !status ? 'violet' : status.type === 'soon' ? 'orange' : 'pink';
  const tagStyle = tone === 'orange' ? styles.tagOrange : tone === 'pink' ? styles.tagPink : styles.tagViolet;
  const textStyle = tone === 'orange' ? styles.orangeText : tone === 'pink' ? styles.pinkText : styles.violetText;
  return (
    <View style={[styles.tag, styles.statusTag, small && styles.tagSmall, tagStyle]}>
      {status ? <View style={[styles.statusDot, small && styles.statusDotSmall, styles[`${tone}Dot`]]} /> : null}
      <Text style={[styles.tagText, styles.statusText, small && styles.tagTextSmall, textStyle]} numberOfLines={1}>
        {status ? label : `✓ ${label}`}
      </Text>
    </View>
  );
}

// The brand-gradient deal badge ("−15%", "Partner").
export function DealTag({ label, small = false, push = true }: { label: string; small?: boolean; push?: boolean }) {
  const styles = useStyles();
  return (
    <View style={[styles.tag, small && styles.tagSmall, styles.dealTag, push && styles.dealPush]}>
      <ToneFill tone="brand" />
      <Text style={[styles.tagText, small && styles.tagTextSmall, styles.dealText]}>{label}</Text>
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  lock: { fontSize: 13, alignSelf: 'center' },
  card: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    ...Raised,
  },
  cardCompact: { paddingVertical: 10, paddingHorizontal: Spacing.md, borderRadius: Radius.lg, gap: 5 },
  cardFull: { padding: 14, borderRadius: 24, gap: Spacing.sm },
  pressed: { opacity: 0.85 },
  tags: { flexDirection: 'row', alignItems: 'center', gap: 5, minWidth: 0 },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: Radius.pill,
    overflow: 'hidden',
  },
  tagSmall: { paddingVertical: 3, paddingHorizontal: Spacing.sm },
  tagOrange: { backgroundColor: Colors.orangeTint },
  tagViolet: { backgroundColor: Colors.violetTint },
  tagPink: { backgroundColor: Colors.pinkTint },
  tagNeutral: { backgroundColor: Colors.surfaceRaised, flexShrink: 1 },
  tagPitstop: { backgroundColor: Colors.amberTint },
  neutralText: { color: Colors.textSecondary },
  pitstopText: { color: Colors.amberText },
  statusTag: { flexShrink: 1, gap: 5 },
  tagText: { fontSize: 12, lineHeight: 16, fontWeight: '800' },
  tagTextSmall: { fontSize: 11, lineHeight: 14 },
  statusText: { fontWeight: '700', flexShrink: 1 },
  orangeText: { color: Colors.accent },
  violetText: { color: Colors.violetText },
  pinkText: { color: Colors.pinkText },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusDotSmall: { width: 5, height: 5 },
  orangeDot: { backgroundColor: Colors.accent },
  pinkDot: { backgroundColor: Colors.pinkText },
  violetDot: { backgroundColor: Colors.violetText },
  dealTag: { paddingHorizontal: 9 },
  dealPush: { marginLeft: 'auto' },
  dealText: { color: Colors.onBrand },
  titleCompact: { ...Type.heading, fontSize: 15, lineHeight: 20, color: Colors.text },
  titleFull: { ...Type.heading, color: Colors.text },
  metaCompact: { ...Type.small, fontSize: 12, lineHeight: 17, color: Colors.textSecondary },
  metaStrong: { fontWeight: '700', color: Colors.text },
  metaFull: { gap: 3 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { ...Type.small, lineHeight: 19, color: Colors.textSecondary, flexShrink: 1 },
  metaMuted: { color: Colors.textMuted },
  pulseRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
  countCompact: { fontSize: 12, fontWeight: '800', color: Colors.text },
  countFull: { fontSize: 13, fontWeight: '800', color: Colors.text },
  pulseDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginLeft: 2,
    backgroundColor: Colors.pink,
    borderWidth: 2,
    borderColor: 'rgba(255, 31, 120, 0.3)',
  },
  pulse: { ...Type.small, fontSize: 12, lineHeight: 16, color: Colors.textMuted, flex: 1 },
  yourVibe: { ...Type.small, fontSize: 11, lineHeight: 15, fontWeight: '800', color: Colors.violetText },
}));
