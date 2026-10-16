import {
  GoogleSignin,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import type { Session } from '@supabase/supabase-js';
import { createContext, use, useEffect, useState, type ReactNode } from 'react';

import { skipLogin } from '@/lib/preview';
import { supabase } from '@/lib/supabase';

GoogleSignin.configure({
  // Supabase checks Google's ID token against this "Web application" client ID.
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
});

type AuthState = {
  // False until the saved session has been read from the phone.
  ready: boolean;
  session: Session | null;
  phoneVerified: boolean;
};

const AuthContext = createContext<AuthState | null>(null);

// Phone check after Google sign-in. Off until SMS is set up (the founder's decision); the database has the matching
// app_settings.require_phone_verification. Turn both on before launch.
export const requirePhoneVerification = process.env.EXPO_PUBLIC_REQUIRE_PHONE === 'true';

// The saved session, or, in the temporary preview build (skipLogin), a guest account so tables can be created and
// joined before Google sign-in is set up. The guest session is saved on the phone like any other.
async function restoreSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession();
  // Once real sign-in is on, a guest left over from the preview build signs out, so everyone uses their own
  // Google account (and keeps their own data).
  if (!skipLogin && data.session?.user.is_anonymous) {
    await supabase.auth.signOut();
    return null;
  }
  if (data.session || !skipLogin) return data.session;

  const { data: guest, error } = await supabase.auth.signInAnonymously();
  if (error) {
    // Usually "Anonymous sign-ins are disabled" in Supabase → Authentication settings.
    console.warn('Guest sign-in failed', error.message);
    return null;
  }
  return guest.session;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    restoreSession().then((restored) => {
      setSession(restored);
      setReady(true);
    });
    // Fires on sign in, sign out, token refresh and when the phone number is verified.
    const { data } = supabase.auth.onAuthStateChange((_event, newSession) => setSession(newSession));
    return () => data.subscription.unsubscribe();
  }, []);

  const phoneVerified = Boolean(session?.user.phone && session.user.phone_confirmed_at);

  return <AuthContext value={{ ready, session, phoneVerified }}>{children}</AuthContext>;
}

export function useAuth(): AuthState {
  const auth = use(AuthContext);
  if (!auth) throw new Error('useAuth must be used inside <AuthProvider>');
  return auth;
}

export type GoogleSignInResult = 'signed-in' | 'cancelled' | 'no-play-services' | 'error';

export async function signInWithGoogle(): Promise<GoogleSignInResult> {
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn();
    if (!isSuccessResponse(response)) return 'cancelled';

    const idToken = response.data.idToken;
    if (!idToken) return 'error';

    const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken });
    if (error) {
      console.warn('Supabase Google sign-in failed', error.message);
      return 'error';
    }
    return 'signed-in';
  } catch (error) {
    if (isErrorWithCode(error)) {
      if (error.code === statusCodes.IN_PROGRESS) return 'cancelled';
      if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) return 'no-play-services';
    }
    console.warn('Google sign-in failed', error);
    return 'error';
  }
}

export async function signOut() {
  await supabase.auth.signOut();
  // Forget the Google account too, so the account picker shows next time.
  await GoogleSignin.signOut().catch(() => {});
}
