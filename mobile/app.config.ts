/// <reference types="node" />
import fs from 'node:fs';
import path from 'node:path';

import type { ConfigContext, ExpoConfig } from 'expo/config';

// Extends app.json. Maps are free (MapLibre + OpenFreeMap), so no map API keys are needed.
// Phone notifications on Android need the Firebase file mobile/google-services.json (git-ignored, README step 7):
// it's added only when present, so the app still builds without it (it just can't get a push token).
// EAS cloud builds don't get git-ignored files: there it comes from the EAS file variable GOOGLE_SERVICES_JSON.
export default ({ config, projectRoot }: ConfigContext): ExpoConfig => {
  const localFirebase = fs.existsSync(path.join(projectRoot, 'google-services.json'))
    ? './google-services.json'
    : undefined;
  const firebase = process.env.GOOGLE_SERVICES_JSON || localFirebase;
  return {
    ...(config as ExpoConfig),
    android: {
      ...config.android,
      ...(firebase ? { googleServicesFile: firebase } : {}),
    },
  };
};
