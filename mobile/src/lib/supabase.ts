import 'expo-sqlite/localStorage/install';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error('Missing Supabase settings. Copy mobile/.env.example to mobile/.env.local and fill it in.');
}

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
