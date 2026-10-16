import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { GlossyFill, InstagramBadge } from '@/components/glossy';
import { Icon } from '@/components/icon';
import { ScreenHeader } from '@/components/screen-header';
import { Radius, Raised, RaisedSmall, Spacing, Type } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { deletePhotoFile, pickAndUploadPhoto, profilePhotoUrl, saveMyPhotos, type PhotoKind } from '@/lib/photos';
import {
  followUser,
  instagramUrl,
  unfollowUser,
  updateMyProfile,
  useProfile,
  type Profile,
  type ProfileErrorKey,
} from '@/lib/profiles';
import { openSafetyMenu } from '@/lib/safety-menu';
import { makeStyles, useColors } from '@/lib/theme';

const PHOTO_SLOTS = 3;

// A person's profile: picture, name, Instagram, their 3 best photos, followers / following, tables and hangouts
// attended, and 👍 / 👎 from people they met. Your own profile can be edited (picture, photos, name, Instagram).
// Anyone signed in can open a profile.
export default function ProfileScreen() {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const { session } = useAuth();
  const myId = session?.user.id;
  const isMe = myId === userId;
  const { state, reload } = useProfile(userId);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [uploading, setUploading] = useState<'avatar' | number | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
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
    state.status === 'ready' && myId && !isMe ? (
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

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <ScreenHeader title={isMe ? t('profile.myProfile') : t('profile.title')} right={menu} />
      {editing ? (
        <EditProfile
          profile={profile}
          onDone={() => {
            setEditing(false);
            reload();
          }}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
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
          </Pressable>

          <Text style={styles.name}>{profile.display_name}</Text>
          {profile.follows_me && !isMe && (
            <Text style={styles.followsYou}>{profile.i_follow ? t('profile.friends') : t('profile.followsYou')}</Text>
          )}

          {profile.instagram ? (
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={`Instagram @${profile.instagram}`}
              onPress={() => Linking.openURL(instagramUrl(profile.instagram as string))}
              style={({ pressed }) => [styles.instagram, pressed && styles.pressed]}>
              <InstagramBadge size={30} />
              <Text style={styles.instagramText}>@{profile.instagram}</Text>
            </Pressable>
          ) : isMe ? (
            <Text style={styles.muted}>{t('profile.noInstagramMine')}</Text>
          ) : null}

          {shownSlots.length > 0 && (
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
          )}

          <View style={styles.stats}>
            <Stat value={profile.followers} label={t('profile.followers')} />
            <Stat value={profile.following} label={t('profile.following')} />
            <Stat value={profile.tables} label={t('profile.tables')} />
            <Stat value={profile.hangouts} label={t('profile.hangouts')} />
            <Stat value={profile.thumbs_up} label="👍" />
            <Stat value={profile.thumbs_down} label="👎" />
          </View>
          <Text style={styles.hint}>{t('profile.countsHint')}</Text>

          {error && (
            <Text accessibilityRole="alert" style={styles.error}>
              {t(`profile.errors.${error}`)}
            </Text>
          )}

          <View style={styles.actions}>
            {isMe ? (
              <Button title={t('profile.edit')} variant="secondary" onPress={() => setEditing(true)} />
            ) : (
              <Button
                title={profile.i_follow ? t('profile.unfollow') : t('profile.follow')}
                variant={profile.i_follow ? 'secondary' : 'primary'}
                loading={busy}
                onPress={() => toggleFollow(profile)}
              />
            )}
          </View>
        </ScrollView>
      )}

      <Modal visible={viewing !== null} transparent animationType="fade" onRequestClose={() => setViewing(null)}>
        <Pressable style={styles.viewer} onPress={() => setViewing(null)} accessibilityLabel={t('common.back')}>
          {viewing && <Image source={profilePhotoUrl(viewing)} style={styles.viewerImage} contentFit="contain" />}
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  const styles = useStyles();
  return (
    <View style={styles.stat}>
      <GlossyFill />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function EditProfile({ profile, onDone }: { profile: Profile; onDone: () => void }) {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  const [name, setName] = useState(profile.display_name);
  const [instagram, setInstagram] = useState(profile.instagram ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ProfileErrorKey | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    const result = await updateMyProfile(name, instagram);
    setSaving(false);
    if (result) {
      setError(result);
      return;
    }
    Alert.alert(t('profile.saved'));
    onDone();
  }

  return (
    <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
      <Text style={styles.label}>{t('profile.nameLabel')}</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        maxLength={60}
        selectionColor={Colors.orange}
        keyboardAppearance="dark"
        style={styles.input}
      />
      <Text style={styles.label}>{t('profile.instagramLabel')}</Text>
      <View style={styles.inputRow}>
        <InstagramBadge size={34} />
        <Text style={styles.at}>@</Text>
        <TextInput
          value={instagram.replace(/^@/, '')}
          onChangeText={setInstagram}
          placeholder={t('profile.instagramPlaceholder')}
          placeholderTextColor={Colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={80}
          selectionColor={Colors.orange}
          keyboardAppearance="dark"
          style={[styles.input, styles.inputFlex]}
        />
      </View>
      <Text style={styles.hint}>{t('profile.instagramHint')}</Text>
      {error && (
        <Text accessibilityRole="alert" style={styles.error}>
          {t(`profile.errors.${error}`)}
        </Text>
      )}
      <View style={styles.actions}>
        <Button title={t('profile.save')} onPress={save} loading={saving} disabled={!name.trim()} />
      </View>
      <View style={styles.actionsSmall}>
        <Button title={t('common.cancel')} variant="text" onPress={onDone} />
      </View>
    </ScrollView>
  );
}

const AVATAR = 104;

const useStyles = makeStyles((Colors) => ({
  safe: { flex: 1, backgroundColor: Colors.bg },
  spinner: { marginTop: Spacing.xxl * 2 },
  center: { alignItems: 'center', gap: Spacing.md, padding: Spacing.xxl },
  centerText: { ...Type.body, color: Colors.textSecondary, textAlign: 'center' },
  content: { alignItems: 'center', padding: Spacing.lg, paddingBottom: Spacing.xxl * 2 },
  menuButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.pill },
  pressed: { opacity: 0.75 },
  avatarWrap: { marginTop: Spacing.md },
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
  avatarText: { ...Type.display, fontSize: 40, lineHeight: 48, color: Colors.text },
  cameraBadge: {
    position: 'absolute',
    right: 0,
    bottom: 2,
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
  name: { ...Type.title, color: Colors.text, marginTop: Spacing.md, textAlign: 'center' },
  followsYou: {
    ...Type.small,
    fontWeight: '700',
    color: Colors.text,
    backgroundColor: Colors.violetTint,
    paddingHorizontal: Spacing.md,
    paddingVertical: 2,
    borderRadius: Radius.pill,
    overflow: 'hidden',
    marginTop: Spacing.xs,
  },
  instagram: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.md, padding: Spacing.xs },
  instagramText: { ...Type.heading, color: Colors.accent },
  muted: { ...Type.small, color: Colors.textMuted, marginTop: Spacing.md, textAlign: 'center' },
  photos: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.lg, alignSelf: 'stretch' },
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
  stats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.xl,
    alignSelf: 'stretch',
  },
  stat: {
    width: '31%',
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    overflow: 'hidden',
    backgroundColor: Colors.surface,
    ...Raised,
  },
  statValue: { ...Type.title, color: Colors.text },
  statLabel: { ...Type.small, color: Colors.textSecondary },
  hint: { ...Type.small, color: Colors.textMuted, marginTop: Spacing.sm, textAlign: 'center' },
  error: {
    ...Type.small,
    color: Colors.danger,
    backgroundColor: Colors.dangerBg,
    padding: Spacing.md,
    borderRadius: Radius.sm,
    marginTop: Spacing.lg,
    alignSelf: 'stretch',
  },
  actions: { marginTop: Spacing.xl, alignSelf: 'stretch' },
  actionsSmall: { marginTop: Spacing.sm, alignSelf: 'stretch' },
  viewer: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.92)', alignItems: 'center', justifyContent: 'center' },
  viewerImage: { width: '100%', height: '80%' },
  form: { padding: Spacing.lg, paddingBottom: Spacing.xxl * 2 },
  label: { ...Type.label, color: Colors.textSecondary, marginTop: Spacing.lg, marginBottom: Spacing.sm },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.lg,
    fontSize: 16,
    color: Colors.text,
  },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  inputFlex: { flex: 1 },
  at: { ...Type.title, color: Colors.textSecondary },
}));
