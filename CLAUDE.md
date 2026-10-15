# CLAUDE.md

This file guides Claude Code when working in this repository.

## Project status
Product spec and tech stack below are agreed. Built so far:
- **Done:** database for venues, deals, coupon codes, venue staff logins and the admin role (`supabase/`), the
  admin panel for managing them (`web/`), and the Android app's welcome/Google sign-in, phone verification and
  home screen of nearby venues (`mobile/`).
- **Not started:** venue detail screen, meetups, check-ins, QR codes and redemptions, staff QR page, redemption feed
  and push notifications, app user profiles (Instagram handle), app user management in the admin panel.
- **Never run on a real device or a real Supabase project yet.** Everything is checked by typecheck, lint, builds
  and the PGlite database tests only.

Setup steps (Supabase, Google, SMS, Android development build) are in `README.md`.

## What TableMeet is
A social dining app. People who want to eat or drink together (travelers, nomads, locals, solo diners) find each other and
meet up at a table. It is inspired by NomadTable but is **not a copy**. Don't copy its branding, copy text or design.

### Key difference from NomadTable
- In NomadTable, the group has to work out *where* to meet by itself.
- In TableMeet, the app **suggests nearby venues** (cafes, restaurants, rooftops, bars) based on the user's location,
  so picking a place is part of the flow.

### Platform and market
- **Android first**, then **iPhone later** from the same code base. Build Android features now, but don't use anything
  Android-only that would block the iPhone version.
- **Launch city: Bangkok, Thailand.** Prices and discounts are in Thai Baht (THB), and times use Asia/Bangkok (UTC+7).
- **Languages: Thai and English.** All user-facing text goes through translation files from the start (no hard-coded
  strings). Venue names and deal descriptions need both a Thai and an English version.

### Accounts and profiles
- **Sign in with Google** (Android), then **verify a phone number** with a one-time SMS code. A user can't join meetups
  or check in until their phone number is verified.
- When the iPhone version is built, add **Sign in with Apple** there (App Store rules expect a privacy-friendly option
  like it when Google sign-in is offered). The phone verification step stays the same on both.
- Users can **add their Instagram** to their profile so others in a meetup can see who they're meeting. They type their
  @handle and the app shows a link to their Instagram profile. No Instagram login or Meta API is needed.

### Partner venues and coupons (core business model)
- The founder makes deals in person with venue owners, who give **exclusive coupon codes / discounts for TableMeet users**.
- Each partner venue has its own discount, set by the owner (e.g. % off or a fixed deal). Treat the discount as per-venue
  data, not a single global value.
- **Only partner venues are listed.** The founder adds and manages the venue list in the admin panel; there is no
  third-party places data (no Google Places / Foursquare). Every venue in the app has a deal.
- **Rule: at least 3 people must be checked in at the venue to unlock a coupon.** Joining the meetup in the app is not
  enough. Groups of 1–2 can still meet but get no discount. Enforce this on the server/backend, not only in the UI.

### Coupon redemption (anti-misuse)
1. **Location check-in**: the app watches the phone's GPS. The **Check in button appears only once the member is at
   the venue** (within **50 m**). When they tap it, the server checks the location again (also 50 m) and that the meetup
   is happening now. Never trust the phone's check alone.
2. When **3 or more members are checked in**, the server issues a **QR code that expires 15 minutes** after it is issued.
3. **Venue staff scan the QR with their phone camera.** The QR holds a link to a TableMeet web page. No staff app is
   needed.
4. **Venue login first.** The page asks for that venue's **login ID and password** before showing anything. The
   founder creates a separate login for each venue in the admin panel. The login must belong to the **same venue as the
   QR**; another venue's login is rejected.
5. After a valid login, the page shows the **coupon code** for the venue's deal and staff apply the discount.
6. Only then does it **count as a redemption**: the server marks the QR as used and **notifies the founder in the admin
   panel** right away, showing the venue, the group (members) and the time.
   The founder uses these records to see which venues people actually visit and to **settle up with each venue owner**.
- QR codes must be created and checked on the server (random tokens stored server-side), never generated only on the
  phone. A code works once; opening it again or after 15 minutes shows an "expired / already used" page.
- Users scanning their own QR see only the login page, so they can't see the coupon or use up the code.
- Store venue passwords hashed. Rate-limit login attempts. Keep staff signed in on their phone so they don't need to log
  in for every scan.

### Admin panel (web)
- A website only the founder can sign in to, with **full control of the app**: venues and their deals (Thai + English
  text, photos, location, 50 m check-in point), **venue staff logins** (create, reset password, disable), meetups, users
  (view, block), check-ins and redemptions.
- **Redemption feed**: live notifications whenever a QR is scanned, plus a history that can be filtered by venue and
  date, so the founder can count visits per venue when settling with owners.
