import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { ScreenHeader } from '@/components/screen-header';
import { Radius, Spacing, Type } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
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

// A person's profile: name, Instagram, followers / following, tables and hangouts attended, 👍 / 👎 from people
// they met. Your own profile can be edited (name and Instagram). Anyone signed in can open a profile.
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
  const [error, setError] = useState<ProfileErrorKey | null>(null);

  async function toggleFollow(profile: Profile) {
    setBusy(true);
    setError(null);
    const result = profile.i_follow ? await unfollowUser(profile.id) : await followUser(profile.id);
    setBusy(false);
    if (result) setError(result);
    else reload();
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

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <ScreenHeader title={isMe ? t('profile.myProfile') : t('profile.title')} right={menu} />
      {state.status === 'loading' ? (
        <ActivityIndicator color={Colors.accent} size="large" style={styles.spinner} />
      ) : state.status !== 'ready' ? (
        <View style={styles.center}>
          <Icon name="error" size={40} color={Colors.textMuted} />
          <Text style={styles.centerText}>{state.status === 'missing' ? t('profile.notFound') : t('profile.errorLoad')}</Text>
          {state.status === 'error' && <Button title={t('common.tryAgain')} variant="secondary" onPress={reload} />}
        </View>
      ) : editing ? (
        <EditProfile
          profile={state.profile}
          onDone={() => {
            setEditing(false);
            reload();
          }}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{state.profile.display_name.slice(0, 1).toUpperCase() || '?'}</Text>
          </View>
          <Text style={styles.name}>{state.profile.display_name}</Text>
          {state.profile.follows_me && !isMe && (
            <Text style={styles.followsYou}>
              {state.profile.i_follow ? t('profile.friends') : t('profile.followsYou')}
            </Text>
          )}

          {state.profile.instagram ? (
            <Pressable
              accessibilityRole="link"
              onPress={() => Linking.openURL(instagramUrl(state.profile.instagram as string))}
              style={({ pressed }) => [styles.instagram, pressed && styles.pressed]}>
              <Icon name="website" size={18} color={Colors.accent} />
              <Text style={styles.instagramText}>@{state.profile.instagram}</Text>
            </Pressable>
          ) : isMe ? (
            <Text style={styles.muted}>{t('profile.noInstagramMine')}</Text>
          ) : null}

          <View style={styles.stats}>
            <Stat value={state.profile.followers} label={t('profile.followers')} />
            <Stat value={state.profile.following} label={t('profile.following')} />
            <Stat value={state.profile.tables} label={t('profile.tables')} />
            <Stat value={state.profile.hangouts} label={t('profile.hangouts')} />
            <Stat value={state.profile.thumbs_up} label="👍" />
            <Stat value={state.profile.thumbs_down} label="👎" />
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
                title={state.profile.i_follow ? t('profile.unfollow') : t('profile.follow')}
                variant={state.profile.i_follow ? 'secondary' : 'primary'}
                loading={busy}
                onPress={() => toggleFollow(state.profile)}
              />
            )}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  const styles = useStyles();
  return (
    <View style={styles.stat}>
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

const useStyles = makeStyles((Colors) => ({
  safe: { flex: 1, backgroundColor: Colors.bg },
  spinner: { marginTop: Spacing.xxl * 2 },
  center: { alignItems: 'center', gap: Spacing.md, padding: Spacing.xxl },
  centerText: { ...Type.body, color: Colors.textSecondary, textAlign: 'center' },
  content: { alignItems: 'center', padding: Spacing.lg, paddingBottom: Spacing.xxl * 2 },
  menuButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.pill },
  pressed: { opacity: 0.7 },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: Colors.violetTint,
    borderWidth: 2,
    borderColor: Colors.violet,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.md,
  },
  avatarText: { ...Type.display, color: Colors.text },
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
  instagram: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginTop: Spacing.md, padding: Spacing.xs },
  instagramText: { ...Type.heading, color: Colors.accent },
  muted: { ...Type.small, color: Colors.textMuted, marginTop: Spacing.md },
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
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
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
