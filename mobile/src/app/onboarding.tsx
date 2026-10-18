import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ToneFill } from '@/components/glossy';
import { Icon } from '@/components/icon';
import { Logo } from '@/components/logo';
import {
  BasicsFields,
  basicsValid,
  CountryField,
  EMPTY_DRAFT,
  InstagramField,
  InterestsField,
  LanguagesField,
  ProfessionField,
  TravelStyleField,
  type ProfileDraft,
} from '@/components/profile-form';
import { RoundButton } from '@/components/round-button';
import { Radius, Spacing, Type } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { useOnboarding } from '@/lib/onboarding';
import { MAX_INTERESTS } from '@/lib/profile-options';
import { fetchMyDetails, saveMyProfile, type ProfileErrorKey } from '@/lib/profiles';
import { makeStyles, useColors } from '@/lib/theme';

// First-time questions after signing in: name + birthday (required, 18+), then where they're from, languages,
// profession, travel style, interests and Instagram (each can be skipped). Everything is saved at the end; the
// root layout then moves them to home.
const STEPS = ['basics', 'country', 'languages', 'profession', 'style', 'interests', 'instagram'] as const;
type Step = (typeof STEPS)[number];

export default function OnboardingScreen() {
  const styles = useStyles();
  const Colors = useColors();
  const { t } = useTranslation();
  const { session } = useAuth();
  const { markDone } = useOnboarding();
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const [index, setIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ProfileErrorKey | null>(null);

  // Start from what's already there (the Google name, an Instagram added earlier).
  useEffect(() => {
    fetchMyDetails().then((details) => {
      const fallbackName = (session?.user.user_metadata?.full_name as string | undefined) ?? '';
      if (details && details !== 'error') {
        const { onboarded: _, ...rest } = details;
        setDraft({ ...rest, display_name: rest.display_name || fallbackName });
      } else {
        setDraft({ ...EMPTY_DRAFT, display_name: fallbackName });
      }
    });
  }, [session]);

  const step: Step = STEPS[index];
  const last = index === STEPS.length - 1;

  async function finish() {
    if (!draft) return;
    setSaving(true);
    setError(null);
    const result = await saveMyProfile(draft);
    setSaving(false);
    if (result) {
      setError(result);
      if (['name_required', 'birth_date_required', 'invalid_birth_date', 'too_young'].includes(result)) setIndex(0);
      return;
    }
    markDone();
  }

  function next() {
    if (last) finish();
    else setIndex(index + 1);
  }

  if (!draft) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator color={Colors.accent} size="large" style={styles.spinner} />
      </SafeAreaView>
    );
  }

  const change = (patch: Partial<ProfileDraft>) => setDraft({ ...draft, ...patch });
  const titles: Record<Step, string> = {
    basics: t('onboarding.basicsTitle'),
    country: t('onboarding.countryTitle'),
    languages: t('onboarding.languagesTitle'),
    profession: t('onboarding.professionTitle'),
    style: t('onboarding.styleTitle'),
    interests: t('onboarding.interestsTitle'),
    instagram: t('onboarding.instagramTitle'),
  };
  const bodies: Partial<Record<Step, string>> = {
    basics: t('onboarding.basicsBody'),
    interests: t('onboarding.interestsBody', { max: MAX_INTERESTS }),
    instagram: t('onboarding.instagramBody'),
  };
  const fields = { draft, onChange: change };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      {/* A soft violet glow in the top corner. */}
      <LinearGradient
        colors={[Colors.violetTint, 'transparent']}
        start={{ x: 1, y: 0 }}
        end={{ x: 0.35, y: 0.45 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          {index > 0 ? (
            <RoundButton icon="back" label={t('common.back')} onPress={() => setIndex(index - 1)} />
          ) : (
            <Logo size={20} />
          )}
          <View style={styles.progress}>
            <View style={styles.segments}>
              {STEPS.map((name, i) => (
                <View key={name} style={[styles.segment, i <= index && styles.segmentDone]}>
                  {i <= index && <ToneFill tone="brand" shine={false} />}
                </View>
              ))}
            </View>
            <Text style={styles.stepOf}>{t('onboarding.stepOf', { step: index + 1, total: STEPS.length })}</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>{titles[step]}</Text>
          {bodies[step] && <Text style={styles.body}>{bodies[step]}</Text>}
          <View style={styles.fields}>
            {step === 'basics' && <BasicsFields {...fields} />}
            {step === 'country' && <CountryField {...fields} />}
            {step === 'languages' && <LanguagesField {...fields} />}
            {step === 'profession' && <ProfessionField {...fields} />}
            {step === 'style' && <TravelStyleField {...fields} />}
            {step === 'interests' && <InterestsField {...fields} />}
            {step === 'instagram' && <InstagramField {...fields} />}
          </View>
          {error && (
            <Text accessibilityRole="alert" style={styles.error}>
              {t(`profile.errors.${error}`)}
            </Text>
          )}
          {index > 0 && <Text style={styles.later}>{t('onboarding.laterHint')}</Text>}
        </ScrollView>

        <View style={styles.footer}>
          {index > 0 && (
            <View style={styles.flex}>
              <Button title={t('onboarding.skip')} variant="secondary" disabled={saving} onPress={next} />
            </View>
          )}
          <View style={index > 0 ? styles.flex : styles.full}>
            <Button
              title={last ? t('onboarding.finish') : t('onboarding.next')}
              trailingIcon={last ? undefined : <Icon name="forward" size={20} color={Colors.onBrand} />}
              loading={saving}
              disabled={step === 'basics' && !basicsValid(draft)}
              onPress={next}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((Colors) => ({
  safe: { flex: 1, backgroundColor: Colors.bg },
  flex: { flex: 1 },
  spinner: { marginTop: Spacing.xxl * 2 },
  full: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: 20,
    paddingTop: Spacing.sm,
    minHeight: 52,
  },
  progress: { flex: 1, gap: 6 },
  segments: { flexDirection: 'row', gap: 4 },
  segment: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: Colors.surfaceRaised },
  segmentDone: { backgroundColor: Colors.orange },
  stepOf: { ...Type.small, fontSize: 12, fontWeight: '700', color: Colors.textMuted },
  content: { paddingHorizontal: 20, paddingTop: Spacing.lg, paddingBottom: Spacing.xxl },
  title: { ...Type.display, color: Colors.text, marginTop: Spacing.md },
  body: { ...Type.body, color: Colors.textSecondary, marginTop: Spacing.sm },
  fields: { marginTop: Spacing.lg },
  error: {
    ...Type.small,
    color: Colors.danger,
    backgroundColor: Colors.dangerBg,
    padding: Spacing.md,
    borderRadius: Radius.sm,
    marginTop: Spacing.lg,
  },
  later: { ...Type.small, color: Colors.textMuted, marginTop: Spacing.xl, textAlign: 'center' },
  footer: {
    flexDirection: 'row',
    gap: Spacing.md - 2,
    paddingHorizontal: 20,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
  },
}));
