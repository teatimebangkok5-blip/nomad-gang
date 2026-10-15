import '@/i18n';

import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { Colors } from '@/constants/theme';
import { AuthProvider, useAuth } from '@/lib/auth';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <RootNavigator />
    </AuthProvider>
  );
}

// Signed out -> welcome. Signed in without a verified phone -> verify-phone. Otherwise -> home.
function RootNavigator() {
  const { ready, session, phoneVerified } = useAuth();

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.ink50 } }}>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="welcome" />
      </Stack.Protected>
      <Stack.Protected guard={!!session && !phoneVerified}>
        <Stack.Screen name="verify-phone" />
      </Stack.Protected>
      <Stack.Protected guard={!!session && phoneVerified}>
        <Stack.Screen name="index" />
      </Stack.Protected>
    </Stack>
  );
}
