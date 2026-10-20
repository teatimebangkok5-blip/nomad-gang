import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { GlossyFill, InstagramBadge } from '@/components/glossy';
import { Icon, type IconName } from '@/components/icon';
import { LevelBadge } from '@/components/level-badge';
import { AboutTab, EventsTab, TravelTab, TripsTab, worldPercent, type ProfileTab } from '@/components/profile-tabs';
import { ScreenHeader } from '@/components/screen-header';
import { StoryShare } from '@/components/story-card';
import { Radius, Raised, RaisedSmall, Spacing, Type } from '@/constants/theme';
import { useLanguage } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { usePassportSummary } from '@/lib/passport';
import { deletePhotoFile, pickAndUploadPhoto, profilePhotoUrl, saveMyPhotos, type PhotoKind } from '@/lib/photos';
import { countryName, flagEmoji } from '@/lib/profile-options';
import {
  followUser,
  instagramUrl,
  unfollowUser,
  useProfile,
  type Profile,
  type ProfileErrorKey,
} from '@/lib/profiles';
import { openSafetyMenu } from '@/lib/safety-menu';
import { makeStyles, useColors } from '@/lib/theme';

const PHOTO_SLOTS = 3;

// A person's profile: picture, name and age, where they're from, Instagram, stat boxes (world %, upcoming trips,
// countries, friends, met up, 👍 / 👎) and four tabs: About (languages, profession, travel style, interests, best
// photos, world clocks), Travel (countries visited), Trips and Events (tables and hangouts). On your own profile:
// Edit, Story (share a picture of it), Favorites, Settings and "View public profile" (?preview=1 shows it the way
// others see it). Anyone signed in can open a profile, except across a block.
export default function ProfileScreen() {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  const language = useLanguage();
  const { userId, preview } = useLocalSearchParams<{ userId: string; preview?: string }>();
  const { session } = useAuth();
  const myId = session?.user.id;
  const isOwner = myId === userId;
  const isMe = isOwner && preview !== '1';
  const { state, reload } = useProfile(userId);
  const passport = usePassportSummary(userId);
  const [tab, setTab] = useState<ProfileTab>('about');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState<'avatar' | number | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [storyOpen, setStoryOpen] = useState(false);
  const [error, setError] = useState<ProfileErrorKey | null>(null);

  async function toggleFollow(profile: Profile) {
    setBusy(true);
    setError(null);
    const result = profile.i_follow ? await unfollowUser(profile.id) : await followUser(profile.id);
    setBusy(false);
    if (result) setError(result);
    else reload();
  }

  // Upload a new picture or photo, save the profile's photo list, then remove the replaced file.
  async function replacePhoto(profile: Profile, kind: PhotoKind, slot: number) {
    if (!myId) return;
    setUploading(kind === 'avatar' ? 'avatar' : slot);
    const path = await pickAndUploadPhoto(myId, kind);
    if (path === 'error') {
      setUploading(null);
      Alert.alert(t('profile.photoFailed'));
      return;
    }
    if (path === null) {
      setUploading(null);
      return;
    }
    const photos = [...profile.photo_paths];
    let old: string | null = null;
    if (kind === 'avatar') {
      old = profile.avatar_path;
    } else if (slot < photos.length) {
      old = photos[slot];
      photos[slot] = path;
    } else {
      photos.push(path);
    }
    const ok = await saveMyPhotos(kind === 'avatar' ? path : profile.avatar_path, photos.slice(0, PHOTO_SLOTS));
    setUploading(null);
    if (!ok) {
      deletePhotoFile(path);
      Alert.alert(t('profile.photoFailed'));
      return;
    }
    deletePhotoFile(old);
    reload();
  }

  async function removePhoto(profile: Profile, kind: PhotoKind, slot: number) {
    const removed = kind === 'avatar' ? profile.avatar_path : profile.photo_paths[slot];
    const photos = kind === 'avatar' ? profile.photo_paths : profile.photo_paths.filter((_, i) => i !== slot);
    if (await saveMyPhotos(kind === 'avatar' ? null : profile.avatar_path, photos)) {
      deletePhotoFile(removed);
      reload();
    }
  }

  function openPhotoMenu(profile: Profile, kind: PhotoKind, slot: number, path: string | null) {
    if (!isMe) {
      if (path) setViewing(path);
      return;
    }
    if (!path) {
      replacePhoto(profile, kind, slot);
      return;
    }
    // Android dialogs fit 3 buttons; tapping outside cancels.
    Alert.alert(
      kind === 'avatar' ? t('profile.picture') : t('profile.bestPhotos'),
      undefined,
      [
        { text: t('profile.view'), onPress: () => setViewing(path) },
        { text: t('profile.removePhoto'), style: 'destructive', onPress: () => removePhoto(profile, kind, slot) },
        { text: t('profile.replacePhoto'), onPress: () => replacePhoto(profile, kind, slot) },
      ],
      { cancelable: true },
    );
  }

  const menu =
    state.status === 'ready' && myId && !isOwner ? (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('chat.more')}
        hitSlop={8}
        onPress={() =>
          openSafetyMenu({
            t,
            name: state.profile.display_name,
            myId,
            otherId: state.profile.id,
            context: 'traveller',
            onBlocked: () => router.back(),
          })
        }
        style={({ pressed }) => [styles.menuButton, pressed && styles.pressed]}>
        <Icon name="more" size={22} color={Colors.text} />
      </Pressable>
    ) : undefined;

  if (state.status !== 'ready') {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
        <ScreenHeader title={isMe ? t('profile.myProfile') : t('profile.title')} />
        {state.status === 'loading' ? (
          <ActivityIndicator color={Colors.accent} size="large" style={styles.spinner} />
        ) : (
          <View style={styles.center}>
            <Icon name="error" size={40} color={Colors.textMuted} />
            <Text style={styles.centerText}>{state.status === 'missing' ? t('profile.notFound') : t('profile.errorLoad')}</Text>
            {state.status === 'error' && <Button title={t('common.tryAgain')} variant="secondary" onPress={reload} />}
          </View>
        )}
      </SafeAreaView>
    );
  }

  const profile = state.profile;
  const slots = Array.from({ length: PHOTO_SLOTS }, (_, i) => profile.photo_paths[i] ?? null);
  // Others see only the photos that are there; you see empty boxes to fill.
  const shownSlots = isMe ? slots : slots.filter(Boolean);

  const photos =
    shownSlots.length > 0 ? (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('profile.bestPhotos')}</Text>
        <View style={styles.photos}>
          {shownSlots.map((path, index) => (
            <Pressable
              key={path ?? `empty-${index}`}
              accessibilityRole="button"
              accessibilityLabel={path ? t('profile.view') : t('profile.addPhoto')}
              onPress={() => openPhotoMenu(profile, 'photo', path ? profile.photo_paths.indexOf(path) : index, path)}
              style={({ pressed }) => [styles.photoBox, pressed && styles.pressed]}>
              <GlossyFill />
              {path ? (
                <Image source={profilePhotoUrl(path)} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
              ) : (
                <View style={styles.photoEmpty}>
                  <Icon name="photo" size={26} color={Colors.textMuted} />
                  <Text style={styles.photoEmptyText}>{t('profile.addPhoto')}</Text>
                </View>
              )}
              {uploading === index && (
                <View style={styles.uploading}>
                  <ActivityIndicator color={Colors.white} />
                </View>
              )}
            </Pressable>
          ))}
        </View>
      </View>
    ) : null;

  const tabs: { key: ProfileTab; label: string; icon: IconName }[] = [
    { key: 'about', label: t('profile.tabAbout'), icon: 'person' },
    { key: 'travel', label: t('profile.tabTravel'), icon: 'globe' },
    { key: 'trips', label: t('profile.tabTrips'), icon: 'trip' },
    { key: 'events', label: t('profile.tabEvents'), icon: 'event' },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <ScreenHeader title={isOwner ? t('profile.myProfile') : t('profile.title')} right={menu} />
      <ScrollView contentContainerStyle={styles.content}>
        {isOwner && !isMe && (
          <View style={styles.previewBanner}>
            <Icon name="eye" size={18} color={Colors.text} />
            <Text style={styles.previewText}>{t('profile.publicPreview')}</Text>
          </View>
        )}

        <View style={styles.top}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isMe ? t('profile.changePicture') : t('profile.picture')}
            disabled={!isMe && !profile.avatar_path}
            onPress={() => openPhotoMenu(profile, 'avatar', 0, profile.avatar_path)}
            style={({ pressed }) => [styles.avatarWrap, pressed && styles.pressed]}>
            <View style={styles.avatar}>
              {profile.avatar_path ? (
                <Image source={profilePhotoUrl(profile.avatar_path)} style={StyleSheet.absoluteFill} contentFit="cover" />
              ) : (
                <>
                  <GlossyFill />
                  <Text style={styles.avatarText}>{profile.display_name.slice(0, 1).toUpperCase() || '?'}</Text>
                </>
              )}
              {uploading === 'avatar' && (
                <View style={styles.uploading}>
                  <ActivityIndicator color={Colors.white} />
                </View>
              )}
            </View>
            {isMe && (
              <View style={styles.cameraBadge}>
                <Icon name="camera" size={16} color={Colors.white} />
              </View>
            )}
            <LevelBadge userId={profile.id} size={AVATAR} corner="bottomLeft" />
          </Pressable>

          <Text style={styles.name}>
            {profile.age !== null ? t('profile.nameAge', { name: profile.display_name, age: profile.age }) : profile.display_name}
          </Text>
          {profile.home_country && (
            <Text style={styles.from}>
              {t('profile.from', { country: `${flagEmoji(profile.home_country)} ${countryName(profile.home_country, language)}` })}
            </Text>
          )}
          {profile.follows_me && !isOwner && (
            <Text style={styles.followsYou}>{profile.i_follow ? t('profile.friends') : t('profile.followsYou')}</Text>
          )}
          {profile.instagram ? (
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={`Instagram @${profile.instagram}`}
              onPress={() => Linking.openURL(instagramUrl(profile.instagram as string))}
              style={({ pressed }) => [styles.instagram, pressed && styles.pressed]}>
              <InstagramBadge size={26} />
              <Text style={styles.instagramText}>@{profile.instagram}</Text>
            </Pressable>
          ) : isMe ? (
            <Text style={styles.muted}>{t('profile.noInstagramMine')}</Text>
          ) : null}
        </View>

        <View style={styles.stats}>
          <Stat icon="globe" value={`${worldPercent(profile.visited_countries.length)}%`} label={t('profile.world')} onPress={() => setTab('travel')} />
          <Stat icon="trip" value={profile.upcoming_trips} label={t('profile.upcomingTrips')} onPress={() => setTab('trips')} />
          <Stat icon="location" value={profile.visited_countries.length} label={t('profile.countries')} onPress={() => setTab('travel')} />
        </View>
        <View style={styles.stats}>
          <Stat
            icon="group"
            value={profile.friends}
            label={t('profile.friendsBox')}
            onPress={() => router.push({ pathname: '/friends/[userId]', params: { userId: profile.id } })}
          />
          <Stat icon="event" value={profile.tables + profile.hangouts} label={t('profile.metUp')} onPress={() => setTab('events')} />
          <Stat icon="heart" value={`👍 ${profile.thumbs_up}  👎 ${profile.thumbs_down}`} label={t('profile.feedbackBox')} small />
        </View>
        {passport && (
          <View style={styles.stats}>
            <Stat icon="event" value={passport.points} label={t('passport.points')} onPress={isMe ? () => router.push('/passport') : undefined} />
            <Stat icon="flag" value={passport.stamps} label={t('passport.stampsBox')} onPress={isMe ? () => router.push('/passport') : undefined} />
            <Stat icon="check" value={passport.verified} label={t('passport.verifiedBox')} onPress={isMe ? () => router.push('/passport') : undefined} />
          </View>
        )}

        {error && (
          <Text accessibilityRole="alert" style={styles.error}>
            {t(`profile.errors.${error}`)}
          </Text>
        )}

        {isMe ? (
          <>
            <View style={styles.actions}>
              <ActionButton icon="edit" label={t('profile.editShort')} dashed onPress={() => router.push('/edit-profile')} />
              <ActionButton icon="share" label={t('profile.story')} onPress={() => setStoryOpen(true)} />
              <ActionButton icon="heart" iconColor={Colors.pink} label={t('profile.favorites')} onPress={() => router.push('/favorites')} />
              <ActionButton icon="settings" label={t('profile.settings')} iconOnly onPress={() => router.push('/settings')} />
            </View>
          </>
        ) : !isOwner ? (
          <View style={styles.followRow}>
            <Button
              title={profile.i_follow ? t('profile.unfollow') : t('profile.follow')}
              variant={profile.i_follow ? 'secondary' : 'primary'}
              loading={busy}
              onPress={() => toggleFollow(profile)}
            />
          </View>
        ) : null}

        {/* Story map: everyone's stories of the last 10 days on a map, in time order (the ones I may see). */}
        <View style={styles.storyMapRow}>
          <ActionButton
            icon="map"
            iconColor={Colors.violetText}
            label={t('profile.storyMap')}
            onPress={() => router.push({ pathname: '/story-map/[userId]', params: { userId: profile.id, name: profile.display_name } })}
          />
          {isMe && (
            <ActionButton
              icon="eye"
              label={t('profile.viewPublic')}
              onPress={() => router.push({ pathname: '/profile/[userId]', params: { userId: profile.id, preview: '1' } })}
            />
          )}
        </View>

        <View style={styles.tabs} accessibilityRole="tablist">
          {tabs.map((item) => {
            const active = tab === item.key;
            return (
              <Pressable
                key={item.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                onPress={() => setTab(item.key)}
                style={({ pressed }) => [styles.tab, pressed && styles.pressed]}>
                <Icon name={item.icon} size={22} color={active ? Colors.accent : Colors.textMuted} />
                <Text style={[styles.tabLabel, active && styles.tabLabelActive]} numberOfLines={1}>
                  {item.label}
                </Text>
                <View style={[styles.tabLine, active && styles.tabLineActive]} />
              </Pressable>
            );
          })}
        </View>

        <View style={styles.tabBody}>
          {tab === 'about' && <AboutTab profile={profile} isMe={isMe} photos={photos} onChanged={reload} />}
          {tab === 'travel' && <TravelTab profile={profile} isMe={isMe} onChanged={reload} />}
          {tab === 'trips' && <TripsTab userId={profile.id} isMe={isMe} />}
          {tab === 'events' && <EventsTab userId={profile.id} />}
        </View>
      </ScrollView>

      <Modal visible={viewing !== null} transparent animationType="fade" onRequestClose={() => setViewing(null)}>
        <Pressable style={styles.viewer} onPress={() => setViewing(null)} accessibilityLabel={t('common.back')}>
          {viewing && <Image source={profilePhotoUrl(viewing)} style={styles.viewerImage} contentFit="contain" />}
        </Pressable>
      </Modal>
      {isMe && <StoryShare profile={profile} visible={storyOpen} onClose={() => setStoryOpen(false)} />}
    </SafeAreaView>
  );
}

