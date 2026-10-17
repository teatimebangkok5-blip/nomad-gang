import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { useAuth } from '@/lib/auth';
import { fetchMyDetails } from '@/lib/profiles';

// Whether the signed-in person still has to answer the first-time questions (name, birthday 18+, and optional
// country, languages, profession, travel style, interests, Instagram). Done = a birthday is saved.
// If the check fails (e.g. offline) the app lets them in and asks again next time.

type Status = 'unknown' | 'needed' | 'done';

const OnboardingContext = createContext<{ status: Status; markDone: () => void }>({
  status: 'unknown',
  markDone: () => {},
});

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [checked, setChecked] = useState<{ userId: string; status: Status } | null>(null);

  useEffect(() => {
    if (!userId) return;
    fetchMyDetails().then((details) => {
      setChecked({ userId, status: details === 'error' || details?.onboarded ? 'done' : 'needed' });
    });
  }, [userId]);

  const markDone = useCallback(() => {
    if (userId) setChecked({ userId, status: 'done' });
  }, [userId]);

  const status: Status = userId && checked?.userId === userId ? checked.status : 'unknown';
  return <OnboardingContext.Provider value={{ status, markDone }}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding() {
  return useContext(OnboardingContext);
}
