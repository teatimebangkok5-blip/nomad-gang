import {
  GoogleSignin,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import type { Session } from '@supabase/supabase-js';
import { createContext, use, useEffect, useState, type ReactNode } from 'react';

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
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
