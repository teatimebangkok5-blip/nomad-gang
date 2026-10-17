import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
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
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          {index > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('common.back')}
              hitSlop={8}
              onPress={() => setIndex(index - 1)}
              style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
              <Icon name="back" size={22} color={Colors.text} />
            </Pressable>
          ) : (
            <View style={styles.back} />
          )}
          <Logo size={22} />
          <Text style={styles.stepOf}>{t('onboarding.stepOf', { step: index + 1, total: STEPS.length })}</Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${((index + 1) / STEPS.length) * 100}%` }]} />
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
          <View style={styles.flex}>
            <Button
              title={last ? t('onboarding.finish') : t('onboarding.next')}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.sm,
    paddingTop: Spacing.sm,
    minHeight: 52,
  },
  back: { width: 44, height: 44, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center' },
  pressed: { backgroundColor: Colors.pressed },
  stepOf: { ...Type.small, color: Colors.textMuted, minWidth: 44, textAlign: 'right', marginRight: Spacing.sm },
  progressTrack: {
    height: 4,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    borderRadius: 2,
    backgroundColor: Colors.surfaceRaised,
    overflow: 'hidden',
  },
  progressFill: { height: 4, borderRadius: 2, backgroundColor: Colors.orange },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl },
  title: { ...Type.display, fontSize: 26, lineHeight: 34, color: Colors.text, marginTop: Spacing.md },
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
    gap: Spacing.sm,
    padding: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
}));
