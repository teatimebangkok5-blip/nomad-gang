import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { Icon } from '@/components/icon';
import { ScreenHeader } from '@/components/screen-header';
import { VenueMap } from '@/components/venue-map';
import { Radius, Spacing, Type } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { GEM_CATEGORIES, GEM_CATEGORY_EMOJI, suggestGem, type GemCategory, type SuggestErrorKey } from '@/lib/gems';
import { useCurrentLocation, type Coords } from '@/lib/location';
import { pickAndUploadPhoto } from '@/lib/photos';
import { supabase } from '@/lib/supabase';
import { makeStyles, useColors } from '@/lib/theme';

// Suggest a Hidden Gem: name, category, what makes it special, a local tip, price, a pin on the map and an optional
// photo. The founder checks it before it appears for everyone (and credits the person who suggested it).
export default function SuggestGemScreen() {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  const { session } = useAuth();
  const location = useCurrentLocation();
  const coords = location.state.status === 'granted' ? location.state.coords : null;
  const [name, setName] = useState('');
  const [category, setCategory] = useState<GemCategory | null>(null);
  const [description, setDescription] = useState('');
  const [tip, setTip] = useState('');
  const [price, setPrice] = useState('');
  const [pin, setPin] = useState<Coords | null>(null);
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<SuggestErrorKey | null>(null);
  const spot = pin ?? coords;
  const canSend = name.trim().length > 0 && category !== null && spot !== null && !sending && !uploading;

  async function addPhoto() {
    if (!session) return;
    setUploading(true);
    const path = await pickAndUploadPhoto(session.user.id, 'photo', 'gem-photos');
    setUploading(false);
    if (path === 'error') Alert.alert(t('gems.photoFailed'));
    else if (path) setPhotoPath(path);
  }

  async function send() {
    if (!category || !spot) return;
    setError(null);
    setSending(true);
    const problem = await suggestGem({ name, category, description, tip, price, lat: spot.lat, lng: spot.lng, photoPath });
    setSending(false);
    if (problem) {
      setError(problem);
      return;
    }
    Alert.alert(t('gems.thanksTitle'), t('gems.thanksBody'));
    router.back();
  }

  const input = (value: string, onChange: (text: string) => void, placeholder: string, max: number, multiline = false) => (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={Colors.textMuted}
      selectionColor={Colors.violet}
      keyboardAppearance="dark"
      maxLength={max}
      multiline={multiline}
      textAlignVertical={multiline ? 'top' : 'center'}
      style={[styles.input, multiline && styles.multiline]}
    />
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <ScreenHeader title={t('gems.suggestTitle')} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.intro}>{t('gems.suggestIntro')}</Text>

          <Text style={styles.label}>{t('gems.nameLabel')}</Text>
          {input(name, setName, t('gems.namePlaceholder'), 120)}

          <Text style={styles.label}>{t('gems.categoryLabel')}</Text>
          <View style={styles.chips}>
            {GEM_CATEGORIES.map((option) => (
              <Chip
                key={option}
                label={`${GEM_CATEGORY_EMOJI[option]} ${t(`gems.categories.${option}`)}`}
                selected={category === option}
                onPress={() => setCategory(option)}
              />
            ))}
          </View>

          <Text style={styles.label}>{t('gems.descriptionLabel')}</Text>
          {input(description, setDescription, t('gems.descriptionPlaceholder'), 600, true)}
          <Text style={styles.label}>{t('gems.tipLabel')}</Text>
          {input(tip, setTip, t('gems.tipPlaceholder'), 400, true)}
          <Text style={styles.label}>{t('gems.priceLabel')}</Text>
          {input(price, setPrice, t('gems.pricePlaceholder'), 160)}

          <Text style={styles.label}>{t('gems.whereLabel')}</Text>
          <Text style={styles.hint}>{t('gems.whereHint')}</Text>
          <VenueMap
            height={220}
            userCoords={coords}
            pins={spot ? [{ key: 'pin', lat: spot.lat, lng: spot.lng, emoji: '💎', tone: 'violet' }] : []}
            onPinPress={() => {}}
            onMapPress={setPin}
          />

          <Text style={styles.label}>{t('gems.photoLabel')}</Text>
          {photoPath ? (
            <Image
              source={supabase.storage.from('gem-photos').getPublicUrl(photoPath).data.publicUrl}
              style={styles.photo}
              contentFit="cover"
            />
          ) : null}
          <Pressable accessibilityRole="button" onPress={addPhoto} disabled={uploading} style={styles.photoButton}>
            <Icon name="gallery" size={20} color={Colors.accent} />
            <Text style={styles.link}>{uploading ? t('gems.uploading') : photoPath ? t('gems.changePhoto') : t('gems.addPhoto')}</Text>
          </Pressable>

          {error && (
            <Text accessibilityRole="alert" style={styles.error}>
              {t(`gems.errors.${error}`)}
            </Text>
          )}
          <View style={styles.submit}>
            <Button title={t('gems.send')} variant="violet" onPress={send} loading={sending} disabled={!canSend} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((Colors) => ({
  safe: { flex: 1, backgroundColor: Colors.bg },
  flex: { flex: 1 },
  content: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xxl * 2 },
  intro: { ...Type.body, color: Colors.textSecondary },
  label: { ...Type.label, color: Colors.textSecondary, marginTop: Spacing.lg, marginBottom: Spacing.sm },
  hint: { ...Type.small, color: Colors.textMuted, marginBottom: Spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
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
  multiline: { minHeight: 96, paddingTop: Spacing.md },
  photo: { width: '100%', height: 180, borderRadius: Radius.md, marginBottom: Spacing.sm },
  photoButton: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, minHeight: 44 },
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
