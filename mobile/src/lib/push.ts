import Constants from 'expo-constants';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { currentLanguage, useLanguage } from '@/i18n';
import { supabase } from '@/lib/supabase';

// Phone notifications: the server sends what also shows in the app (messages, joins, followers, new tables and
// hangouts near me, promotions) to this phone through Expo's push service. Rules and texts:
// supabase/migrations/*_push_notifications.sql. Android also needs the Firebase file (README).
//
// The phone registers its Expo push token with its app language and, only if location is already allowed, a rough
// area (the server rounds it to ~11 km) for "near me". Settings → Phone notifications turns it off for this phone.

const ENABLED_KEY = 'tablemeet.push.enabled';
const TOKEN_KEY = 'tablemeet.push.token';
// Register again when the app comes back after this long (keeps the token, language and rough area fresh).
const REFRESH_MS = 6 * 60 * 60 * 1000;

// Notifications that arrive while the app is open still show as a banner.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Not saved: it's asked again next time.
  }
}

export function pushEnabled(): boolean {
  return read(ENABLED_KEY) !== 'off';
}

export type PushResult = 'ok' | 'denied' | 'unavailable';

let lastRegistered = 0;

// Asks for permission (if `ask`), gets this phone's push token and saves it on the server.
async function registerPush(ask: boolean): Promise<PushResult> {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'TableMeet',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FE593B',
      });
    }
    let permission = await Notifications.getPermissionsAsync();
    if (!permission.granted && ask && permission.canAskAgain) permission = await Notifications.requestPermissionsAsync();
    if (!permission.granted) return 'denied';

    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;

    let lat: number | null = null;
    let lng: number | null = null;
    try {
      const location = await Location.getForegroundPermissionsAsync();
      if (location.granted) {
        const position = await Location.getLastKnownPositionAsync();
        if (position) {
          lat = position.coords.latitude;
          lng = position.coords.longitude;
        }
      }
    } catch {
      // No rough area: only "near me" notifications are missed.
    }

    const { error } = await supabase.rpc('register_push_device', {
      p_token: token,
      p_platform: Platform.OS === 'ios' ? 'ios' : 'android',
      p_language: currentLanguage(),
      p_lat: lat,
      p_lng: lng,
    });
    if (error) {
      console.warn('Saving the push token failed', error.message);
      return 'unavailable';
    }
    write(TOKEN_KEY, token);
    lastRegistered = Date.now();
    return 'ok';
  } catch (error) {
    // E.g. no Firebase file in this build yet (Android), or an emulator without Google Play.
    console.warn('Phone notifications are unavailable', error);
    return 'unavailable';
  }
}

// This phone stops getting my notifications (Settings switch off, signing out). Needs the session still active.
export async function unregisterPush() {
  const token = read(TOKEN_KEY);
  if (!token) return;
  const { error } = await supabase.rpc('unregister_push_device', { p_token: token });
  if (error) console.warn('Removing the push token failed', error.message);
  write(TOKEN_KEY, null);
}

// Settings → Phone notifications.
export function usePushSetting() {
  const [on, setOn] = useState(pushEnabled);
  const [busy, setBusy] = useState(false);
  async function set(next: boolean): Promise<PushResult> {
    setBusy(true);
    write(ENABLED_KEY, next ? 'on' : 'off');
    setOn(next);
    const result = next ? await registerPush(true) : (await unregisterPush(), 'ok' as const);
    if (next && result !== 'ok') {
      write(ENABLED_KEY, 'off');
      setOn(false);
    }
    setBusy(false);
    return result;
  }
  return { on, busy, set };
}

let handledResponseId: string | null = null;

function openFromNotification(response: Notifications.NotificationResponse | null) {
  if (!response) return;
  const id = response.notification.request.identifier;
  if (id === handledResponseId) return;
  handledResponseId = id;
  const url = response.notification.request.content.data?.url;
  if (typeof url === 'string' && url.startsWith('/')) router.push(url as Href);
}

// In the root layout: registers this phone while signed in (and again when the language changes or after a while),
// and opens the right screen when a notification is tapped.
export function usePushNotifications(userId: string | undefined, signedIn: boolean) {
  const language = useLanguage();

  useEffect(() => {
    if (!userId || !signedIn || !pushEnabled()) return;
    registerPush(true);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && pushEnabled() && Date.now() - lastRegistered > REFRESH_MS) registerPush(false);
    });
    return () => subscription.remove();
  }, [userId, signedIn, language]);

  useEffect(() => {
    if (!signedIn) return;
    // A notification tapped while the app was closed.
    openFromNotification(Notifications.getLastNotificationResponse());
    const subscription = Notifications.addNotificationResponseReceivedListener(openFromNotification);
    return () => subscription.remove();
  }, [signedIn]);
}
