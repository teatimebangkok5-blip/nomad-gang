import * as AppleAuthentication from 'expo-apple-authentication';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LanguageSegment } from '@/components/language-toggle';
import { Logo } from '@/components/logo';
import { Fonts, Radius, Spacing, Type } from '@/constants/theme';
import { requirePhoneVerification, signInWithApple, signInWithGoogle } from '@/lib/auth';
import { supabaseConfigured } from '@/lib/supabase';
import { makeStyles, useColors, useTheme } from '@/lib/theme';

const HERO_HEIGHT = 470;

// First screen: what TableMeet is, and sign in with Google (and Apple on iPhone). Signing in means agreeing to the
// Terms of Use and Privacy Policy, linked below the buttons. The hero is the app icon's artwork, zoomed past its
// frame, fading into the background.
export default function WelcomeScreen() {
  const styles = useStyles();
  const Colors = useColors();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { name: themeName } = useTheme();
  const { t } = useTranslation();
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    AppleAuthentication.isAvailableAsync()
      .then(setAppleAvailable)
      .catch(() => {});
  }, []);

  async function handleApple() {
    setError(null);
    const result = await signInWithApple();
    if (result === 'error') setError(t('welcome.errorSignIn'));
  }

  async function handleGoogle() {
    setError(null);
    setSigningIn(true);
    const result = await signInWithGoogle();
    setSigningIn(false);
    // On success the root layout moves on to phone verification by itself.
    if (result === 'error') setError(t('welcome.errorSignIn'));
    if (result === 'no-play-services') setError(t('welcome.errorPlayServices'));
  }

  // The artwork is square; show it bigger than the screen so its rounded frame is cut off.
  const art = Math.max(width, HERO_HEIGHT) * 1.3;

  return (
    <View style={styles.root}>
      <View style={styles.hero} pointerEvents="none">
        <Image
          source={require('@/assets/images/icon.png')}
          style={{ position: 'absolute', width: art, height: art, left: (width - art) / 2, top: (HERO_HEIGHT - art) / 2 - 20 }}
          contentFit="cover"
          accessibilityIgnoresInvertColors
        />
        <LinearGradient
          colors={['rgba(10, 6, 18, 0.55)', 'rgba(10, 6, 18, 0)', 'rgba(10, 6, 18, 0)', Colors.bg]}
          locations={[0, 0.3, 0.55, 1]}
          style={StyleSheet.absoluteFill}
        />
      </View>

      <View style={[styles.language, { top: insets.top + Spacing.md }]}>
        <LanguageSegment />
      </View>

      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + Spacing.xl }]} bounces={false}>
        <View style={styles.spacer} />
        <Image
          source={require('@/assets/images/icon.png')}
          style={styles.icon}
          contentFit="cover"
          accessibilityIgnoresInvertColors
        />
        <Logo size={38} />
        <Text style={styles.tagline}>{t('welcome.title')}</Text>
        <Text style={styles.subtitle}>{t('welcome.subtitle')}</Text>

        <View style={styles.flexGrow} />

        {!supabaseConfigured && (
          <Text style={styles.previewNotice}>Preview build: not connected to the TableMeet server yet.</Text>
        )}
        {error && (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        )}
        {appleAvailable && (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
            buttonStyle={
              themeName === 'dark'
                ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
            }
            cornerRadius={28}
            style={styles.appleButton}
            onPress={handleApple}
          />
        )}
        {/* Sign in with Google: a white button (without Google's logo, which may not be redrawn). */}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ busy: signingIn }}
          disabled={signingIn}
          onPress={handleGoogle}
          style={({ pressed }) => [styles.google, pressed && styles.pressed]}>
          <LinearGradient colors={['#FFFFFF', '#FFFFFF', '#F1ECF7']} locations={[0, 0.5, 1]} style={StyleSheet.absoluteFill} />
          {signingIn ? (
            <ActivityIndicator color="#1A1028" />
          ) : (
            <Text style={styles.googleText}>{t('welcome.continueWithGoogle')}</Text>
          )}
        </Pressable>
        {requirePhoneVerification && <Text style={styles.note}>{t('welcome.nextStepNote')}</Text>}
        <Text style={styles.note}>
          {t('welcome.agreePrefix')}
          <Text
            accessibilityRole="link"
            style={styles.link}
            onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'terms' } })}>
            {t('legal.terms')}
          </Text>
          {t('welcome.agreeAnd')}
          <Text
            accessibilityRole="link"
            style={styles.link}
            onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'privacy' } })}>
            {t('legal.privacy')}
          </Text>
          {t('welcome.agreeSuffix')}
        </Text>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((Colors) => ({
  root: { flex: 1, backgroundColor: Colors.bg },
  hero: { position: 'absolute', top: 0, left: 0, right: 0, height: HERO_HEIGHT, overflow: 'hidden' },
  language: { position: 'absolute', right: Spacing.lg, zIndex: 2 },
  scroll: { flexGrow: 1, paddingHorizontal: Spacing.xl, gap: 14 },
  spacer: { height: 330 },
  flexGrow: { flexGrow: 1, minHeight: Spacing.lg },
  icon: {
    width: 88,
    height: 88,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    elevation: 10,
    shadowColor: '#7B4DFF',
  },
  tagline: { ...Type.title, lineHeight: 29, fontWeight: '700', color: Colors.text },
  subtitle: { ...Type.body, color: Colors.textSecondary },
  google: {
    height: 56,
    borderRadius: Radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: '#E5DDF0',
    overflow: 'hidden',
    elevation: 6,
  },
  pressed: { opacity: 0.85 },
  googleText: { fontFamily: Fonts.body, fontSize: 16, fontWeight: '800', color: '#1A1028' },
  error: {
    ...Type.small,
    color: Colors.danger,
    backgroundColor: Colors.dangerBg,
    padding: Spacing.md,
    borderRadius: Radius.sm,
    overflow: 'hidden',
  },
  note: { ...Type.small, fontSize: 12, color: Colors.textMuted, textAlign: 'center' },
  link: { color: Colors.textSecondary, fontWeight: '700' },
  appleButton: { height: 56 },
  previewNotice: {
    ...Type.small,
    color: Colors.textSecondary,
    backgroundColor: Colors.surfaceRaised,
    padding: Spacing.md,
    borderRadius: Radius.sm,
    textAlign: 'center',
    overflow: 'hidden',
  },
}));
