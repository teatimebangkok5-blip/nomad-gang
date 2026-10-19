/// <reference types="node" />
import fs from 'node:fs';
import path from 'node:path';

import type { ConfigContext, ExpoConfig } from 'expo/config';

// Extends app.json. Maps are free (MapLibre + OpenFreeMap), so no map API keys are needed.
// Phone notifications on Android need the Firebase file mobile/google-services.json (git-ignored, README step 7):
// it's added only when present, so the app still builds without it (it just can't get a push token).
export default ({ config, projectRoot }: ConfigContext): ExpoConfig => {
  const firebase = fs.existsSync(path.join(projectRoot, 'google-services.json'));
  return {
    ...(config as ExpoConfig),
    android: {
      ...config.android,
      ...(firebase ? { googleServicesFile: './google-services.json' } : {}),
    },
  };
};
