import { AppState } from 'react-native';
import mobileAds, { AdEventType, AdsConsent, AppOpenAd, TestIds } from 'react-native-google-mobile-ads';

// Google AdMob "app open" ads for people without Plus: a full-screen ad with Google's own close button ("Continue to
// app") over the home screen every time the app is opened (also after being closed from the recent apps) and every
// time it comes back from the background. App open ads are the AdMob format made for this; ordinary pop-up
// (interstitial) ads at app launch are against Google's rules.
//
// Quick trips out of the app (a photo picker, the maps app, a share sheet) don't count as opening it: the app has to
// have been in the background for at least MIN_AWAY_MS, and the photo pickers call skipNextOpenAd().
//
// At most MAX_ADS_PER_DAY ads a day per person (founder, 2026-10-22): counted on the phone for each account and
// calendar day (the phone's date) when an ad actually opens; after that, no more ads until tomorrow.
//
// The ad unit comes from EXPO_PUBLIC_ADMOB_APP_OPEN_ID (Google's test ad until it's set). The AdMob app ID is in
// app.json (react-native-google-mobile-ads plugin) and needs a new native build when it changes.

const UNIT_ID = process.env.EXPO_PUBLIC_ADMOB_APP_OPEN_ID || TestIds.APP_OPEN;
const MIN_AWAY_MS = 30 * 1000;
// Google: an app open ad loaded more than 4 hours ago shouldn't be shown.
const MAX_AD_AGE_MS = 4 * 60 * 60 * 1000;
// If the ad isn't ready yet when the app opens, show it only if it arrives within this time.
const WAIT_FOR_AD_MS = 6 * 1000;
const MAX_ADS_PER_DAY = 2;

let preparing: Promise<void> | null = null;
let ad: AppOpenAd | null = null;
let loadedAt: number | null = null;
let loading = false;
let showing = false;
let wantedAt: number | null = null;
let skipNext = false;
let backgroundSince: number | null = null;
let launchAdDone = false;
let adsUser: string | null = null;
const resumeListeners = new Set<() => void>();

AppState.addEventListener('change', (next) => {
  if (next === 'background') {
    backgroundSince = Date.now();
  } else if (next === 'active' && backgroundSince !== null) {
    const away = Date.now() - backgroundSince;
    backgroundSince = null;
    if (skipNext) {
      skipNext = false;
    } else if (away >= MIN_AWAY_MS && !showing) {
      resumeListeners.forEach((listener) => listener());
    }
  }
});

// Today's count for this account, kept as "<day>:<count>" (one small value per account).
function countKey() {
  return `tm.ads.${adsUser ?? 'guest'}`;
}

function today() {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

function shownToday(): number {
  try {
    const [day, count] = (localStorage.getItem(countKey()) ?? '').split(':');
    return day === today() ? Number(count) || 0 : 0;
  } catch {
    return 0;
  }
}

function countShown() {
  try {
    localStorage.setItem(countKey(), `${today()}:${shownToday() + 1}`);
  } catch {
    // Not saved: the next ad may show anyway.
  }
}

function limitReached() {
  return shownToday() >= MAX_ADS_PER_DAY;
}

// Who is signed in, so each account gets its own daily count.
export function setAdsUser(userId: string | null) {
  adsUser = userId;
}

// No new ad once today's are used up (an ad loaded but never shown only lowers the show rate).
function load() {
  if (!ad || loading || limitReached()) return;
  loadedAt = null;
  loading = true;
  ad.load();
}

// Asks for ad consent where the law requires it (EEA / UK: Google's consent form, set up in AdMob), starts the ads
// SDK and loads the first ad. Called once people without Plus are signed in; every call waits for the same start.
export function prepareAds(): Promise<void> {
  if (!preparing) preparing = startAds();
  return preparing;
}

async function startAds() {
  try {
    const consent = await AdsConsent.gatherConsent().catch(() => null);
    if (consent && !consent.canRequestAds) return;
    await mobileAds().initialize();
    ad = AppOpenAd.createForAdRequest(UNIT_ID);
    ad.addAdEventListener(AdEventType.LOADED, () => {
      loading = false;
      loadedAt = Date.now();
      // The app opened before the ad was ready: show it now if that was only a moment ago.
      if (wantedAt !== null && Date.now() - wantedAt < WAIT_FOR_AD_MS) {
        wantedAt = null;
        show();
      }
    });
    ad.addAdEventListener(AdEventType.OPENED, countShown);
    ad.addAdEventListener(AdEventType.ERROR, () => {
      loading = false;
      loadedAt = null;
      showing = false;
    });
    ad.addAdEventListener(AdEventType.CLOSED, () => {
      showing = false;
      // Ready for the next opening.
      load();
    });
    load();
  } catch (error) {
    console.warn('Starting ads failed', error);
  }
}

function show() {
  if (!ad || showing || limitReached()) return;
  showing = true;
  ad.show().catch(() => {
    showing = false;
    load();
  });
}

// Shows the app open ad (not for Plus members, nor after today's 2). If it's still loading, it shows as soon as it
// arrives (briefly).
export function showOpenAd(isMember: boolean) {
  if (isMember || !ad || showing || limitReached()) return;
  if (loadedAt !== null && Date.now() - loadedAt < MAX_AD_AGE_MS) {
    show();
  } else {
    // Too old, or none loaded yet (e.g. the first one of a new day): load and show it if it comes quickly.
    wantedAt = Date.now();
    load();
  }
}

// Called when the app comes back after a while (counts as opening it). Returns the unsubscribe function.
export function onAppReopened(listener: () => void): () => void {
  resumeListeners.add(listener);
  return () => {
    resumeListeners.delete(listener);
  };
}

// The app is about to open the camera or a photo picker: coming back from it isn't "opening the app".
export function skipNextOpenAd() {
  skipNext = true;
}

// The ad when the app starts (opened fresh, or after being closed from the recent apps): once per start.
export async function showLaunchAd(isMember: boolean) {
  if (isMember || launchAdDone) return;
  launchAdDone = true;
  await prepareAds();
  showOpenAd(false);
}
