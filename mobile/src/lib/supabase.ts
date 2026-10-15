import 'expo-sqlite/localStorage/install';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

// False in preview builds made before Supabase is set up (no mobile/.env.local). The app still opens so the screens
// can be looked at; sign-in and loading venues fail with their normal error messages.
export const supabaseConfigured = Boolean(
  process.env.EXPO_PUBLIC_SUPABASE_URL && process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);
if (!supabaseConfigured) {
  console.warn('Missing Supabase settings. Copy mobile/.env.example to mobile/.env.local and fill it in.');
}

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://not-configured.invalid';
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'not-configured';

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    // expo-sqlite provides localStorage on Android and iOS; the session survives app restarts.
    storage: localStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Only refresh the session while the app is open.
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});

export function venuePhotoUrl(path: string): string {
  return `${supabaseUrl}/storage/v1/object/public/venue-photos/${path}`;
}
