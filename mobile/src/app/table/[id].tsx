import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlossyFill } from '@/components/glossy';
import { Button } from '@/components/button';
import { CouponBox } from '@/components/coupon-box';
import { LevelBadge } from '@/components/level-badge';
import { Icon, type IconName } from '@/components/icon';
import { DealTag, KindTag, StatusTag, dealBadge } from '@/components/meetup-card';
import { PlanTimeline } from '@/components/plan-timeline';
import { RewardCard } from '@/components/reward-card';
import { PlanMap } from '@/components/plan-view';
import { RoundButton } from '@/components/round-button';
import { ScreenHeader } from '@/components/screen-header';
import { VenueMap } from '@/components/venue-map';
import { avatarColor, Radius, Raised, Spacing, Type } from '@/constants/theme';
import { localized, useLanguage } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { deviceZone, formatUtcOffset, formatWhen, formatWhenRange, sameClock } from '@/lib/bangkok-time';
import { COUPONS_ENABLED, useCheckedIn } from '@/lib/coupons';
import { meetupStatus } from '@/lib/feed';
import { isSafeLink, openLink, ticketLink } from '@/lib/links';
import {
  cancelJoinRequest,
  cancelMeetup,
  decideJoinRequest,
  directionsUrl,
  joinMeetup,
  leaveMeetup,
  meetupPlaceName,
  requestToJoin,
  useJoinRequests,
  useMeetup,
  type MeetupErrorKey,
} from '@/lib/meetups';
import { profilePhotoUrl } from '@/lib/photos';
import { useChallenges } from '@/lib/passport';
import { usePlanForMeetup } from '@/lib/plans';
import { REWARD_MIN_PEOPLE, useRewards } from '@/lib/rewards';
import { useMyFeedback } from '@/lib/profiles';
import { venuePhotoUrl } from '@/lib/supabase';
import { PROMOTION_EMOJI, useVenues } from '@/lib/venues';
import { makeStyles, useColors } from '@/lib/theme';

const HERO = 196;

