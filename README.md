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

### 2. Phone verification (SMS)

1. In Supabase, **Authentication → Sign In / Providers → Phone**: turn it on and connect an SMS provider such as
   Twilio (it delivers to Thai numbers; you pay per message).
2. For testing without paying for SMS, add a **test phone number and code** on the same page, e.g.
   `66812345678=123456`. Typing `081 234 5678` in the app then accepts the code `123456`.

### 3. Google Maps (home map and "Create table")

1. In the same Google Cloud project: **APIs & Services → Library → Maps SDK for Android → Enable**. Google asks
   for a billing account; maps in mobile apps are free, but a card must be on file.
2. **Credentials → Create credentials → API key**. Edit it: **Application restrictions → Android apps → Add**:
   package `com.tablemeet.app`, SHA-1 `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25` (the test
   signing key). **API restrictions → Maps SDK for Android.** Save.
3. Add it to `mobile/.env.local` as `GOOGLE_MAPS_API_KEY=...` (no `EXPO_PUBLIC_` prefix) and rebuild the app.
   Without a key the app shows "Map not set up yet" where the map goes.

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

## Checks

```bash
cd web && npm run lint && npm run build     # admin panel
cd supabase/tests && npm install && npm test # database security rules (no Docker needed)
cd mobile && npm run typecheck && npm run lint # Android app
```
