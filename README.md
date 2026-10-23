# TableMeet

Social dining app for Bangkok: people meet at partner cafes, restaurants, rooftops and bars, and groups of 3 or more
get an exclusive discount. See [CLAUDE.md](CLAUDE.md) for the full product rules.

What exists so far:

- `supabase/` — database: venues, deals, coupon codes, venue staff logins, admin role, venue photo storage.
- `web/` — admin panel (manage venues, deals, coupon codes, staff logins, photos).
- `mobile/` — Android app: welcome + Google sign-in, phone verification, and the home screen of nearby venues.

## First-time setup

You need Node.js (already installed) and a free [Supabase](https://supabase.com) account.

### 1. Create the Supabase project

1. In Supabase, click **New project**. Pick region **Southeast Asia (Singapore)**, closest to Bangkok.
   Save the database password somewhere safe.
2. Open **SQL Editor**, paste the whole of
   `supabase/migrations/20261015000001_venues_deals_venue_logins.sql`, and click **Run**.

### 2. Create your admin account

1. Go to **Authentication → Users → Add user → Create new user**. Enter your email and a strong password and tick
   **Auto Confirm User**.
2. Back in **SQL Editor**, run this (with your email):

   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = 'you@example.com';
   ```

### 3. Connect the admin panel

1. In Supabase, open **Project Settings → API Keys**. Copy the **Publishable key**. The project URL is on the
   **Data API** page (looks like `https://abcd1234.supabase.co`).
2. In the `web` folder, copy `.env.example` to `.env.local` and paste both values in.

### 4. Run the admin panel

```bash
cd web
npm install
npm run dev
```

Open http://localhost:3000 and sign in with the email and password from step 2.

## Adding a venue

1. **Venues → Add venue.** Fill in English and Thai names, category and the check-in point (in Google Maps,
   right-click the entrance and click the coordinates to copy them).
2. On the venue page, upload a **photo**, add the **deal** with the owner's **coupon code**, and create a
   **staff login**. Give the login ID and password to the venue. The password is shown only once.
3. Tick **Live in the app** and save.

## Running the Android app

Do the Supabase steps above first. Google sign-in needs custom native code, so the app can't run in the Expo Go app.
Instead you install your own **development build** once (built in the cloud by Expo), then code changes load into it
live from your PC.

### 1. Google sign-in

1. Go to [Google Cloud Console](https://console.cloud.google.com), create a project called TableMeet, and set up the
   **OAuth consent screen** (External, app name TableMeet, your email).
2. **APIs & Services → Credentials → Create credentials → OAuth client ID → Web application.** Copy its
   **Client ID** and **Client secret**.
3. In Supabase, **Authentication → Sign In / Providers → Google**: turn it on and paste the Client ID (into
   **Client IDs**) and the secret.
4. The Android client is created in step 3 of "Build and install" below, once Expo has made your app's signing key.
   For the **local release APK** (built with `gradlew.bat assembleRelease`, signed with
   `mobile/android/app/debug.keystore`), create the Android client now: **Create credentials → OAuth client ID →
   Android**, package name `com.tablemeet.app`, SHA-1 `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`.
   (Google Play builds get their own key later; add its SHA-1 as another Android client then.)
5. Put the **Web** client ID in `mobile/.env.local` as `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, set
   `EXPO_PUBLIC_SKIP_LOGIN=false`, and rebuild the app. Any guest account left on the phone is signed out, so
   everyone uses their own Google account. The SMS phone check stays off until step 2 is done
   (`EXPO_PUBLIC_REQUIRE_PHONE` and `app_settings.require_phone_verification`).

### 2. Phone verification (SMS)

1. In Supabase, **Authentication → Sign In / Providers → Phone**: turn it on and connect an SMS provider such as
   Twilio (it delivers to Thai numbers; you pay per message).
2. For testing without paying for SMS, add a **test phone number and code** on the same page, e.g.
   `66812345678=123456`. Typing `081 234 5678` in the app then accepts the code `123456`.

### 3. Maps and places (free, nothing to set up)

The map uses MapLibre with free OpenFreeMap tiles, and the places come from OpenStreetMap (already loaded into the
database: 9,336 Bangkok food and drink places for tables, and 2,810 places to hang out such as temples, parks,
markets, malls and museums for hangouts). No Google key, card or billing is needed.

### 4. Guest testing before sign-in is ready

While `EXPO_PUBLIC_SKIP_LOGIN=true` is in `mobile/.env.local`, the app skips sign-in and uses a temporary guest
account. Turn on **Supabase → Authentication → Sign In / Providers → Allow anonymous sign-ins** so guests can create
and join tables. Before launch, set the switch to `false` and run in the SQL Editor:
`update public.app_settings set allow_guest_meetups = false;`

### 5. Build and install

```bash
cd mobile
npm install
npx eas-cli@latest login          # free Expo account
npx eas-cli@latest init           # links this folder to an Expo project
npx eas-cli@latest credentials    # Android -> development: note the SHA-1 fingerprint
```

1. Back in Google Cloud: **Create credentials → OAuth client ID → Android**, package name `com.tablemeet.app`, and the
   SHA-1 fingerprint from above.
2. Copy `mobile/.env.example` to `mobile/.env.local` and fill in the Supabase URL, publishable key and the **Web**
   client ID from step 1. Add the same three values on expo.dev under your project's **Environment variables**
   (environment: development) so cloud builds get them too.
3. Build and install:

   ```bash
   npx eas-cli@latest build --profile development --platform android
   ```

   When it finishes, open the link on your Android phone and install the app.
4. Start the dev server on your PC (phone and PC on the same Wi-Fi), then open TableMeet on the phone:

   ```bash
   npx expo start
   ```

Rebuild (step 3) only when you add a library with native code. Normal code changes appear instantly.

### 6. Ads (Google AdMob) and TableMeet Plus

People without Plus see a full-screen **app open ad** with a close button over the home screen every time they open
the app, including after closing it from the recent apps, and when they come back to it after 30 seconds or more. Until you set up AdMob, the app shows Google's **test ads**, which is fine for testing
but earns nothing. Never tap your own real ads.

1. Create a free account at <https://admob.google.com> and add the app: Android, then **"No, it's not listed on a
   supported app store"** until TableMeet is on Google Play (link it to the Play listing later).
2. Copy the **App ID** (`ca-app-pub-…~…`) into `mobile/app.json` → `react-native-google-mobile-ads` →
   `androidAppId`, replacing Google's sample ID.
3. In the app, go to **Ad units → Add ad unit → App open**, then copy its ID (`ca-app-pub-…/…`) into
   `mobile/.env.local` as `EXPO_PUBLIC_ADMOB_APP_OPEN_ID`.
4. **Privacy & messaging → GDPR**: create and publish the consent message. Travellers from Europe are shown it
   automatically before any ad.
5. Rebuild the app (`npx expo prebuild --platform android`, then the release APK), because the App ID is native.
6. In Play Console, answer **"Contains ads: Yes"** and, under Data safety, declare **Device or other IDs** (advertising
   ID) collected by AdMob for advertising.

**Plus** has no payments yet. When someone pays you, open the admin panel → **Plus**, search them by name or email,
and tap **Give 1 month** or **Give 1 year** (giving more while they still have Plus adds it after the current end).
To open Plan my day, Hidden Gems and the Passport to everyone, run
`update public.app_settings set plus_locked = false;` in the Supabase SQL editor.

### 7. Phone notifications (Firebase, free)

The server sends notifications through Expo's free push service, which delivers them on Android through Google's
Firebase Cloud Messaging. Until the two Firebase steps below are done, the app works but phones can't get
notifications (Settings → Phone notifications says it isn't available yet).

1. Go to <https://console.firebase.google.com> → **Create a project** (any name, e.g. TableMeet; Google Analytics
   not needed).
2. **Add app → Android**, package name **`com.tablemeet.app`**, then **Download google-services.json** and put it
   in `mobile/` (next to `app.json`). It's git-ignored; `app.config.ts` picks it up automatically.
3. In Firebase: **Project settings → Service accounts → Generate new private key** (a JSON file). Keep it private.
4. Upload that key to Expo: <https://expo.dev> → your project → **Credentials → Android → com.tablemeet.app →
   FCM V1 service account key → Upload** (or run `npx eas credentials` in `mobile/`).
5. Rebuild the app (`npx expo prebuild --platform android`, then the release APK) and install it. The app asks to
   allow notifications the first time it opens.

Nothing else is needed on the server: the database (`pg_net`) posts to Expo directly when something happens.

## Website on Vercel (staff QR page, Terms, Privacy, Delete account)

Redemption QR codes open `<website>/r/<code>`, so the website must be online before coupons work.

1. On vercel.com: **Add New → Project**, import this GitHub repo, set **Root Directory** to `web`.
2. Environment variables (Production): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
   `SUPABASE_SECRET_KEY` (Supabase → Project Settings → API Keys → **Secret keys**; server only, never
   `NEXT_PUBLIC_`), and once you have them `NEXT_PUBLIC_BUSINESS_NAME` and `NEXT_PUBLIC_CONTACT_EMAIL`.
3. Deploy. Note the address (e.g. `https://tablemeet.vercel.app`) and set it as `EXPO_PUBLIC_WEB_URL` in
   `mobile/.env.local` and in the EAS environment variables (below), then rebuild the app.
4. Public pages for the store listings: `<website>/privacy` (Privacy Policy URL), `<website>/delete-account`
   (Google Play "Delete account URL"), `<website>/terms`. Add `?lang=th` for Thai.

The Terms / Privacy text lives in `mobile/src/legal/content.ts`. After editing it run `cd mobile && npm run sync:legal`
(copies it to `web/src/lib/legal-content.ts`). It is a draft: have it checked (ideally by a Thai lawyer) before launch.

## Release builds with EAS (Google Play, App Store)

Cloud builds don't see `.env.local`. Add every `EXPO_PUBLIC_*` value from `mobile/.env.example` on expo.dev →
your project → **Environment variables**, for the `preview` and `production` environments (or
`npx eas-cli@latest env:create`).

### Google Play

1. Play Console: create the app (package `com.tablemeet.app`), fill in the store listing, content rating, data safety
   (use the Privacy Policy as the guide) and the Privacy Policy / Delete account URLs above.
2. The first upload must be done by hand: `npx eas-cli@latest build --profile production --platform android`,
   download the `.aab` and upload it to **Testing → Internal testing** in Play Console.
3. For automatic uploads after that: Google Cloud → a service account with a JSON key, invited in Play Console →
   **Users and permissions** with release rights. Save the key as `mobile/google-play-service-account.json` (it's
   git-ignored; never commit it). Then:

   ```bash
   npx eas-cli@latest build --profile production --platform android --auto-submit
   # or, for an existing build:
   npx eas-cli@latest submit --profile production --platform android
   ```

   Builds go to the **internal** track as a **draft** (`eas.json`); promote them in Play Console.
4. App signing: Google Play App Signing creates a new SHA-1. Add it (Play Console → App integrity) as another
   **Android** OAuth client in Google Cloud, or Google sign-in fails in the Play build.

### iPhone / App Store (no Mac needed)

The app builds for iOS in the cloud with EAS (`ios.bundleIdentifier` `com.tablemeet.app`). Differences from Android:
**no ads** on iPhone for now (`src/lib/ads.ios.ts`, and the ads SDK is left out by `mobile/react-native.config.js`),
the Plus screen shows only "free at level 15" (Apple doesn't allow selling features outside in-app purchase), and
"Open in Maps" opens Apple Maps. Store texts, screenshots and privacy answers are in `app-store/README.md`.

1. **Apple Developer account**: sign in at developer.apple.com once and accept the latest agreement. In App Store
   Connect → **Business**, accept the Free Apps agreement (paid agreement + bank details only matter if you sell
   something later).
2. **Sign in with Apple in Supabase**: Authentication → Sign In / Providers → **Apple** → turn on, and in **Client IDs**
   put `com.tablemeet.app`. (The secret key fields are only for web sign-in; the app doesn't need them.)
3. **Google sign-in on iPhone**: Google Cloud Console → APIs & Services → Credentials → Create credentials → OAuth
   client ID → type **iOS**, bundle ID `com.tablemeet.app`. Copy its client ID (`…apps.googleusercontent.com`) and:
   - Supabase → Providers → **Google** → **Client IDs**: add it after the web client ID, comma-separated. If Google
     sign-in on the iPhone then fails with a "nonce" error, also turn on **Skip nonce checks** there.
   - EAS: `npx eas-cli@latest env:create --environment production --name EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID --value
     <the iOS client ID> --visibility plaintext` (and in `mobile/.env.local` for local builds). `app.config.ts` then
     adds the Google Sign-In plugin with the right URL scheme. Without it the iPhone app still works, with Sign in with
     Apple only.
4. **Create the app in App Store Connect**: Apps → **+** → New App → iOS, name `TableMeet`, primary language English,
   bundle ID `com.tablemeet.app` (if it isn't in the list yet, step 5 registers it; come back after), SKU
   `tablemeet-ios`, Full Access. Add **Thai** under App Information → Localizations.
5. **Build**: from `mobile/`, `npx eas-cli@latest build --profile production --platform ios`. Log in with your Apple
   ID when asked (two-factor code from your iPhone) and say **yes** to everything EAS offers: it registers the bundle
   ID with Sign in with Apple and Push, creates the distribution certificate, the provisioning profile and the push
   key (APNs) for phone notifications. The build number goes up by itself. Takes about 20–30 minutes.
6. **Revoking Sign in with Apple when an account is deleted** (Apple's rule; `supabase/functions/apple-account`):
   - developer.apple.com → Certificates, IDs & Profiles → **Keys** → **+** → name `TableMeet Sign in with Apple`, tick
     **Sign in with Apple** → Configure → primary App ID `com.tablemeet.app` (registered by step 5) → Save → Continue →
     Register → **Download** the `.p8` file (only possible once; keep it safe, never commit it). Note the **Key ID**,
     and your **Team ID** (top right, or Membership details).
   - Supabase → Edge Functions → **Secrets**: add `APPLE_TEAM_ID`, `APPLE_KEY_ID` and `APPLE_PRIVATE_KEY` (open the
     `.p8` in Notepad and paste all of it, including the BEGIN / END lines).
   - Deploy the function from the project folder: `npx supabase login`, then
     `npx supabase functions deploy apple-account --project-ref zxghiilryqzexzvacbrl --no-verify-jwt`. Redeploy after
     changing `supabase/functions/`. (`--no-verify-jwt`: the function checks the session itself.)
   - From then on, Sign in with Apple keeps a token for the account, and deleting the account (Settings, or
     /admin/users) revokes it with Apple first. If no token was kept, the iPhone asks to confirm with Apple once.
7. **Upload**: `npx eas-cli@latest submit --profile production --platform ios --latest` (pick the App Store Connect
   app from step 4). Next time you can do both at once with `build … --auto-submit`.
8. **TestFlight**: after Apple processes the build (10–30 min), App Store Connect → your app → **TestFlight**. Answer the
   export compliance question if asked (the app uses no non-exempt encryption; `ITSAppUsesNonExemptEncryption` is
   already false). Add yourself under **Internal Testing**, install the **TestFlight** app on your iPhone and install
   TableMeet from there. Test: Sign in with Apple, Google sign-in, onboarding, map, create / join a table, chat with
   photo and voice note, push notifications, check-in, Travellers nearby, and last Delete account on a test account
   signed in with Apple (afterwards it should be gone from iPhone Settings → your name → Sign in with Apple).
9. **Screenshots**: take captures on the iPhone and regenerate the framed ones (`app-store/README.md`), or use the
   ready ones in `app-store/screenshots/`.
10. **Store listing**: App Store tab → version 1.0 → paste the texts from `app-store/README.md` (English and Thai), upload
    the screenshots, pick the build, fill in **App Privacy**, **Age Rating** and the **App Review notes**, set the
    price to Free and the countries, then **Add for Review** → **Submit**. Review usually takes 1–3 days.

Known gap Apple may ask about: chats have block / report but no automatic word filter.

## Checks

```bash
cd web && npm run lint && npm run build     # admin panel
cd supabase/tests && npm install && npm test # database security rules (no Docker needed)
cd mobile && npm run typecheck && npm run lint && npm run check:legal # app (+ legal texts match the website)
```
