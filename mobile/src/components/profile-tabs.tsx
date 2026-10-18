import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { GlossyFill } from '@/components/glossy';
import { Icon } from '@/components/icon';
import { SearchPicker, useProfileOptions } from '@/components/profile-fields';
import { WorldClocks } from '@/components/world-clocks';
import { Radius, Raised, RaisedSmall, Spacing, Type } from '@/constants/theme';
import { useLanguage } from '@/i18n';
import { formatWhen } from '@/lib/bangkok-time';
import {
  countryName,
  flagEmoji,
  formatDateRange,
  interestEmoji,
  interestLabel,
  languageLabel,
  professionLabel,
  toIsoDate,
  travelStyleLabel,
  WORLD_COUNTRY_COUNT,
} from '@/lib/profile-options';
import { saveVisitedCountries, useProfileMeetups, type Profile, type ProfileMeetup } from '@/lib/profiles';
import { makeStyles, useColors } from '@/lib/theme';
import { useTrips, type Trip } from '@/lib/trips';

// The four tabs under a profile: About, Travel (countries visited), Trips and Events (tables and hangouts).

export type ProfileTab = 'about' | 'travel' | 'trips' | 'events';

export function worldPercent(visited: number): string {
  return Math.min(100, (visited / WORLD_COUNTRY_COUNT) * 100).toFixed(1);
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

// A read-only pill (languages, profession, interests).
function Tag({ label }: { label: string }) {
  const styles = useStyles();
  return (
    <View style={styles.tag}>
      <GlossyFill />
      <Text style={styles.tagText}>{label}</Text>
    </View>
  );
}

export function AboutTab({
  profile,
  isMe,
  photos,
  onChanged,
}: {
  profile: Profile;
  isMe: boolean;
  // The best photos block (its editing lives on the profile screen).
  photos: ReactNode;
  onChanged: () => void;
}) {
  const styles = useStyles();
  const { t } = useTranslation();
  const language = useLanguage();
  const empty = profile.languages.length === 0 && !profile.profession && !profile.travel_style && profile.interests.length === 0;

  return (
    <View>
      {empty && (
        <View style={styles.emptyBox}>
          <Text style={styles.muted}>{t('profile.nothingYet')}</Text>
          {isMe && <Button title={t('profile.fillAbout')} variant="secondary" onPress={() => router.push('/edit-profile')} />}
        </View>
      )}
      {profile.languages.length > 0 && (
        <Section title={t('about.languages')}>
          <View style={styles.tags}>
            {profile.languages.map((code) => {
              const label = languageLabel(code, language, t('about.otherLanguage'));
              return <Tag key={code} label={`${label.flag} ${label.name}`} />;
            })}
          </View>
        </Section>
      )}
      {profile.profession && (
        <Section title={t('about.profession')}>
          <View style={styles.tags}>
            <Tag label={professionLabel(t, profile.profession)} />
          </View>
        </Section>
      )}
      {profile.travel_style && (
        <Section title={t('about.travelStyle')}>
          <View style={styles.tags}>
            <Tag label={travelStyleLabel(t, profile.travel_style)} />
          </View>
        </Section>
      )}
      {profile.interests.length > 0 && (
        <Section title={t('about.interests')}>
          <View style={styles.tags}>
            {profile.interests.map((key) => (
              <Tag key={key} label={`${interestEmoji(key)} ${interestLabel(t, key)}`} />
            ))}
          </View>
        </Section>
      )}
      {photos}
      <View style={styles.section}>
        <WorldClocks zones={profile.world_clocks} editable={isMe} onChanged={onChanged} />
      </View>
    </View>
  );
}

export function TravelTab({ profile, isMe, onChanged }: { profile: Profile; isMe: boolean; onChanged: () => void }) {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  const language = useLanguage();
  const options = useProfileOptions();
  const [picking, setPicking] = useState(false);
  const visited = profile.visited_countries;
  const percent = worldPercent(visited.length);

  async function save(codes: string[]) {
    const error = await saveVisitedCountries(codes);
    if (error) Alert.alert(t(`profile.errors.${error}`));
    onChanged();
  }

  return (
    <View>
      <View style={styles.worldCard}>
        <GlossyFill />
        <Icon name="globe" size={28} color={Colors.accent} />
        <View style={styles.flex}>
          <Text style={styles.worldPercent}>{t('profile.worldSeen', { percent })}</Text>
          <Text style={styles.muted}>{t('profile.countriesCount', { count: visited.length })}</Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.max(Number(percent), visited.length ? 2 : 0)}%` }]} />
          </View>
        </View>
      </View>

      <Section title={t('profile.countriesVisited')}>
        {visited.length === 0 ? (
          <Text style={styles.muted}>{isMe ? t('profile.addCountries') : t('profile.noCountries')}</Text>
        ) : (
          <View style={styles.tags}>
            {[...visited]
              .sort((a, b) => countryName(a, language).localeCompare(countryName(b, language), language))
              .map((code) => (
                <Tag key={code} label={`${flagEmoji(code)} ${countryName(code, language)}`} />
              ))}
          </View>
        )}
        {isMe && (
          <View style={styles.buttonRow}>
            <Button
              title={visited.length ? t('profile.editCountries') : t('profile.addCountries')}
              variant="secondary"
              icon={<Icon name="flag" size={18} color={Colors.text} />}
              onPress={() => setPicking(true)}
            />
          </View>
        )}
      </Section>

      <SearchPicker
        visible={picking}
        title={t('profile.countriesVisited')}
        searchPlaceholder={t('about.searchCountry')}
        options={options.countries}
        selected={visited}
        max={250}
        onClose={() => setPicking(false)}
        onDone={(codes) => {
          setPicking(false);
          save(codes);
        }}
      />
    </View>
  );
}

export function TripsTab({ userId, isMe }: { userId: string; isMe: boolean }) {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  const { trips } = useTrips(userId);
  const today = toIsoDate(new Date());

  const list = trips === null || trips === 'error' ? [] : trips;
  const upcoming = list.filter((trip) => trip.ends_on >= today);
  const past = list.filter((trip) => trip.ends_on < today).reverse();

  return (
    <View>
      {isMe && (
        <View style={styles.buttonRow}>
          <Button
            title={t('trips.add')}
            icon={<Icon name="plus" size={20} color={Colors.onBrand} />}
            onPress={() => router.push('/trip-form')}
          />
        </View>
      )}
      {trips === null ? (
        <ActivityIndicator color={Colors.accent} style={styles.spinner} />
      ) : trips === 'error' ? (
        <Text style={styles.muted}>{t('profile.loadFailed')}</Text>
      ) : list.length === 0 ? (
        <View style={styles.emptyBox}>
          <Icon name="trip" size={28} color={Colors.textMuted} />
          <Text style={styles.muted}>{isMe ? t('trips.noneMine') : t('trips.none')}</Text>
        </View>
      ) : (
        <>
          {upcoming.length > 0 && (
            <Section title={t('trips.upcoming')}>
              {upcoming.map((trip) => (
                <TripRow key={trip.id} trip={trip} today={today} isMe={isMe} />
              ))}
            </Section>
          )}
          {past.length > 0 && (
            <Section title={t('trips.past')}>
              {past.map((trip) => (
                <TripRow key={trip.id} trip={trip} today={today} isMe={isMe} />
              ))}
            </Section>
          )}
        </>
      )}
    </View>
  );
}

function TripRow({ trip, today, isMe }: { trip: Trip; today: string; isMe: boolean }) {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  const language = useLanguage();
  const now = trip.starts_on <= today && trip.ends_on >= today;

  return (
    <Pressable
      accessibilityRole={isMe ? 'button' : undefined}
      accessibilityLabel={isMe ? `${t('trips.edit')}: ${trip.city}` : undefined}
      disabled={!isMe}
      onPress={() => router.push({ pathname: '/trip-form', params: { id: trip.id } })}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <GlossyFill />
      <Text style={styles.rowEmoji}>{flagEmoji(trip.country_code)}</Text>
      <View style={styles.flex}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {trip.city}
          {trip.country_code ? `, ${countryName(trip.country_code, language)}` : ''}
        </Text>
        <Text style={styles.rowMeta}>{formatDateRange(trip.starts_on, trip.ends_on, language)}</Text>
        {trip.note ? (
          <Text style={styles.rowNote} numberOfLines={2}>
            {trip.note}
          </Text>
        ) : null}
      </View>
      {now && <Text style={styles.badge}>{t('trips.now')}</Text>}
      {isMe && <Icon name="edit" size={18} color={Colors.textMuted} />}
    </Pressable>
  );
}

export function EventsTab({ userId }: { userId: string }) {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  const meetups = useProfileMeetups(userId, true);

  if (meetups === null) return <ActivityIndicator color={Colors.accent} style={styles.spinner} />;
  if (meetups === 'error') return <Text style={styles.muted}>{t('profile.loadFailed')}</Text>;
  if (meetups.length === 0) {
    return (
      <View style={styles.emptyBox}>
        <Icon name="event" size={28} color={Colors.textMuted} />
        <Text style={styles.muted}>{t('profile.noEvents')}</Text>
      </View>
    );
  }
  const upcoming = meetups.filter((m) => m.upcoming).reverse();
  const past = meetups.filter((m) => !m.upcoming);

  return (
    <View>
      {upcoming.length > 0 && (
        <Section title={t('profile.upcoming')}>
          {upcoming.map((meetup) => (
            <EventRow key={meetup.id} meetup={meetup} />
          ))}
        </Section>
      )}
      {past.length > 0 && (
        <Section title={t('profile.past')}>
          {past.map((meetup) => (
            <EventRow key={meetup.id} meetup={meetup} />
          ))}
        </Section>
      )}
    </View>
  );
}

function EventRow({ meetup }: { meetup: ProfileMeetup }) {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  const language = useLanguage();
  const place =
    (language === 'th' ? meetup.venue_name_th || meetup.place_name_th : meetup.venue_name_en || meetup.place_name_en) ||
    meetup.venue_name_en ||
    meetup.place_name ||
    '';
  const title = meetup.title || place;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/table/[id]', params: { id: meetup.id } })}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <GlossyFill />
      <Text style={styles.rowEmoji}>{meetup.kind === 'hangout' ? '🙌' : '👥'}</Text>
      <View style={styles.flex}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {formatWhen(meetup.starts_at, t, new Date(), meetup.time_zone ?? undefined)}
          {meetup.title && place ? ` · ${place}` : ''}
        </Text>
        <Text style={styles.rowNote}>{t('profile.members', { count: meetup.member_count })}</Text>
      </View>
      {meetup.is_host && <Text style={styles.badge}>{t('profile.host')}</Text>}
      <Icon name="chevronRight" size={20} color={Colors.textMuted} />
    </Pressable>
  );
}

const useStyles = makeStyles((Colors) => ({
  flex: { flex: 1 },
  spinner: { marginTop: Spacing.xl },
  pressed: { opacity: 0.75 },
  section: { marginTop: Spacing.xl },
  sectionTitle: {
    ...Type.label,
    fontSize: 14,
    fontWeight: '800',
    color: Colors.text,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: Spacing.md,
  },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  tag: {
    minHeight: 40,
    paddingHorizontal: Spacing.lg,
    justifyContent: 'center',
    borderRadius: Radius.pill,
    borderWidth: 1.5,
    borderColor: Colors.borderStrong,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
    ...RaisedSmall,
  },
  tagText: { ...Type.body, color: Colors.text },
  muted: { ...Type.body, color: Colors.textMuted, textAlign: 'center' },
  emptyBox: { alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.xl },
  buttonRow: { marginTop: Spacing.lg },
  worldCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginTop: Spacing.lg,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
    ...Raised,
  },
  worldPercent: { ...Type.title, color: Colors.text },
  progressTrack: {
    height: 8,
    marginTop: Spacing.sm,
    borderRadius: 4,
    backgroundColor: Colors.surfaceRaised,
    overflow: 'hidden',
  },
  progressFill: { height: 8, borderRadius: 4, backgroundColor: Colors.orange },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
    ...RaisedSmall,
  },
  rowEmoji: { fontSize: 28 },
  rowTitle: { ...Type.heading, color: Colors.text },
  rowMeta: { ...Type.small, color: Colors.textSecondary },
  rowNote: { ...Type.small, color: Colors.textMuted },
  badge: {
    ...Type.label,
    fontSize: 12,
    color: Colors.onBrand,
    backgroundColor: Colors.orange,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.pill,
    overflow: 'hidden',
  },
}));
