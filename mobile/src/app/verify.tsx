import { Image } from 'expo-image';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { FormFooter, FormSection } from '@/components/form-parts';
import { GlossyFill, ToneFill } from '@/components/glossy';
import { Icon } from '@/components/icon';
import { ScreenHeader } from '@/components/screen-header';
import { Radius, Spacing, Type } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { formatWhen } from '@/lib/bangkok-time';
import { makeStyles, useColors } from '@/lib/theme';
import { GENDERS, submitVerification, takeVerificationPhoto, useMyVerification, type Gender } from '@/lib/verification';

// Get verified: a selfie and a photo of an ID, checked by hand by the TableMeet team and deleted right after. Verified
// people get the shield badge; verified women can host and join women-only tables and hangouts.
export default function VerifyScreen() {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  const { session } = useAuth();
  const myId = session?.user.id;
  const { verification, reload } = useMyVerification(Boolean(myId));
  const [gender, setGender] = useState<Gender | null>(null);
  const [selfie, setSelfie] = useState<string | null>(null);
  const [idPhoto, setIdPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(false);

  async function take(which: 'selfie' | 'id', source: 'camera' | 'library') {
    try {
      const result = await takeVerificationPhoto(source, which === 'selfie');
      if (result === 'permission') Alert.alert(t('chat.cameraDenied'));
      else if (result !== 'cancelled') (which === 'selfie' ? setSelfie : setIdPhoto)(result);
    } catch (error) {
      console.warn('Verification photo failed', error);
    }
  }

  function pickId() {
    Alert.alert(t('verify.idPhoto'), undefined, [
      { text: t('chat.camera'), onPress: () => take('id', 'camera') },
      { text: t('chat.gallery'), onPress: () => take('id', 'library') },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  }

  async function send() {
    if (!myId || !gender || !selfie || !idPhoto) return;
    setBusy(true);
    const error = await submitVerification(myId, gender, selfie, idPhoto);
    setBusy(false);
    if (error) {
      Alert.alert(t(`verify.errors.${error}`));
      return;
    }
    setRetry(false);
    setSelfie(null);
    setIdPhoto(null);
    reload();
  }

  if (!verification) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScreenHeader title={t('verify.title')} />
        <ActivityIndicator color={Colors.accent} style={styles.spinner} />
      </SafeAreaView>
    );
  }

  const pending = verification.status === 'pending';
  const showForm = !pending && (!verification.verified || retry);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScreenHeader title={t('verify.title')} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <ToneFill tone="violet" />
          <Icon name="shield" size={34} color={Colors.white} />
          <View style={styles.flex}>
            <Text style={styles.heroTitle}>{t('verify.heroTitle')}</Text>
            <Text style={styles.heroBody}>{t('verify.heroBody')}</Text>
          </View>
        </View>

        {verification.verified && !retry && (
          <View style={[styles.status, styles.statusOk]}>
            <Icon name="checkCircle" size={24} color={Colors.ok} />
            <View style={styles.flex}>
              <Text style={styles.statusTitle}>{t('verify.verified')}</Text>
              <Text style={styles.statusBody}>
                {verification.gender ? t(`verify.genders.${verification.gender}`) : ''}
                {verification.verified_at ? ` · ${formatWhen(verification.verified_at, t)}` : ''}
              </Text>
              {verification.woman && <Text style={styles.statusBody}>♀ {t('verify.womenUnlocked')}</Text>}
            </View>
          </View>
        )}
        {pending && (
          <View style={[styles.status, styles.statusWait]}>
            <Icon name="time" size={24} color={Colors.amberText} />
            <View style={styles.flex}>
              <Text style={styles.statusTitle}>{t('verify.pending')}</Text>
              <Text style={styles.statusBody}>{t('verify.pendingBody')}</Text>
            </View>
          </View>
        )}
        {verification.status === 'rejected' && !verification.verified && (
          <View style={[styles.status, styles.statusBad]}>
            <Icon name="error" size={24} color={Colors.danger} />
            <View style={styles.flex}>
              <Text style={styles.statusTitle}>{t('verify.rejected')}</Text>
              {verification.reason ? <Text style={styles.statusBody}>{verification.reason}</Text> : null}
              <Text style={styles.statusBody}>{t('verify.tryAgain')}</Text>
            </View>
          </View>
        )}

        {showForm && (
          <>
            <FormSection label={t('verify.gender')}>
              <View style={styles.chips}>
                {GENDERS.map((item) => (
                  <Chip key={item} tone="violet" label={t(`verify.genders.${item}`)} selected={gender === item} onPress={() => setGender(item)} />
                ))}
              </View>
              <Text style={styles.hint}>{t('verify.genderHint')}</Text>
            </FormSection>

            <View style={styles.photos}>
              <PhotoSlot
                label={t('verify.selfie')}
                hint={t('verify.selfieHint')}
                icon="camera"
                uri={selfie}
                onPress={() => take('selfie', 'camera')}
              />
              <PhotoSlot label={t('verify.idPhoto')} hint={t('verify.idHint')} icon="document" uri={idPhoto} onPress={pickId} />
            </View>

            <View style={styles.privacy}>
              <GlossyFill />
              <Icon name="privacy" size={20} color={Colors.violetText} />
              <Text style={styles.privacyText}>{t('verify.privacy')}</Text>
            </View>
          </>
        )}

        {verification.verified && !retry && !pending && (
          <Pressable accessibilityRole="button" onPress={() => setRetry(true)}>
            <Text style={styles.redo}>{t('verify.redo')}</Text>
          </Pressable>
        )}
      </ScrollView>
      {showForm && (
        <FormFooter>
          <Button
            variant="violet"
            title={t('verify.send')}
            disabled={!gender || !selfie || !idPhoto}
            loading={busy}
            onPress={send}
          />
        </FormFooter>
      )}
    </SafeAreaView>
  );
}