// A stat box with a round icon badge on its top-left corner.
function Stat({
  icon,
  value,
  label,
  onPress,
  small = false,
}: {
  icon: IconName;
  value: number | string;
  label: string;
  onPress?: () => void;
  small?: boolean;
}) {
  const styles = useStyles();
  const Colors = useColors();
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${label}: ${value}`}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.statWrap, pressed && styles.pressed]}>
      <View style={styles.stat}>
        <GlossyFill />
        <Text style={[styles.statValue, small && styles.statValueSmall]} numberOfLines={1} adjustsFontSizeToFit>
          {value}
        </Text>
        <Text style={styles.statLabel} numberOfLines={2}>
          {label}
        </Text>
      </View>
      <View style={styles.statBadge}>
        <Icon name={icon} size={14} color={Colors.white} />
      </View>
    </Pressable>
  );
}

function ActionButton({
  icon,
  label,
  onPress,
  dashed = false,
  iconOnly = false,
  iconColor,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  dashed?: boolean;
  iconOnly?: boolean;
  iconColor?: string;
}) {
  const styles = useStyles();
  const Colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.action, dashed && styles.actionDashed, iconOnly && styles.actionIcon, pressed && styles.pressed]}>
      {!dashed && <GlossyFill />}
      <Icon name={icon} size={18} color={iconColor ?? Colors.text} />
      {!iconOnly && <Text style={styles.actionText}>{label}</Text>}
    </Pressable>
  );
}

const AVATAR = 120;

const useStyles = makeStyles((Colors) => ({
  safe: { flex: 1, backgroundColor: Colors.bg },
  spinner: { marginTop: Spacing.xxl * 2 },
  center: { alignItems: 'center', gap: Spacing.md, padding: Spacing.xxl },
  centerText: { ...Type.body, color: Colors.textSecondary, textAlign: 'center' },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl * 2 },
  menuButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.pill },
  pressed: { opacity: 0.75 },
  previewBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.violetTint,
    borderWidth: 1,
    borderColor: Colors.violet,
    marginBottom: Spacing.md,
  },
  previewText: { ...Type.small, color: Colors.text, flex: 1 },
  top: { alignItems: 'center' },
  avatarWrap: { marginTop: Spacing.sm },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    borderWidth: 3,
    borderColor: Colors.violet,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: Colors.surface,
    ...Raised,
  },
  avatarText: { ...Type.display, fontSize: 46, lineHeight: 54, color: Colors.text },
  cameraBadge: {
    position: 'absolute',
    right: 2,
    bottom: 4,
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: Colors.bg,
    backgroundColor: Colors.violet,
    alignItems: 'center',
    justifyContent: 'center',
    ...RaisedSmall,
  },
  uploading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { ...Type.display, fontSize: 28, lineHeight: 36, color: Colors.text, marginTop: Spacing.md, textAlign: 'center' },
  from: { ...Type.body, color: Colors.textSecondary, marginTop: 2 },
  followsYou: {
    ...Type.small,
    fontWeight: '700',
    color: Colors.text,
    backgroundColor: Colors.violetTint,
    paddingHorizontal: Spacing.md,
    paddingVertical: 2,
    borderRadius: Radius.pill,
    overflow: 'hidden',
    marginTop: Spacing.sm,
  },
  instagram: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.sm, padding: Spacing.xs },
  instagramText: { ...Type.heading, color: Colors.accent },
  muted: { ...Type.small, color: Colors.textMuted, marginTop: Spacing.sm, textAlign: 'center' },
  stats: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.lg },
  statWrap: { flex: 1, paddingTop: 8, paddingLeft: 6 },
  stat: {
    minHeight: 84,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xs,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: Colors.surface,
    ...Raised,
  },
  statValue: { ...Type.title, fontSize: 24, color: Colors.text },
  statValueSmall: { fontSize: 16 },
  statLabel: { ...Type.small, fontSize: 11, lineHeight: 14, color: Colors.textSecondary, textTransform: 'uppercase', textAlign: 'center', letterSpacing: 0.4 },
  statBadge: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.coral,
    borderWidth: 2,
    borderColor: Colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
  },
  error: {
    ...Type.small,
    color: Colors.danger,
    backgroundColor: Colors.dangerBg,
    padding: Spacing.md,
    borderRadius: Radius.sm,
    marginTop: Spacing.lg,
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: Spacing.sm, marginTop: Spacing.xl },
  storyMapRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: Spacing.sm, marginTop: Spacing.md },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.pill,
    borderWidth: 1.5,
    borderColor: Colors.borderStrong,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
    ...RaisedSmall,
  },
  actionDashed: { borderStyle: 'dashed', backgroundColor: 'transparent', elevation: 0, shadowOpacity: 0 },
  actionIcon: { width: 44, paddingHorizontal: 0, justifyContent: 'center' },
  actionText: { ...Type.label, fontSize: 14, color: Colors.text },
  followRow: { marginTop: Spacing.xl },
  tabs: {
    flexDirection: 'row',
    marginTop: Spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tab: { flex: 1, alignItems: 'center', gap: 2, paddingTop: Spacing.sm },
  tabLabel: { ...Type.small, color: Colors.textMuted },
  tabLabelActive: { color: Colors.accent, fontWeight: '700' },
  tabLine: { height: 3, width: '60%', marginTop: Spacing.sm, borderRadius: 2, backgroundColor: 'transparent' },
  tabLineActive: { backgroundColor: Colors.accent },
  tabBody: { paddingBottom: Spacing.lg },
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
  photos: { flexDirection: 'row', gap: Spacing.sm },
  photoBox: {
    flex: 1,
    aspectRatio: 4 / 5,
    maxWidth: '33%',
    borderRadius: Radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    ...Raised,
  },
  photoEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.xs },
  photoEmptyText: { ...Type.small, color: Colors.textMuted },
  viewer: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.92)', alignItems: 'center', justifyContent: 'center' },
  viewerImage: { width: '100%', height: '80%' },
}));
