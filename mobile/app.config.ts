import type { ConfigContext, ExpoConfig } from 'expo/config';

// Extends app.json with values that must not be committed to git.
// GOOGLE_MAPS_API_KEY comes from mobile/.env.local (or the EAS environment). It is restricted in Google Cloud to
// this app's package name and signing fingerprint.
const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  plugins: [...(config.plugins ?? []), ['react-native-maps', { androidGoogleMapsApiKey: googleMapsApiKey }]],
  extra: {
    ...config.extra,
    // Google Maps crashes on Android without a key, so the app shows a placeholder instead when this is false.
    mapsEnabled: Boolean(googleMapsApiKey),
    // Same restricted key, used for Places API (New) place-type lookups (src/lib/google-places.ts). It is already
    // visible inside the APK's manifest, so exposing it here adds no risk; the Android-app restriction protects it.
    googleApiKey: googleMapsApiKey,
  },
});
