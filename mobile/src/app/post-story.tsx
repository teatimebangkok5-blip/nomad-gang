import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { GlossyFill } from '@/components/glossy';
import { Icon } from '@/components/icon';
import { ScreenHeader } from '@/components/screen-header';
import { Radius, Raised, Spacing, Type } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { useCurrentLocation } from '@/lib/location';
import {
  pickStoryPhoto,
  postStory,
  STORY_CAPTION_MAX,
  type PostStoryError,
  type StoryPhotoSource,
} from '@/lib/stories';
import { makeStyles, useColors } from '@/lib/theme';

// Post a story: take or pick a photo, add an optional caption, and it's pinned on the home map near where I am
// (moved 100–250 m by the server) for 24 hours, for everyone signed in.
export default function PostStoryScreen() {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  const { session } = useAuth();
  const location = useCurrentLocation();
  const [photo, setPhoto] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [picking, setPicking] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<PostStoryError | null>(null);
  const locationOk = location.state.status === 'granted';

  async function pick(source: StoryPhotoSource) {
    setPicking(true);
    const result = await pickStoryPhoto(source);
    setPicking(false);
    if (result === 'permission') Alert.alert(t('stories.cameraPermission'));
    else if (result === 'error') Alert.alert(t('stories.photoFailed'));
    else if (result !== 'cancelled') setPhoto(result);
  }

  async function post() {
    if (!session || !photo) return;
    setError(null);
    setPosting(true);
    const problem = await postStory(session.user.id, photo, caption);
    setPosting(false);
    if (problem) {
      setError(problem);
      return;
    }
    Alert.alert(t('stories.posted'));
    router.back();
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <ScreenHeader title={t('stories.newTitle')} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.intro}>{t('stories.intro')}</Text>

          {photo ? (
            <View style={styles.preview}>
              <Image source={photo} style={styles.previewImage} contentFit="cover" accessibilityIgnoresInvertColors />
            </View>
          ) : null}
          <View style={styles.sources}>
            <PhotoButton icon="camera" label={t('stories.takePhoto')} onPress={() => pick('camera')} disabled={picking || posting} />
            <PhotoButton
              icon="gallery"
              label={photo ? t('stories.changePhoto') : t('stories.choosePhoto')}
              onPress={() => pick('library')}
              disabled={picking || posting}
            />
          </View>

          <Text style={styles.label}>{t('stories.captionLabel')}</Text>
          <TextInput
            value={caption}
            onChangeText={setCaption}
            placeholder={t('stories.captionPlaceholder')}
            placeholderTextColor={Colors.textMuted}
            selectionColor={Colors.violet}
            keyboardAppearance="dark"
            maxLength={STORY_CAPTION_MAX}
            multiline
            textAlignVertical="top"
            style={styles.input}
          />
          <Text style={styles.counter}>
            {caption.length}/{STORY_CAPTION_MAX}
          </Text>

          <View style={styles.note}>
            <Icon name="pin" size={18} color={Colors.violetText} />
            <Text style={styles.noteText}>{t('stories.privacyNote')}</Text>
          </View>

          {location.state.status === 'denied' && (
            <View style={styles.locationBox}>
              <Text style={styles.noteText}>{t('stories.locationNeeded')}</Text>
              <Pressable
                accessibilityRole="button"
                onPress={location.state.canAskAgain ? location.request : () => Linking.openSettings()}
                style={({ pressed }) => [styles.locationButton, pressed && styles.pressed]}>
                <Text style={styles.link}>
                  {location.state.canAskAgain ? t('stories.allowLocation') : t('stories.openSettings')}
                </Text>
              </Pressable>
            </View>
          )}

          {error && (
            <Text accessibilityRole="alert" style={styles.error}>
              {t(`stories.errors.${error}`)}
            </Text>
          )}
          <View style={styles.submit}>
            <Button title={t('stories.post')} onPress={post} loading={posting} disabled={!photo || !locationOk || picking || posting} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function PhotoButton({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: 'camera' | 'gallery';
  label: string;
  onPress: () => void;
  disabled: boolean;
}) {
  const styles = useStyles();
  const Colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.source, (pressed || disabled) && styles.pressed]}>
      <GlossyFill />
      <Icon name={icon} size={26} color={Colors.accent} />
      <Text style={styles.sourceText}>{label}</Text>
    </Pressable>
  );
}

const useStyles = makeStyles((Colors) => ({
  safe: { flex: 1, backgroundColor: Colors.bg },
  flex: { flex: 1 },
  content: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xxl * 2 },
  intro: { ...Type.body, color: Colors.textSecondary },
  preview: {
    marginTop: Spacing.lg,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
    aspectRatio: 4 / 5,
  },
  previewImage: { width: '100%', height: '100%' },
  sources: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.lg },
  source: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    minHeight: 88,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
    ...Raised,
  },
  sourceText: { ...Type.label, color: Colors.text, textAlign: 'center' },
  pressed: { opacity: 0.6 },
  label: { ...Type.label, color: Colors.textSecondary, marginTop: Spacing.xl, marginBottom: Spacing.sm },
  input: {
    minHeight: 88,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    fontSize: 16,
    color: Colors.text,
  },
  counter: { ...Type.small, color: Colors.textMuted, textAlign: 'right', marginTop: Spacing.xs },
  note: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.lg,
    padding: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.violetTint,
  },
  noteText: { ...Type.small, color: Colors.text, flex: 1 },
  locationBox: {
    marginTop: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    gap: Spacing.sm,
  },
  locationButton: { minHeight: 44, justifyContent: 'center' },
  link: { ...Type.label, color: Colors.accent },
  error: {
    ...Type.small,
    color: Colors.danger,
    backgroundColor: Colors.dangerBg,
    padding: Spacing.md,
    borderRadius: Radius.sm,
    marginTop: Spacing.lg,
  },
  submit: { marginTop: Spacing.xl },
}));
