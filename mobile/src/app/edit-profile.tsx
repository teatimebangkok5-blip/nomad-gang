import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { FieldLabel } from '@/components/profile-fields';
import {
  BasicsFields,
  basicsValid,
  CountryField,
  InstagramField,
  InterestsField,
  LanguagesField,
  ProfessionField,
  TravelStyleField,
  type ProfileDraft,
} from '@/components/profile-form';
import { ScreenHeader } from '@/components/screen-header';
import { Radius, Spacing, Type } from '@/constants/theme';
import { fetchMyDetails, saveMyProfile, type ProfileErrorKey } from '@/lib/profiles';
import { makeStyles, useColors } from '@/lib/theme';

// Edit profile: everything the first-time questions asked, on one page. Photos are changed on the profile itself.
export default function EditProfileScreen() {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  const [draft, setDraft] = useState<ProfileDraft | null | 'error'>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ProfileErrorKey | null>(null);

  useEffect(() => {
    fetchMyDetails().then((details) => {
      if (!details || details === 'error') {
        setDraft('error');
        return;
      }
      const { onboarded: _, ...rest } = details;
      setDraft(rest);
    });
  }, []);

  async function save(current: ProfileDraft) {
    setSaving(true);
    setError(null);
    const result = await saveMyProfile(current);
    setSaving(false);
    if (result) {
      setError(result);
      return;
    }
    Alert.alert(t('profile.saved'));
    router.back();
  }

  if (draft === null || draft === 'error') {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
        <ScreenHeader title={t('profile.edit')} />
        {draft === null ? (
          <ActivityIndicator color={Colors.accent} size="large" style={styles.spinner} />
        ) : (
          <Text style={styles.center}>{t('profile.loadFailed')}</Text>
        )}
      </SafeAreaView>
    );
  }

  const fields = { draft, onChange: (patch: Partial<ProfileDraft>) => setDraft({ ...draft, ...patch }) };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <ScreenHeader title={t('profile.edit')} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <BasicsFields {...fields} />
          <FieldLabel>{t('profile.instagramLabel')}</FieldLabel>
          <InstagramField {...fields} />
          <FieldLabel>{t('about.country')}</FieldLabel>
          <CountryField {...fields} />
          <FieldLabel>{t('about.languages')}</FieldLabel>
          <LanguagesField {...fields} />
          <FieldLabel>{t('about.profession')}</FieldLabel>
          <ProfessionField {...fields} />
          <FieldLabel>{t('about.travelStyle')}</FieldLabel>
          <TravelStyleField {...fields} />
          <FieldLabel>{t('about.interests')}</FieldLabel>
          <InterestsField {...fields} />
          {error && (
            <Text accessibilityRole="alert" style={styles.error}>
              {t(`profile.errors.${error}`)}
            </Text>
          )}
        </ScrollView>
        <View style={styles.footer}>
          <Button title={t('profile.save')} loading={saving} disabled={!basicsValid(draft)} onPress={() => save(draft)} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((Colors) => ({
  safe: { flex: 1, backgroundColor: Colors.bg },
  flex: { flex: 1 },
  spinner: { marginTop: Spacing.xxl * 2 },
  center: { ...Type.body, color: Colors.textSecondary, textAlign: 'center', marginTop: Spacing.xxl },
  content: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xxl },
  error: {
    ...Type.small,
    color: Colors.danger,
    backgroundColor: Colors.dangerBg,
    padding: Spacing.md,
    borderRadius: Radius.sm,
    marginTop: Spacing.lg,
  },
  footer: { padding: Spacing.lg, borderTopWidth: 1, borderTopColor: Colors.border },
}));
