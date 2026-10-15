// TEMPORARY testing switch: EXPO_PUBLIC_SKIP_LOGIN=true in mobile/.env.local opens the home screen without Google
// sign-in or phone verification, so the app can be tried before Google/SMS are set up. Venues are still loaded
// as an anonymous visitor (Row Level Security only shows live venues). Must be removed or set to false before
// any build that goes to real users or Google Play.
export const skipLogin = process.env.EXPO_PUBLIC_SKIP_LOGIN === 'true';
