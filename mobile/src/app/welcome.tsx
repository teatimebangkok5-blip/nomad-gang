import { Image } from 'expo-image';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Icon, type IconName } from '@/components/icon';
import { LanguageToggle } from '@/components/language-toggle';
import { Logo } from '@/components/logo';
import { Colors, Radius, Spacing, Type } from '@/constants/theme';
import { signInWithGoogle } from '@/lib/auth';
import { supabaseConfigured } from '@/lib/supabase';

// First screen: what TableMeet is, and sign in with Google.
export default function WelcomeScreen() {
  const { t } = useTranslation();
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGoogle() {
    setError(null);
    setSigningIn(true);
    const result = await signInWithGoogle();
    setSigningIn(false);
    // On success the root layout moves on to phone verification by itself.
    if (result === 'error') setError(t('welcome.errorSignIn'));
    if (result === 'no-play-services') setError(t('welcome.errorPlayServices'));
  }

  const steps: { icon: IconName; text: string }[] = [
    { icon: 'nearMe', text: t('welcome.step1') },
    { icon: 'group', text: t('welcome.step2') },
    { icon: 'deal', text: t('welcome.step3') },
  ];

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.topBar}>
          <Logo />
          <LanguageToggle />
        </View>

        <View style={styles.hero}>
          <Image
            source={require('@/assets/images/icon.png')}
            style={styles.heroIcon}
            contentFit="cover"
            accessibilityIgnoresInvertColors
          />
          <Text style={styles.title}>{t('welcome.title')}</Text>
          <Text style={styles.subtitle}>{t('welcome.subtitle')}</Text>
        </View>

        <View style={styles.steps}>
          {steps.map((step, index) => (
            <View key={step.icon} style={styles.step}>
              <View style={styles.stepIcon}>
                <Icon name={step.icon} size={22} color={Colors.orange} />
              </View>
              <Text style={styles.stepNumber}>{index + 1}</Text>
              <Text style={styles.stepText}>{step.text}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        {!supabaseConfigured && (
          <Text style={styles.previewNotice}>Preview build: not connected to the TableMeet server yet.</Text>
        )}
        {error && (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        )}
        <Button title={t('welcome.continueWithGoogle')} onPress={handleGoogle} loading={signingIn} />
        <Text style={styles.note}>{t('welcome.nextStepNote')}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  scroll: { flexGrow: 1, paddingHorizontal: Spacing.xl, paddingBottom: Spacing.xl },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.lg,
  },
  hero: { marginTop: Spacing.xxl, gap: Spacing.md },
  heroIcon: { width: 96, height: 96, borderRadius: 24, marginBottom: Spacing.sm },
  title: { ...Type.display, color: Colors.text },
  subtitle: { ...Type.body, fontSize: 16, lineHeight: 24, color: Colors.textSecondary },
  steps: { marginTop: Spacing.xxl, gap: Spacing.md },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  stepIcon: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: Colors.orangeTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumber: { ...Type.label, color: Colors.textMuted },
  stepText: { ...Type.body, color: Colors.text, flex: 1 },
  footer: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
    gap: Spacing.md,
  },
  error: {
    ...Type.small,
    color: Colors.danger,
    backgroundColor: Colors.dangerBg,
    padding: Spacing.md,
    borderRadius: Radius.sm,
  },
  note: { ...Type.small, color: Colors.textMuted, textAlign: 'center' },
  previewNotice: {
    ...Type.small,
    color: Colors.textSecondary,
    backgroundColor: Colors.surfaceRaised,
    padding: Spacing.md,
    borderRadius: Radius.sm,
    textAlign: 'center',
  },
});
