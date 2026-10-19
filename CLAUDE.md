# CLAUDE.md

This file guides Claude Code when working in this repository.

## Project status
Product spec and tech stack below are agreed. Built so far:
- **Done:** database for venues, deals, coupon codes, venue staff logins and the admin role (`supabase/`), the
  admin panel for managing them (`web/`), and the Android app's welcome/Google sign-in, phone verification, home
  (**full-screen map** of the open tables and hangouts people created (👥 / 🙌 pins, also at partner venues) and
  Bangkok food place icons; **no partner venue pins and no Discount/Offer/Event/Party buttons on home** (founder,
  2026-10-16: those are on the Create table map). My profile (avatar, top left), logo, language, Travellers,
  settings and the search bar float on top over a fade, then a row with Plan my day / Gems / Passport and the feed
  filter chips; List and Messages, the tapped pin's pop-up card(s), "Create table" and "Create hangout" float at the
  bottom; "List" slides up the open tables and hangouts; no cards row since the 2026-10-18 redesign), the Create
  table flow and the table screen (join / leave / cancel) (`mobile/`). `VenueMap` takes `fullScreen` + `mapPadding`
  (measured overlay heights) so centering and the map attribution stay clear of the floating UI.
  There is no place-type (cafe/restaurant/rooftop/bar) filter any more (removed 2026-10-16 at the founder's request);
  tapping a 👥 / 🙌 pin opens its pop-up card(s) (tap a card → table screen); tapping a place dot opens the **place
  sheet** (photo for partner venues, Open in Maps → the phone's maps app via a `geo:` link, website, partner offers,
  what's happening there, "Create table here", ♥). Admin: per-venue **Promotions** editor and **Find the place on the map** (server action
  `searchPlaces` → RPC `search_places`).
- **Chat and Travellers** (added 2026-10-16): table group chat for members (`src/app/table-chat/[id].tsx`), a
  **Travellers** screen (top-right button on the map, `src/app/travellers.tsx`) with Nearby (opt-in, people within
  5 km as fuzzy violet dots + list) and Messages (inbox) tabs, and direct messages (`src/app/dm/[userId].tsx`).
  Shared UI: `src/components/chat-view.tsx`; data: `src/lib/chat.ts`, `src/lib/travellers.ts`; Block/Report menu:
  `src/lib/safety-menu.ts`. Settings has a "Show me to travellers nearby" switch.
  Rules (database, `*_chat_and_travellers.sql`): visibility is **opt-in** (`profiles.discoverable`; off deletes the
  location); exact locations are never returned (`user_locations` has no API access); dots are moved 150–400 m in a
  direction fixed per person per day; distances rounded to 0.5 km; locations older than 2 h are ignored; you must be
  visible to see others. A first DM is a **request** (one message until the receiver replies or accepts); blocking
  hides both ways; reports are readable only by admins. Sending DMs needs a verified phone or an allowed guest.
- **Hangouts** (added 2026-10-16): groups that meet to do something (park walk, market, museum, event) anywhere in
  Bangkok. Home has a violet **"Create hangout"** button next to "Create table" (List is now an icon button). It opens
  `src/app/create-hangout.tsx`: step 1 is a **full-screen Hangout map** (violet dots = OSM hangout places, partner
  hangout venues with Tickets/Free entry/Event/Party filter buttons, 🙌 pins for open hangouts, **tap anywhere to drop
  a pin**), step 2 the form (title required, description ≤ 500, meeting-point name for a dropped pin, 14 days of day
  chips, 30-min slots, length 1–12 h, 2–30 people). Open hangouts also show on home (🙌 pins open a pop-up card;
  a day hangout's pin also draws its route). Hangouts are `meetups` with `kind = 'hangout'`, so `table/[id].tsx` (adapts its
  wording), join/leave/cancel and the group chat are shared. Create table step 1 is now a full-screen map too.
  Shared full-screen-map UI: `MapHeader` (`src/components/map-header.tsx`) and `SlideUpPanel`
  (`src/components/slide-up-panel.tsx`). `VenueMap` also takes `onMapPress`.
  Admin: **"Add hangout venue"** (`/admin/venues/new?for=hangout`), venues listed as Food & drink / Hangout, and
  promotion kinds **Ticket discount** and **Free entry**.
  **Buy tickets / Official website** (added 2026-10-16, `*_ticket_links.sql`): the founder can paste an official
  ticket page on a venue (`venues.ticket_url`) or on one event/ticket/party/free-entry promotion
  (`deals.ticket_url`, `admin_save_promotion(…, p_ticket_url)`); the Hangout place card and the hangout screen show
  **Buy tickets** only where one is set (`ticketLink()` in `src/lib/links.ts`: a promotion's link first, then the
  venue's). Places without one show **Official website** if OpenStreetMap has one (`places.website`, 168 hangout
  places, seeded by `*_seed_hangout_place_websites.sql`; plain http links were skipped). Not from Google Maps: that
  needs the paid Places API. All these links must be **https** (database checks + `openLink()`).
  All 168 OSM websites were opened and checked by hand (`*_fix_place_websites.sql`): 48 removed (dead, hijacked by
  gambling sites, YouTube/Wikipedia/Facebook/Linktree, directories, wrong place), 10 corrected; 120 remain.
  **Tickets / Free entry buttons** (`*_place_entry.sql`): `places.entry` / `venues.entry` = `ticket`, `free` or
  `free_thai` (free for Thai citizens, foreigners pay), null = unconfirmed (shown on the map, under neither button).
  Set by type (malls, markets, parks/gardens, monuments and **temples** free; zoos, aquariums, theme/water parks,
  cinemas, theatres, escape rooms, arcades, ice rinks ticketed), then OSM `fee` tags, then ~60 well-known places
  checked against official and published fees (only the group is stored, not prices): the 8 famous temples that charge
  foreigners are `free_thai`, Wat Hua Lamphong is null (fee not confirmed). Galleries and most museums stay null
  (founder's decision: unconfirmed places are left out of both buttons). `free_thai` shows under **Free entry in Thai** and **Tickets in English** (`entryFilter()` in
  `src/lib/places.ts`); `places_in_bounds(…, p_entry)` filters on the server. Venues: founder sets Entry in the admin
  panel, else the linked place's. Event / Party buttons work as before. The place card shows the entry line.
- **Map search** (added 2026-10-16): a search bar on every map (home, Create table, Hangout map) finds that map's
  partner venues (matched in the app), places (food or hangout) and Bangkok **areas** (`public.areas`: 69 districts,
  344 subdistricts, 879 neighbourhoods, 358 main roads from OSM, seeded by `*_seed_bangkok_areas.sql`; a road sits at
  its segment nearest Siam) via RPC `search_map(query, purpose)`. Picking a result moves the camera (`VenueMap` prop
  `focus`) and opens the place's card; areas only move the map. UI: `src/components/map-search.tsx` (`MapSearchBar` in
  the header, `MapSearchResults` rendered at the screen's top level because Android ignores touches outside a parent's
  bounds), hook `useMapSearch` in `src/lib/map-search.ts`. Place icons for the map and results: `src/lib/place-icons.ts`.
