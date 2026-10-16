// Applies every migration to an in-memory Postgres (PGlite) with a small stand-in for Supabase's
// roles/schemas, then checks the security rules. Runs on Windows without Docker: `npm test` in this folder.
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { postgis } from "@electric-sql/pglite-postgis";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const migrationsDir = fileURLToPath(new URL("../migrations/", import.meta.url));
const migration = readdirSync(migrationsDir)
  .filter((file) => file.endsWith(".sql"))
  .sort()
  .map((file) => readFileSync(join(migrationsDir, file), "utf8"))
  .join("\n");

const db = new PGlite({ extensions: { postgis, pgcrypto } });

// Minimal stand-in for what Supabase provides.
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema extensions; create schema auth; create schema storage;
  grant usage on schema public, extensions, auth, storage to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  create table auth.users (
    id uuid primary key default gen_random_uuid(), email text,
    raw_user_meta_data jsonb not null default '{}', is_anonymous boolean not null default false,
    phone_confirmed_at timestamptz
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  create publication supabase_realtime;
`);

await db.exec(migration);
console.log("migration applied OK");

const admin = "11111111-1111-1111-1111-111111111111";
const user = "22222222-2222-2222-2222-222222222222";
await db.exec(`insert into auth.users (id, email, raw_user_meta_data, phone_confirmed_at) values
    ('${admin}', 'founder@x.com', '{}', null),
    ('${user}', 'user@x.com', '{"full_name": "Somchai Jaidee"}', now());
  insert into public.admins (user_id) values ('${admin}');
  grant usage on schema extensions to anon, authenticated, service_role;`);

let failures = 0;
function check(name, cond) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
  if (!cond) failures++;
}

async function as(role, sub, fn) {
  await db.exec(`begin; set local role ${role}; select set_config('request.jwt.claim.sub', '${sub ?? ""}', true);`);
  try {
    return await fn();
  } finally {
    await db.exec("commit;");
  }
}
async function tryQuery(role, sub, sql, params) {
  try {
    return { rows: (await as(role, sub, () => db.query(sql, params))).rows };
  } catch (e) {
    await db.exec("rollback;").catch(() => {});
    return { error: e.message };
  }
}

// --- Admin flows
let r = await tryQuery("authenticated", admin,
  `insert into public.venues (name_en, name_th, category, lat, lng) values ('Sky Bar', 'สกายบาร์', 'rooftop', 13.7563, 100.5018) returning id, extensions.st_astext(location::extensions.geometry) as wkt, checkin_radius_m, is_active`);
check("admin can create venue", !r.error);
const venueId = r.rows?.[0]?.id;
check("location synced from lat/lng", r.rows?.[0]?.wkt === "POINT(100.5018 13.7563)");
check("radius defaults to 50, venue starts hidden", r.rows?.[0]?.checkin_radius_m === 50 && r.rows?.[0]?.is_active === false);

r = await tryQuery("authenticated", admin, `update public.venues set lat = 13.75, lng = 100.49 where id = $1 returning extensions.st_astext(location::extensions.geometry) as wkt`, [venueId]);
check("location re-synced on update", r.rows?.[0]?.wkt === "POINT(100.49 13.75)");

r = await tryQuery("authenticated", admin,
  `select public.admin_save_promotion($1, null, 'discount', '15% off', 'ลด 15%', '', '', 'percent', 15, 'TM15', null, null, true) as id`, [venueId]);
check("admin can save deal", !r.error);
const dealId = r.rows?.[0]?.id;
r = await tryQuery("authenticated", admin,
  `select public.admin_save_promotion($1, $2, 'discount', '20% off', 'ลด 20%', '', '', 'percent', 20, 'TM20', null, null, true) as id`, [venueId, dealId]);
check("admin can update deal", r.rows?.[0]?.id === dealId);
r = await tryQuery("authenticated", admin, `select coupon_code from public.deal_coupons where deal_id = $1`, [dealId]);
check("coupon code updated", r.rows?.[0]?.coupon_code === "TM20");
r = await tryQuery("authenticated", admin,
  `select public.admin_save_promotion($1, null, 'discount', 'x', 'x', '', '', 'percent', 150, 'X', null, null, true)`, [venueId]);
check("percent over 100 rejected", !!r.error);
r = await tryQuery("authenticated", admin,
  `select public.admin_save_promotion($1, null, 'offer', 'Free drink', 'ฟรี', '', '', 'other', null, 'FREE', null, null, true)`, [venueId]);
check("second active coupon (offer) for same venue rejected", !!r.error);
r = await tryQuery("authenticated", admin,
  `select public.admin_save_promotion($1, null, 'event', 'Live jazz', 'แจ๊สสด', '', '', 'other', null, null, now() + interval '1 day', now() + interval '1 day 3 hours', true) as id`, [venueId]);
check("event added alongside the discount", !r.error);
const eventId = r.rows?.[0]?.id;
r = await tryQuery("authenticated", admin, `select count(*)::int n from public.deal_coupons where deal_id = $1`, [eventId]);
check("events have no coupon code", r.rows?.[0]?.n === 0);
r = await tryQuery("authenticated", admin,
  `select public.admin_save_promotion($1, null, 'party', 'DJ night', 'ดีเจ', '', '', 'other', null, null, null, null, true)`, [venueId]);
check("party without dates rejected", !!r.error);
r = await tryQuery("authenticated", admin,
  `select public.admin_save_promotion($1, null, 'offer', 'x', 'x', '', '', 'other', null, '', null, null, false)`, [venueId]);
check("offer without coupon code rejected", !!r.error);
r = await tryQuery("authenticated", admin,
  `select public.admin_save_promotion($1, null, 'party', 'Pool party', 'ปาร์ตี้', '', '', 'other', null, null, now() + interval '2 days', now() + interval '2 days 4 hours', true)`, [venueId]);
check("several events/parties per venue allowed", !r.error);

r = await tryQuery("authenticated", admin, `select public.admin_create_venue_account($1, ' SkyBar-Staff ', 'password123') as id`, [venueId]);
check("admin can create venue login", !r.error);
const accountId = r.rows?.[0]?.id;
r = await tryQuery("authenticated", admin, `select login_id from public.venue_accounts where id = $1`, [accountId]);
check("login id normalized to lowercase", r.rows?.[0]?.login_id === "skybar-staff");
r = await tryQuery("authenticated", admin, `select public.admin_create_venue_account($1, 'skybar-staff', 'password123')`, [venueId]);
check("duplicate login id rejected", !!r.error && /duplicate|unique/.test(r.error));
r = await tryQuery("authenticated", admin, `select public.admin_create_venue_account($1, 'short-pw', 'abc')`, [venueId]);
check("short password rejected", !!r.error);

// --- Staff login verification (service role only)
r = await tryQuery("service_role", null, `select * from public.verify_venue_login('SKYBAR-STAFF', 'password123')`);
check("correct staff login returns venue", r.rows?.[0]?.venue_id === venueId);
r = await tryQuery("service_role", null, `select * from public.verify_venue_login('nobody', 'password123')`);
check("unknown login returns nothing", r.rows?.length === 0);
for (let i = 0; i < 5; i++) await tryQuery("service_role", null, `select * from public.verify_venue_login('skybar-staff', 'wrong')`);
r = await tryQuery("service_role", null, `select * from public.verify_venue_login('skybar-staff', 'password123')`);
check("locked after 5 wrong passwords", r.rows?.length === 0);
r = await tryQuery("authenticated", admin, `select public.admin_set_venue_password($1, 'newpassword1')`, [accountId]);
check("admin can reset password", !r.error);
r = await tryQuery("service_role", null, `select * from public.verify_venue_login('skybar-staff', 'newpassword1')`);
check("reset clears lock and new password works", r.rows?.[0]?.account_id === accountId);
r = await tryQuery("authenticated", admin, `update public.venue_accounts set is_active = false where id = $1`, [accountId]);
r = await tryQuery("service_role", null, `select * from public.verify_venue_login('skybar-staff', 'newpassword1')`);
check("turned-off login can't log in", r.rows?.length === 0);

// --- App users and anonymous visitors
r = await tryQuery("anon", null, `select id from public.venues`);
check("anon can't see hidden venue", !r.error && r.rows.length === 0);
await tryQuery("authenticated", admin, `update public.venues set is_active = true where id = $1`, [venueId]);
r = await tryQuery("anon", null, `select id from public.venues`);
check("anon sees live venue", r.rows?.length === 1);
r = await tryQuery("authenticated", user, `select id, title_en from public.deals`);
check("app user sees active promotions (discount + event + party)", r.rows?.length === 3);
r = await tryQuery("authenticated", user, `select * from public.deal_coupons`);
check("app user can't read coupon codes", !r.error && r.rows.length === 0);
r = await tryQuery("anon", null, `select * from public.deal_coupons`);
check("anon can't read coupon codes", !r.error && r.rows.length === 0);
r = await tryQuery("authenticated", user, `select * from public.venue_account_secrets`);
check("app user can't read password hashes", !!r.error);
r = await tryQuery("authenticated", user, `select * from public.venue_accounts`);
check("app user can't see venue logins", !r.error && r.rows.length === 0);
r = await tryQuery("authenticated", user, `select * from public.verify_venue_login('skybar-staff', 'newpassword1')`);
check("app user can't call verify_venue_login", !!r.error);
r = await tryQuery("anon", null, `select * from public.verify_venue_login('skybar-staff', 'newpassword1')`);
check("anon can't call verify_venue_login", !!r.error);
r = await tryQuery("authenticated", user, `insert into public.venues (name_en, name_th, category, lat, lng) values ('x','x','bar',1,1)`);
check("app user can't create venues", !!r.error);
r = await tryQuery("authenticated", user, `select public.admin_create_venue_account($1, 'hacker', 'password123')`, [venueId]);
check("app user can't create venue logins", !!r.error);
r = await tryQuery("authenticated", user, `select public.admin_save_promotion($1, $2, 'discount', 'x', 'x', '', '', 'percent', 99, 'X', null, null, true)`, [venueId, dealId]);
check("app user can't edit deals", !!r.error);
r = await tryQuery("authenticated", user, `update public.venues set name_en = 'hacked' where id = $1 returning id`, [venueId]);
check("app user can't update venues", !r.error && r.rows.length === 0);
r = await tryQuery("authenticated", user, `select public.is_admin() as a`);
check("is_admin false for app user", r.rows?.[0]?.a === false);

// --- Tables (meetups)
const guests = ["33333333-3333-3333-3333-333333333331", "33333333-3333-3333-3333-333333333332", "33333333-3333-3333-3333-333333333333"];
const unverified = "44444444-4444-4444-4444-444444444444";
await db.exec(`insert into auth.users (id, is_anonymous) values ${guests.map((g) => `('${g}', true)`).join(", ")};
  insert into auth.users (id, email) values ('${unverified}', 'nophone@x.com');`);

r = await tryQuery("service_role", null, `select id, display_name from public.profiles order by id`);
const names = Object.fromEntries((r.rows ?? []).map((p) => [p.id, p.display_name]));
check("profile created for every user", Object.keys(names).length === 6);
check("Google name used as display name", names[user] === "Somchai Jaidee");
check("guests get a Guest name", names[guests[0]] === "Guest 3333");

const inHours = (h) => new Date(Date.now() + h * 3600_000).toISOString();
r = await tryQuery("authenticated", user, `select public.create_meetup($1, $2, 3, '  After-work drinks  ') as id`, [venueId, inHours(2)]);
check("phone-verified user can create a table", !r.error);
const meetupId = r.rows?.[0]?.id;
r = await tryQuery("authenticated", user, `select title, max_people, (ends_at - starts_at) = interval '3 hours' as three_hours from public.meetups where id = $1`, [meetupId]);
check("title trimmed, table lasts 3 hours", r.rows?.[0]?.title === "After-work drinks" && r.rows?.[0]?.three_hours === true);
r = await tryQuery("authenticated", user, `select * from public.list_open_meetups()`);
check("host is a member; listed as joined", r.rows?.length === 1 && r.rows[0].member_count === 1 && r.rows[0].joined === true);

r = await tryQuery("authenticated", user, `select public.create_meetup($1, $2, 3)`, [venueId, inHours(-1)]);
check("table in the past rejected", /invalid_time/.test(r.error ?? ""));
r = await tryQuery("authenticated", user, `select public.create_meetup($1, $2, 3)`, [venueId, inHours(24 * 8)]);
check("table more than 7 days ahead rejected", /invalid_time/.test(r.error ?? ""));
r = await tryQuery("authenticated", user, `select public.create_meetup($1, $2, 2)`, [venueId, inHours(2)]);
check("group smaller than 3 rejected", /invalid_size/.test(r.error ?? ""));
r = await tryQuery("authenticated", user, `select public.create_meetup($1, $2, 13)`, [venueId, inHours(2)]);
check("group larger than 12 rejected", /invalid_size/.test(r.error ?? ""));
r = await tryQuery("authenticated", unverified, `select public.create_meetup($1, $2, 3)`, [venueId, inHours(2)]);
check("user without verified phone can't create", /not_allowed/.test(r.error ?? ""));
r = await tryQuery("anon", null, `select public.create_meetup($1, $2, 3)`, [venueId, inHours(2)]);
check("signed-out visitor can't create", !!r.error);
r = await tryQuery("authenticated", user, `insert into public.meetups (venue_id, host_id, starts_at, ends_at, max_people) values ($1, $2, now(), now() + interval '1 hour', 3)`, [venueId, user]);
check("direct insert into meetups blocked", !!r.error);
r = await tryQuery("authenticated", user, `insert into public.meetup_members (meetup_id, user_id) values ($1, $2)`, [meetupId, unverified]);
check("direct insert into members blocked", !!r.error);

r = await tryQuery("authenticated", guests[0], `select public.join_meetup($1)`, [meetupId]);
check("guest can join while guests are allowed", !r.error);
r = await tryQuery("authenticated", guests[0], `select public.join_meetup($1)`, [meetupId]);
check("joining twice is harmless", !r.error);
r = await tryQuery("authenticated", guests[1], `select public.join_meetup($1)`, [meetupId]);
check("third person fills the table", !r.error);
r = await tryQuery("authenticated", guests[2], `select public.join_meetup($1)`, [meetupId]);
check("full table rejects a fourth person", /meetup_full/.test(r.error ?? ""));
r = await tryQuery("authenticated", guests[2], `select member_count, joined from public.list_open_meetups() where id = $1`, [meetupId]);
check("list shows 3 members, not joined for outsider", r.rows?.[0]?.member_count === 3 && r.rows?.[0]?.joined === false);

r = await tryQuery("authenticated", guests[1], `select public.leave_meetup($1)`, [meetupId]);
check("member can leave", !r.error);
r = await tryQuery("authenticated", guests[2], `select public.join_meetup($1)`, [meetupId]);
check("freed seat can be taken", !r.error);
r = await tryQuery("authenticated", guests[2], `select public.cancel_meetup($1)`, [meetupId]);
check("non-host can't cancel", /not_host/.test(r.error ?? ""));

await db.exec(`update public.app_settings set allow_guest_meetups = false`);
r = await tryQuery("authenticated", guests[1], `select public.create_meetup($1, $2, 4)`, [venueId, inHours(3)]);
check("guests blocked once the founder turns guests off", /not_allowed/.test(r.error ?? ""));
await db.exec(`update public.app_settings set allow_guest_meetups = true`);
r = await tryQuery("authenticated", guests[1], `update public.app_settings set allow_guest_meetups = false returning id`);
check("app users can't change app settings", !r.error && r.rows.length === 0);

r = await tryQuery("authenticated", user, `select public.leave_meetup($1)`, [meetupId]);
check("host leaving cancels the table", !r.error);
r = await tryQuery("authenticated", user, `select count(*)::int n from public.list_open_meetups()`);
check("cancelled table disappears from the list", r.rows?.[0]?.n === 0);
r = await tryQuery("authenticated", guests[1], `select public.join_meetup($1)`, [meetupId]);
check("can't join a cancelled table", /meetup_cancelled/.test(r.error ?? ""));

for (let i = 0; i < 3; i++) await tryQuery("authenticated", guests[0], `select public.create_meetup($1, $2, 3)`, [venueId, inHours(1 + i)]);
r = await tryQuery("authenticated", guests[0], `select public.create_meetup($1, $2, 3)`, [venueId, inHours(5)]);
check("a person can host at most 3 open tables", /too_many_open/.test(r.error ?? ""));

// --- Places (OpenStreetMap) and tables at any place
r = await tryQuery("anon", null, `select count(*)::int n from public.places`);
check("Bangkok places seeded and readable by anyone", r.rows?.[0]?.n > 9000);
r = await tryQuery("anon", null, `select id, name from public.places where osm_type = 'node' and osm_id = 268242835`);
const placeId = r.rows?.[0]?.id;
check("a known place is in the list", r.rows?.[0]?.name === "Manna");
r = await tryQuery("authenticated", user, `insert into public.places (osm_type, osm_id, name, kind, lat, lng) values ('node', 1, 'Fake', 'restaurant', 13.7, 100.5)`);
check("app users can't add places", !!r.error);
r = await tryQuery("authenticated", admin, `insert into public.places (osm_type, osm_id, name, kind, lat, lng) values ('node', 2, 'Chiang Mai Cafe', 'cafe', 18.79, 98.98)`);
check("places outside Bangkok can't be added", !!r.error);
r = await tryQuery("authenticated", admin, `insert into public.places (osm_type, osm_id, name, kind, lat, lng) values ('node', 3, 'Founder Added Noodles', 'restaurant', 13.74, 100.53) returning id`);
check("founder can add a missing place", !r.error);
r = await tryQuery("authenticated", user, `select count(*)::int n from public.search_places('manna')`);
check("place search finds places by name", r.rows?.[0]?.n >= 1);
r = await tryQuery("authenticated", user, `select count(*)::int n from public.places_in_bounds(100.53, 13.74, 100.54, 13.75, 50)`);
check("places in a map area are returned (capped)", r.rows?.[0]?.n > 0 && r.rows?.[0]?.n <= 50);

const fn = `select public.create_meetup_at_place($1, $2, 4) as id`;
r = await tryQuery("authenticated", user, fn, [placeId, inHours(2)]);
check("table at any place", !r.error);
const placeMeetupId = r.rows?.[0]?.id;
r = await tryQuery("authenticated", user, `select venue_id, place_name, place_lat from public.list_open_meetups() where id = $1`, [placeMeetupId]);
check("place table listed with its name and position", r.rows?.[0]?.venue_id === null && r.rows?.[0]?.place_name === "Manna" && r.rows?.[0]?.place_lat > 13);
r = await tryQuery("authenticated", guests[1], `select public.join_meetup($1)`, [placeMeetupId]);
check("people can join a place table", !r.error);
r = await tryQuery("authenticated", user, fn, ["00000000-0000-0000-0000-000000000000", inHours(2)]);
check("unknown place rejected", /venue_unavailable/.test(r.error ?? ""));
r = await tryQuery("anon", null, `select id from public.places where osm_type = 'node' and osm_id = 311069785`);
const zenId = r.rows?.[0]?.id;
await tryQuery("authenticated", admin, `update public.venues set place_id = $2 where id = $1`, [venueId, zenId]);
r = await tryQuery("authenticated", user, `select count(*)::int n from public.places_in_bounds(100.0, 13.0, 101.0, 14.5, 1000) where id = $1`, [zenId]);
check("a place linked to a live venue isn't shown twice", r.rows?.[0]?.n === 0);
r = await tryQuery("authenticated", user, fn, [zenId, inHours(4)]);
const linkedId = r.rows?.[0]?.id;
r = await tryQuery("authenticated", user, `select venue_id, place_id from public.meetups where id = $1`, [linkedId]);
check("place linked to a partner venue becomes a venue table", r.rows?.[0]?.venue_id === venueId && r.rows?.[0]?.place_id === null);
r = await tryQuery("authenticated", unverified, fn, [placeId, inHours(2)]);
check("unverified user can't create at a place", /not_allowed/.test(r.error ?? ""));
r = await tryQuery("authenticated", user, `insert into public.meetups (place_id, host_id, starts_at, ends_at, max_people) values ($2, $1, now(), now() + interval '1 hour', 3)`, [user, placeId]);
check("direct insert of a place table blocked", !!r.error);

await tryQuery("authenticated", admin, `update public.venues set is_active = false where id = $1`, [venueId]);
r = await tryQuery("authenticated", user, `select public.create_meetup($1, $2, 3)`, [venueId, inHours(2)]);
check("can't create a table at a hidden venue", /venue_unavailable/.test(r.error ?? ""));
r = await tryQuery("authenticated", user, `select count(*)::int n from public.list_open_meetups()`);
check("tables at hidden venues aren't listed; place tables still are", r.rows?.[0]?.n === 1);
r = await tryQuery("anon", null, `select count(*)::int n from public.meetups`);
check("signed-out visitors can't read tables", !r.error && r.rows[0].n === 0);

// --- Deleting a venue cascades
await tryQuery("authenticated", admin, `delete from public.venues where id = $1`, [venueId]);
r = await tryQuery("service_role", null, `select (select count(*) from public.deals)::int d, (select count(*) from public.deal_coupons)::int c, (select count(*) from public.venue_accounts)::int a, (select count(*) from public.venue_account_secrets)::int s, (select count(*) from public.meetups where venue_id is not null)::int m, (select count(*) from public.meetup_members mm join public.meetups m on m.id = mm.meetup_id where m.venue_id is not null)::int mm`);
const c = r.rows?.[0];
check("deleting venue removes deal, coupon, logins, tables", c && c.d + c.c + c.a + c.s + c.m + c.mm === 0);

// --- Travellers (opt-in, 5 km, fuzzy) and direct messages
const [g0, g1, g2] = guests;
const loc = (who, lat, lng) => tryQuery("authenticated", who, `select public.update_my_location($1, $2)`, [lat, lng]);
const BKK = [13.7466, 100.5393];
await loc(user, ...BKK);
r = await tryQuery("service_role", null, `select count(*)::int n from public.user_locations`);
check("location not stored while not discoverable", r.rows?.[0]?.n === 0);
for (const who of [user, g0, g1]) await tryQuery("authenticated", who, `select public.set_discoverable(true)`);
await loc(user, ...BKK);
await loc(g0, BKK[0] + 0.009, BKK[1]); // ~1 km north
await loc(g1, BKK[0] + 0.072, BKK[1]); // ~8 km north
await loc(g2, BKK[0] + 0.001, BKK[1]); // not discoverable
r = await tryQuery("authenticated", user, `select * from public.nearby_travellers()`);
check("nearby shows only discoverable people within 5 km", r.rows?.length === 1 && r.rows[0].user_id === g0);
check("distance rounded to 0.5 km", Number(r.rows?.[0]?.distance_km) === 1);
const fuzz = r.rows?.[0];
r = await tryQuery("service_role", null,
  `select extensions.st_distance(extensions.st_setsrid(extensions.st_makepoint($2, $1), 4326)::extensions.geography, l.location) d from public.user_locations l where l.user_id = $3`,
  [fuzz?.fuzzy_lat, fuzz?.fuzzy_lng, g0]);
const fuzzMeters = Number(r.rows?.[0]?.d);
check("dot is moved 150-400 m from the real spot", fuzzMeters >= 140 && fuzzMeters <= 410);
r = await tryQuery("authenticated", user, `select fuzzy_lat from public.nearby_travellers()`);
check("dot stays put on repeat looks (no averaging)", r.rows?.[0]?.fuzzy_lat === fuzz?.fuzzy_lat);
r = await tryQuery("authenticated", g2, `select count(*)::int n from public.nearby_travellers()`);
check("people who aren't discoverable can't browse travellers", r.rows?.[0]?.n === 0);
r = await tryQuery("authenticated", user, `select * from public.user_locations`);
check("exact locations unreadable through the API", !!r.error);
await db.exec(`update public.user_locations set updated_at = now() - interval '3 hours' where user_id = '${g0}'`);
r = await tryQuery("authenticated", user, `select count(*)::int n from public.nearby_travellers()`);
check("locations older than 2 hours are hidden", r.rows?.[0]?.n === 0);
await loc(g0, BKK[0] + 0.009, BKK[1]);

const dm = (from, to, body) => tryQuery("authenticated", from, `select public.send_direct_message($1, $2) as id`, [to, body]);
r = await dm(user, g0, "Hi! Want to grab noodles?");
check("first message to someone nearby starts a request", !r.error);
const threadId = r.rows?.[0]?.id;
r = await dm(user, g0, "Hello??");
check("only one message until the request is answered", /request_pending/.test(r.error ?? ""));
r = await dm(g0, user, "Sure!");
check("receiver replying accepts the request", !r.error);
r = await dm(user, g0, "Great, 7pm?");
check("after accepting, both can keep messaging", !r.error);
r = await tryQuery("authenticated", g0, `select count(*)::int n from public.direct_messages where thread_id = $1`, [threadId]);
check("participants read the conversation", r.rows?.[0]?.n === 3);
r = await tryQuery("authenticated", g1, `select count(*)::int n from public.direct_messages where thread_id = $1`, [threadId]);
check("outsiders can't read it", r.rows?.[0]?.n === 0);
r = await tryQuery("authenticated", user, `insert into public.direct_messages (thread_id, sender_id, body) values ($1, $2, 'x')`, [threadId, user]);
check("direct inserts blocked (must use send_direct_message)", !!r.error);
r = await dm(user, g1, "hey");
check("can't message someone 8 km away", /too_far/.test(r.error ?? ""));
r = await dm(user, g2, "hey");
check("can't message someone who isn't discoverable", /not_visible/.test(r.error ?? ""));
r = await dm(user, g0, "   ");
check("empty message rejected", /empty_message/.test(r.error ?? ""));
r = await dm(unverified, g0, "hey");
check("unverified users can't send messages", /not_allowed/.test(r.error ?? ""));
r = await tryQuery("authenticated", user, `select * from public.list_my_threads()`);
check("inbox lists the thread with the other person's name", r.rows?.length === 1 && r.rows[0].other_id === g0 && r.rows[0].last_body === "Great, 7pm?");

await loc(g1, BKK[0] + 0.02, BKK[1]); // g1 moves within 5 km
r = await dm(g1, user, "Hi from nearby");
const reqId = r.rows?.[0]?.id;
check("second person sends a request", !r.error);
r = await tryQuery("authenticated", g1, `select public.respond_direct_request($1, true)`, [reqId]);
check("sender can't accept their own request", /not_found/.test(r.error ?? ""));
r = await tryQuery("authenticated", user, `select public.respond_direct_request($1, false)`, [reqId]);
check("receiver declines", !r.error);
r = await dm(g1, user, "Please?");
check("declined requester can't keep messaging", /request_declined/.test(r.error ?? ""));
r = await tryQuery("authenticated", user, `select count(*)::int n from public.list_my_threads() where thread_id = $1`, [reqId]);
check("declined request disappears from the decliner's inbox", r.rows?.[0]?.n === 0);

r = await tryQuery("authenticated", g0, `insert into public.blocks (blocker_id, blocked_id) values ($1, $2)`, [g0, user]);
check("user can block someone", !r.error);
r = await dm(user, g0, "still there?");
check("blocked people can't message", /blocked/.test(r.error ?? ""));
r = await tryQuery("authenticated", user, `select count(*)::int n from public.list_my_threads() where thread_id = $1`, [threadId]);
check("blocked conversation hidden from both", r.rows?.[0]?.n === 0);
r = await tryQuery("authenticated", g0, `select count(*)::int n from public.nearby_travellers() where user_id = $1`, [user]);
check("blocked people don't see each other nearby", r.rows?.[0]?.n === 0);
r = await tryQuery("authenticated", user, `insert into public.blocks (blocker_id, blocked_id) values ($1, $2)`, [g0, g1]);
check("can't create blocks for someone else", !!r.error);

r = await tryQuery("authenticated", user, `insert into public.reports (reporter_id, reported_id, context, reason) values ($1, $2, 'traveller', 'Rude messages')`, [user, g1]);
check("user can report someone", !r.error);
r = await tryQuery("authenticated", user, `insert into public.reports (reporter_id, reported_id, context, reason) values ($1, $2, 'traveller', 'x')`, [g1, user]);
check("can't file a report as someone else", !!r.error);
r = await tryQuery("authenticated", user, `select count(*)::int n from public.reports`);
check("users can't read reports", r.rows?.[0]?.n === 0);
r = await tryQuery("authenticated", admin, `select count(*)::int n from public.reports`);
check("founder reads reports", r.rows?.[0]?.n === 1);

await tryQuery("authenticated", user, `select public.set_discoverable(false)`);
r = await tryQuery("service_role", null, `select count(*)::int n from public.user_locations where user_id = $1`, [user]);
check("turning visibility off deletes the stored location", r.rows?.[0]?.n === 0);

// --- Table chat
r = await tryQuery("authenticated", user, `insert into public.meetup_messages (meetup_id, sender_id, body) values ($1, $2, 'See you at 8!')`, [placeMeetupId, user]);
check("table member can post in the table chat", !r.error);
r = await tryQuery("authenticated", g1, `select count(*)::int n from public.meetup_messages where meetup_id = $1`, [placeMeetupId]);
check("other members read the table chat", r.rows?.[0]?.n === 1);
r = await tryQuery("authenticated", g2, `select count(*)::int n from public.meetup_messages where meetup_id = $1`, [placeMeetupId]);
check("non-members can't read the table chat", r.rows?.[0]?.n === 0);
r = await tryQuery("authenticated", g2, `insert into public.meetup_messages (meetup_id, sender_id, body) values ($1, $2, 'hi')`, [placeMeetupId, g2]);
check("non-members can't post in the table chat", !!r.error);
r = await tryQuery("authenticated", g1, `insert into public.meetup_messages (meetup_id, sender_id, body) values ($1, $2, 'fake')`, [placeMeetupId, user]);
check("can't post as someone else", !!r.error);

// --- Hangouts: places, spots, venues, ticket discounts and free entry
r = await tryQuery("anon", null, `select count(*)::int n from public.places where purpose = 'hangout'`);
check("Bangkok hangout places seeded", r.rows?.[0]?.n > 2000);
r = await tryQuery("anon", null, `select id, kind from public.places where osm_type = 'way' and osm_id = 23483299`);
const lumphiniId = r.rows?.[0]?.id;
check("Lumphini Park is a hangout place", r.rows?.[0]?.kind === "park");
r = await tryQuery("authenticated", user, `select count(*)::int n from public.places_in_bounds(100.0, 13.0, 101.0, 14.5, 1000) where id = $1`, [lumphiniId]);
check("food map doesn't show hangout places", r.rows?.[0]?.n === 0);
r = await tryQuery("authenticated", user, `select count(*)::int n from public.places_in_bounds(100.535, 13.725, 100.548, 13.736, 400, 'hangout') where id = $1`, [lumphiniId]);
check("hangout map shows hangout places", r.rows?.[0]?.n === 1);
r = await tryQuery("authenticated", user, `select count(*)::int n from public.places_in_bounds(100.0, 13.0, 101.0, 14.5, 1000, 'hangout') where id = $1`, [placeId]);
check("hangout map doesn't show food places", r.rows?.[0]?.n === 0);
r = await tryQuery("authenticated", user, `select public.create_meetup_at_place($1, $2, 4)`, [lumphiniId, inHours(2)]);
check("tables can't be created at a hangout place", /venue_unavailable/.test(r.error ?? ""));

const hangout = (who, a) =>
  tryQuery("authenticated", who,
    `select public.create_hangout(p_title => $1, p_description => $2, p_starts_at => $3, p_duration_minutes => $4,
       p_max_people => $5, p_venue_id => $6, p_place_id => $7, p_spot_lat => $8, p_spot_lng => $9, p_spot_name => $10) as id`,
    [a.title ?? "Sunset walk", a.description ?? "", a.startsAt ?? inHours(2), a.duration ?? 120, a.size ?? 2,
      a.venueId ?? null, a.placeId ?? null, a.lat ?? null, a.lng ?? null, a.spotName ?? null]);

r = await hangout(user, { placeId: lumphiniId, description: "  Bring water  " });
check("hangout at a hangout place", !r.error);
const hangoutId = r.rows?.[0]?.id;
r = await tryQuery("authenticated", user, `select kind, place_name, description, (ends_at - starts_at) = interval '2 hours' as two_hours from public.list_open_meetups() where id = $1`, [hangoutId]);
check("hangout listed with kind, place, description and its own length",
  r.rows?.[0]?.kind === "hangout" && r.rows[0].place_name === "สวนลุมพินี" && r.rows[0].description === "Bring water" && r.rows[0].two_hours === true);
r = await hangout(user, { lat: 13.7466, lng: 100.5393, spotName: "  Siam BTS exit 1  ", size: 30, duration: 720 });
check("hangout at any spot on the map, 30 people, 12 hours", !r.error);
const spotHangoutId = r.rows?.[0]?.id;
r = await tryQuery("authenticated", g1, `select place_id, place_name, place_lat, joined from public.list_open_meetups() where id = $1`, [spotHangoutId]);
check("spot hangout listed with the spot's name and pin", r.rows?.[0]?.place_id === null && r.rows[0].place_name === "Siam BTS exit 1" && r.rows[0].place_lat === 13.7466 && r.rows[0].joined === false);
r = await hangout(user, { lat: 18.79, lng: 98.98, spotName: "Chiang Mai" });
check("spot outside Bangkok rejected", /outside_bangkok/.test(r.error ?? ""));
r = await hangout(user, { lat: 13.75, lng: 100.5, spotName: "   " });
check("spot without a name rejected", /spot_name_required/.test(r.error ?? ""));
r = await hangout(user, { placeId: lumphiniId, lat: 13.75, lng: 100.5, spotName: "x" });
check("hangout with two locations rejected", /invalid_place/.test(r.error ?? ""));
r = await hangout(user, { placeId: lumphiniId, size: 31 });
check("hangout larger than 30 rejected", /invalid_size/.test(r.error ?? ""));
r = await hangout(user, { placeId: lumphiniId, size: 1 });
check("hangout of 1 rejected", /invalid_size/.test(r.error ?? ""));
r = await hangout(user, { placeId: lumphiniId, title: "   " });
check("hangout without a title rejected", /title_required/.test(r.error ?? ""));
r = await hangout(user, { placeId: lumphiniId, duration: 15 });
check("hangout shorter than 30 min rejected", /invalid_duration/.test(r.error ?? ""));
r = await hangout(user, { placeId: lumphiniId, duration: 13 * 60 });
check("hangout longer than 12 hours rejected", /invalid_duration/.test(r.error ?? ""));
r = await hangout(user, { placeId: lumphiniId, startsAt: inHours(24 * 15) });
check("hangout more than 14 days ahead rejected", /invalid_time/.test(r.error ?? ""));
r = await hangout(unverified, { placeId: lumphiniId });
check("unverified user can't create a hangout", /not_allowed/.test(r.error ?? ""));
r = await tryQuery("anon", null, `select public.create_hangout('x', '', now() + interval '1 hour', 60, 2, null, $1)`, [lumphiniId]);
check("signed-out visitor can't create a hangout", !!r.error);
r = await tryQuery("authenticated", user, `insert into public.meetups (kind, spot_name, spot_lat, spot_lng, host_id, title, starts_at, ends_at, max_people) values ('hangout', 'x', 13.7, 100.5, $1, 'x', now(), now() + interval '1 hour', 2)`, [user]);
check("direct insert of a hangout blocked", !!r.error);

r = await tryQuery("authenticated", g1, `select public.join_meetup($1)`, [hangoutId]);
check("people join a hangout like a table", !r.error);
r = await tryQuery("authenticated", g2, `select public.join_meetup($1)`, [hangoutId]);
check("a hangout for 2 is full with 2", /meetup_full/.test(r.error ?? ""));
r = await tryQuery("authenticated", g1, `insert into public.meetup_messages (meetup_id, sender_id, body) values ($1, $2, 'Meet at the gate')`, [hangoutId, g1]);
check("hangout members use the group chat", !r.error);

r = await tryQuery("authenticated", admin,
  `insert into public.venues (name_en, name_th, category, lat, lng, is_active) values ('Benjakitti Park', 'สวนเบญจกิติ', 'park', 13.7301, 100.5585, true) returning id`);
check("admin can create a hangout venue", !r.error);
const parkVenueId = r.rows?.[0]?.id;
r = await tryQuery("authenticated", user, `select public.create_meetup($1, $2, 3)`, [parkVenueId, inHours(2)]);
check("tables can't be created at a hangout venue", /venue_unavailable/.test(r.error ?? ""));
r = await hangout(user, { venueId: parkVenueId });
check("hangout at a hangout venue", !r.error);
r = await hangout(user, { lat: 13.75, lng: 100.5, spotName: "Somewhere" });
check("a person can host at most 3 open hangouts", /too_many_open/.test(r.error ?? ""));
r = await tryQuery("authenticated", g2, `select public.create_meetup_at_place($1, $2, 3)`, [placeId, inHours(6)]);
check("hangouts don't count towards the 3-table limit", !r.error);

const promo = (args) => tryQuery("authenticated", admin, `select public.admin_save_promotion($1, null, ${args}) as id`, [parkVenueId]);
r = await promo(`'ticket', '20% off entry', 'ลดค่าเข้า 20%', '', '', 'percent', 20, 'PARK20', null, null, true`);
check("ongoing ticket discount with a coupon code", !r.error);
r = await tryQuery("authenticated", admin, `select coupon_code from public.deal_coupons where deal_id = $1`, [r.rows?.[0]?.id]);
check("ticket discount stores its coupon code", r.rows?.[0]?.coupon_code === "PARK20");
r = await promo(`'ticket', 'Festival ฿100 off', 'ลด 100 บาท', '', '', 'fixed_thb', 100, 'FEST100', now() + interval '3 days', now() + interval '4 days', true`);
check("dated ticket discount for an event (several tickets per venue)", !r.error);
r = await promo(`'ticket', 'x', 'x', '', '', 'percent', 10, '', null, null, true`);
check("ticket discount without a coupon code rejected", !!r.error);
r = await promo(`'ticket', 'x', 'x', '', '', 'other', null, 'X', null, null, true`);
check("ticket discount without an amount rejected", !!r.error);
r = await promo(`'free_entry', 'Free entry', 'เข้าฟรี', '', '', 'other', null, null, null, null, true`);
check("free entry listing without a coupon", !r.error);
const freeId = r.rows?.[0]?.id;
r = await tryQuery("authenticated", admin, `select count(*)::int n from public.deal_coupons where deal_id = $1`, [freeId]);
check("free entry has no coupon code", r.rows?.[0]?.n === 0);
r = await promo(`'free_entry', 'x', 'x', '', '', 'other', null, null, now() + interval '1 day', null, true`);
check("free entry with only a start date rejected", !!r.error);
r = await tryQuery("authenticated", user, `select count(*)::int n from public.deals where venue_id = $1`, [parkVenueId]);
check("app users see the hangout venue's promotions", r.rows?.[0]?.n === 3);

// --- Ticket links and official websites
r = await tryQuery("anon", null, `select count(*)::int n from public.places where website is not null`);
check("official websites of hangout places seeded (https only)", r.rows?.[0]?.n > 100);
r = await tryQuery("anon", null, `select count(*)::int n from public.places where website not like 'https://%'`);
check("no non-https websites stored", r.rows?.[0]?.n === 0);
r = await tryQuery("anon", null, `select lat, lng, website from public.places where osm_type = 'node' and osm_id = 1696984912`);
const tussauds = r.rows?.[0];
check("Madame Tussauds has its official website", tussauds?.website === "https://www.madametussauds.com/bangkok");
r = await tryQuery("authenticated", user, `select website from public.places_in_bounds($2 - 0.001, $1 - 0.001, $2 + 0.001, $1 + 0.001, 400, 'hangout') where website is not null`, [tussauds?.lat, tussauds?.lng]);
check("hangout map gets place websites", r.rows?.some((row) => row.website === tussauds?.website));
r = await tryQuery("authenticated", admin, `update public.venues set ticket_url = 'https://tickets.example.com/park' where id = $1 returning id`, [parkVenueId]);
check("founder sets a venue's ticket link", r.rows?.length === 1);
r = await tryQuery("authenticated", admin, `update public.venues set ticket_url = 'http://tickets.example.com' where id = $1`, [parkVenueId]);
check("non-https ticket link rejected", !!r.error);
r = await tryQuery("authenticated", admin, `update public.venues set ticket_url = 'javascript:alert(1)' where id = $1`, [parkVenueId]);
check("script links rejected", !!r.error);
r = await tryQuery("anon", null, `select ticket_url from public.venues where id = $1`, [parkVenueId]);
check("anyone can read a live venue's ticket link", r.rows?.[0]?.ticket_url === "https://tickets.example.com/park");
r = await promo(`'event', 'Lantern night', 'คืนโคมไฟ', '', '', 'other', null, null, now() + interval '5 days', now() + interval '5 days 4 hours', true, ' https://tickets.example.com/lanterns '`);
const lanternId = r.rows?.[0]?.id;
r = await tryQuery("authenticated", user, `select ticket_url from public.deals where id = $1`, [lanternId]);
check("event saved with its own ticket link (trimmed)", r.rows?.[0]?.ticket_url === "https://tickets.example.com/lanterns");
r = await promo(`'event', 'x', 'x', '', '', 'other', null, null, now() + interval '5 days', now() + interval '6 days', true, 'ftp://x'`);
check("event with a non-https ticket link rejected", !!r.error);
r = await tryQuery("authenticated", user, `select public.admin_save_promotion($1, null, 'event', 'x', 'x', '', '', 'other', null, null, now() + interval '1 day', now() + interval '2 days', true, 'https://x.com')`, [parkVenueId]);
check("app users can't save promotions with ticket links", !!r.error);

// --- Website clean-up and entry (Tickets / Free entry buttons)
r = await tryQuery("anon", null, `select count(*)::int n from public.places where website ~ '(youtu|facebook|wikipedia|linktr|meechaitravel|pantipplaza)'`);
check("wrong / unofficial websites removed", r.rows?.[0]?.n === 0);
r = await tryQuery("anon", null, `select website from public.places where name_en = 'Wat Phra Kaew'`);
check("wrong website corrected to the official one", r.rows?.[0]?.website === "https://www.royalgrandpalace.th/en/home");
const entryOf = async (type, id) =>
  (await tryQuery("anon", null, `select entry from public.places where osm_type = $1 and osm_id = $2`, [type, id])).rows?.[0]?.entry;
check("Grand Palace: free for Thai citizens", (await entryOf("way", 23482754)) === "free_thai");
check("Wat Pho: free for Thai citizens", (await entryOf("way", 376312450)) === "free_thai");
check("Bangkok National Museum: ticket", (await entryOf("relation", 20505832)) === "ticket");
check("Suan Luang Rama IX: ticket (10 baht) despite being a park", (await entryOf("way", 33042465)) === "ticket");
check("Lumphini Park: free (public park)", (await entryOf("way", 23483299)) === "free");
check("Chatuchak Market: free", (await entryOf("way", 37911198)) === "free");
check("MahaNakhon SkyWalk: ticket", (await entryOf("node", 6259620985)) === "ticket");
r = await tryQuery("anon", null, `select website from public.places where osm_type = 'node' and osm_id = 6259620985`);
check("MahaNakhon SkyWalk has its official website", r.rows?.[0]?.website === "https://kingpowermahanakhon.co.th/");
r = await tryQuery("anon", null, `select website from public.places where osm_type = 'way' and osm_id = 706259602`);
check("Safari World has the founder's website", r.rows?.[0]?.website === "https://www.safariworld.online/");
r = await tryQuery("anon", null, `select website from public.places where osm_type = 'way' and osm_id = 666021136`);
check("Erawan Museum has its official website", r.rows?.[0]?.website === "https://www.erawanmuseum.com/en/rate/");
check("Chong Nonsi Skywalk: free", (await entryOf("way", 198877011)) === "free");
r = await tryQuery("anon", null, `select count(*) filter (where entry = 'free')::int f, count(*) filter (where entry is null)::int u from public.places where kind = 'temple'`);
check("temples are free, except the checked paid ones and Wat Hua Lamphong (unconfirmed)", r.rows?.[0]?.f > 800 && r.rows[0].u === 1);
r = await tryQuery("anon", null, `select count(*)::int n from public.places where purpose = 'food' and entry is not null`);
check("food places have no entry", r.rows?.[0]?.n === 0);
r = await tryQuery("authenticated", user, `select count(*)::int n, count(*) filter (where entry = 'free')::int f from public.places_in_bounds(100.0, 13.0, 101.0, 14.5, 1000, 'hangout', array['free'])`);
check("entry filter returns only matching places", r.rows?.[0]?.n > 0 && r.rows[0].n === r.rows[0].f);
r = await tryQuery("authenticated", user, `select count(*)::int n from public.places_in_bounds(100.48, 13.73, 100.51, 13.76, 400, 'hangout', array['ticket', 'free_thai']) where entry = 'free_thai'`);
check("Tickets (English) includes free-for-Thais temples", r.rows?.[0]?.n >= 3);
r = await tryQuery("authenticated", admin, `update public.venues set entry = 'free_thai' where id = $1 returning id`, [parkVenueId]);
check("founder sets a venue's entry", r.rows?.length === 1);
r = await tryQuery("authenticated", admin, `update public.venues set entry = 'maybe' where id = $1`, [parkVenueId]);
check("unknown entry value rejected", !!r.error);

// --- Map search (places of that map + Bangkok areas)
r = await tryQuery("anon", null, `select count(*)::int n from public.areas`);
check("Bangkok areas seeded and readable by anyone", r.rows?.[0]?.n > 1000);
r = await tryQuery("authenticated", user, `insert into public.areas (osm_type, osm_id, kind, name, lat, lng) values ('node', 1, 'road', 'Fake Road', 13.7, 100.5)`);
check("app users can't add areas", !!r.error);
r = await tryQuery("anon", null, `select result_type, name_en, kind from public.search_map('sukhumvit', 'food') where result_type = 'area'`);
check("search finds areas and roads (Sukhumvit)", r.rows?.some((row) => row.name_en === "Sukhumvit Road"));
r = await tryQuery("anon", null, `select result_type, name from public.search_map('manna', 'food') where result_type = 'place'`);
check("food search finds food places", r.rows?.some((row) => row.name === "Manna"));
r = await tryQuery("anon", null, `select count(*)::int n from public.search_map('lumphini', 'food') where result_type = 'place' and kind = 'park'`);
check("food search doesn't return hangout places", r.rows?.[0]?.n === 0);
r = await tryQuery("anon", null, `select entry, kind from public.search_map('lumphini park', 'hangout') where result_type = 'place'`);
check("hangout search finds hangout places, with their entry", r.rows?.some((row) => row.kind === "park" && row.entry === "free"));
r = await tryQuery("anon", null, `select count(*)::int n from public.search_map('สยาม', 'hangout')`);
check("search works in Thai", r.rows?.[0]?.n > 0);
r = await tryQuery("anon", null, `select count(*)::int n from public.search_map('%', 'food')`);
check("% is searched literally, not as a wildcard", r.rows?.[0]?.n === 0);
r = await tryQuery("anon", null, `select count(*)::int n from public.search_map('a', 'food')`);
check("one-letter searches return nothing", r.rows?.[0]?.n === 0);

console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
