import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GlossyFill } from '@/components/glossy';
import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { PlanTimeline } from '@/components/plan-timeline';
import { PlanMap } from '@/components/plan-view';
import { ScreenHeader } from '@/components/screen-header';
import { Radius, RaisedSmall, Spacing, Type } from '@/constants/theme';
import { currentLanguage, localized } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { formatWhen, formatWhenRange } from '@/lib/bangkok-time';
import { isSafeLink, openLink, ticketLink } from '@/lib/links';
import {
  cancelMeetup,
  directionsUrl,
  joinMeetup,
  leaveMeetup,
  meetupPlaceName,
  useMeetup,
  type MeetupErrorKey,
} from '@/lib/meetups';
import { profilePhotoUrl } from '@/lib/photos';
import { usePlanForMeetup } from '@/lib/plans';
import { useMyFeedback } from '@/lib/profiles';
import { venuePhotoUrl } from '@/lib/supabase';
import { PROMOTION_EMOJI, useVenues } from '@/lib/venues';
import { makeStyles, useColors } from '@/lib/theme';

// One table or hangout: where and when, who's coming, and join / leave / cancel.
export default function TableScreen() {
  const styles = useStyles();
  const Colors = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const language = currentLanguage();
  const { session } = useAuth();
  const { state, reload } = useMeetup(id);
  const venues = useVenues();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MeetupErrorKey | null>(null);
  // 👍 / 👎 for the other members: once it has ended (not cancelled), for 14 days, if you were there.
  const [openedAt] = useState(() => Date.now());
  const loaded = state.status === 'ready' ? state.meetup : null;
  const endsAt = loaded ? new Date(loaded.ends_at).getTime() : 0;
  const canRate = Boolean(
    loaded &&
      loaded.status === 'open' &&
      endsAt <= openedAt &&
      endsAt > openedAt - 14 * 24 * 60 * 60 * 1000 &&
      loaded.members.some((m) => m.user_id === session?.user.id),
  );
  const feedback = useMyFeedback(id, canRate);
  // A day hangout made from a day plan links to the plan.
  const dayPlan = usePlanForMeetup(id);

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
        <ActivityIndicator color={Colors.accent} size="large" style={styles.spinner} />
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
    ? { lat: venue.lat, lng: venue.lng, name: localized(venue, 'name', language) }
    : meetup.place_lat !== null && meetup.place_lng !== null
      ? { lat: meetup.place_lat, lng: meetup.place_lng, name: meetupPlaceName(meetup, language) }
      : null;
  const userId = session?.user.id;
  const isHost = meetup.host_id === userId;
  const isMember = meetup.members.some((m) => m.user_id === userId);
  const ended = new Date(meetup.ends_at) <= new Date();
  const cancelled = meetup.status === 'cancelled';
  const seatsLeft = Math.max(0, meetup.max_people - meetup.members.length);
  const isHangout = meetup.kind === 'hangout';
  const placeLabel = venue ? localized(venue, 'name', language) : meetupPlaceName(meetup, language);
  const errorText = error ? (isHangout ? t(`hangouts.errors.${error}`) : t(`tables.errors.${error}`)) : null;
  // Hangouts: the official ticket page the founder added, else the place's official website (OpenStreetMap).
  const tickets = isHangout && venue ? ticketLink(venue) : null;
  const website = isHangout && !tickets && isSafeLink(meetup.place_website) ? meetup.place_website : null;

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
          {isHangout ? (
            <>
              <Text style={styles.kindTag}>🙌 {t('hangouts.hangout')}</Text>
              <Text style={styles.venue}>{meetup.title}</Text>
              {meetup.description ? <Text style={styles.description}>{meetup.description}</Text> : null}
            </>
          ) : (
            <>
              <Text style={styles.venue}>{placeLabel}</Text>
              {meetup.title ? <Text style={styles.title}>{meetup.title}</Text> : null}
            </>
          )}

          <View style={styles.facts}>
            <View style={styles.fact}>
              <Icon name="time" size={18} color={Colors.accent} />
              <Text style={styles.factText}>
                {isHangout ? formatWhenRange(meetup.starts_at, meetup.ends_at, t) : formatWhen(meetup.starts_at, t)}
              </Text>
            </View>
            {isHangout && (
              <View style={styles.fact}>
                <Icon name={venue ? venue.category : 'pin'} size={18} color={Colors.accent} />
                <Text style={styles.factText}>{placeLabel}</Text>
              </View>
            )}
            <View style={styles.fact}>
              <Icon name="group" size={18} color={Colors.accent} />
              <Text style={styles.factText}>
                {t('tables.peopleCount', { count: meetup.members.length, max: meetup.max_people })}
                {!cancelled && !ended && seatsLeft > 0 ? ` · ${t('tables.seatsLeft', { count: seatsLeft })}` : ''}
              </Text>
            </View>
            {venue?.address_en || venue?.address_th ? (
              <View style={styles.fact}>
                <Icon name="location" size={18} color={Colors.accent} />
                <Text style={styles.factText}>{localized(venue, 'address', language)}</Text>
              </View>
            ) : null}
            {mapsTarget && (
              <Pressable accessibilityRole="link" onPress={() => Linking.openURL(directionsUrl(mapsTarget))} style={styles.fact}>
                <Icon name="map" size={18} color={Colors.accent} />
                <Text style={styles.mapsLink}>{t('tables.openInMaps')}</Text>
              </Pressable>
            )}
            {dayPlan && (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/plan/[id]', params: { id: dayPlan.id } })}
                style={styles.fact}>
                <Icon name="route" size={18} color={Colors.accent} />
                <Text style={styles.mapsLink}>
                  {t('plan.dayPlan')} · {t('plan.stops', { count: dayPlan.stops.length })}
                </Text>
              </Pressable>
            )}
            {(tickets || website) && (
              <Pressable accessibilityRole="link" onPress={() => openLink(tickets ?? website)} style={styles.fact}>
                <Icon name={tickets ? 'ticket' : 'website'} size={18} color={Colors.accent} />
                <Text style={styles.mapsLink}>{tickets ? t('hangouts.buyTickets') : t('hangouts.officialWebsite')}</Text>
              </Pressable>
            )}
          </View>

          {dayPlan && (
            <View style={styles.planMap}>
              <PlanMap start={null} stops={dayPlan.stops} height={220} />
            </View>
          )}

          {isHangout
            ? venue?.promotions.map((promotion) => (
                <View key={promotion.id} style={styles.deal}>
                  <Text style={styles.dealEmoji}>{PROMOTION_EMOJI[promotion.kind]}</Text>
                  <View style={styles.dealBody}>
                    <Text style={styles.dealTitle}>{localized(promotion, 'title', language)}</Text>
                    <Text style={styles.dealNote}>
                      {promotion.kind === 'ticket'
                        ? t('hangouts.ticketNote')
                        : promotion.kind === 'discount' || promotion.kind === 'offer'
                          ? t('tables.discountNote')
                          : promotion.starts_at && promotion.ends_at
                            ? formatWhenRange(promotion.starts_at, promotion.ends_at, t)
                            : t(`promo.${promotion.kind}`)}
                    </Text>
                  </View>
                </View>
              ))
            : venue?.deal && (
                <View style={styles.deal}>
                  <Icon name="deal" size={18} color={Colors.accent} />
                  <View style={styles.dealBody}>
                    <Text style={styles.dealTitle}>{localized(venue.deal, 'title', language)}</Text>
                    <Text style={styles.dealNote}>{t('tables.discountNote')}</Text>
                  </View>
                </View>
              )}

          {(cancelled || ended) && (
            <Text style={styles.status}>
              {isHangout
                ? cancelled
                  ? t('hangouts.cancelled')
                  : t('hangouts.ended')
                : cancelled
                  ? t('tables.cancelled')
                  : t('tables.ended')}
            </Text>
          )}

          <Text style={styles.heading}>{canRate ? t('feedback.title') : t('tables.whoIsComing')}</Text>
          {canRate && <Text style={styles.feedbackBody}>{t('feedback.body')}</Text>}
          <View style={styles.members}>
            {meetup.members.map((member) => {
              const vote = feedback.votes.get(member.user_id);
              const rateable = canRate && member.user_id !== userId;
              return (
                <View key={member.user_id} style={styles.member}>
                  <GlossyFill />
                  {/* Tap a person to open their profile. */}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${t('profile.open')}: ${member.display_name}`}
                    onPress={() => router.push({ pathname: '/profile/[userId]', params: { userId: member.user_id } })}
                    style={({ pressed }) => [styles.memberMain, pressed && styles.memberPressed]}>
                    <View style={styles.avatar}>
                      {member.avatar_path ? (
                        <Image source={profilePhotoUrl(member.avatar_path)} style={styles.avatarImage} contentFit="cover" />
                      ) : (
                        <Text style={styles.avatarText}>{member.display_name.slice(0, 1).toUpperCase() || '?'}</Text>
                      )}
                    </View>
                    <Text style={styles.memberName} numberOfLines={1}>
                      {member.display_name}
                      {member.user_id === userId ? ` (${t('tables.you')})` : ''}
                    </Text>
                    {member.user_id === meetup.host_id && <Text style={styles.hostTag}>{t('tables.host')}</Text>}
                  </Pressable>
                  {rateable && (
                    <View style={styles.votes}>
                      {([1, -1] as const).map((value) => (
                        <Pressable
                          key={value}
                          accessibilityRole="button"
                          accessibilityState={{ selected: vote === value }}
                          accessibilityLabel={t(value === 1 ? 'feedback.good' : 'feedback.bad', { name: member.display_name })}
                          hitSlop={4}
                          onPress={async () => {
                            const problem = await feedback.give(member.user_id, value);
                            if (problem) Alert.alert(t(`profile.errors.${problem}`));
                          }}
                          style={({ pressed }) => [
                            styles.voteButton,
                            vote === value && (value === 1 ? styles.voteUp : styles.voteDown),
                            pressed && styles.memberPressed,
                          ]}>
                          <Text style={styles.voteEmoji}>{value === 1 ? '👍' : '👎'}</Text>
                        </Pressable>
                      ))}
                    </View>
                  )}
                </View>
              );
            })}
          </View>

          {errorText && (
            <Text accessibilityRole="alert" style={styles.error}>
              {errorText}
            </Text>
          )}

          {isMember && !cancelled && (
            <View style={styles.actions}>
              <Button
                title={isHangout ? t('hangouts.chat') : t('chat.openChat')}
                icon={<Icon name="chat" size={20} color={Colors.onBrand} />}
                onPress={() => router.push({ pathname: '/table-chat/[id]', params: { id } })}
              />
            </View>
          )}

          {!cancelled && !ended && (
            <View style={styles.actions}>
              {isHost ? (
                <Button
                  title={isHangout ? t('hangouts.cancel') : t('tables.cancelTable')}
                  variant="secondary"
                  loading={busy}
                  onPress={() =>
                    isHangout
                      ? confirm(t('hangouts.cancelConfirm'), t('hangouts.cancel'), () => run(cancelMeetup))
                      : confirm(t('tables.cancelConfirm'), t('tables.cancelTable'), () => run(cancelMeetup))
                  }
                />
              ) : isMember ? (
                <Button
                  title={isHangout ? t('hangouts.leave') : t('tables.leave')}
                  variant="secondary"
                  loading={busy}
                  onPress={() =>
                    isHangout
                      ? confirm(t('hangouts.leaveConfirm'), t('hangouts.leave'), () => run(leaveMeetup))
                      : confirm(t('tables.leaveConfirm'), t('tables.leave'), () => run(leaveMeetup))
                  }
                />
              ) : (
                <Button
                  title={seatsLeft > 0 ? t('tables.join') : t('tables.full')}
                  variant={isHangout ? 'violet' : 'primary'}
                  loading={busy}
                  disabled={seatsLeft === 0}
                  onPress={() => run(joinMeetup)}
                />
              )}
            </View>
          )}

          {dayPlan && (
            <>
              <Text style={styles.heading}>{t('plan.dayPlan')}</Text>
              <PlanTimeline stops={dayPlan.stops} />
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((Colors) => ({
  safe: { flex: 1, backgroundColor: Colors.bg },
  content: { paddingBottom: Spacing.xxl * 2 },
  spinner: { marginTop: Spacing.xxl * 2 },
  center: { alignItems: 'center', gap: Spacing.md, padding: Spacing.xxl },
  centerText: { ...Type.body, color: Colors.textSecondary, textAlign: 'center' },
  photo: { width: '100%', aspectRatio: 16 / 9, backgroundColor: Colors.surfaceRaised },
  pad: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg },
  venue: { ...Type.display, fontSize: 26, lineHeight: 32, color: Colors.text },
  title: { ...Type.body, fontSize: 16, color: Colors.textSecondary, marginTop: Spacing.xs },
  kindTag: { ...Type.label, color: Colors.textSecondary, marginBottom: Spacing.xs },
  description: { ...Type.body, color: Colors.textSecondary, marginTop: Spacing.sm },
  dealEmoji: { fontSize: 18 },
  facts: { marginTop: Spacing.lg, gap: Spacing.sm },
  fact: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  factText: { ...Type.body, color: Colors.text, flex: 1 },
  mapsLink: { ...Type.body, color: Colors.accent, fontWeight: '600' },
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
    gap: Spacing.sm,
    padding: Spacing.sm,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
    ...RaisedSmall,
  },
  memberMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  memberPressed: { opacity: 0.7 },
  feedbackBody: { ...Type.small, color: Colors.textSecondary, marginTop: -Spacing.sm, marginBottom: Spacing.md },
  votes: { flexDirection: 'row', gap: Spacing.xs },
  voteButton: {
    width: 44,
    height: 40,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceRaised,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  voteUp: { backgroundColor: Colors.orangeTint, borderColor: Colors.orange },
  voteDown: { backgroundColor: Colors.dangerBg, borderColor: Colors.danger },
  voteEmoji: { fontSize: 18 },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.violetTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { ...Type.label, color: Colors.text },
  avatarImage: { width: 36, height: 36, borderRadius: 18 },
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
  planMap: { marginTop: Spacing.lg },
}));
