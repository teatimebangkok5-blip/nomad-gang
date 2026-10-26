# App Review information (Guideline 2.1 answer)

Apple asked for this on the first submission (2026-10-26). Paste the text below **both** as the reply in App Store
Connect (with the screen recording attached) **and** into App Review Information → Notes (4,000 characters max; this
text is under 4,000). Fill in the `[ ]` parts first.

```
1. SCREEN RECORDING
Attached, recorded on an iPhone [model] with iOS [version]. From launch: sign-up, map, joining a table and its chat, creating a table and a hangout, a story, reporting and blocking a user, the Plus screen (nothing is sold), account deletion.

2. PURPOSE AND AUDIENCE
TableMeet is a social dining app for Bangkok, Thailand, for adults (18+): travellers, digital nomads, expats, solo diners and locals who don't want to eat or go out alone. Meeting people in a new city is hard, and in most meetup apps the group must still work out where to go. In TableMeet, someone creates a "table" at a real café, restaurant, rooftop or bar on the map, with a day, time and group size; others join, talk in the table's group chat and meet in person. "Hangouts" and "events" work the same way for activities (parks, markets, museums, concerts) anywhere in the world.

3. HOW TO USE IT
No demo account is needed: tap "Sign in with Apple". On first start enter a name and a birthday (18+ only); the other questions can be skipped.
- Home map: opens on central Bangkok. Orange pins = tables, violet = hangouts, pink = events. Tap a pin, then its card.
- Join: on a table's screen tap Join, then Chat opens its group chat (text, photos, voice notes, reactions).
- Create a table: "Create table" → tap a café or restaurant on the map → "Choose this place" → day, time, people → Create.
- Create a hangout: "Create hangout" → tap a place or anywhere on the map → fill in the form.
- Story: camera button on home → photo + caption, shown on the map for 24 hours.
- My profile: picture at the top left. Settings: gear button on home.
- Report / block: press and hold anyone's message in any chat → Report message (then Block if wanted). On a profile, private chat or story, tap ⋮ → Report or Block. Place tips have Report too. Blocking hides both people from each other everywhere. Reports reach our admin panel; we act within 24 hours. The Terms (accepted on the welcome screen) have zero tolerance for objectionable content.
- Delete account: Settings → Delete account → confirm. Deletes the profile, messages and photos, and revokes Sign in with Apple.
- Check-in only works at the place (within 50 m by GPS) in Bangkok, so it can't be tested from abroad.
- Paid content: none. No in-app purchases, subscriptions or ads in the iPhone app. TableMeet Plus (day planner, Hidden Gems, Rewards Passport) is unlocked free by reaching level 15 through using the app.
- Optional "Get verified" (Settings): selfie + ID photo checked by hand by us, deleted as soon as we decide. It gives a badge and access to women-only tables.

4. EXTERNAL SERVICES
- Supabase: database, authentication, file storage, realtime chat (our backend)
- Sign in with Apple, Google Sign-In: login
- OpenStreetMap data and OpenFreeMap map tiles, drawn with MapLibre: maps and places
- Photon (Komoot, OpenStreetMap search): place and address search
- Expo push service via Apple Push Notification service: notifications
- Frankfurter (European Central Bank rates): approximate currency conversion in the bill splitter
- Wikimedia Commons / Wikidata: place photos (credited) and short descriptions
- Apple Maps / Google Maps: links that open directions
No AI services, payment processors, ads or analytics SDKs.

5. REGIONAL DIFFERENCES
The app works the same in all regions. Its content is focused on Bangkok (tables, partner venues, day planner, Hidden Gems), so elsewhere the map opens on Bangkok. Hangouts and events can be created anywhere in the world. Languages: English and Thai.

6. REGULATED INDUSTRY / THIRD-PARTY MATERIAL
Not a regulated industry: no payments, alcohol sales, gambling, health or financial services. Third-party material: OpenStreetMap data (ODbL; "© OpenStreetMap contributors" is shown on every map) and Wikimedia Commons photos (author and licence shown).
```

## Recording the video

Record on the iPhone itself (Control Center → Screen Recording; add it in Settings → Control Center if missing), on the
latest iOS, from the TestFlight build of the same version you submit. Keep it to about 3–5 minutes. Before recording:

- **Make sure there is something on the map.** Reviewers are outside Thailand and see central Bangkok; an empty map
  looks broken. From the Android phone (a second account), create 2–3 tables a few days ahead (they stay open up to
  7 days) and a hangout, and keep some open for the whole review.
- Delete any old account on the iPhone first, so the recording shows a **new** sign-up.
- The second account is "the other person" for joining, chatting, reporting and blocking. Don't show real people's
  names or photos.

Order:

1. Home screen → tap the TableMeet icon (the recording must start at launch).
2. Welcome → Sign in with Apple → name + birthday → skip the rest → home map.
3. Pan the map, tap a filter chip, tap a pin → card → table screen → **Join** → **Chat** → send a message and a photo.
4. Back → **Create table** → pick a restaurant → time → Create. Then **Create hangout** → tap the map → Create.
5. Camera button → post a story.
6. In the table chat, press and hold a message from the second account → **Report message** → Harassment → **Block**
   → confirm. Also show ⋮ → Report / Block on a profile or story.
7. Settings → TableMeet Plus row → show "Free at level 15" (nothing to buy).
8. Settings → **Delete account** → confirm → back on the welcome screen.

Attach the video to the reply in App Store Connect. If the file is too big, upload it to Google Drive or YouTube
(unlisted) and paste the link instead.