// One table or hangout: a small map of where, what and when, the check-in box, who's coming, and join / leave /
// cancel / chat in the bar at the bottom.
export default function TableScreen() {
  const styles = useStyles();
  const Colors = useColors();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const language = useLanguage();
  const { session } = useAuth();
  const { state, reload } = useMeetup(id);
  const venues = useVenues();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MeetupErrorKey | null>(null);
  // 👍 / 👎 for the other members: once it has ended (not cancelled), for 14 days, if you were there.
  const [openedAt] = useState(() => Date.now());
  const loaded = state.status === 'ready' ? state.meetup : null;
  const endsAt = loaded ? new Date(loaded.ends_at).getTime() : 0;
  const amMember = Boolean(loaded?.members.some((m) => m.user_id === session?.user.id));
  const canRate = Boolean(
    loaded && loaded.status === 'open' && endsAt <= openedAt && endsAt > openedAt - 14 * 24 * 60 * 60 * 1000 && amMember,
  );
  const feedback = useMyFeedback(id, canRate);
  const checkedIn = useCheckedIn(id, amMember && loaded?.status === 'open');
  // Private tables / hangouts: the host sees the join requests, others their own.
  const joinRequests = useJoinRequests(id, loaded?.join_mode === 'private' && !!session);
  // A day hangout made from a day plan links to the plan.
  const dayPlan = usePlanForMeetup(id);
  const challenges = useChallenges();

  async function run(action: (meetupId: string) => Promise<{ error: MeetupErrorKey | null }>) {
    setError(null);
    setBusy(true);
    const result = await action(id);
    setBusy(false);
    if (result.error) setError(result.error);
    reload();
    joinRequests.reload();
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
  const challenge = challenges.find((c) => c.id === meetup.challenge_id);
  const venue = meetup.venue_id ? venues.venues.find((v) => v.id === meetup.venue_id) : undefined;
  const at = venue
    ? { lat: venue.lat, lng: venue.lng }
    : meetup.place_lat !== null && meetup.place_lng !== null
      ? { lat: meetup.place_lat, lng: meetup.place_lng }
      : null;
  const userId = session?.user.id;
  const isHost = meetup.host_id === userId;
  const isMember = amMember;
  const isPrivate = meetup.join_mode === 'private';
  const myRequest = joinRequests.requests.find((r) => r.user_id === userId && r.status !== 'approved') ?? null;
  const pendingRequests = isHost ? joinRequests.requests.filter((r) => r.status === 'pending') : [];
  const ended = new Date(meetup.ends_at) <= new Date();
  const cancelled = meetup.status === 'cancelled';
  const seatsLeft = Math.max(0, meetup.max_people - meetup.members.length);
  const isHangout = meetup.kind === 'hangout';
  const placeLabel = venue ? localized(venue, 'name', language) : meetupPlaceName(meetup, language);
  const errorText = error ? (isHangout ? t(`hangouts.errors.${error}`) : t(`tables.errors.${error}`)) : null;
  // Hangouts: the official ticket page the founder added, else the place's official website (OpenStreetMap).
  const tickets = isHangout && venue ? ticketLink(venue) : null;
  const website = isHangout && !tickets && isSafeLink(meetup.place_website) ? meetup.place_website : null;
  const status =
    cancelled || ended
      ? null
      : meetupStatus({ starts_at: meetup.starts_at, max_people: meetup.max_people, member_count: meetup.members.length }, new Date(openedAt));
  const when = isHangout
    ? formatWhenRange(meetup.starts_at, meetup.ends_at, t, undefined, meetup.time_zone)
    : formatWhen(meetup.starts_at, t, undefined, meetup.time_zone);
  const otherClock = !sameClock(meetup.time_zone, deviceZone(), new Date(meetup.starts_at));
  const title = meetup.title || placeLabel;

  function confirm(message: string, actionLabel: string, action: () => void) {
    Alert.alert(message, undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: actionLabel, style: 'destructive', onPress: action },
    ]);
  }

  function share() {
    Share.share({ message: t('tables.shareText', { title, when, place: placeLabel }) }).catch(() => {});
  }

  const leave = () =>
    isHangout
      ? confirm(t('hangouts.leaveConfirm'), t('hangouts.leave'), () => run(leaveMeetup))
      : confirm(t('tables.leaveConfirm'), t('tables.leave'), () => run(leaveMeetup));
  const cancel = () =>
    isHangout
      ? confirm(t('hangouts.cancelConfirm'), t('hangouts.cancel'), () => run(cancelMeetup))
      : confirm(t('tables.cancelConfirm'), t('tables.cancelTable'), () => run(cancelMeetup));
  const open = !cancelled && !ended;

  return (
    <View style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Where: a small map of the place (or the venue's photo), under the back and share buttons. */}
        <View style={[styles.hero, { height: insets.top + HERO }]}>
          {at ? (
            // A picture of the place: touches go to the scroll view.
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <VenueMap
              fullScreen
              interactive={false}
              userCoords={null}
              center={at}
              initialZoom={15.5}
              pins={[
                {
                  key: 'here',
                  ...at,
                  emoji: isHangout ? '🙌' : '👥',
                  tone: isHangout ? 'violet' : 'orange',
                  count: meetup.members.length,
                },
              ]}
              onPinPress={() => {}}
              mapPadding={{ top: insets.top + 40, right: 0, bottom: 20, left: 0 }}
            />
            </View>
          ) : venue?.photo_path ? (
            <Image source={venuePhotoUrl(venue.photo_path)} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : null}
          <LinearGradient
            colors={['rgba(10, 6, 18, 0.55)', 'rgba(10, 6, 18, 0)', 'rgba(10, 6, 18, 0)', Colors.bg]}
            locations={[0, 0.35, 0.7, 1]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <View style={[styles.heroBar, { top: insets.top + 6 }]}>
            <RoundButton
              icon="back"
              label={t('common.back')}
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
            />
            <View style={styles.flex} />
            {open && <RoundButton icon="share" label={t('tables.share')} onPress={share} />}
          </View>
        </View>

        <View style={styles.body}>
          <View style={styles.tags}>
            <KindTag hangout={isHangout} />
            {cancelled || ended ? (
              <View style={styles.endedTag}>
                <Text style={styles.endedText}>
                  {cancelled ? t('tables.cancelledShort') : t('tables.endedShort')}
                </Text>
              </View>
            ) : (
              <StatusTag status={status} joined={isMember} />
            )}
            {venue?.deal && <DealTag label={`${dealBadge(venue.deal, t)} · ${t('home.partner')}`} push={false} />}
            {isPrivate && (
              <View style={styles.privateTag}>
                <Icon name="lock" size={13} color={Colors.violetText} />
                <Text style={styles.privateText}>{t('privacy.private')}</Text>
              </View>
            )}
          </View>

          <View style={styles.titles}>
            <Text style={styles.title}>{title}</Text>
            {meetup.title ? <Text style={styles.subtitle}>{placeLabel}</Text> : null}
            {isHangout && meetup.description ? <Text style={styles.description}>{meetup.description}</Text> : null}
          </View>

          <View style={styles.card}>
            <GlossyFill />
            <InfoRow icon="event" first>
              {when}
              {otherClock ? (
                <Text style={styles.infoMuted}>
                  {`  ·  ${t('hangouts.localTime', { offset: formatUtcOffset(meetup.time_zone, new Date(meetup.starts_at)) })}`}
                </Text>
              ) : null}
            </InfoRow>
            {isHangout && <InfoRow icon={venue ? venue.category : 'pin'}>{placeLabel}</InfoRow>}
            {meetup.meeting_point ? <InfoRow icon="pin">{meetup.meeting_point}</InfoRow> : null}
            {typeof meetup.cost_level === 'number' ? (
              <InfoRow icon="payments">{t('feed.costPerPerson', { cost: t(`feed.cost.${meetup.cost_level}`) })}</InfoRow>
            ) : null}
            <InfoRow icon="group">
              {t('tables.peopleCount', { count: meetup.members.length, max: meetup.max_people })}
              {open && seatsLeft > 0 ? ` · ${t('tables.seatsLeft', { count: seatsLeft })}` : ''}
            </InfoRow>
            {challenge && (
              <InfoRow emoji={challenge.emoji}>
                {t('passport.challengeFact', { title: localized(challenge, 'title', language), points: challenge.points })}
              </InfoRow>
            )}
            {venue?.address_en || venue?.address_th ? (
              <InfoRow icon="location">{localized(venue, 'address', language)}</InfoRow>
            ) : null}
          </View>

          <View style={styles.links}>
            {at && (
              <LinkChip
                icon="map"
                label={t('tables.openInMaps')}
                onPress={() => Linking.openURL(directionsUrl({ ...at, name: placeLabel }))}
              />
            )}
            {dayPlan && (
              <LinkChip
                icon="route"
                label={`${t('plan.dayPlan')} · ${t('plan.stops', { count: dayPlan.stops.length })}`}
                onPress={() => router.push({ pathname: '/plan/[id]', params: { id: dayPlan.id } })}
              />
            )}
            {(tickets || website) && (
              <LinkChip
                icon={tickets ? 'ticket' : 'website'}
                label={tickets ? t('hangouts.buyTickets') : t('hangouts.officialWebsite')}
                onPress={() => openLink(tickets ?? website)}
              />
            )}
          </View>

          {dayPlan && <PlanMap start={null} stops={dayPlan.stops} height={220} />}

          {/* Promotions at a hangout venue (events, tickets…); a table's deal before joining (members see it in the
              check-in box). */}
          {isHangout
            ? venue?.promotions.map((promotion) => (
                <View key={promotion.id} style={styles.deal}>
                  <Text style={styles.dealEmoji}>{PROMOTION_EMOJI[promotion.kind]}</Text>
                  <View style={styles.flex}>
                    <Text style={styles.dealTitle}>{localized(promotion, 'title', language)}</Text>
                    <Text style={styles.dealNote}>
                      {!COUPONS_ENABLED && ['ticket', 'discount', 'offer'].includes(promotion.kind)
                        ? t('coupon.comingSoon')
                        : promotion.kind === 'ticket'
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
            : venue?.deal &&
              !isMember && (
                <View style={styles.deal}>
                  <Icon name="deal" size={20} color={Colors.accent} />
                  <View style={styles.flex}>
                    <Text style={styles.dealTitle}>{localized(venue.deal, 'title', language)}</Text>
                    <Text style={styles.dealNote}>
                      {COUPONS_ENABLED ? t('tables.discountNote') : t('coupon.comingSoon')}
                    </Text>
                  </View>
                </View>
              )}

          {/* Check in (Rewards Passport + a partner venue's coupon), until 3 days after the end. */}
          {isMember && !cancelled && endsAt > openedAt - 3 * 24 * 60 * 60 * 1000 && (
            <CouponBox meetupId={id} timeZone={meetup.time_zone} isHost={isHost} ended={ended} />
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

          {/* Host reward: travel deals for this city once it ends (not cancelled) with 4+ people. */}
          {isHost &&
            !cancelled &&
            (ended && meetup.members.length >= REWARD_MIN_PEOPLE ? (
              <HostReward meetupId={id} />
            ) : (
              <Pressable accessibilityRole="button" onPress={() => router.push('/rewards')} style={styles.bonus}>
                <Text style={styles.bonusEmoji}>🎁</Text>
                <Text style={styles.bonusText}>
                  {ended
                    ? t('rewards.notThisTime', { count: REWARD_MIN_PEOPLE })
                    : t('rewards.hostBonus', { count: REWARD_MIN_PEOPLE })}{' '}
                  <Text style={styles.bonusLink}>{t('rewards.seeExample')}</Text>
                </Text>
              </Pressable>
            ))}

          {open && pendingRequests.length > 0 && (
            <View>
              <View style={styles.membersHeader}>
                <Text style={styles.heading}>{t('privacy.requestsTitle')}</Text>
                <Text style={styles.membersCount}>{pendingRequests.length}</Text>
              </View>
              {pendingRequests.map((request) => (
                <View key={request.user_id} style={styles.member}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${t('profile.open')}: ${request.display_name}`}
                    onPress={() => router.push({ pathname: '/profile/[userId]', params: { userId: request.user_id } })}
                    style={({ pressed }) => [styles.memberMain, pressed && styles.pressed]}>
                    <View style={styles.avatarBox}>
                      <View style={[styles.avatar, { backgroundColor: avatarColor(request.user_id) }]}>
                        {request.avatar_path ? (
                          <Image source={profilePhotoUrl(request.avatar_path)} style={styles.avatarImage} contentFit="cover" />
                        ) : (
                          <Text style={styles.avatarText}>{request.display_name.slice(0, 1).toUpperCase() || '?'}</Text>
                        )}
                      </View>
                      <LevelBadge userId={request.user_id} size={44} />
                    </View>
                    <Text style={[styles.memberName, styles.flex]} numberOfLines={1}>
                      {request.display_name}
                    </Text>
                  </Pressable>
                  <View style={styles.votes}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t('privacy.approve', { name: request.display_name })}
                      disabled={busy}
                      onPress={() => run((meetupId) => decideJoinRequest(meetupId, request.user_id, true))}
                      style={({ pressed }) => [styles.decide, styles.approve, pressed && styles.pressed]}>
                      <Icon name="check" size={20} color={Colors.white} />
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t('privacy.decline', { name: request.display_name })}
                      disabled={busy}
                      onPress={() => run((meetupId) => decideJoinRequest(meetupId, request.user_id, false))}
                      style={({ pressed }) => [styles.decide, styles.decline, pressed && styles.pressed]}>
                      <Icon name="close" size={20} color={Colors.text} />
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          )}

          <View>
            <View style={styles.membersHeader}>
              <Text style={styles.heading}>{canRate ? t('feedback.title') : t('tables.members')}</Text>
              <Text style={styles.membersCount}>
                {meetup.members.length}/{meetup.max_people}
              </Text>
            </View>
            {canRate && <Text style={styles.feedbackBody}>{t('feedback.body')}</Text>}
            {meetup.members.map((member) => {
              const vote = feedback.votes.get(member.user_id);
              const rateable = canRate && member.user_id !== userId;
              const here = checkedIn.has(member.user_id);
              const initials = member.display_name
                .split(/\s+/)
                .slice(0, 2)
                .map((part) => part.slice(0, 1).toUpperCase())
                .join('');
              return (
                <View key={member.user_id} style={styles.member}>
                  {/* Tap a person to open their profile. */}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${t('profile.open')}: ${member.display_name}`}
                    onPress={() => router.push({ pathname: '/profile/[userId]', params: { userId: member.user_id } })}
                    style={({ pressed }) => [styles.memberMain, pressed && styles.pressed]}>
                    <View style={styles.avatarBox}>
                      <View style={[styles.avatar, { backgroundColor: avatarColor(member.user_id) }]}>
                        {member.avatar_path ? (
                          <Image source={profilePhotoUrl(member.avatar_path)} style={styles.avatarImage} contentFit="cover" />
                        ) : (
                          <Text style={styles.avatarText}>{initials || '?'}</Text>
                        )}
                      </View>
                      <LevelBadge userId={member.user_id} size={44} />
                    </View>
                    <View style={styles.flex}>
                      <Text style={styles.memberName} numberOfLines={1}>
                        {member.user_id === userId ? t('tables.you') : member.display_name}
                      </Text>
                      {open && isMember && (
                        <Text style={[styles.memberSub, here && styles.memberHere]}>
                          {here ? t('coupon.memberCheckedIn') : t('coupon.memberNotYet')}
                        </Text>
                      )}
                    </View>
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
                            pressed && styles.pressed,
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

          {dayPlan && (
            <View>
              <Text style={[styles.heading, styles.headingSpace]}>{t('plan.dayPlan')}</Text>
              <PlanTimeline stops={dayPlan.stops} />
            </View>
          )}
        </View>
      </ScrollView>

      {/* Chat and leave / cancel for members; join for everyone else. */}
      {(isMember || open) && (
        <View style={[styles.bar, { paddingBottom: insets.bottom + Spacing.md }]}>
          {isMember ? (
            <>
              <View style={styles.flex}>
                <Button
                  title={isHangout ? t('hangouts.chat') : t('chat.openChat')}
                  variant="secondary"
                  icon={<Icon name="forum" size={22} color={Colors.text} />}
                  onPress={() => router.push({ pathname: '/table-chat/[id]', params: { id } })}
                />
              </View>
              {open && (
                <Button
                  title={isHost ? (isHangout ? t('hangouts.cancel') : t('tables.cancelTable')) : t('tables.leaveShort')}
                  variant="danger"
                  loading={busy}
                  onPress={isHost ? cancel : leave}
                />
              )}
            </>
          ) : (
            <View style={styles.flex}>
              {isPrivate ? (
                myRequest?.status === 'pending' ? (
                  <Button title={t('privacy.requestSent')} variant="secondary" loading={busy} onPress={() => run(cancelJoinRequest)} />
                ) : (
                  <Button
                    title={
                      myRequest?.status === 'declined'
                        ? t('privacy.declinedShort')
                        : seatsLeft > 0
                          ? t('privacy.requestToJoin')
                          : t('tables.full')
                    }
                    variant={isHangout ? 'violet' : 'primary'}
                    icon={<Icon name="lock" size={20} color={Colors.white} />}
                    loading={busy}
                    disabled={seatsLeft === 0 || myRequest?.status === 'declined'}
                    onPress={() => run(requestToJoin)}
                  />
                )
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
        </View>
      )}
    </View>
  );
}

function InfoRow({ icon, emoji, first = false, children }: { icon?: IconName; emoji?: string; first?: boolean; children: ReactNode }) {
  const styles = useStyles();
  const Colors = useColors();
  return (
    <View style={[styles.infoRow, !first && styles.infoBorder]}>
      {emoji ? <Text style={styles.infoEmoji}>{emoji}</Text> : icon && <Icon name={icon} size={22} color={Colors.accent} />}
      <Text style={styles.infoText}>{children}</Text>
    </View>
  );
}

function LinkChip({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const styles = useStyles();
  const Colors = useColors();
  return (
    <Pressable accessibilityRole="link" onPress={onPress} style={({ pressed }) => [styles.linkChip, pressed && styles.pressed]}>
      <GlossyFill />
      <Icon name={icon} size={18} color={Colors.text} />
      <Text style={styles.linkChipText}>{label}</Text>
    </Pressable>
  );
}

// The host's travel deals for this table / hangout (from my_rewards).
function HostReward({ meetupId }: { meetupId: string }) {
  const Colors = useColors();
  const { rewards, reload } = useRewards();
  const reward = rewards?.find((r) => r.meetup_id === meetupId);
  if (rewards === null) return <ActivityIndicator color={Colors.accent} />;
  return reward ? <RewardCard reward={reward} onChanged={reload} /> : null;
}

const useStyles = makeStyles((Colors) => ({
  safe: { flex: 1, backgroundColor: Colors.bg },
  flex: { flex: 1 },
  pressed: { opacity: 0.75 },
  content: { paddingBottom: Spacing.xl },
  spinner: { marginTop: Spacing.xxl * 2 },
  center: { alignItems: 'center', gap: Spacing.md, padding: Spacing.xxl },
  centerText: { ...Type.body, color: Colors.textSecondary, textAlign: 'center' },
  hero: { overflow: 'hidden', backgroundColor: Colors.surfaceRaised },
  heroBar: { position: 'absolute', left: Spacing.md, right: Spacing.md, flexDirection: 'row', gap: Spacing.sm },
  body: { paddingHorizontal: Spacing.lg, marginTop: -14, gap: 14 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  endedTag: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: Radius.pill, backgroundColor: Colors.dangerBg },
  endedText: { fontSize: 12, lineHeight: 16, fontWeight: '800', color: Colors.danger },
  titles: { gap: 4 },
  title: { ...Type.display, fontSize: 26, lineHeight: 31, color: Colors.text },
  subtitle: { ...Type.label, fontWeight: '600', color: Colors.textSecondary },
  description: { ...Type.body, color: Colors.textSecondary, marginTop: Spacing.xs },
  card: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
    ...Raised,
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.md, paddingHorizontal: 14 },
  infoBorder: { borderTopWidth: 1, borderTopColor: Colors.border },
  infoEmoji: { width: 22, textAlign: 'center', fontSize: 18 },
  infoText: { ...Type.body, fontWeight: '600', color: Colors.text, flex: 1 },
  infoMuted: { fontWeight: '500', color: Colors.textMuted },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  linkChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 40,
    paddingHorizontal: 14,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
    ...Raised,
  },
  linkChipText: { ...Type.label, color: Colors.text },
  deal: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: 14,
    borderRadius: Radius.lg,
    backgroundColor: Colors.orangeTint,
  },
  dealEmoji: { fontSize: 20 },
  dealTitle: { ...Type.label, color: Colors.text },
  dealNote: { ...Type.small, color: Colors.textSecondary },
  status: {
    ...Type.label,
    color: Colors.danger,
    backgroundColor: Colors.dangerBg,
    padding: Spacing.md,
    borderRadius: Radius.sm,
    overflow: 'hidden',
  },
  bonus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md - 2,
    paddingVertical: Spacing.md,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: Colors.pinkTint,
  },
  bonusEmoji: { fontSize: 20 },
  bonusText: { ...Type.small, fontWeight: '600', color: Colors.text, flex: 1 },
  bonusLink: { fontWeight: '800', textDecorationLine: 'underline' },
  membersHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: Spacing.xs },
  heading: { ...Type.heading, fontWeight: '800', color: Colors.text },
  headingSpace: { marginBottom: Spacing.md },
  membersCount: { ...Type.label, fontSize: 13, color: Colors.textMuted },
  feedbackBody: { ...Type.small, color: Colors.textSecondary, marginBottom: Spacing.sm },
  member: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, minHeight: 56 },
  memberMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  avatarBox: { width: 44, height: 44 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarText: { fontSize: 14, fontWeight: '800', color: Colors.onBrand },
  avatarImage: { width: 44, height: 44 },
  memberName: { ...Type.body, fontWeight: '700', color: Colors.text },
  memberSub: { ...Type.small, fontSize: 12, fontWeight: '600', color: Colors.textMuted },
  memberHere: { color: Colors.ok },
  hostTag: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
    color: Colors.pinkText,
    backgroundColor: Colors.pinkTint,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: Radius.pill,
    overflow: 'hidden',
  },
  votes: { flexDirection: 'row', gap: Spacing.xs },
  privateTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.pill,
    backgroundColor: Colors.violetTint,
  },
  privateText: { ...Type.small, fontWeight: '700', color: Colors.violetText },
  decide: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  approve: { backgroundColor: Colors.ok },
  decline: { backgroundColor: Colors.surfaceRaised, borderWidth: 1, borderColor: Colors.borderStrong },
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
  error: {
    ...Type.small,
    color: Colors.danger,
    backgroundColor: Colors.dangerBg,
    padding: Spacing.md,
    borderRadius: Radius.sm,
    overflow: 'hidden',
  },
  bar: {
    flexDirection: 'row',
    gap: Spacing.md - 2,
    paddingTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.surface,
  },
}));
