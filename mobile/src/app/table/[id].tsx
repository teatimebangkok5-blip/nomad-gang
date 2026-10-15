import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { ScreenHeader } from '@/components/screen-header';
import { Colors, Radius, Spacing, Type } from '@/constants/theme';
import { currentLanguage, localized } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { formatWhen } from '@/lib/bangkok-time';
import { cancelMeetup, googleMapsUrl, joinMeetup, leaveMeetup, useMeetup, type MeetupErrorKey } from '@/lib/meetups';
import { venuePhotoUrl } from '@/lib/supabase';
import { useVenues } from '@/lib/venues';

// One table: where and when, who's coming, and join / leave / cancel.
export default function TableScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const language = currentLanguage();
  const { session } = useAuth();
  const { state, reload } = useMeetup(id);
  const venues = useVenues();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MeetupErrorKey | null>(null);

  async function run(action: (meetupId: string) => Promise<{ error: MeetupErrorKey | null }>) {
    setError(null);
    setBusy(true);
    const result = await action(id);
    setBusy(false);
    if (result.error) setError(result.error);
    reload();
  }

  if (state.status === 'loading') {
    return (
      <SafeAreaView style={styles.safe}>
        <ScreenHeader />
        <ActivityIndicator color={Colors.orange} size="large" style={styles.spinner} />
      </SafeAreaView>
    );
  }

  if (state.status !== 'ready') {
    return (
      <SafeAreaView style={styles.safe}>
        <ScreenHeader />
        <View style={styles.center}>
          <Icon name="error" size={40} color={Colors.textMuted} />
          <Text style={styles.centerText}>{state.status === 'missing' ? t('tables.notFound') : t('tables.errorLoad')}</Text>
          {state.status === 'error' && <Button title={t('common.tryAgain')} variant="secondary" onPress={reload} />}
        </View>
      </SafeAreaView>
    );
  }

  const meetup = state.meetup;
  const venue = meetup.venue_id ? venues.venues.find((v) => v.id === meetup.venue_id) : undefined;
  const mapsTarget = venue
    ? { lat: venue.lat, lng: venue.lng, placeId: venue.google_place_id, name: venue.name_en }
    : meetup.place_lat !== null && meetup.place_lng !== null
      ? { lat: meetup.place_lat, lng: meetup.place_lng, placeId: meetup.google_place_id, name: meetup.place_name }
      : null;
  const userId = session?.user.id;
  const isHost = meetup.host_id === userId;
  const isMember = meetup.members.some((m) => m.user_id === userId);
  const ended = new Date(meetup.ends_at) <= new Date();
  const cancelled = meetup.status === 'cancelled';
  const seatsLeft = Math.max(0, meetup.max_people - meetup.members.length);

  function confirm(message: string, actionLabel: string, action: () => void) {
    Alert.alert(message, undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: actionLabel, style: 'destructive', onPress: action },
    ]);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <ScreenHeader />
      <ScrollView contentContainerStyle={styles.content}>
        {venue?.photo_path ? (
          <Image
            source={venuePhotoUrl(venue.photo_path)}
            style={styles.photo}
            contentFit="cover"
            accessibilityIgnoresInvertColors
          />
        ) : null}

        <View style={styles.pad}>
          <Text style={styles.venue}>{venue ? localized(venue, 'name', language) : (meetup.place_name ?? '—')}</Text>
          {meetup.title ? <Text style={styles.title}>{meetup.title}</Text> : null}

          <View style={styles.facts}>
            <View style={styles.fact}>
              <Icon name="time" size={18} color={Colors.orange} />
              <Text style={styles.factText}>{formatWhen(meetup.starts_at, t)}</Text>
            </View>
            <View style={styles.fact}>
              <Icon name="group" size={18} color={Colors.orange} />
              <Text style={styles.factText}>
                {t('tables.peopleCount', { count: meetup.members.length, max: meetup.max_people })}
                {!cancelled && !ended && seatsLeft > 0 ? ` · ${t('tables.seatsLeft', { count: seatsLeft })}` : ''}
              </Text>
            </View>
            {venue?.address_en || venue?.address_th ? (
              <View style={styles.fact}>
                <Icon name="location" size={18} color={Colors.orange} />
                <Text style={styles.factText}>{localized(venue, 'address', language)}</Text>
              </View>
            ) : null}
            {mapsTarget && (
              <Pressable accessibilityRole="link" onPress={() => Linking.openURL(googleMapsUrl(mapsTarget))} style={styles.fact}>
                <Icon name="map" size={18} color={Colors.orange} />
                <Text style={styles.mapsLink}>{t('tables.openInMaps')}</Text>
              </Pressable>
            )}
          </View>

          {venue?.deal && (
            <View style={styles.deal}>
              <Icon name="deal" size={18} color={Colors.orange} />
              <View style={styles.dealBody}>
                <Text style={styles.dealTitle}>{localized(venue.deal, 'title', language)}</Text>
                <Text style={styles.dealNote}>{t('tables.discountNote')}</Text>
              </View>
            </View>
          )}

          {(cancelled || ended) && (
            <Text style={styles.status}>{cancelled ? t('tables.cancelled') : t('tables.ended')}</Text>
          )}

          <Text style={styles.heading}>{t('tables.whoIsComing')}</Text>
          <View style={styles.members}>
            {meetup.members.map((member) => (
              <View key={member.user_id} style={styles.member}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{member.display_name.slice(0, 1).toUpperCase() || '?'}</Text>
                </View>
                <Text style={styles.memberName} numberOfLines={1}>
                  {member.display_name}
                  {member.user_id === userId ? ` (${t('tables.you')})` : ''}
                </Text>
                {member.user_id === meetup.host_id && <Text style={styles.hostTag}>{t('tables.host')}</Text>}
              </View>
            ))}
          </View>

          {error && (
            <Text accessibilityRole="alert" style={styles.error}>
              {t(`tables.errors.${error}`)}
            </Text>
          )}

          {!cancelled && !ended && (
            <View style={styles.actions}>
              {isHost ? (
                <Button
                  title={t('tables.cancelTable')}
                  variant="secondary"
                  loading={busy}
                  onPress={() => confirm(t('tables.cancelConfirm'), t('tables.cancelTable'), () => run(cancelMeetup))}
                />
              ) : isMember ? (
                <Button
                  title={t('tables.leave')}
                  variant="secondary"
                  loading={busy}
                  onPress={() => confirm(t('tables.leaveConfirm'), t('tables.leave'), () => run(leaveMeetup))}
                />
              ) : (
                <Button
                  title={seatsLeft > 0 ? t('tables.join') : t('tables.full')}
                  loading={busy}
                  disabled={seatsLeft === 0}
                  onPress={() => run(joinMeetup)}
                />
              )}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  content: { paddingBottom: Spacing.xxl * 2 },
  spinner: { marginTop: Spacing.xxl * 2 },
  center: { alignItems: 'center', gap: Spacing.md, padding: Spacing.xxl },
  centerText: { ...Type.body, color: Colors.textSecondary, textAlign: 'center' },
  photo: { width: '100%', aspectRatio: 16 / 9, backgroundColor: Colors.surfaceRaised },
  pad: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg },
  venue: { ...Type.display, fontSize: 26, lineHeight: 32, color: Colors.text },
  title: { ...Type.body, fontSize: 16, color: Colors.textSecondary, marginTop: Spacing.xs },
  facts: { marginTop: Spacing.lg, gap: Spacing.sm },
  fact: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  factText: { ...Type.body, color: Colors.text, flex: 1 },
  mapsLink: { ...Type.body, color: Colors.orange, fontWeight: '600' },
  deal: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.lg,
    padding: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.orangeTint,
    borderWidth: 1,
    borderColor: 'rgba(255, 154, 27, 0.35)',
  },
  dealBody: { flex: 1, gap: 2 },
  dealTitle: { ...Type.label, color: Colors.glow },
  dealNote: { ...Type.small, color: Colors.textSecondary },
  status: {
    ...Type.label,
    color: Colors.danger,
    backgroundColor: Colors.dangerBg,
    padding: Spacing.md,
    borderRadius: Radius.sm,
    marginTop: Spacing.lg,
  },
  heading: { ...Type.heading, color: Colors.text, marginTop: Spacing.xl, marginBottom: Spacing.md },
  members: { gap: Spacing.sm },
  member: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.sm,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.violetTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { ...Type.label, color: Colors.text },
  memberName: { ...Type.body, color: Colors.text, flex: 1 },
  hostTag: {
    ...Type.small,
    fontWeight: '700',
    color: Colors.onBrand,
    backgroundColor: Colors.pink,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.pill,
    overflow: 'hidden',
  },
  error: {
    ...Type.small,
    color: Colors.danger,
    backgroundColor: Colors.dangerBg,
    padding: Spacing.md,
    borderRadius: Radius.sm,
    marginTop: Spacing.lg,
  },
  actions: { marginTop: Spacing.xl },
});
