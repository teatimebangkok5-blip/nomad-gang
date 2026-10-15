import type { ConfigContext, ExpoConfig } from 'expo/config';

// Extends app.json. Maps are free (MapLibre + OpenFreeMap), so no map API keys are needed.
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
});
