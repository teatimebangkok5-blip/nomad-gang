import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { GlossyFill } from '@/components/glossy';
import { Icon } from '@/components/icon';
import { Radius, Raised, Spacing, Type } from '@/constants/theme';
import { type Language, useLanguage } from '@/i18n';
import { formatClock } from '@/lib/bangkok-time';
import { isSafeLink, openLink } from '@/lib/links';
import { PLACE_ICON_IMAGES } from '@/lib/place-icons';
import { placeIcon } from '@/lib/places';
import type { Leg, PlanStop } from '@/lib/planner';
import { makeStyles, useColors } from '@/lib/theme';
import type { TFunction } from 'i18next';

export function stopName(stop: Pick<PlanStop, 'name' | 'name_en' | 'name_th'>, language: Language): string {
  return (language === 'th' ? stop.name_th : stop.name_en) || stop.name;
}

// "🚶 12 min walk", "🚕 18 min by taxi", "🚇 BTS Sukhumvit Line: Siam → Asok · 14 min".
export function legText(leg: Leg, t: TFunction): string {
  if (leg.mode === 'walk') return t('plan.legWalk', { minutes: leg.minutes });
  if (leg.mode === 'taxi') return t('plan.legTaxi', { minutes: leg.minutes });
  const via = leg.change ? ` → ${leg.change} → ` : ' → ';
  return t('plan.legTrain', { line: (leg.lines ?? []).join(' + '), route: `${leg.board}${via}${leg.alight}`, minutes: leg.minutes });
}

// A day plan as a timeline: the trip to each stop, then the stop (photo, times, name, details).
// `onRemove` shows a remove button on each stop (while editing a new plan).
export function PlanTimeline({ stops, onRemove }: { stops: PlanStop[]; onRemove?: (key: string) => void }) {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  const language = useLanguage();

  return (
    <View style={styles.list}>
      {stops.map((stop, index) => {
        const description = language === 'th' ? stop.description_th || stop.description_en : stop.description_en;
        return (
          <View key={stop.key}>
            {stop.travel && (
              <View style={styles.leg}>
                <View style={styles.legLine} />
                <Text style={styles.legText}>{legText(stop.travel, t)}</Text>
              </View>
            )}
            <View style={styles.card}>
              <GlossyFill />
              <View style={styles.photo}>
                {stop.image_url ? (
                  <Image source={stop.image_url} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
                ) : (
                  <View style={styles.photoEmpty}>
                    <Image source={PLACE_ICON_IMAGES[placeIcon(stop.kind)]} style={styles.photoIcon} contentFit="contain" />
                  </View>
                )}
                <View style={styles.number}>
                  <Text style={styles.numberText}>{index + 1}</Text>
                </View>
                {stop.image_credit ? (
                  <Text style={styles.credit} numberOfLines={1}>
                    {t('plan.photoCredit', { credit: stop.image_credit })}
                  </Text>
                ) : null}
              </View>
              <View style={styles.body}>
                <Text style={styles.time}>
                  {formatClock(stop.arrive)}–{formatClock(stop.leave)}
                  {stop.type !== 'sight' ? `  ·  ${stop.type === 'meal' ? t('plan.meal') : t('plan.nightlife')}` : ''}
                </Text>
                <View style={styles.titleRow}>
                  <Text style={styles.name} numberOfLines={2}>
                    {stopName(stop, language)}
                  </Text>
                  {onRemove && (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t('plan.remove', { name: stopName(stop, language) })}
                      hitSlop={10}
                      onPress={() => onRemove(stop.key)}
                      style={({ pressed }) => [styles.remove, pressed && styles.pressed]}>
                      <Text style={styles.removeText}>✕</Text>
                    </Pressable>
                  )}
                </View>
                {description ? (
                  <Text style={styles.description} numberOfLines={2}>
                    {description}
                  </Text>
                ) : null}
                <View style={styles.facts}>
                  {stop.entry && (
                    <Text style={styles.fact}>
                      {stop.entry === 'free'
                        ? `✓ ${t('hangouts.entryFree')}`
                        : stop.entry === 'ticket'
                          ? `🎟️ ${t('hangouts.entryTicket')}`
                          : `🎟️ ${t('hangouts.entryFreeThai')}`}
                    </Text>
                  )}
                  {stop.opening_hours && <Text style={styles.fact}>🕘 {stop.opening_hours}</Text>}
                </View>
                {isSafeLink(stop.website) && (
                  <Pressable accessibilityRole="link" onPress={() => openLink(stop.website)} style={styles.link}>
                    <Icon name="website" size={16} color={Colors.accent} />
                    <Text style={styles.linkText}>{t('hangouts.officialWebsite')}</Text>
                  </Pressable>
                )}
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

// The plan as text for the phone's share sheet (LINE, WhatsApp, …).
export function planShareText(title: string, dayLabel: string, stops: PlanStop[], t: TFunction, language: Language): string {
  const lines = [`🗓️ ${title} · ${dayLabel}`, ''];
  for (const stop of stops) {
    if (stop.travel) lines.push(`   ${legText(stop.travel, t)}`);
    lines.push(`${formatClock(stop.arrive)}  ${stopName(stop, language)}`);
  }
  lines.push('', t('plan.sharedFrom'));
  return lines.join('\n');
}

const useStyles = makeStyles((Colors) => ({
  list: { gap: 0 },
  leg: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.sm, paddingLeft: Spacing.lg },
  legLine: { width: 3, height: 26, borderRadius: 2, backgroundColor: Colors.violet },
  legText: { ...Type.small, color: Colors.textSecondary, flex: 1 },
  card: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
    ...Raised,
  },
  photo: { width: '100%', aspectRatio: 16 / 9, backgroundColor: Colors.surfaceRaised },
  photoEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  photoIcon: { width: 72, height: 72 },
  number: {
    position: 'absolute',
    top: Spacing.sm,
    left: Spacing.sm,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.violet,
    borderWidth: 2,
    borderColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberText: { ...Type.label, color: Colors.white, fontWeight: '800' },
  credit: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    maxWidth: '80%',
    fontSize: 10,
    color: '#FFFFFF',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderTopLeftRadius: Radius.sm,
    overflow: 'hidden',
  },
  body: { padding: Spacing.md, gap: 4 },
  time: { ...Type.label, color: Colors.accent },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  name: { ...Type.heading, color: Colors.text, flex: 1 },
  remove: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceRaised,
  },
  removeText: { ...Type.label, color: Colors.textSecondary },
  pressed: { opacity: 0.7 },
  description: { ...Type.small, color: Colors.textSecondary },
  facts: { gap: 2 },
  fact: { ...Type.small, color: Colors.textSecondary },
  link: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginTop: 2 },
  linkText: { ...Type.label, color: Colors.accent },
}));
