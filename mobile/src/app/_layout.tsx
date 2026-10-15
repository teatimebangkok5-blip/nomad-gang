import '@/i18n';

import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { AuthProvider, useAuth } from '@/lib/auth';
import { skipLogin } from '@/lib/preview';
import { ThemeProvider, useTheme } from '@/lib/theme';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </ThemeProvider>
  );
}

// Signed out -> welcome. Signed in without a verified phone -> verify-phone. Otherwise -> home.
// With the temporary skipLogin switch, always -> home.
function RootNavigator() {
  const { name: themeName, colors: Colors } = useTheme();
  const { ready, session, phoneVerified } = useAuth();

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

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
        <Stack.Protected guard={skipLogin || (!!session && phoneVerified)}>
          <Stack.Screen name="index" />
          <Stack.Screen name="create-table" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="table/[id]" />
          <Stack.Screen name="settings" />
          <Stack.Screen name="travellers" />
          <Stack.Screen name="dm/[userId]" />
          <Stack.Screen name="table-chat/[id]" />
        </Stack.Protected>
      </Stack>
    </>
  );
}