- **Founder phone notification**: every time staff complete a scan (scan + correct venue login), the founder also gets
  a notification **on their phone**, even when the admin panel isn't open. It shows the venue, the number of people
  checked in, and the time. This is how the founder confirms people really showed up.
  **Channel: web push from the admin panel.** The admin panel is a PWA the founder adds to their phone's home screen
  (works on Android; on iPhone it needs iOS 16.4+). No LINE, Telegram or email needed.
- **Changes show up in the app quickly, without a new app store release.** The app loads all venue, deal and
  other content from the backend instead of building it into the app, and listens for live updates where it matters.

### Core user flow (high level)
1. User opens the app and sees nearby partner venues (cafes, restaurants, rooftops, bars) in Bangkok with their deals.
2. User creates or joins a meetup (venue + time) and other people join.
3. At the venue, GPS confirms each member is there and shows them a Check in button, which they tap.
4. Once ≥ 3 members are checked in, the group gets a 15-minute QR code.
5. Staff scan the QR with their phone camera, log in with their venue's ID and password, see the coupon code, and
   apply the discount.
6. The founder sees the redemption in the admin panel.

### Domain terms
- **Venue / partner venue**: a cafe, restaurant, rooftop or bar that has a TableMeet deal. Added by hand by the founder.
- **Coupon / deal**: the discount a venue gives; each venue has its own.
- **Meetup / table**: a planned gathering at a venue and time that users join.
- **Check-in**: a member confirming, by phone location, that they are at the venue.
- **Redemption QR**: a single-use code valid for 15 minutes, issued once ≥ 3 members are checked in; scanned by staff.
- **Venue login**: the login ID and password the founder gives each venue; staff use it to open the coupon code.
- **Redemption**: a QR scanned and opened with the right venue login. It is recorded with the venue, group and time, and shown to the founder in the admin
  panel.

## Tech stack
The founder develops on **Windows with no Mac**, so nothing may depend on Xcode or a local macOS build.
All code is **TypeScript**.

