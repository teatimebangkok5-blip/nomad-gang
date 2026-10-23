// No ads in the first iPhone version (founder, 2026-10-23): iOS ads need their own AdMob app and Apple's tracking
// prompt (App Tracking Transparency). Same functions as ads.ts, doing nothing, so the ads SDK is never loaded on iOS
// (it's also left out of the iOS build by react-native.config.js).

export function setAdsUser(_userId: string | null) {}

export function prepareAds(): Promise<void> {
  return Promise.resolve();
}

export function showOpenAd(_isMember: boolean) {}

export function onAppReopened(_listener: () => void): () => void {
  return () => {};
}

export function skipNextOpenAd() {}

export async function showLaunchAd(_isMember: boolean) {}
