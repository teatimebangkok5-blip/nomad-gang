import { AppState } from 'react-native';
import mobileAds, { AdEventType, AdsConsent, InterstitialAd, TestIds } from 'react-native-google-mobile-ads';

// Pop-up (interstitial) ads from Google AdMob for people without Plus: at most one each time the app is opened, when
// they open a hangout from home, tap Create table / Create hangout, or open a story. The ad has its own close
// button; the action carries on when it closes. If no ad is ready, the action carries on right away.
//
// The ad unit comes from EXPO_PUBLIC_ADMOB_INTERSTITIAL_ID (Google's test ad until it's set). The AdMob app ID is in
// app.json (react-native-google-mobile-ads plugin) and needs a new native build when it changes.

const UNIT_ID = process.env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_ID || TestIds.INTERSTITIAL;
// Back in the app after this long in the background counts as a new opening.
const NEW_OPENING_AFTER_MS = 30 * 60 * 1000;

let started = false;
let ad: InterstitialAd | null = null;
let loaded = false;
let shownThisOpening = false;
let backgroundSince: number | null = null;

AppState.addEventListener('change', (next) => {
  if (next === 'background') backgroundSince = Date.now();
  else if (next === 'active' && backgroundSince !== null) {
    if (Date.now() - backgroundSince > NEW_OPENING_AFTER_MS) shownThisOpening = false;
    backgroundSince = null;
  }
});

// Asks for ad consent where the law requires it (EEA / UK: Google's consent form, set up in AdMob), starts the ads
// SDK and loads the first ad. Called once people without Plus are signed in; safe to call again.
export async function prepareAds() {
  if (started) return;
  started = true;
  try {
    const consent = await AdsConsent.gatherConsent().catch(() => null);
    if (consent && !consent.canRequestAds) return;
    await mobileAds().initialize();
    ad = InterstitialAd.createForAdRequest(UNIT_ID);
    ad.addAdEventListener(AdEventType.LOADED, () => {
      loaded = true;
    });
    ad.addAdEventListener(AdEventType.ERROR, () => {
      loaded = false;
    });
    ad.load();
  } catch (error) {
    console.warn('Starting ads failed', error);
  }
}

// Runs `action`, after a pop-up ad if one is due (not for Plus members).
export function withAd(isMember: boolean, action: () => void) {
  if (isMember || shownThisOpening || !ad || !loaded) {
    // An ad that failed to load gets another try for next time (load() ignores the call while one is loading).
    if (!isMember && !shownThisOpening && ad && !loaded) ad.load();
    action();
    return;
  }
  const current = ad;
  shownThisOpening = true;
  loaded = false;
  const unsubscribe = current.addAdEventListener(AdEventType.CLOSED, () => {
    unsubscribe();
    action();
    // Ready for the next opening.
    current.load();
  });
  current.show().catch(() => {
    unsubscribe();
    action();
    current.load();
  });
}