- **Profiles, follows, feedback** (added 2026-10-16, `*_profiles_follows_feedback.sql`): `src/app/profile/[userId].tsx`
  (open by tapping a person in a table/hangout or Travellers nearby; Settings → My profile) shows name, Instagram link
  (`profiles.instagram`, set via `update_my_profile`, links/@ are cleaned to a handle), Followers / Following, tables
  and hangouts attended (ended, not cancelled), 👍 / 👎 totals, and Follow; Block/Report menu. **Follows** are one-way
  like Instagram (`follows`, `follow_user` / `unfollow_user`; mutual = friends; blocking removes them); Travellers
  nearby has a Follow button per person. **Feedback**: after a table or hangout ends (not cancelled, for 14 days)
  members give each other 👍 or 👎 on the table screen (`member_feedback`, `give_feedback(meetup, user, 1|-1|0)`);
  who gave what is private, `get_profile` returns totals. Any signed-in user can open a profile except across a
  block. Data: `src/lib/profiles.ts`.
- **Profile photos** (added 2026-10-16, `*_profile_photos.sql`): a profile picture (`profiles.avatar_path`, shown on
  the profile, the home profile button and table member lists) and up to 3 "best photos" (`profiles.photo_paths`)
  under the Instagram link; saved via `update_my_photos` (paths must be in the caller's own folder). Files: public
  `profile-photos` bucket, `<user id>/…` with random names; storage policies let people list / add / replace / delete
  only their own folder. App: `src/lib/photos.ts` (expo-image-picker with cropping → expo-image-manipulator resize
  512 / 1080 px, JPEG 0.8 → upload). The image-picker plugin in `app.json` blocks the camera and microphone
  permissions (library only); `npx expo prebuild --platform android` was run for it (debug key SHA-1 unchanged).
- **Glossy 3D style** (2026-10-16): `src/components/glossy.tsx` — `GlossyFill` (surface gradient + shine),
  `Shine` (`onColor` for orange / violet / pink fills), `GlossyView` / `GlossyPressable`, and our own
  `InstagramBadge` (Instagram's real logo may not be altered). Tokens `surfaceGradient`, `shine` in both themes and
  `Raised` / `RaisedSmall` shadows in `src/constants/theme.ts`. Used on buttons, chips, filter buttons, cards, the
  search bar, round header buttons, place cards, settings groups, member / traveller rows and profile boxes. New
  boxes should follow the same pattern (container with borderRadius + `overflow: 'hidden'` + Raised, `<GlossyFill />`
  as first child).
- **Day planner / itinerary** (added 2026-10-16, `*_day_planner.sql`, `*_seed_place_details.sql`, `*_seed_transit.sql`):
  "Plan my day" button under the home search bar (violet → pink gradient, 52 dp, bigger than the round header buttons,
  ⭐ badge on its top-right corner) → `src/app/plan-day.tsx`: start (my location, 9 well-known areas or a
  search result), day (14 days), from/until typed as HH:MM (`parseClock()` in `bangkok-time.ts`; 1–12 h), interests (temples, sights, markets, malls, museums, parks,
  family & fun), lunch/dinner and an evening bar, Entry: Free entry and/or Tickets (both = any place, also
  unconfirmed; one = `entryFilter()` groups), and getting around: any 1–3 of Walk / Taxi / BTS-MRT
  (`day_plans.travel_modes`; `travel()` picks per trip: < 900 m or ≤ 20 min walks if walking is picked, else the train
  unless much slower than a taxi). The plan is **rule-based, no
  AI or paid services**: `buildPlan()` / `retime()` in `src/lib/planner.ts` (pure functions) pick from
  `plan_candidates` (hangout places of those kinds near the start, best-known first by `places.prominence`) plus
  partner hangout venues, meals from partner food venues within 800 m else `plan_food_near`. Train legs use
  `transit_stations` / `transit_lines` (BTS Sukhumvit/Silom/Gold, MRT Blue/Purple/Yellow/Pink, ARL, SRT Dark Red;
  184 stations; station names English; Silom's order is hand-written because OSM's route lists 3 stops), one change
  max, else taxi. Places got Wikidata descriptions, a Wikimedia Commons photo + credit (credit must stay visible),
  OSM opening hours and a prominence score (2,094 places). Results: map with numbered route + timeline
  (`PlanView`, `PlanTimeline`, `MakeHangoutBox` in `src/components/`); remove stops, Shuffle, Share as text, Save
  (`day_plans`, owner only) and **Make it a day hangout** (`create_plan_hangout(plan, people)`: a hangout at the first
  stop for the plan's hours, stops listed in the description; once per plan). Saved plans: "My plans" on the
  planner → `src/app/plan/[id].tsx` (share, make hangout / open it, delete). A day hangout links to its plan from
  `table/[id].tsx` (route map under the details, timeline at the bottom); on home, tapping a day hangout's 🙌 pin
  opens its card with the plan and draws the route (`VenueMap` props `route` + `routeStops`; the map fits a route
  whenever it changes). A plan that became a hangout is readable by everyone signed in. Data: `src/lib/plans.ts`
  (`usePlansForMeetups` for home).
- **Notifications** (added 2026-10-16, `*_notifications.sql`): bell next to Travellers on home (pink count badge) →
  `src/app/notifications.tsx`. In-app only (no phone push yet). RPC `my_notifications(limit)` builds the list on the
  server from existing data, so nothing is written per event and blocks always apply: new tables / hangouts by
  others (open, 7 days), people joining mine (14 d), latest chat message per table/hangout I'm in and latest DM per
  conversation from the other person (14 d; `dm_request` while pending), new followers (30 d), new promotions at
  active venues that haven't ended (30 d). Unread = newer than `notification_state.seen_at` (no API access), set by
  `mark_notifications_seen()` when the page opens. App: `useNotifications()` in `src/lib/notifications.ts` (focus,
  foreground, every 2 min, and Realtime inserts on meetups / members / messages / deals). Tapping opens the table,
  chat, DM, profile, or for a deal `create-table` / `create-hangout` with `venueId` (create-hangout now takes it).
- **Hangouts anywhere in the world** (added 2026-10-17, `*_world_hangouts.sql`; **tables stay Bangkok-only**).
  World places are **not stored**: the Hangout map draws them straight from OpenFreeMap's vector tiles (OpenStreetMap
  layer `poi`, `VectorSource` + `worldPlaces` prop on `VenueMap`), outside the Bangkok box only (Bangkok keeps its
  database places). Founder's filter: sights & culture, parks & nature, shopping & markets, fun & entertainment
  (`WORLD_SUBCLASS_KIND` in `src/lib/places.ts`), plus **well-known religious places only** = name in ≥ 8 of 14
  languages (`WORLD_FAMOUS_*`). Hidden while Tickets / Free entry is on (entry unknown). Tapping one opens the place
  card (`Place.world`); a hangout there, or at a dropped pin anywhere, is a **spot** hangout with the place's name.
  `meetups.time_zone` (IANA): `Asia/Bangkok` for tables / venues / places; for spots the app looks it up offline
  (`zoneAt()` via `@photostructure/tz-lookup`) and `create_hangout(…, p_time_zone)` checks it against
  `pg_timezone_names` (`invalid_time_zone`). Times show in the place's local time: the helpers in
  `bangkok-time.ts` take an optional `zone` (default Bangkok; others via Intl), with "Local time at this place (UTC+2)"
  where it differs from the phone. Chat / message times use the phone's zone. **Search**: home and the Hangout map
  also query **Photon** (photon.komoot.io, free OSM search, no key) after the Bangkok results (`type: 'world'` in
  `useMapSearch(…, { near })`); create-table and the planner stay Bangkok-only. Home's List shows
  tables / hangouts within 50 km of me (or central Bangkok); the map pins all of them. `my_notifications(limit, lat,
  lng)`: new tables / hangouts only within 50 km of that point (Bangkok box without one). Day planner, partner venues,
  promotions and areas are still Bangkok-only.
- **Messages + group chats** (added 2026-10-17, `*_messages_and_groups.sql`): a Messages button (chat icon, pink
  badge = chats with unread messages) next to List on home → `src/app/messages.tsx`: one inbox (RPC `my_chats()`) of
  private chats, group chats and table / hangout chats, filter chips, press-and-hold to delete / leave. Travellers is
  now Nearby only. Read / hidden state per person and chat in `chat_state` (no API access; `mark_chat_read`,
  `leave_chat`; `useMarkChatRead` in every chat screen). Rules: table / hangout chats stay after the meetup ends or
  is cancelled (members can still write) until the member leaves the chat, which is only allowed once it has ended
  (`meetup_not_ended`); then they can't read or write it (`in_meetup_chat`). "Delete chat" on a private chat hides
  it for me only; a new message brings it back with only the newer messages (RLS on `direct_messages`).
  **Group chats** (`chat_groups`, `chat_group_members`, `chat_group_messages`; `src/app/new-group.tsx`,
  `group/[id].tsx`, `group-info/[id].tsx`): name + emoji, up to 100 people, **friends only** (mutual follows,
  `my_friends()` / `are_friends`), any member adds their own friends, only the owner removes people and renames; the
  owner role passes to the longest member when the owner leaves; the last one out deletes the group; new members
  see messages from when they joined; blocked senders are hidden. The bell no longer lists chat / private messages
  (message requests stay). Data: `src/lib/messages.ts`.
- **Travel deals = host reward** (added 2026-10-17, `*_travel_deals.sql`; founder: no affiliate programs yet, Awin
  account exists for later). When a table / hangout ends, not cancelled, with **at least 4 people**, **only its host**
  unlocks travel deals for that city: `my_rewards()` returns the host's qualifying meetups with up to 8 active deals
  (city within `radius_km`, then country, then everywhere). Deals are `travel_deals` (admins only; brand,
  category activity/hotel/flight/cruise/other, title/details EN+TH, coupon code and/or https link, scope, dates)
  added in the admin panel at **/admin/travel-deals** (city found on the map with Photon when saved). Users never
  read the table directly. "Didn't work?" → `report_travel_deal` (hidden for the reporter at once, for everyone at 3
  reports until the founder clears them). The app also shows "Find more deals in {city}" buttons to official
  search pages (Klook, GetYourGuide, Agoda, Booking.com, Google Flights; `cityDealLinks()` in `src/lib/rewards.ts`;
  swap for Awin affiliate links later). `meetups.city` / `country_code`: Bangkok by trigger; for spots outside
  Bangkok the app looks them up with Photon reverse (`areaAt`) and saves them with `set_meetup_area` (host, once).
  UI: `RewardCard` (`src/components/reward-card.tsx`, copy code via expo-clipboard) on the table screen for the host,
  "My rewards" (`src/app/rewards.tsx`, from Settings and a 🎁 `reward` bell notification); hosts see a "Host bonus"
  hint before it ends.
- **Profile details, first-time questions, trips, favourites** (added 2026-10-17, `*_profile_details.sql`).
  **First-time questions** (`src/app/onboarding.tsx`, guard in `_layout.tsx` via `OnboardingProvider` in
  `src/lib/onboarding.tsx`): name + **birthday, required, 18+** (founder), then From country, languages, profession,
  travel style, interests (max 15), Instagram, each skippable; saved at the end with `save_my_profile(…)` (errors
  `too_young`, `birth_date_required`, …). Done = a birthday is saved; existing users are asked on their next start. The
  birthday is private (`profile_private`, no API access); profiles show only the age. About columns on `profiles`
  (`home_country` ISO code, `languages` ISO 639 or `other`, `profession`, `travel_style`, `interests` = keys translated
  in `about.professions/styles/interestNames`, `world_clocks` IANA zones ≤ 6 via `set_my_world_clocks`,
  `visited_countries` via `set_my_visited_countries`), with check constraints because profiles can still be updated
  directly. Option lists: `src/lib/profile-options.ts`; countries + languages with English/Thai names are generated
  into `src/lib/countries.ts` by `mobile/scripts/gen-countries.mjs` (Node CLDR data). **Profile page** redesigned:
  name + age, "From 🇮🇳 India", stat boxes World % (visited / 195), Upcoming trips, Countries, **Friends** (mutual
  follows, replaces Followers / Following; tap → `src/app/friends/[userId].tsx`, RPC `user_friends`), Met up,
  👍 / 👎; own profile: Edit (→ `src/app/edit-profile.tsx`), Story (9:16 share image, `src/components/story-card.tsx`,
  react-native-view-shot + expo-sharing), Favorites, Settings, View public profile (`?preview=1`); tabs About /
  Travel / Trips / Events (`src/components/profile-tabs.tsx`, world clocks `src/components/world-clocks.tsx`).
  **Trips** (`trips`, readable except across a block, `save_trip` / `delete_trip`, max 50; city from Photon in
  `src/app/trip-form.tsx`). **Events** = `profile_meetups(user)` (open, not cancelled; upcoming + ended).
  **Favourites** (`favorite_places`, private, a place or a partner venue): heart on the place cards of home and the
  Hangout map (`FavoriteButton`), list in `src/app/favorites.tsx` (Create table / Create hangout there — create-hangout
  now also takes `placeId` — or Open in Maps). Shared form pieces: `src/components/profile-fields.tsx` (chips, search
  picker, `@expo/ui` date picker dialog) and `profile-form.tsx`.
- **Chat photos, voice notes, live location** (added 2026-10-17, `*_chat_media.sql`): a **+** button in every chat's
  composer (table / hangout, private, group) → Take photo, Photo from gallery, Voice note (expo-audio, ≤ 2 min, m4a),
  Share live location (15 min / 1 h / 8 h). Message tables have `kind` (text/photo/voice/location), `media_path`,
  `duration_ms`, `lat/lng`, `live_until`, `location_updated_at`; direct inserts stay text-only, the rest goes through
  `send_chat_attachment`. Files: private `chat-media` bucket at `<chat kind>/<chat id>/<sender id>/<file>`, opened with
  signed links; storage policies use `chat_file_access(name, write)`. Private chats: attachments only once the
  request is accepted. **Live location only updates while the app is open** (founder: no background location, so no
  Play declaration): `useLiveLocationSharing` in the root layout (`src/lib/live-location.ts`) watches the position
  and calls `update_live_location`; `stop_live_location`, `my_live_locations`. Full-screen map:
  `src/app/live-location.tsx`. Other people's messages show their **profile picture** (tap → profile). Bubbles:
  `src/components/chat-bubbles.tsx`; upload / signed links: `src/lib/chat-media.ts`. `my_chats` returns `last_kind`
  so the inbox says "📷 Photo" / "🎤 Voice message" / "📍 Live location". `app.json` now allows camera and
  microphone (image-picker + expo-audio plugins, background audio off); prebuild `--clean` was run (debug key SHA-1
  unchanged). The + button shows in **every** chat (`*_dm_attachments_on_reply.sql`): in a private chat the receiver of
  a request can reply with an attachment (accepts it); a brand-new private chat starts with text (tapping + explains).
- **Edit / unsend, pin / archive** (added 2026-10-17, `*_edit_unsend_pin_archive.sql`): press and hold your own
  message → Edit (text; shows "edited", `edit_chat_message`) or Unsend (any kind → kind `unsent`, shown as "Message
  unsent"; `unsend_chat_message` returns the file path and the app deletes the file). Messages list
  (`src/app/messages.tsx`, `ReanimatedSwipeable`; the root layout is wrapped in `GestureHandlerRootView`): swipe right
  → Delete (private) / Leave (group, table / hangout); swipe left → Pin / Archive (`set_chat_flag(kind, id, 'pin' |
  'archive', on)`, stored in `chat_state.pinned_at / archived_at`). `my_chats` returns `pinned` (listed first) and
  `archived` (only under the Archived filter, not counted in the home badge).
- **Login without SMS for now** (founder's decision 2026-10-16): `app_settings.require_phone_verification` (default
  false) and `EXPO_PUBLIC_REQUIRE_PHONE` (default false) let Google accounts in without the phone check; turn both on
  once SMS is set up. With `EXPO_PUBLIC_SKIP_LOGIN=false`, a leftover anonymous guest session is signed out on start.
  Google sign-in still needs the founder's Google Cloud OAuth clients (README; local APK SHA-1 is listed there).
- **Check-ins, coupon QR, staff page, redemptions, account deletion, Terms / Privacy** (added 2026-10-18,
  `*_checkins_redemptions_account_deletion.sql`). Table screen (members, venue tables / hangouts, not ended):
  `CouponBox` (`src/components/coupon-box.tsx`, data `src/lib/coupons.ts`): the Check in button shows only within the
  venue's `checkin_radius_m` (50 m) by the phone's GPS, `check_in(meetup, lat, lng)` re-checks with PostGIS and the
  time window (15 min before start → end); `meetup_checkins` (members read, Realtime). `meetup_coupon_state` lists the
  usable promotions (tables: discount / offer, needs 3 checked in; hangouts: ticket, needs 1) and the QR token for
  checked-in members; `issue_redemption_qr` makes a 48-hex token in `redemption_qrs` (no API access), valid 15 min,
  one redemption per meetup + promotion. QR drawn by `src/components/qr-code.tsx` (qrcode-generator, plain views),
  holding `EXPO_PUBLIC_WEB_URL/r/<token>`. **Staff page** `web/src/app/r/[token]` (Thai + English): venue login
  (`staff_sign_in`, per-login lock + 20 failures / IP / 15 min) → session cookie `tm_staff` (path /r, 90 days, hash
  in `venue_staff_sessions`) → `staff_check_qr` (no use-up) → "Show coupon code" → `staff_redeem` (marks used,
  writes `redemptions` with names copied, returns the code). Another venue's login → `wrong_venue`, code not used.
  All `staff_*` functions are service-role only: the web uses `SUPABASE_SECRET_KEY` via `src/lib/supabase/service.ts`.
  Admin **/admin/redemptions**: filter by venue + Bangkok dates, visits per venue, history, Realtime "new redemption"
  banner. **Delete account** (Settings): `deleteAccount()` in `src/lib/auth.tsx` removes my chat files
  (`my_account_files`) and profile photos, then `delete_my_account()` (groups pass on via `leave_group`, hosted
  meetups with others are cancelled if upcoming and passed to the longest other member, then `auth.users` row deleted;
  everything else cascades). **Terms / Privacy**: one source `mobile/src/legal/content.ts` (EN + TH draft, PDPA),
  copied to `web/src/lib/legal-content.ts` by `npm run sync:legal` (`check:legal` compares); app screen
  `src/app/legal/[doc].tsx` (outside the sign-in guards; linked on welcome and Settings → About), web `/terms`,
  `/privacy`, `/delete-account` (`?lang=th`). Business name / contact email: `EXPO_PUBLIC_BUSINESS_NAME`,
  `EXPO_PUBLIC_CONTACT_EMAIL` (app), `NEXT_PUBLIC_*` (web); empty = generic wording. **iOS ready**: bundle ID
  `com.tablemeet.app`, Sign in with Apple (`signInWithApple`, expo-apple-authentication + expo-crypto nonce, button on
  welcome on iOS only); no Apple Developer account yet. **EAS Submit**: Android → internal track, draft, key
  `mobile/google-play-service-account.json` (git-ignored). Steps in README.
- **Activity feed + live pulse** (added 2026-10-18, `*_feed_cost_meeting_point_area.sql`): `meetups.cost_level`
  (0 free, 1 < ฿300, 2 ฿300–700, 3 ฿700–1,500, 4 ฿1,500+; null = not given) and `meetups.meeting_point` (≤ 120),
  set by the host right after creating via `set_meetup_details` (`setMeetupDetails`; form piece
  `src/components/meetup-extras.tsx` on Create table / Create hangout). `list_open_meetups` also returns `place_kind`,
  cost, meeting point and `area_name(_en/_th)` = nearest neighbourhood / subdistrict from `public.areas`
  (`area_near`). Home: filter chips All / Today / Tonight (from 17:00 local) / Food / Drinks (bar/rooftop venues,
  bar/pub/biergarten/nightclub places) / Explore (hangouts) / Budget-friendly (cost ≤ 1) on the pins and List
  (`src/lib/feed.ts`); each `MeetupCard` shows a status (Happening now / Starts in N min / Full / N seats left), a
  pulse line from real counts ("3 going for dinner near Asok") and the cost; the table screen shows meeting point and
  cost. Planned next (founder, 2026-10-18, in this order): Rewards Passport (stamps / points / milestones 3-5-10,
  completion by GPS check-in or host code + admin review), Hidden Gems (founder supplies the list), Locals + Safety +
  Invites, and map "stories" on home instead of a posts feed.
- **Phone (push) notifications** (added 2026-10-19, `*_push_notifications.sql`). Founder's choice of what reaches
  the phone: **messages** (private incl. requests, group, table / hangout chat; not after leaving that chat),
  **someone joins my table / hangout**, **new followers**, **new tables / hangouts within 20 km** of my rough area ("Sam
  created \"title\" · time", max 3 a day; 50 km until 2026-10-19) and **new promotions** to everyone (max 1 a day). Never my own actions, never across a block. DB triggers
  on `meetup_messages`, `direct_messages`, `chat_group_messages`, `meetup_members`, `follows`, `meetups`, `deals` call
  `push_send(user, kind, title_en, body_en, title_th, body_th, url)` → `net.http_post` (pg_net) to
  `https://exp.host/--/api/v2/push/send` (Expo push, no key); each trigger and `push_send` swallow errors so a push
  can't break the action. `push_devices` (token, language en/th, rough area rounded to 0.05° (~5 km) only if location
  is already allowed; no API access) via `register_push_device` / `unregister_push_device`; `push_log` for the daily
  limits. Tests stub `net.http_post` into `net.calls`. App: `expo-notifications` (plugin in `app.json`, white icon
  `assets/images/notification-icon.png`, channel `default`), `src/lib/push.ts`: `usePushNotifications` in the root
  layout (after onboarding; registers on start, on language change and after 6 h; tapping opens `data.url`),
  `usePushSetting` (Settings → Phone notifications), `unregisterPush` on sign-out and account deletion. **Android
  needs Firebase**: `mobile/google-services.json` (git-ignored, added by `app.config.ts` only if present) + the FCM V1
  service account key uploaded to the Expo project (README step 7); without them `getExpoPushTokenAsync` fails and
  Settings says it isn't available. Not pushed: the 🎁 host reward (time-based, no event).
- **Private tables / hangouts + story audience** (added 2026-10-19, `*_private_meetups_story_audience.sql`).
  `meetups.join_mode` `open` (anyone joins) or `private`: "Who can join" chips in `MeetupExtras` on both create forms →
  `set_meetup_join_mode` right after creating (`setMeetupJoinMode`). Private: `join_meetup` → `approval_required`;
  people call `request_to_join` (errors `not_private`, `already_member`, `blocked`, `meetup_full`, `request_declined`;
  no second request after a decline), `cancel_join_request`; the host `decide_join_request(meetup, user, approve)`
  (locks the meetup, approving adds the member if there's a seat). `meetup_join_requests` (no direct writes; readable
  by the person and the host; Realtime). `list_open_meetups` returns `join_mode` + `my_request`. Push + bell kinds
  `join_request` (host) and `request_approved` (person); "X joined" now only for open ones. App: table screen shows a
  🔒 Private tag, "Request to join" / "Request sent · Cancel" / "Request declined", and for the host a Join requests
  list with ✓ / ✕ (`useJoinRequests`); `MeetupCard` shows 🔒. **Stories**: `stories.audience` `everyone` (default) or
  `friends` (mutual follows, `are_friends`), chosen on `post-story.tsx`; `post_story(…, p_audience default
  'everyone')`, `story_visible` checks it, `map_stories` returns it; the viewer labels friends-only ones. Home already
  pins open hangouts worldwide (no change).
- **TableMeet Plus + AdMob ads** (added 2026-10-19, `*_tablemeet_plus.sql`). Founder's decisions: Plus = Plan my
  day, Hidden Gems, Rewards Passport, and no ads; **payments not built yet**, the founder gives Plus by hand at
  **/admin/plus** (search by name / email via `admin_find_users`, Give 1 month / 1 year with `admin_grant_plus`, added
  after the current end; End now = `admin_end_plus`; list = `admin_list_plus`); plans monthly + yearly (Google Play
  billing later, likely RevenueCat). `plus_members` (own row readable, no direct writes), `has_plus(user)` (admins
  always), `plus_unlocked()` (member, or `app_settings.plus_locked = false`), `my_plus()` → `{member, unlocked, plan,
  ends_at}`. Locked **on the server** by renaming the old functions to `*_all` (no API access) behind same-named
  wrappers: `list_gems`, `plan_candidates`, `plan_food_near` return nothing; `my_passport`, `suggest_gem`,
  `create_plan_hangout` raise `plus_required`; inserting a `day_plans` row needs Plus. Free stays free: a day
  hangout's plan on its table screen and `plan/[id]`, check-ins, completion codes. App: `usePlus()`
  (`src/lib/plus.ts`), `RequirePlus` (`src/components/require-plus.tsx`) wraps plan-day, gems, gem/[id], suggest-gem
  and passport (→ redirect to `src/app/plus.tsx`: benefits, Monthly / Yearly, "Contact us" mailto
  `EXPO_PUBLIC_CONTACT_EMAIL`); home's Plan my day / Gems / Passport buttons go straight to /plus when locked;
  Settings has a Plus row. **Ads**: `react-native-google-mobile-ads` (plugin in `app.json`: the founder's **Android AdMob App
  ID** `ca-app-pub-7210077278553769~2177243131` since 2026-10-19; iOS still Google's sample ID; README step 6). **App open ads** (founder, 2026-10-19, replaced the
  tap-triggered interstitials; interstitials at launch break AdMob policy): unit `EXPO_PUBLIC_ADMOB_APP_OPEN_ID`
  (empty = `TestIds.APP_OPEN`). `src/lib/ads.ts`: `prepareAds()` (UMP consent via `AdsConsent.gatherConsent`, then
  initialize + preload; one shared promise), `showLaunchAd()` once per app start and `onAppReopened()` → `showOpenAd()`
  when the app returns after ≥ 30 s in the background **while home is focused** (`useFocusEffect` in `index.tsx`);
  Google's own close button. Photo pickers call `skipNextOpenAd()`; ads older than 4 h are reloaded; an ad still
  loading at launch shows only if it arrives within 6 s. Never for Plus members (`plus.member`). Terms (§7) and
  Privacy (AdMob, advertising ID, EEA consent) updated.
- **Map stories** (added 2026-10-19, `*_map_stories.sql`): camera button first in the home row (before Plan my day)
  → `src/app/post-story.tsx` (take / pick a photo, caption ≤ 150) → `post_story(path, caption, lat, lng)`: pinned on
  the home map for **24 hours** for everyone signed in (anywhere in the world), except across a block. **The exact
  location is never stored**: the server moves the pin 100–250 m in a random direction (plus `area_near` name in
  Bangkok). Same phone / guest rule as meetups (`meetup_caller_allowed`), max 10 per person per 24 h. One pin per
  person (profile picture in a brand ring, `MapPin.image` + `tone: 'story'`, count when > 1, key `s:<user id>`) →
  full-screen viewer `src/app/story/[userId].tsx` (tap right / left, ⋮ = delete mine or Report / Block via
  `openSafetyMenu(context 'story')`). Reports: `reports.context = 'story'`; hidden for the reporter at once and for
  everyone at 3 open reports until the founder resolves them. Photos: private `story-photos` bucket
  `<user id>/<file>`, signed links, readable only while the story is live for you. `clear_my_expired_stories()` runs
  once per app start (deletes my expired rows, the app deletes the files); account deletion removes the folder. Data:
  `src/lib/stories.ts` (`useStories`, Realtime on `stories`). Privacy Policy mentions stories. No admin UI yet
  (`delete_story` works for admins).
- **Hidden Gems list** (`*_hidden_gems.sql` + `*_more_hidden_gems.sql`): the founder's numbered list of 100 (2026-10-18:
  1–30 places by type, 31–65 cafés, 66–100 food) is gems 1–100; the first 32 gems not on it are 101+ (still
  published). Areas are free text and become the map's area chips. All are published (`*_publish_hidden_gems.sql`,
  founder 2026-10-19) except 3 that can't be placed (Old Town White Coffee: no Bangkok branch; KALM, Wanwan: no
  address); gems published with an approximate pin keep a `check_note`. The selected gem's pop-up card on the Gems
  map has a **Google Maps** button: a plain `google.com/maps/search` link by name (`googleMapsUrl()` in
  `src/lib/links.ts`, no API key or billing).