function PhotoSlot({
  label,
  hint,
  icon,
  uri,
  onPress,
}: {
  label: string;
  hint: string;
  icon: 'camera' | 'document';
  uri: string | null;
  onPress: () => void;
}) {
  const styles = useStyles();
  const Colors = useColors();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.slot, pressed && styles.pressed]}>
      <GlossyFill />
      {uri ? (
        <Image source={{ uri }} style={styles.slotImage} contentFit="cover" />
      ) : (
        <View style={styles.slotEmpty}>
          <Icon name={icon} size={30} color={Colors.violetText} />
        </View>
      )}
      <Text style={styles.slotLabel}>{label}</Text>
      <Text style={styles.slotHint}>{hint}</Text>
    </Pressable>
  );
}

const useStyles = makeStyles((Colors) => ({
  safe: { flex: 1, backgroundColor: Colors.bg },
  flex: { flex: 1 },
  spinner: { marginTop: Spacing.xxl },
  pressed: { opacity: 0.8 },
  content: { padding: Spacing.lg, gap: Spacing.lg, paddingBottom: Spacing.xxl },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  heroTitle: { ...Type.heading, fontSize: 18, color: Colors.white },
  heroBody: { ...Type.small, color: 'rgba(255, 255, 255, 0.88)' },
  status: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  statusOk: { borderColor: Colors.ok, backgroundColor: Colors.surface },
  statusWait: { borderColor: Colors.amber, backgroundColor: Colors.amberTint },
  statusBad: { borderColor: Colors.danger, backgroundColor: Colors.dangerBg },
  statusTitle: { ...Type.label, fontSize: 16, fontWeight: '800', color: Colors.text },
  statusBody: { ...Type.small, color: Colors.textSecondary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  hint: { ...Type.small, color: Colors.textSecondary },
  photos: { flexDirection: 'row', gap: Spacing.md },
  slot: {
    flex: 1,
    padding: Spacing.md,
    gap: 4,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
  },
  slotImage: { width: '100%', aspectRatio: 1, borderRadius: Radius.md },
  slotEmpty: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: Colors.violet,
    backgroundColor: Colors.violetTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotLabel: { ...Type.label, fontSize: 14, color: Colors.text, marginTop: Spacing.xs },
  slotHint: { ...Type.small, fontSize: 12, color: Colors.textMuted },
  privacy: {
    flexDirection: 'row',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
  },
  privacyText: { ...Type.small, color: Colors.textSecondary, flex: 1 },
  redo: { ...Type.label, color: Colors.violetText, textAlign: 'center' },
}));