| Part | Choice |
|---|---|
| Mobile app | **React Native with Expo** (Expo Router). **Android first**: test on the Android Studio emulator or a real Android phone with an EAS development build (Expo Go can't do Google sign-in). Build and submit to Google Play with **EAS Build / EAS Submit**. The iPhone version comes later from the same code, built in the cloud with EAS (no Mac needed). |
| Backend | **Supabase**: Postgres + **PostGIS**, Auth, Realtime, Storage (venue photos), Edge Functions. Use the Singapore region (closest to Bangkok). |
| Admin panel + staff QR page | One **Next.js** web app, hosted on **Vercel**. The admin panel is a PWA with **web push** for the founder's scan notifications. |
| Translations | **i18next** (react-i18next) with Thai and English files, shared by the app and the web. |

How the key rules map onto this:
- **Sign-in**: Supabase Auth with Google sign-in (Apple added with the iPhone version), then phone verification by SMS
  OTP (Supabase phone auth with an SMS provider such as Twilio that delivers to Thai numbers).
- **50 m check-in**: the app uses expo-location to show the button; the server re-checks with PostGIS
  (`ST_DWithin`) inside a database function or Edge Function.
- **QR / redemption**: QR tokens are created, expired (15 min) and marked used only on the server. Venue logins are a
  separate account type from app users, managed from the admin panel.
- **Security**: Row Level Security on every table. The service-role key is used only in Edge Functions and the
  Next.js server, never in the mobile app or the browser.
- **Live updates**: the app reads venues and deals from Supabase and subscribes with Realtime, so admin changes appear
  without an app store release. The admin redemption feed uses Realtime too.
- Accounts needed: a **Google Play Console** developer account (one-time $25). New personal Play accounts must run a
  closed test with testers before going public; check Google's current rules. Later, for iPhone: an **Apple
  Developer account** ($99/year).

## Project layout
- `mobile/`: Expo SDK 57 app (Android first, iPhone later), Expo Router with routes in `src/app/`.
  - `src/app/_layout.tsx`: `Stack.Protected` guards. Signed out → `welcome`. Signed in without a verified phone →
    `verify-phone`. Verified → `index` (home). Screens never navigate after sign-in; changing auth state moves them.
  - `src/lib/auth.tsx`: `AuthProvider`/`useAuth`, Google sign-in (`@react-native-google-signin/google-signin`, free
    "original" API → `supabase.auth.signInWithIdToken`) and sign-out. Phone verification uses
    `updateUser({ phone })` + `verifyOtp({ type: 'phone_change' })`. `src/lib/phone.ts` turns input into E.164
    (Thai by default, `+` for foreign numbers).
  - `src/lib/venues.ts`: `useVenues()` loads venues + their active deal (RLS does the filtering), refetches on
    Realtime changes and when the app returns to the foreground. Realtime can't deliver a venue being *hidden*.
  - `src/lib/location.ts`: foreground location permission and haversine distance (display only; the 50 m check-in
    rule must be enforced on the server).
  - `src/i18n/`: i18next with `en.ts` (source, typed keys) and `th.ts` (must match). `localized(row, 'name', lang)`
    picks `name_th`/`name_en` columns. The language choice is saved on the phone; the default follows the phone language.
  - `src/components/`: `Button`, `Icon` (expo-symbols: Material names on Android, SF Symbols for iOS; add new icons
    to the map), `LanguageToggle`, `VenueCard`, `CategoryFilter`. Colors etc. in `src/constants/theme.ts` match the
    admin panel.
  - `src/lib/supabase.ts`: client with expo-sqlite `localStorage` session storage. Env vars are `EXPO_PUBLIC_*`
    (see `mobile/.env.example`) and are baked into the app, so never put secrets there.
  - The Google Sign-In config plugin is deliberately **not** in `app.json`: without Firebase it only configures iOS
    and throws without `iosUrlScheme`. Add it (with `iosUrlScheme`) when building for iPhone.
- `web/`: Next.js admin panel (`src/app/admin/`) and, later, the staff QR coupon page.
  - `src/lib/auth.ts`: `requireAdmin()`. Call it at the top of **every** admin page and Server Action. It returns a
    Supabase client acting as the founder.
  - `src/lib/supabase/server.ts` / `browser.ts`: Supabase clients. `src/proxy.ts` refreshes the session and sends
    signed-out visitors to `/admin/login` (Next 16 renamed middleware to proxy).
  - `src/components/form.tsx`: shared `Field`, `FormMessage`, `SubmitButton` and `buttonClass`. Admin forms use
    Server Actions with `useActionState` and return a `FormState`. Return errors instead of throwing, because
    thrown messages are hidden in production.
  - `src/lib/types.ts`: hand-written row types. Replace with generated Supabase types once a project is linked.
- `supabase/migrations/`: SQL migrations, applied in filename order. `supabase/tests/rls.test.mjs` applies them to
  PGlite (in-memory Postgres with PostGIS and pgcrypto) with a stand-in for Supabase roles and checks the security
  rules. Add a check there for every new table, policy or function.

## Database conventions
- RLS is on for every table. Admin checks use `(select public.is_admin())`. The founder is a Supabase Auth user listed
  in `public.admins`.
- Secrets live in their own tables that app users can't read: `deal_coupons` (coupon codes) and
  `venue_account_secrets` (bcrypt hashes via pgcrypto).
- Venue staff logins are **not** Supabase Auth users. They are `venue_accounts` rows checked by
  `verify_venue_login()`, which only `service_role` may call. It locks a login for 15 minutes after 5 wrong
  passwords.
- Multi-step writes go in one SQL function so they succeed or fail together, e.g. `admin_save_deal`.
- `venues.lat`/`lng` are the source of truth. A trigger keeps the PostGIS `location` column in sync for distance
  checks.
- Use the `extensions.` prefix for PostGIS/pgcrypto functions and set `search_path = ''` on every function.

## Commands
```bash
# admin panel (needs web/.env.local, see web/.env.example)
cd web && npm run dev          # http://localhost:3000
cd web && npm run lint
cd web && npm run build        # also runs the TypeScript check

# database security tests (no Docker or Supabase needed)
cd supabase/tests && npm install && npm test

# Android app (needs mobile/.env.local, see mobile/.env.example)
cd mobile && npm run typecheck
cd mobile && npm run lint
cd mobile && npx expo export --platform android --output-dir <tmp>   # full bundle check without a device
cd mobile && npx expo start                                          # dev server for the installed development build
cd mobile && npx expo install <package>                              # always use this, not npm install, for app deps
```
Node is at `C:\Program Files\nodejs`. If `node` isn't found in Bash, run `export PATH="$PATH:/c/Program Files/nodejs"`
first. Android Studio is installed: `ANDROID_HOME` = `%LOCALAPPDATA%\Android\Sdk`, `JAVA_HOME` = Android Studio's
`jbr`, and the emulator `Medium_Phone_API_37.0` exists. `cd mobile && npx expo run:android` builds the development
build locally and installs it on the running emulator (or a USB-connected phone). EAS cloud builds also work.

## Working in this repo
- `web/` uses **Next.js 16** with Cache Components on. Read the docs in `web/node_modules/next/dist/docs/` before
  using unfamiliar APIs (see `web/AGENTS.md`). Pages that read cookies or data must sit behind a Suspense boundary
  (`loading.tsx` in `admin/(panel)/` does this). Don't read the session at the top of a layout.
- `mobile/` uses **Expo SDK 57**, which is newer than most training data. Follow `mobile/AGENTS.md` and check
  https://docs.expo.dev before using Expo/React Native APIs. Lint enforces React Compiler rules: no synchronous
  `setState` in effects (do async work in a plain function and set state in its `.then`).
- The admin panel UI is English-only (founder-facing). Everything app users or venue staff see must be Thai + English.
- The `app-builder` agent (`.claude/agents/app-builder.md`) is set up for building features, pages and UI.
- Keep this file updated as features are built.