- **Design refresh** (2026-10-18, from the founder's Claude Design project "TableMeet Screen", layout variant a):
  fonts **Bricolage Grotesque** (headings) + **Figtree** (text), **Anuphan** in Thai (`assets/fonts/`, embedded by the
  `expo-font` plugin in `app.json` with one Android family per typeface; **needs a prebuild + new native build**,
  older builds fall back to the system font). `Type` tokens carry the font; `makeStyles` gives Figtree to any text
  style without a font and swaps both for Anuphan in Thai (sheets cached per theme + language). New tokens:
  `violetText`, `pinkText`, `ok`, `field`, `Tones` (orange / violet / lilac / plan / brand fills, drawn with
  `<ToneFill />` from `glossy.tsx`), `ToneShadow` (colored elevation), `avatarColor(id)`, `Radius.sheet`; radii are
  rounder (md 18, lg 22). Buttons are 56 dp pills (orange or violet gradient, `danger` outline variant,
  `trailingIcon`); `Chip` takes `tone`, `icon`, `shape="tile"`, `tall`. New shared pieces: `RoundButton` (44 dp
  glossy circle, `tone`, `badge`, `star`), `form-parts.tsx` (`FormSection`, `FormInput`, `Stepper`, `PlaceSummary`,
  `IconBadge`, `FormFooter`), `LanguageSegment` (EN | ไทย, welcome). `MeetupCard` is compact (kind / status / deal
  tags, title, where · when · cost, count + pulse) or full (`compact={false}`); it has **no Join button** (join on the
  table screen). Pins: tables orange → pink, hangouts violet, count = people, selected = bigger. Create table / hangout:
  "Step 1 of 2" map headers with a List button, hint card, "Choose this place →" / "Use this spot →", step-2 forms
  with a sticky create button; a hangout's length is a 1–12 h stepper. Table screen: small map of the place on top
  (`VenueMap` `center` + `interactive={false}`), tags, details card, check-in box with a brand-gradient frame,
  members with "Checked in ✓" (`useCheckedIn`), chat + leave / cancel / join in a bottom bar, Share. Welcome: the
  icon artwork as hero until a photo is supplied. Phone code: six boxes over one hidden input.
- **Not started:** web push to the founder's phone for redemptions, tables/users in the admin panel, Apple token
  revocation on account deletion. Places missing from OpenStreetMap can be added by the founder (admin insert into `places`; no UI yet).
- Running on the founder's Redmi as a local release APK, connected to the real Supabase project
  (`zxghiilryqzexzvacbrl`, migrations applied by Supabase's GitHub integration on push to `main`).
- **Google sign-in is on** (2026-10-16): the founder created the Google Cloud OAuth clients (Web client ID in
  `mobile/.env.local` as `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`; Android client for the debug-key SHA-1 in README) and
  enabled Google in Supabase. `EXPO_PUBLIC_SKIP_LOGIN=false` now (the preview/guest mode in `src/lib/preview.ts`
  still exists for testing). **Phone verification is not configured** (no SMS provider): the phone check is off via
  `EXPO_PUBLIC_REQUIRE_PHONE=false` + `app_settings.require_phone_verification = false`. **Before Google Play:** set
  up SMS, turn both on, set `allow_guest_meetups = false` and consider turning off Anonymous sign-ins in Supabase.

Setup steps (Supabase, Google sign-in, SMS, Android build) are in `README.md`.

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
  Exception: **hangouts can be anywhere in the world** (founder, 2026-10-17) and use the place's local time zone.
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
- **No Google Maps or Google Places** (changed 2026-10-17: Google billing needed a prepayment the founder declined).
  Maps are **MapLibre** (`@maplibre/maplibre-react-native`) with free **OpenFreeMap** tiles (colorful `liberty`
  style in both app themes, no key, no billing). Places are **OpenStreetMap** data in `public.places`: 9,336 named Bangkok food and
  drink places (restaurant, cafe, bar, pub, fast food, food court, ice cream, bakery, tea/coffee shop, …), seeded by
  `supabase/migrations/20261017000002_seed_bangkok_places.sql` (generated from an Overpass query; ODbL, the
  "© OpenStreetMap contributors" credit must stay visible on the map). Anyone can read places; only admins write.
  `places.purpose` is `'food'` (those 9,336) or `'hangout'`: 2,810 named places to spend time (temples, parks and
  gardens, markets, malls, attractions, museums, galleries, monuments, cinemas, theatres, viewpoints, zoos, …), seeded
  by `20261018000003_seed_bangkok_hangout_places.sql` (Overpass via the `maps.mail.ru` mirror; `overpass-api.de`
  wasn't reachable). People can create a table at any **food** place (`create_meetup_at_place(place_id, …)`, which
  rejects hangout places) and a hangout at any place, venue or dropped pin (`create_hangout`). The map loads places
  for the visible area (`places_in_bounds(…, p_purpose)`, zoom ≥ 14 for food / ≥ 12 for hangout, max 400) via
  `usePlacesInView(purpose)` in `src/lib/places.ts`.
- **Partner venues** are the places the founder adds in the admin panel, linked to an OSM place via `venues.place_id`
  (found with "Find the place on the map"). A linked place's dot is hidden and replaced by the venue's pin, and tables
  or hangouts created at that place move to the venue. Categories cafe/restaurant/rooftop/bar are **food & drink
  venues** (food map, tables); attraction/park/mall/museum/temple/market/entertainment are **hangout venues** (Hangout
  map, hangouts only; `create_meetup` rejects them). They carry **promotions** of six kinds: **discount** and
  **offer** use the coupon (3+ check-ins, max one active per venue); **event** and **party** are dated listings
  (any number, no coupon); **ticket** (entry-ticket discount, coupon code, any number) and **free_entry** (no coupon)
  are ongoing or dated.
- **Ticket discounts don't need 3 people** (founder's decision, 2026-10-16): any member of a hangout at that venue
  can use one. Apply this when QR redemption is built; the 3+ rule below stays for discount and offer.
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
  - `src/lib/meetups.ts`: tables ("meetups" in the DB). `useOpenMeetups(enabled)` (RPC `list_open_meetups`, Realtime +
    foreground + 5-min refetch), `useMeetup(id)` (one table with members' `profiles.display_name`),
    `createMeetup/joinMeetup/leaveMeetup/cancelMeetup` return `{ data, error }` where error is a key translated via
    `tables.errors.*`. `src/lib/bangkok-time.ts`: Bangkok (UTC+7, no DST) day/time maths and labels; 24-hour clock.
  - Screens: `src/app/create-table.tsx` (modal: pick a place on a full-screen map or from the List panel, then day
    chips for 7 days, 30-min slots 06:00–23:30 from `timeSlots()` in `bangkok-time.ts`, 3–12 people, optional 80-char
    title), `src/app/create-hangout.tsx` (see Hangouts above) and `src/app/table/[id].tsx` (a table or hangout:
    members, join/leave; host sees Cancel). All are registered inside the signed-in guard in `_layout.tsx`.
  - Maps: `src/components/venue-map.tsx` wraps MapLibre (`Map`, `Camera`, `Marker` for emoji pins,
    `GeoJSONSource` + symbol `Layer` for places, `UserLocation`). Places show as **colored circle icons with their
    name beside them** (like Apple Maps): OSM kind → icon/color via `placeIcon()` / `PLACE_ICON_COLORS` in
    `src/lib/places.ts`, images in `assets/images/map-icons/` (120 px **3D** glossy balls with a shadow and the white
    Material icon, Apache 2.0, drawn by a System.Drawing script; shown at `PLACE_ICON_SIZE` 0.32 ≈ 32 dp) registered
    with `Images`. Pins (`PinView`) are 50 dp 3D balls: gradient, shine, white rim, elevation shadow, ground shadow.
    Zoomed out places are **small dots in their icon color** (from `DOTS_MIN_ZOOM` food 12 / hangout 11, all of a
    purpose loaded once via RPC `place_dots` as `[id, kind, lat, lng]`, names fetched on tap); from `ICON_ZOOM` 15 icon +
    name. Overlapping icons hide until zoomed in (MapLibre collision); names hide first. Labels use `Noto Sans Bold` (must
    be a font OpenFreeMap serves; it has Thai). Pins with a `label` (partner venues) get their name beside them too.
    Props: `pins`, `places`, `onPlacePress`, `onMapPress`, `onBoundsChange`, `fullScreen`, `mapPadding`
    (→ `contentInset`). Keep `attribution` on (OSM licence).
  - `src/i18n/`: i18next with `en.ts` (source, typed keys) and `th.ts` (must match). `localized(row, 'name', lang)`
    picks `name_th`/`name_en` columns. The language choice is saved on the phone; the default follows the phone language.
    In components read the language with the `useLanguage()` hook; `currentLanguage()` is for callbacks and plain
    functions only (the React Compiler caches a plain call, so a screen kept showing the old language).
  - `src/components/`: `Button`, `Icon` (expo-symbols: Material names on Android, SF Symbols for iOS; add new icons
    to the map), `LanguageToggle`, `VenueCard`, `PromoFilter`, `Logo` (white "Table", orange "M", pink "eet", as on the
    icon). **Two themes, Dark (default) and Light**, chosen in `src/app/settings.tsx` and saved on the phone (`src/lib/theme.tsx`: `ThemeProvider`, `useTheme`, `useColors`). Colors live in `src/constants/theme.ts` as `darkColors` / `lightColors` with the same **semantic tokens** (`bg`, `surface`, `surfaceRaised`, `border`, `overlay`, `text`, `textSecondary`, `textMuted`, `orange`/`pink` for fills, `accent` for orange text and icons, `glow` for warm text on `orangeTint`, `onBrand`, `*Tint`, `fade`). **Never import colors statically:** write `const useStyles = makeStyles((Colors) => ({ ... }))` at module level and call `const styles = useStyles()` (and `const Colors = useColors()` for inline colors) in each component. Text on orange/pink fills is always `onBrand`; orange text/icons on plain backgrounds use `accent` (darker in Light so it passes 4.5:1). `BrandGradient` (orange → coral → pink) is the same in both themes. The map is always OpenFreeMap **Liberty** (blue water, green parks, yellow main roads; founder, 2026-10-18), in both themes, so labels / dots the app draws on it use light-map colors (`PLACE_ICON_COLORS` as-is, white halos, `lightColors.accent` / `violet` for pin names) in `venue-map.tsx`. `app.json` stays `userInterfaceStyle: "dark"` (native dialogs/keyboard); changing it needs a prebuild. The admin panel shares the brand colors but stays light.
  - Icons in `assets/images/` were generated from the founder's icon artwork: `icon.png` (full art),
    `android-icon-foreground.png` (art at 64% on transparent, for Android's adaptive mask) on a black background
    layer, and `splash-icon.png` (art with the outside corners transparent). Regenerate all three from the source
    art if the icon changes, then `npx expo prebuild --clean`.
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
- Tables: `meetups` + `meetup_members` are read-only through the API; every change goes through
  `create_meetup` / `join_meetup` / `leave_meetup` / `cancel_meetup` (security definer, check `auth.uid()`; join
  locks the meetup row with `for update` so the last seat can't be taken twice). Rules: live venue, start between
  now−15 min and now+7 days, 3–12 people, lasts 3 hours, max 3 open tables hosted per person, host leaving =
  cancel. Hangouts (`kind = 'hangout'`, `create_hangout`): exactly one of venue / place / spot (`spot_name`,
  `spot_lat`, `spot_lng`, anywhere in the world since `*_world_hangouts.sql`, with `time_zone`), title required, 2–30 people, start within 14 days, 30 min–12 h,
  max 3 open hangouts per host (separate from the 3 tables); `list_open_meetups` returns `kind`, `description` and
  the spot as `place_name/lat/lng`. Callers must be phone-verified, or anonymous while `app_settings.allow_guest_meetups`. Errors are short
  keys (`meetup_full`, `invalid_time`, …) that the app translates. `profiles` rows are created by a trigger on
  `auth.users` (Google `full_name`, else "Guest XXXX").
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
first. **Don't start `adb` (or anything long-running) from inside `mobile/android`**: the adb server keeps that
folder as its working directory, which locks it and makes `expo prebuild --clean` fail with EBUSY. Run adb from
another folder (`cd /g`), or `adb kill-server` before a clean prebuild. Android Studio is installed: `ANDROID_HOME` = `%LOCALAPPDATA%\Android\Sdk`, and the emulator
`Medium_Phone_API_37.0` exists. `JAVA_HOME` = `C:\Program Files\Zulu\zulu-17` (JDK 17). Don't use Android Studio's
bundled JBR (Java 25) for Gradle: its "restricted method" warning makes the native CMake/prefab steps
(`react-native-worklets`, `react-native-screens`) fail. A local release APK:
`cd mobile/android && gradlew.bat assembleRelease -PreactNativeArchitectures=arm64-v8a` (signed with the debug key,
output in `app/build/outputs/apk/release/`). The founder's test phone is a Redmi (Android 15, arm64), connected over
USB debugging; "Install via USB" must be on in its Developer options. `cd mobile && npx expo run:android` builds the development
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
