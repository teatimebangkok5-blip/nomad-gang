import '@/i18n';

import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AuthProvider, requirePhoneVerification, useAuth } from '@/lib/auth';
import { useLiveLocationSharing } from '@/lib/live-location';
import { OnboardingProvider, useOnboarding } from '@/lib/onboarding';
import { skipLogin } from '@/lib/preview';
import { ThemeProvider, useTheme } from '@/lib/theme';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  // The gesture root lets rows be swiped (Messages).
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <AuthProvider>
          <OnboardingProvider>
            <RootNavigator />
          </OnboardingProvider>
        </AuthProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

// Signed out -> welcome. Signed in without a verified phone -> verify-phone. First time in -> onboarding (name,
// birthday 18+, About questions). Otherwise -> home. With the temporary skipLogin switch, always -> home.
function RootNavigator() {
  const { name: themeName, colors: Colors } = useTheme();
  const { ready, session, phoneVerified: verified } = useAuth();
  const { status: onboarding } = useOnboarding();
  // While the phone check is off (until SMS is set up), a Google account goes straight in.
  const phoneVerified = verified || !requirePhoneVerification;
  const signedIn = !skipLogin && !!session && phoneVerified;
  // Keep the splash screen up until we know whether the first-time questions are needed.
  const waiting = !ready || (signedIn && onboarding === 'unknown');
  useLiveLocationSharing(session?.user.id);

  useEffect(() => {
    if (!waiting) SplashScreen.hideAsync();
  }, [waiting]);

  if (waiting) return null;

  return (
    <>
      <StatusBar style={themeName === 'light' ? 'dark' : 'light'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.bg } }}>
        <Stack.Protected guard={!skipLogin && !session}>
          <Stack.Screen name="welcome" />
        </Stack.Protected>
        <Stack.Protected guard={!skipLogin && !!session && !phoneVerified}>
          <Stack.Screen name="verify-phone" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && onboarding === 'needed'}>
          <Stack.Screen name="onboarding" />
        </Stack.Protected>
        <Stack.Protected guard={skipLogin || (signedIn && onboarding === 'done')}>
          <Stack.Screen name="index" />
          <Stack.Screen name="create-table" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="create-hangout" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="table/[id]" />
          <Stack.Screen name="settings" />
          <Stack.Screen name="travellers" />
          <Stack.Screen name="dm/[userId]" />
          <Stack.Screen name="table-chat/[id]" />
          <Stack.Screen name="profile/[userId]" />
          <Stack.Screen name="edit-profile" />
          <Stack.Screen name="friends/[userId]" />
          <Stack.Screen name="trip-form" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="favorites" />
          <Stack.Screen name="live-location" />
          <Stack.Screen name="plan-day" />
          <Stack.Screen name="plan/[id]" />
          <Stack.Screen name="notifications" />
          <Stack.Screen name="messages" />
          <Stack.Screen name="rewards" />
          <Stack.Screen name="passport" />
          <Stack.Screen name="gems" />
          <Stack.Screen name="gem/[id]" />
          <Stack.Screen name="suggest-gem" />
          <Stack.Screen name="new-group" />
          <Stack.Screen name="group/[id]" />
          <Stack.Screen name="group-info/[id]" />
          <Stack.Screen name="post-story" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="story/[userId]" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
        </Stack.Protected>
        {/* Terms / Privacy: open signed in or not. */}
        <Stack.Screen name="legal/[doc]" />
      </Stack>
    </>
  );
}
