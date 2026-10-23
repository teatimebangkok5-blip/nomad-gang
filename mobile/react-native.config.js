// No ads on iPhone yet (src/lib/ads.ios.ts): keep the Google Mobile Ads SDK out of the iOS build, so the app doesn't
// ship advertising / tracking code there. Remove the ios: null line when iOS ads are added.
module.exports = {
  dependencies: {
    'react-native-google-mobile-ads': {
      platforms: { ios: null },
    },
  },
};
