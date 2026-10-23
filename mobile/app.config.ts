/// <reference types="node" />
import fs from 'node:fs';
import path from 'node:path';

import type { ConfigContext, ExpoConfig } from 'expo/config';

// Extends app.json. Maps are free (MapLibre + OpenFreeMap), so no map API keys are needed.
// The Google Sign-In plugin is added here (not in app.json) only when EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID is set.
// Phone notifications on Android need the Firebase file mobile/google-services.json (git-ignored, README step 7):
// it's added only when present, so the app still builds without it (it just can't get a push token).
// EAS cloud builds don't get git-ignored files: there it comes from the EAS file variable GOOGLE_SERVICES_JSON.
export default ({ config, projectRoot }: ConfigContext): ExpoConfig => {
  const localFirebase = fs.existsSync(path.join(projectRoot, 'google-services.json'))
    ? './google-services.json'
    : undefined;
  const firebase = process.env.GOOGLE_SERVICES_JSON || localFirebase;
  // Google sign-in on iPhone needs the "iOS" OAuth client from Google Cloud (README, iPhone step 3). Its reversed ID is
  // the URL scheme Google returns to. The plugin is only added once the ID is set: without it, it throws.
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  const iosUrlScheme = iosClientId
    ? `com.googleusercontent.apps.${iosClientId.replace(/\.apps\.googleusercontent\.com$/, '')}`
    : undefined;
  return {
    ...(config as ExpoConfig),
    android: {
      ...config.android,
      ...(firebase ? { googleServicesFile: firebase } : {}),
    },
    plugins: [
      ...(config.plugins ?? []),
      ...(iosUrlScheme ? [['@react-native-google-signin/google-signin', { iosUrlScheme }] as [string, unknown]] : []),
    ],
  };
};
