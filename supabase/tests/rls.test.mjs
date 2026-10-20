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
  grant select, insert, update, delete on storage.objects to anon, authenticated, service_role;
  create publication supabase_realtime;
  -- pg_net stand-in: records the push requests instead of sending them.
  create schema net;
  create table net.calls (id serial primary key, url text, body jsonb);
  create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}',
    timeout_milliseconds integer default 5000) returns bigint language sql as $$
    insert into net.calls (url, body) values (url, body) returning id::bigint $$;
`);

await db.exec(migration);
console.log("migration applied OK");
// The checks below were written for the launch rules (phone required); the "no phone check" mode is tested at the end.
await db.exec(`update public.app_settings set require_phone_verification = true`);
// Plus features are unlocked for the older checks; the Plus lock is tested at the end.
await db.exec(`update public.app_settings set plus_locked = false`);

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
r = await tryQuery("anon", null, `select public.place_dots('hangout') as dots`);
check("hangout dots include the place as [id, kind, lat, lng]", (r.rows?.[0]?.dots ?? []).some((d) => d[0] === lumphiniId && d.length === 4 && typeof d[2] === "number"));
r = await tryQuery("anon", null, `select public.place_dots('food') as dots`);
check("food dots leave out hangout places", Array.isArray(r.rows?.[0]?.dots) && !r.rows[0].dots.some((d) => d[0] === lumphiniId));
r = await tryQuery("authenticated", user, `select count(*)::int n from public.places_in_bounds(100.0, 13.0, 101.0, 14.5, 1000, 'hangout') where id = $1`, [placeId]);
check("hangout map doesn't show food places", r.rows?.[0]?.n === 0);
r = await tryQuery("authenticated", user, `select public.create_meetup_at_place($1, $2, 4)`, [lumphiniId, inHours(2)]);
check("tables can't be created at a hangout place", /venue_unavailable/.test(r.error ?? ""));

const hangout = (who, a) =>
  tryQuery("authenticated", who,
    `select public.create_hangout(p_title => $1, p_description => $2, p_starts_at => $3, p_duration_minutes => $4,
       p_max_people => $5, p_venue_id => $6, p_place_id => $7, p_spot_lat => $8, p_spot_lng => $9, p_spot_name => $10,
       p_time_zone => $11) as id`,
    [a.title ?? "Sunset walk", a.description ?? "", a.startsAt ?? inHours(2), a.duration ?? 120, a.size ?? 2,
      a.venueId ?? null, a.placeId ?? null, a.lat ?? null, a.lng ?? null, a.spotName ?? null, a.zone ?? null]);

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
r = await tryQuery("authenticated", user, `select time_zone from public.list_open_meetups() where id = $1`, [spotHangoutId]);
check("a Bangkok spot without a zone gets Bangkok time", r.rows?.[0]?.time_zone === "Asia/Bangkok");
r = await hangout(user, { lat: 18.79, lng: 98.98, spotName: "Chiang Mai" });
check("spot outside Bangkok needs its time zone", /invalid_time_zone/.test(r.error ?? ""));
r = await hangout(user, { lat: 48.8606, lng: 2.3376, spotName: "Louvre", zone: "Mars/Olympus_Mons" });
check("made-up time zone rejected", /invalid_time_zone/.test(r.error ?? ""));
r = await hangout(user, { lat: 91, lng: 2.3, spotName: "Nowhere", zone: "Europe/Paris" });
check("spot off the globe rejected", /invalid_place/.test(r.error ?? ""));
r = await hangout(g1, { lat: 48.8606, lng: 2.3376, spotName: "Louvre", zone: "Europe/Paris" });
check("hangout anywhere in the world with its time zone", !r.error);
const parisHangoutId = r.rows?.[0]?.id;
r = await tryQuery("authenticated", user, `select place_name, time_zone from public.list_open_meetups() where id = $1`, [parisHangoutId]);
check("world hangout listed with its spot and zone", r.rows?.[0]?.place_name === "Louvre" && r.rows[0].time_zone === "Europe/Paris");
r = await tryQuery("authenticated", user, `select count(*)::int n from public.my_notifications(100) where meetup_id = $1`, [parisHangoutId]);
check("Bangkok users aren't notified of a Paris hangout", r.rows?.[0]?.n === 0);
r = await tryQuery("authenticated", user, `select count(*)::int n from public.my_notifications(100, 48.85, 2.35) where meetup_id = $1`, [parisHangoutId]);
check("people near Paris are notified of it", r.rows?.[0]?.n === 1);
r = await tryQuery("authenticated", g1, `select public.cancel_meetup($1)`, [parisHangoutId]);
check("world hangout cancelled like any other", !r.error);
r = await tryQuery("authenticated", user, `select public.create_meetup_at_place($1, $2, 4)`, [lumphiniId, inHours(2)]);
check("tables still need a Bangkok food place", /venue_unavailable/.test(r.error ?? ""));
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

// --- Google accounts without a phone check, profiles, follows, feedback
r = await tryQuery("authenticated", unverified, `select public.create_meetup_at_place($1, $2, 3)`, [placeId, inHours(30)]);
check("with the phone check on, a Google account without a phone can't create", /not_allowed/.test(r.error ?? ""));
await db.exec(`update public.app_settings set require_phone_verification = false`);
r = await tryQuery("authenticated", unverified, `select public.create_meetup_at_place($1, $2, 3) as id`, [placeId, inHours(30)]);
check("with the phone check off (for now), a Google account can create a table", !r.error);
const googleTableId = r.rows?.[0]?.id;
await db.exec(`update public.app_settings set allow_guest_meetups = false`);
r = await tryQuery("authenticated", g0, `select public.join_meetup($1)`, [googleTableId]);
check("guests still need allow_guest_meetups", /not_allowed/.test(r.error ?? ""));
await db.exec(`update public.app_settings set allow_guest_meetups = true`);
r = await tryQuery("authenticated", user, `update public.app_settings set require_phone_verification = false returning id`);
check("app users can't change the phone setting", !r.error && r.rows.length === 0);

r = await tryQuery("authenticated", user, `select public.update_my_profile('  Somchai J.  ', 'https://www.instagram.com/somchai.eats/?igsh=abc')`);
check("profile saved; Instagram link turned into a handle", !r.error);
r = await tryQuery("authenticated", g1, `select display_name, instagram from public.profiles where id = $1`, [user]);
check("others see the name and Instagram handle", r.rows?.[0]?.display_name === "Somchai J." && r.rows[0].instagram === "somchai.eats");
r = await tryQuery("authenticated", user, `select public.update_my_profile('Somchai', '@bad handle!')`);
check("invalid Instagram rejected", /invalid_instagram/.test(r.error ?? ""));
r = await tryQuery("authenticated", user, `select public.update_my_profile('   ', null)`);
check("empty name rejected", /name_required/.test(r.error ?? ""));
r = await tryQuery("authenticated", user, `update public.profiles set instagram = 'no spaces allowed' where id = $1`, [user]);
check("bad Instagram blocked even on direct update", !!r.error);

r = await tryQuery("authenticated", g1, `select public.follow_user($1)`, [user]);
check("follow someone", !r.error);
r = await tryQuery("authenticated", g1, `select public.follow_user($1)`, [user]);
check("following twice is harmless", !r.error);
r = await tryQuery("authenticated", g1, `select public.follow_user($1)`, [g1]);
check("can't follow yourself", /not_found/.test(r.error ?? ""));
r = await tryQuery("authenticated", user, `insert into public.follows (follower_id, followee_id) values ($1, $2)`, [g2, user]);
check("can't create follows directly (or for someone else)", !!r.error);
r = await tryQuery("authenticated", user, `select public.follow_user($1)`, [g0]);
check("can't follow someone across a block", /blocked/.test(r.error ?? ""));
r = await tryQuery("authenticated", user, `select public.follow_user($1)`, [g1]);
r = await tryQuery("authenticated", g1, `select followers, following, i_follow, follows_me from public.get_profile($1)`, [user]);
check("profile counts followers / following and mutual follow", r.rows?.[0]?.followers === 1 && r.rows[0].following === 1 && r.rows[0].i_follow && r.rows[0].follows_me);
r = await tryQuery("authenticated", g1, `select public.unfollow_user($1)`, [user]);
r = await tryQuery("authenticated", g2, `select followers from public.get_profile($1)`, [user]);
check("unfollow", r.rows?.[0]?.followers === 0);
r = await tryQuery("authenticated", g0, `select count(*)::int n from public.get_profile($1)`, [user]);
check("blocked people can't see each other's profile", r.rows?.[0]?.n === 0);
r = await tryQuery("anon", null, `select count(*)::int n from public.get_profile($1)`, [user]);
check("signed-out visitors can't load profiles", !!r.error || r.rows?.[0]?.n === 0);
await tryQuery("authenticated", g2, `select public.follow_user($1)`, [g1]);
await tryQuery("authenticated", g1, `insert into public.blocks (blocker_id, blocked_id) values ($1, $2)`, [g1, g2]);
r = await tryQuery("service_role", null, `select count(*)::int n from public.follows where follower_id = $1 and followee_id = $2`, [g2, g1]);
check("blocking removes follows", r.rows?.[0]?.n === 0);
await db.exec(`delete from public.blocks where blocker_id = '${g1}' and blocked_id = '${g2}'`);

// Feedback: a hangout of user + g1 + g2 that has ended.
r = await hangout(g2, { lat: 13.75, lng: 100.5, spotName: "Feedback test", size: 5 });
const fbId = r.rows?.[0]?.id;
await tryQuery("authenticated", user, `select public.join_meetup($1)`, [fbId]);
await tryQuery("authenticated", g1, `select public.join_meetup($1)`, [fbId]);
const vote = (who, to, v) => tryQuery("authenticated", who, `select public.give_feedback($1, $2, $3)`, [fbId, to, v]);
r = await vote(user, g1, 1);
check("no feedback before it has ended", /meetup_not_ended/.test(r.error ?? ""));
await db.exec(`update public.meetups set starts_at = now() - interval '3 hours', ends_at = now() - interval '1 hour' where id = '${fbId}'`);
r = await vote(user, g1, 1);
check("member gives 👍 after it ended", !r.error);
r = await vote(g2, g1, -1);
check("another member gives 👎", !r.error);
r = await vote(user, g1, -1);
check("a vote can be changed", !r.error);
r = await vote(user, g1, 1);
r = await vote(user, user, 1);
check("can't rate yourself", /not_member/.test(r.error ?? ""));
r = await vote(g0, g1, 1);
check("non-members can't rate", /not_member/.test(r.error ?? ""));
r = await vote(user, g1, 5);
check("only 👍 or 👎", /invalid_vote/.test(r.error ?? ""));
r = await tryQuery("authenticated", user, `insert into public.member_feedback (meetup_id, from_id, to_id, vote) values ($1, $2, $3, 1)`, [fbId, user, g2]);
check("feedback can't be written directly", !!r.error);
r = await tryQuery("authenticated", g1, `select count(*)::int n from public.member_feedback where to_id = $1`, [g1]);
check("who gave what stays private", r.rows?.[0]?.n === 0);
r = await tryQuery("authenticated", user, `select vote from public.member_feedback where meetup_id = $1 and to_id = $2`, [fbId, g1]);
check("people see the vote they gave", r.rows?.[0]?.vote === 1);
r = await tryQuery("authenticated", g2, `select thumbs_up, thumbs_down, hangouts from public.get_profile($1)`, [g1]);
check("profile shows 👍 / 👎 totals and hangouts attended", r.rows?.[0]?.thumbs_up === 1 && r.rows[0].thumbs_down === 1 && r.rows[0].hangouts === 1);
r = await vote(user, g1, 0);
r = await tryQuery("authenticated", g2, `select thumbs_up from public.get_profile($1)`, [g1]);
check("a vote can be taken back", r.rows?.[0]?.thumbs_up === 0);
await db.exec(`update public.meetups set starts_at = now() - interval '20 days', ends_at = now() - interval '19 days' where id = '${fbId}'`);
r = await vote(user, g1, 1);
check("feedback closes 14 days after the end", /feedback_closed/.test(r.error ?? ""));

// --- Profile picture and best photos
const photo = (who, name) =>
  tryQuery("authenticated", who, `insert into storage.objects (bucket_id, name) values ('profile-photos', $1) returning id`, [name]);
r = await photo(user, `${user}/avatar-1.jpg`);
check("people upload photos to their own folder", !r.error);
r = await photo(user, `${g1}/sneaky.jpg`);
check("can't upload into someone else's folder", !!r.error);
r = await tryQuery("authenticated", user, `select public.update_my_photos($1, $2)`, [`${user}/avatar-1.jpg`, [`${user}/a.jpg`, `${user}/b.jpg`, `${user}/c.jpg`]]);
check("save profile picture and 3 best photos", !r.error);
r = await tryQuery("authenticated", g1, `select avatar_path, photo_paths from public.get_profile($1)`, [user]);
check("others see the picture and photos on the profile", r.rows?.[0]?.avatar_path === `${user}/avatar-1.jpg` && r.rows[0].photo_paths?.length === 3);
r = await tryQuery("authenticated", user, `select public.update_my_photos(null, $1)`, [[`${user}/a.jpg`, `${user}/b.jpg`, `${user}/c.jpg`, `${user}/d.jpg`]]);
check("at most 3 best photos", /too_many_photos/.test(r.error ?? ""));
r = await tryQuery("authenticated", user, `select public.update_my_photos($1, '{}')`, [`${g1}/x.jpg`]);
check("can't use someone else's photo", /invalid_photo/.test(r.error ?? ""));
r = await tryQuery("authenticated", user, `update public.profiles set photo_paths = $2 where id = $1`, [user, [`${user}/1.jpg`, `${user}/2.jpg`, `${user}/3.jpg`, `${user}/4.jpg`]]);
check("more than 3 photos blocked even on direct update", !!r.error);
r = await tryQuery("authenticated", g1, `delete from storage.objects where bucket_id = 'profile-photos' and name = $1 returning id`, [`${user}/avatar-1.jpg`]);
check("can't delete someone else's photo", !r.error && r.rows.length === 0);
r = await tryQuery("authenticated", user, `delete from storage.objects where bucket_id = 'profile-photos' and name = $1 returning id`, [`${user}/avatar-1.jpg`]);
check("people delete their own photos", r.rows?.length === 1);

// --- Day planner
r = await tryQuery("anon", null, `select count(*)::int n from public.transit_stations`);
check("anyone can read rail stations", !r.error);
r = await tryQuery("anon", null, `select name_en, cardinality(station_ids) n from public.transit_lines order by name_en`);
check("rail lines seeded with their stations in order",
  r.rows?.length === 9 && r.rows.find((l) => l.name_en === "Silom Line")?.n === 14 && r.rows.find((l) => l.name_en === "Sukhumvit Line")?.n === 47);
r = await tryQuery("authenticated", user, `insert into public.transit_stations (osm_type, osm_id, name, lat, lng) values ('node', 1, 'Fake', 13.7, 100.5)`);
check("app users can't add stations", !!r.error);
r = await tryQuery("authenticated", user, `insert into public.transit_lines (osm_id, network, name_en, station_ids) values (1, 'BTS', 'Fake', '{}')`);
check("app users can't add lines", !!r.error);
r = await tryQuery("authenticated", user, `select id, kind from public.plan_candidates(13.7314, 100.5414, 3000, array['park'])`);
check("planner finds hangout places of the chosen kinds", r.rows?.some((row) => row.id === lumphiniId) && r.rows.every((row) => row.kind === "park"));
r = await tryQuery("authenticated", user, `select id, kind from public.plan_candidates(13.7314, 100.5414, 3000, array['temple'])`);
check("planner leaves out other kinds", r.rows?.length > 0 && !r.rows.some((row) => row.id === lumphiniId) && r.rows.every((row) => row.kind === "temple"));
r = await tryQuery("authenticated", user, `select kind, distance_m from public.plan_food_near(13.74, 100.53, array['restaurant'], 5)`);
check("planner finds food places nearby", r.rows?.length === 5 && r.rows.every((row) => row.kind === "restaurant" && row.distance_m <= 1500));

const tomorrow = new Date(Date.now() + 7 * 3600e3 + 24 * 3600e3).toISOString().slice(0, 10); // Bangkok tomorrow
const stops = JSON.stringify([
  { key: `place:${lumphiniId}`, type: "sight", place_id: lumphiniId, venue_id: null, name: "Lumphini Park", lat: 13.7314, lng: 100.5414, arrive: 540, leave: 600 },
  { key: "place:x", type: "meal", place_id: null, venue_id: null, name: "Noodles", lat: 13.74, lng: 100.53, arrive: 615, leave: 675 },
]);
const savePlanAs = (who, owner, extra = "") =>
  tryQuery("authenticated", who,
    `insert into public.day_plans (owner_id, title, day, start_minutes, end_minutes, travel_modes, stops${extra ? ", meetup_id" : ""})
     values ($1, 'My day in Silom', $2, 540, 1080, '{walk,transit}', $3::jsonb${extra ? `, '${extra}'` : ""}) returning id`,
    [owner, tomorrow, stops]);
r = await savePlanAs(g1, g1);
check("people save their own day plan", !r.error);
const planId = r.rows?.[0]?.id;
r = await savePlanAs(g1, user);
check("can't save a plan as someone else", !!r.error);
r = await tryQuery("authenticated", g1, `update public.day_plans set travel_modes = '{}' where id = $1`, [planId]);
check("a plan needs at least one way of getting around", !!r.error);
r = await tryQuery("authenticated", g1, `update public.day_plans set travel_modes = '{walk,boat}' where id = $1`, [planId]);
check("only walk, taxi and transit", !!r.error);
r = await tryQuery("authenticated", g1, `update public.day_plans set travel_modes = '{walk,taxi,transit}' where id = $1 returning id`, [planId]);
check("all three ways can be picked", r.rows?.length === 1);
r = await savePlanAs(g1, g1, hangoutId);
check("can't attach a plan to a hangout directly", !!r.error);
r = await tryQuery("authenticated", g2, `select count(*)::int n from public.day_plans where id = $1`, [planId]);
check("others can't read a private plan", r.rows?.[0]?.n === 0);
r = await tryQuery("authenticated", g1, `update public.day_plans set meetup_id = $2 where id = $1`, [planId, hangoutId]);
check("meetup_id can't be changed directly", !!r.error);
r = await tryQuery("authenticated", g1, `update public.day_plans set title = 'Renamed' where id = $1 returning id`, [planId]);
check("owner renames the plan", r.rows?.length === 1);
r = await tryQuery("authenticated", g2, `select public.create_plan_hangout($1, 8)`, [planId]);
check("can't turn someone else's plan into a hangout", /not_found/.test(r.error ?? ""));
r = await tryQuery("anon", null, `select public.create_plan_hangout($1, 8)`, [planId]);
check("signed-out visitors can't make plan hangouts", !!r.error);
r = await tryQuery("authenticated", g1, `select public.create_plan_hangout($1, 8) as id`, [planId]);
check("owner turns the plan into a day hangout", !r.error && !!r.rows?.[0]?.id);
const planHangoutId = r.rows?.[0]?.id;
r = await tryQuery("authenticated", g2,
  `select kind, title, place_id, description, (ends_at - starts_at) = interval '9 hours' as nine_hours from public.list_open_meetups() where id = $1`, [planHangoutId]);
check("day hangout at the first stop, for the plan's hours, stops listed",
  r.rows?.[0]?.kind === "hangout" && r.rows[0].title === "Renamed" && r.rows[0].place_id === lumphiniId &&
  r.rows[0].nine_hours === true && r.rows[0].description === "09:00 Lumphini Park\n10:15 Noodles");
r = await tryQuery("authenticated", g2, `select meetup_id from public.day_plans where id = $1`, [planId]);
check("a plan that became a hangout is readable by others", r.rows?.[0]?.meetup_id === planHangoutId);
r = await tryQuery("authenticated", g1, `select public.create_plan_hangout($1, 8)`, [planId]);
check("a plan becomes a hangout only once", /already_hangout/.test(r.error ?? ""));
r = await tryQuery("authenticated", g2, `delete from public.day_plans where id = $1 returning id`, [planId]);
check("others can't delete the plan", !r.error && r.rows.length === 0);
r = await tryQuery("authenticated", g1, `delete from public.day_plans where id = $1 returning id`, [planId]);
check("owner deletes the plan", r.rows?.length === 1);

// --- Notifications
const notes = async (who) => (await tryQuery("authenticated", who, `select * from public.my_notifications(100)`)).rows ?? [];
r = await hangout(g2, { lat: 13.75, lng: 100.5, spotName: "Notification test", size: 6, title: "Night market walk" });
const noteHangoutId = r.rows?.[0]?.id;
let list = await notes(user);
check("new hangouts by others show up", list.some((n) => n.kind === "new_hangout" && n.meetup_id === noteHangoutId && n.actor_id === g2 && n.title === "Night market walk"));
check("new tables show up", list.some((n) => n.kind === "new_table"));
check("they start unread", list.find((n) => n.meetup_id === noteHangoutId)?.unread === true);
list = await notes(g2);
check("my own hangouts aren't notified to me", !list.some((n) => n.kind === "new_hangout" && n.meetup_id === noteHangoutId));
await tryQuery("authenticated", user, `select public.join_meetup($1)`, [noteHangoutId]);
list = await notes(g2);
check("host hears who joined", list.some((n) => n.kind === "joined" && n.meetup_id === noteHangoutId && n.actor_id === user));
await tryQuery("authenticated", g2, `insert into public.meetup_messages (meetup_id, sender_id, body) values ($1, $2, 'Bring cash!')`, [noteHangoutId, g2]);
list = await notes(user);
check("chat messages are no longer in the bell (they're on the Messages button)", !list.some((n) => n.kind === "chat_message"));
await tryQuery("authenticated", g2, `select public.follow_user($1)`, [user]);
// Messages need the sender to be visible nearby (Travellers rules).
for (const who of [user, g2]) await tryQuery("authenticated", who, `select public.set_discoverable(true)`);
await loc(g2, BKK[0] + 0.001, BKK[1]);
await loc(user, ...BKK);
r = await dm(g2, user, "Hi, are you going to the walk?");
list = await notes(user);
check("message requests show up", list.some((n) => n.kind === "dm_request" && n.actor_id === g2 && n.body === "Hi, are you going to the walk?"));
check("new followers show up", list.some((n) => n.kind === "follow" && n.actor_id === g2));
list = await notes(g2);
check("my own messages aren't notified to me", !list.some((n) => (n.kind === "dm_request" || n.kind === "direct_message") && n.actor_id === g2));
check("new promotions show up with their venue", list.some((n) => n.kind === "promotion" && n.venue_id && n.promo_kind));
check("nothing from blocked people", !list.some((n) => n.actor_id === g0));
r = await tryQuery("authenticated", user, `select public.mark_notifications_seen()`);
list = await notes(user);
check("opening notifications marks them seen", list.length > 0 && list.every((n) => n.unread === false));
r = await tryQuery("authenticated", user, `select * from public.notification_state`);
check("seen state isn't readable directly", !!r.error);
r = await tryQuery("anon", null, `select * from public.my_notifications()`);
check("signed-out visitors get no notifications", !!r.error || r.rows.length === 0);

// --- Messages: one inbox, unread counts, leaving / deleting chats, group chats
const chats = async (who) => (await tryQuery("authenticated", who, `select * from public.my_chats()`)).rows ?? [];
let inbox = await chats(user);
let row = inbox.find((c) => c.chat_kind === "meetup" && c.chat_id === noteHangoutId);
check("table / hangout chats are in Messages with the unread count", row?.unread_count === 1 && row.last_body === "Bring cash!" && row.ended === false);
row = inbox.find((c) => c.chat_kind === "dm" && c.other_id === g2);
check("private chats are in Messages (a request counts as unread)", row?.dm_status === "pending" && row.unread_count === 1);
const g2ThreadId = row?.chat_id;
inbox = await chats(g1);
check("non-members don't get the table chat", !inbox.some((c) => c.chat_id === noteHangoutId));
await tryQuery("authenticated", user, `select public.mark_chat_read('meetup', $1)`, [noteHangoutId]);
inbox = await chats(user);
check("opening a chat marks it read", inbox.find((c) => c.chat_id === noteHangoutId)?.unread_count === 0);
r = await tryQuery("authenticated", user, `select public.leave_chat('meetup', $1)`, [noteHangoutId]);
check("can't leave the chat of a table / hangout that hasn't ended", /meetup_not_ended/.test(r.error ?? ""));
await db.exec(`update public.meetups set starts_at = now() - interval '3 hours', ends_at = now() - interval '1 hour' where id = '${noteHangoutId}'`);
inbox = await chats(user);
check("the chat stays after the hangout ends", inbox.find((c) => c.chat_id === noteHangoutId)?.ended === true);
r = await tryQuery("authenticated", g2, `insert into public.meetup_messages (meetup_id, sender_id, body) values ($1, $2, 'Thanks all!')`, [noteHangoutId, g2]);
check("members can still write after it ends", !r.error);
r = await tryQuery("authenticated", user, `select public.leave_chat('meetup', $1)`, [noteHangoutId]);
check("leave the chat once it has ended", !r.error);
inbox = await chats(user);
check("a left chat is gone from Messages", !inbox.some((c) => c.chat_id === noteHangoutId));
r = await tryQuery("authenticated", user, `select count(*)::int n from public.meetup_messages where meetup_id = $1`, [noteHangoutId]);
check("a left chat can't be read", r.rows?.[0]?.n === 0);
r = await tryQuery("authenticated", user, `insert into public.meetup_messages (meetup_id, sender_id, body) values ($1, $2, 'hi')`, [noteHangoutId, user]);
check("a left chat can't be written to", !!r.error);

await tryQuery("authenticated", user, `select public.respond_direct_request($1, true)`, [g2ThreadId]);
r = await tryQuery("authenticated", user, `select public.leave_chat('dm', $1)`, [g2ThreadId]);
check("delete a private chat", !r.error);
inbox = await chats(user);
check("a deleted private chat is gone from Messages", !inbox.some((c) => c.chat_id === g2ThreadId));
r = await tryQuery("authenticated", g2, `select count(*)::int n from public.direct_messages where thread_id = $1`, [g2ThreadId]);
check("the other person keeps the chat", r.rows?.[0]?.n === 1);
await new Promise((resolve) => setTimeout(resolve, 20));
r = await dm(g2, user, "Still coming?");
inbox = await chats(user);
row = inbox.find((c) => c.chat_id === g2ThreadId);
check("a new message brings the deleted chat back", row?.last_body === "Still coming?" && row.unread_count === 1);
r = await tryQuery("authenticated", user, `select body from public.direct_messages where thread_id = $1`, [g2ThreadId]);
check("only messages after the delete show", r.rows?.length === 1 && r.rows[0].body === "Still coming?");

// Groups: friends only (mutual follows), any member adds their friends, the owner removes and renames.
await tryQuery("authenticated", user, `select public.follow_user($1)`, [g2]); // g2 already follows user
const group = (who, name, emoji, ids) =>
  tryQuery("authenticated", who, `select public.create_group_chat($1, $2, $3::uuid[]) as id`, [name, emoji, ids]);
r = await tryQuery("authenticated", user, `select id from public.my_friends()`);
check("friends = mutual follows", r.rows?.length === 1 && r.rows[0].id === g2);
r = await group(user, "Crew", "🎉", [g1]);
check("only friends can be added to a group", /not_friends/.test(r.error ?? ""));
r = await group(user, "   ", "🎉", [g2]);
check("a group needs a name", /name_required/.test(r.error ?? ""));
r = await group(user, "Crew", "", [g2]);
check("a group needs an emoji", /emoji_required/.test(r.error ?? ""));
r = await group(user, "Crew", "🎉", []);
check("a group needs someone else", /invalid_size/.test(r.error ?? ""));
r = await group(user, "  Weekend crew  ", "🎉", [g2, g2, user]);
check("create a group with a friend", !r.error);
const groupId = r.rows?.[0]?.id;
r = await tryQuery("authenticated", g2, `insert into public.chat_group_messages (group_id, sender_id, body) values ($1, $2, 'Hello group')`, [groupId, g2]);
check("members write in the group", !r.error);
inbox = await chats(user);
row = inbox.find((c) => c.chat_kind === "group" && c.chat_id === groupId);
check("the group is in Messages with name, emoji, members and unread", row?.title === "Weekend crew" && row.emoji === "🎉" && row.member_count === 2 && row.unread_count === 1 && row.last_sender_name);
r = await tryQuery("authenticated", g1, `select count(*)::int n from public.chat_group_messages where group_id = $1`, [groupId]);
check("non-members can't read the group", r.rows?.[0]?.n === 0);
r = await tryQuery("authenticated", g1, `insert into public.chat_group_messages (group_id, sender_id, body) values ($1, $2, 'hi')`, [groupId, g1]);
check("non-members can't write in the group", !!r.error);
r = await tryQuery("authenticated", user, `insert into public.chat_groups (name, emoji, owner_id) values ('x', 'x', $1)`, [user]);
check("groups are only made through create_group_chat", !!r.error);
r = await tryQuery("authenticated", user, `insert into public.chat_group_members (group_id, user_id) values ($1, $2)`, [groupId, g1]);
check("members are only added through add_group_members", !!r.error);
await tryQuery("authenticated", g1, `select public.follow_user($1)`, [g2]);
await tryQuery("authenticated", g2, `select public.follow_user($1)`, [g1]);
r = await tryQuery("authenticated", g2, `select public.add_group_members($1, $2::uuid[])`, [groupId, [g1]]);
check("any member adds their own friends", !r.error);
r = await tryQuery("authenticated", g1, `select count(*)::int n from public.chat_group_messages where group_id = $1`, [groupId]);
check("new members see messages from when they joined", r.rows?.[0]?.n === 0);
r = await tryQuery("authenticated", g1, `select public.remove_group_member($1, $2)`, [groupId, g2]);
check("only the owner removes people", /not_owner/.test(r.error ?? ""));
r = await tryQuery("authenticated", g2, `select public.rename_group($1, 'Mine now', '😎')`, [groupId]);
check("only the owner renames", /not_owner/.test(r.error ?? ""));
r = await tryQuery("authenticated", user, `select public.rename_group($1, 'Saturday crew', '🍜')`, [groupId]);
check("the owner renames the group", !r.error);
r = await tryQuery("authenticated", user, `select public.remove_group_member($1, $2)`, [groupId, g1]);
check("the owner removes a member", !r.error);
inbox = await chats(g1);
check("a removed member loses the group", !inbox.some((c) => c.chat_id === groupId));
r = await tryQuery("authenticated", user, `select public.leave_group($1)`, [groupId]);
check("the owner can leave", !r.error);
r = await tryQuery("authenticated", g2, `select owner_id, name, emoji from public.chat_groups where id = $1`, [groupId]);
check("the longest member becomes owner", r.rows?.[0]?.owner_id === g2 && r.rows[0].name === "Saturday crew" && r.rows[0].emoji === "🍜");
r = await tryQuery("authenticated", g2, `select public.leave_chat('group', $1)`, [groupId]);
r = await tryQuery("service_role", null, `select count(*)::int n from public.chat_groups where id = $1`, [groupId]);
check("the last one out deletes the group", r.rows?.[0]?.n === 0);
r = await tryQuery("authenticated", user, `select * from public.chat_state`);
check("read state isn't readable directly", !!r.error);
r = await tryQuery("anon", null, `select * from public.my_chats()`);
check("signed-out visitors have no Messages", !!r.error || r.rows.length === 0);

// --- Travel deals: host reward after a table / hangout ends with 4+ people
r = await tryQuery("service_role", null, `select count(*)::int n from public.meetups where city is distinct from 'Bangkok' and (spot_lat is null or public.in_bangkok(spot_lat, spot_lng))`);
check("Bangkok tables and hangouts are in Bangkok", r.rows?.[0]?.n === 0);
const host = unverified;
r = await hangout(host, { lat: 48.8606, lng: 2.3376, spotName: "Louvre", zone: "Europe/Paris", size: 6, title: "Louvre walk" });
check("host creates a Paris hangout", !r.error);
const parisWalk = r.rows?.[0]?.id;
await tryQuery("authenticated", user, `select public.set_meetup_area($1, 'Hacked', 'XX')`, [parisWalk]);
await tryQuery("authenticated", host, `select public.set_meetup_area($1, '  Paris ', 'fr')`, [parisWalk]);
r = await tryQuery("service_role", null, `select city, country_code from public.meetups where id = $1`, [parisWalk]);
check("only the host sets the city and country", r.rows?.[0]?.city === "Paris" && r.rows[0].country_code === "FR");
await tryQuery("authenticated", host, `select public.set_meetup_area($1, 'Lyon', 'FR')`, [parisWalk]);
r = await tryQuery("service_role", null, `select city from public.meetups where id = $1`, [parisWalk]);
check("the city is set once", r.rows?.[0]?.city === "Paris");

const addDeal = (values) =>
  tryQuery("authenticated", admin,
    `insert into public.travel_deals (brand, category, title_en, title_th, code, url, scope, city_name, lat, lng, country_code, ends_at, is_active)
     values ($1, $2, $3, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) returning id`,
    [values.brand ?? "Klook", values.category ?? "activity", values.title, values.code ?? null, values.url ?? null, values.scope,
      values.city ?? null, values.lat ?? null, values.lng ?? null, values.country ?? null, values.endsAt ?? null, values.active ?? true]);
r = await addDeal({ title: "Seine cruise 10% off", code: "SEINE10", scope: "city", city: "Paris", lat: 48.8566, lng: 2.3522 });
check("admin adds a city deal", !r.error);
const parisDeal = r.rows?.[0]?.id;
r = await addDeal({ title: "France hotels", url: "https://example.com/fr", scope: "country", country: "FR", category: "hotel" });
const franceDeal = r.rows?.[0]?.id;
r = await addDeal({ title: "Flights sale", code: "FLY5", scope: "world", category: "flight" });
const worldDeal = r.rows?.[0]?.id;
r = await addDeal({ title: "Bangkok tuk-tuk", code: "TUK", scope: "city", city: "Bangkok", lat: 13.75, lng: 100.5 });
const bangkokDeal = r.rows?.[0]?.id;
r = await addDeal({ title: "Old deal", code: "OLD", scope: "world", endsAt: inHours(-1) });
const expiredDeal = r.rows?.[0]?.id;
r = await addDeal({ title: "Paused", code: "OFF", scope: "world", active: false });
const pausedDeal = r.rows?.[0]?.id;
r = await addDeal({ title: "No code or link", scope: "world" });
check("a deal needs a code or a link", !!r.error);
r = await addDeal({ title: "Bad link", url: "http://example.com", scope: "world" });
check("deal links must be https", !!r.error);
r = await addDeal({ title: "City without a point", code: "X", scope: "city", city: "Rome" });
check("a city deal needs its place", !!r.error);
r = await tryQuery("authenticated", user, `select count(*)::int n from public.travel_deals`);
check("app users can't read the deals list", !!r.error || r.rows?.[0]?.n === 0);
r = await tryQuery("authenticated", user, `insert into public.travel_deals (brand, category, title_en, title_th, code, scope) values ('x', 'other', 'x', 'x', 'x', 'world')`);
check("app users can't add deals", !!r.error);

const rewards = async (who) => (await tryQuery("authenticated", who, `select * from public.my_rewards()`)).rows ?? [];
for (const who of [user, g0, g2]) await tryQuery("authenticated", who, `select public.join_meetup($1)`, [parisWalk]);
await db.exec(`update public.meetups set starts_at = now() - interval '3 hours', ends_at = now() - interval '1 hour' where id = '${parisWalk}'`);
let reward = (await rewards(host)).find((x) => x.meetup_id === parisWalk);
const dealIds = (reward?.deals ?? []).map((d) => d.id);
check("host unlocks deals after it ends with 4 people", reward?.member_count === 4 && reward.city === "Paris");
check("city, country and world deals, city first", dealIds[0] === parisDeal && dealIds.includes(franceDeal) && dealIds.includes(worldDeal));
check("no deals from other cities or countries", !dealIds.includes(bangkokDeal));
check("no expired or paused deals", !dealIds.includes(expiredDeal) && !dealIds.includes(pausedDeal));
check("the code comes with the deal", reward?.deals?.[0]?.code === "SEINE10");
check("members who aren't the host get no reward", !(await rewards(user)).some((x) => x.meetup_id === parisWalk));
r = await tryQuery("authenticated", host, `select count(*)::int n from public.my_notifications(100) where kind = 'reward' and meetup_id = $1`, [parisWalk]);
check("the host is notified of the reward", r.rows?.[0]?.n === 1);

r = await hangout(host, { lat: 48.86, lng: 2.34, spotName: "Small group", zone: "Europe/Paris", size: 6 });
const smallWalk = r.rows?.[0]?.id;
for (const who of [user, g0]) await tryQuery("authenticated", who, `select public.join_meetup($1)`, [smallWalk]);
await db.exec(`update public.meetups set starts_at = now() - interval '3 hours', ends_at = now() - interval '1 hour' where id = '${smallWalk}'`);
check("fewer than 4 people: no reward", !(await rewards(host)).some((x) => x.meetup_id === smallWalk));
r = await hangout(host, { lat: 48.86, lng: 2.34, spotName: "Cancelled one", zone: "Europe/Paris", size: 6 });
const cancelledWalk = r.rows?.[0]?.id;
for (const who of [user, g0, g2]) await tryQuery("authenticated", who, `select public.join_meetup($1)`, [cancelledWalk]);
await tryQuery("authenticated", host, `select public.cancel_meetup($1)`, [cancelledWalk]);
await db.exec(`update public.meetups set starts_at = now() - interval '3 hours', ends_at = now() - interval '1 hour' where id = '${cancelledWalk}'`);
check("cancelled: no reward", !(await rewards(host)).some((x) => x.meetup_id === cancelledWalk));

r = await tryQuery("authenticated", user, `select public.report_travel_deal($1)`, [parisDeal]);
check("only hosts with a reward can report a deal", /not_allowed/.test(r.error ?? ""));
r = await tryQuery("authenticated", host, `select public.report_travel_deal($1)`, [worldDeal]);
check("report a deal that didn't work", !r.error);
reward = (await rewards(host)).find((x) => x.meetup_id === parisWalk);
check("a deal I reported is hidden for me", !(reward?.deals ?? []).some((d) => d.id === worldDeal));
r = await tryQuery("authenticated", admin, `select count(*)::int n from public.travel_deal_reports where deal_id = $1`, [worldDeal]);
check("the founder sees the reports", r.rows?.[0]?.n === 1);
r = await tryQuery("authenticated", host, `select * from public.travel_deal_reports`);
check("users can't read reports", !!r.error || r.rows.length === 0);
r = await tryQuery("anon", null, `select * from public.my_rewards()`);
check("signed-out visitors have no rewards", !!r.error || r.rows.length === 0);

// --- Profile details: first-time questions (18+), About, world clocks, countries, trips, friends, favourites, events
const saveProfile = (who, birth, extra = {}) =>
  tryQuery("authenticated", who,
    `select public.save_my_profile($1, $2, $3::date, $4, $5::text[], $6, $7, $8::text[])`,
    [extra.name ?? "Somchai", extra.instagram ?? null, birth, extra.country ?? "IN", extra.languages ?? ["en", "hi"],
     extra.profession ?? "marketing", extra.style ?? "digital_nomad", extra.interests ?? ["food", "coffee"]]);
r = await tryQuery("authenticated", user, `select onboarded from public.my_profile_details()`);
check("first-time questions not done yet", r.rows?.[0]?.onboarded === false);
r = await saveProfile(user, null);
check("a birthday is required", /birth_date_required/.test(r.error ?? ""));
const today = new Date();
const seventeen = `${today.getFullYear() - 17}-01-01`;
r = await saveProfile(user, seventeen);
check("under-18s can't continue", /too_young/.test(r.error ?? ""));
r = await saveProfile(user, "2999-01-01");
check("birthdays in the future are rejected", /invalid_birth_date/.test(r.error ?? ""));
r = await saveProfile(user, "1997-05-04", { country: "India" });
check("countries must be ISO codes", /invalid_country/.test(r.error ?? ""));
r = await saveProfile(user, "1997-05-04", { interests: ["Food!"] });
check("interest keys are checked", /invalid_details/.test(r.error ?? ""));
r = await saveProfile(user, "1997-05-04", { name: " Somchai J ", instagram: "@somchai.j", languages: ["EN", "hi", "en"] });
check("save the first-time answers", !r.error);
r = await tryQuery("authenticated", user, `select * from public.my_profile_details()`);
check("my details come back, onboarded", r.rows?.[0]?.onboarded === true && r.rows[0].display_name === "Somchai J" && r.rows[0].instagram === "somchai.j" && r.rows[0].languages.join() === "en,hi");
r = await tryQuery("authenticated", user, `select * from public.profile_private`);
check("birthdays aren't readable directly", !!r.error);
r = await tryQuery("authenticated", user, `update public.profiles set languages = '{"Not a code"}' where id = $1`, [user]);
check("direct profile updates are still checked", !!r.error);
r = await tryQuery("authenticated", user, `select public.set_my_world_clocks('{"Mars/Olympus"}')`);
check("world clocks must be real time zones", /invalid_time_zone/.test(r.error ?? ""));
r = await tryQuery("authenticated", user, `select public.set_my_world_clocks($1::text[])`, [["Asia/Tokyo", "Asia/Tokyo", "Europe/London", "Asia/Kolkata", "America/New_York", "Europe/Paris", "Australia/Sydney", "Asia/Dubai"]]);
check("at most 6 world clocks", /too_many_clocks/.test(r.error ?? ""));
r = await tryQuery("authenticated", user, `select public.set_my_world_clocks($1::text[])`, [["Asia/Tokyo", "Asia/Tokyo", "Europe/London"]]);
check("save world clocks (repeats dropped)", !r.error);
r = await tryQuery("authenticated", user, `select public.set_my_visited_countries($1::text[])`, [["th", "JP", "jp", "FR"]]);
check("save countries visited", !r.error);
r = await tryQuery("authenticated", user, `select public.set_my_visited_countries($1::text[])`, [["Japan"]]);
check("visited countries must be ISO codes", /invalid_country/.test(r.error ?? ""));

const trip = (who, id, city, starts, ends) =>
  tryQuery("authenticated", who, `select public.save_trip($1, $2, 'JP', 35.68, 139.69, $3::date, $4::date, null) as id`, [id, city, starts, ends]);
const isoDay = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
r = await trip(user, null, "Tokyo", isoDay(10), isoDay(20));
check("add a trip", !r.error);
const tripId = r.rows?.[0]?.id;
r = await trip(user, null, "Osaka", isoDay(-40), isoDay(-30));
check("add a past trip", !r.error);
r = await trip(user, null, "Kyoto", isoDay(20), isoDay(10));
check("a trip can't end before it starts", /invalid_trip/.test(r.error ?? ""));
r = await trip(g1, tripId, "Hijacked", isoDay(1), isoDay(2));
check("can't change someone else's trip", /not_found/.test(r.error ?? ""));
r = await tryQuery("authenticated", user, `insert into public.trips (user_id, city, starts_on, ends_on) values ($1, 'x', current_date, current_date)`, [user]);
check("trips only change through save_trip", !!r.error);
r = await tryQuery("authenticated", g1, `select count(*)::int n from public.trips where user_id = $1`, [user]);
check("others see my trips", r.rows?.[0]?.n === 2);
r = await tryQuery("authenticated", g0, `select count(*)::int n from public.trips where user_id = $1`, [user]);
check("blocked people don't see my trips", r.rows?.[0]?.n === 0);

r = await tryQuery("authenticated", g1, `select * from public.get_profile($1)`, [user]);
let prof = r.rows?.[0];
check("profile shows age, country, languages, About and travel details",
  prof?.age >= 28 && prof.home_country === "IN" && prof.profession === "marketing" && prof.travel_style === "digital_nomad"
  && prof.interests.join() === "food,coffee" && prof.world_clocks.join() === "Asia/Tokyo,Europe/London"
  && prof.visited_countries.join() === "FR,JP,TH" && prof.upcoming_trips === 1);
check("the birthday itself is never returned", prof && !("birth_date" in prof));
check("friends = mutual follows", prof?.friends === 1);
r = await tryQuery("authenticated", g1, `select id from public.user_friends($1)`, [user]);
check("list someone's friends", r.rows?.length === 1 && r.rows[0].id === g2);
r = await tryQuery("authenticated", g0, `select count(*)::int n from public.user_friends($1)`, [user]);
check("no friends list across a block", r.rows?.[0]?.n === 0);
r = await tryQuery("authenticated", g1, `select * from public.profile_meetups($1)`, [user]);
check("events: tables and hangouts they went to", r.rows?.some((m) => m.id === parisWalk && m.upcoming === false));
r = await tryQuery("authenticated", user, `select public.delete_trip($1)`, [tripId]);
check("delete my trip", !r.error);

r = await tryQuery("authenticated", user, `insert into public.favorite_places (user_id, place_id) values ($1, $2)`, [user, lumphiniId]);
check("save a favourite place", !r.error);
const favVenueId = (await tryQuery("service_role", null, `select id from public.venues limit 1`)).rows?.[0]?.id;
r = await tryQuery("authenticated", user, `insert into public.favorite_places (user_id, venue_id) values ($1, $2)`, [user, favVenueId]);
check("save a favourite venue", !r.error);
r = await tryQuery("authenticated", user, `insert into public.favorite_places (user_id, place_id) values ($1, $2)`, [user, lumphiniId]);
check("a place is saved once", !!r.error);
r = await tryQuery("authenticated", g1, `select count(*)::int n from public.favorite_places`);
check("favourites are private", r.rows?.[0]?.n === 0);
r = await tryQuery("authenticated", g1, `insert into public.favorite_places (user_id, place_id) values ($1, $2)`, [user, lumphiniId]);
check("can't save favourites for someone else", !!r.error);
r = await tryQuery("authenticated", user, `delete from public.favorite_places where place_id = $1`, [lumphiniId]);
check("remove a favourite", !r.error);

// --- Chat photos, voice notes and live location
const upload = (who, name, mime = "image/jpeg") =>
  tryQuery("authenticated", who, `insert into storage.objects (bucket_id, name) values ('chat-media', $1) returning name`, [name]);
const attach = (who, chatKind, chatId, kind, path, extra = {}) =>
  tryQuery("authenticated", who, `select public.send_chat_attachment($1, $2, $3, $4, $5, $6, $7, $8) as id`,
    [chatKind, chatId, kind, path, extra.duration ?? null, extra.lat ?? null, extra.lng ?? null, extra.minutes ?? null]);
const photoPath = `meetup/${parisWalk}/${user}/p1.jpg`;
r = await tryQuery("authenticated", user, `insert into public.meetup_messages (meetup_id, sender_id, kind, media_path) values ($1, $2, 'photo', $3)`, [parisWalk, user, photoPath]);
check("photos can't be inserted directly", !!r.error);
r = await upload(user, photoPath);
check("members upload a chat photo to their own folder", !r.error);
r = await upload(g1, `meetup/${parisWalk}/${g1}/p2.jpg`);
check("non-members can't upload to a chat", !!r.error);
r = await upload(user, `meetup/${parisWalk}/${g0}/p3.jpg`);
check("can't upload into someone else's folder", !!r.error);
r = await attach(user, "meetup", parisWalk, "photo", `meetup/${parisWalk}/${user}/missing.jpg`);
check("a photo must be uploaded first", /invalid_attachment/.test(r.error ?? ""));
r = await attach(user, "meetup", parisWalk, "photo", photoPath);
check("send a photo", !r.error);
r = await tryQuery("authenticated", g0, `select kind, media_path from public.meetup_messages where meetup_id = $1 and kind = 'photo'`, [parisWalk]);
check("members see the photo message", r.rows?.[0]?.media_path === photoPath);
r = await tryQuery("authenticated", g0, `select count(*)::int n from storage.objects where bucket_id = 'chat-media' and name = $1`, [photoPath]);
check("members can open the photo", r.rows?.[0]?.n === 1);
r = await tryQuery("authenticated", g1, `select count(*)::int n from storage.objects where bucket_id = 'chat-media' and name = $1`, [photoPath]);
check("outsiders can't open the photo", r.rows?.[0]?.n === 0);

r = await attach(user, "meetup", parisWalk, "location", null, { lat: 13.75, lng: 100.5, minutes: 7 });
check("live location only for 15 min, 1 h or 8 h", /invalid_attachment/.test(r.error ?? ""));
r = await attach(user, "meetup", parisWalk, "location", null, { lat: 13.75, lng: 100.5, minutes: 60 });
check("share live location", !r.error);
const liveId = r.rows?.[0]?.id;
r = await tryQuery("authenticated", user, `select * from public.my_live_locations()`);
check("my running live locations", r.rows?.length === 1 && r.rows[0].message_id === liveId);
r = await tryQuery("authenticated", user, `select public.update_live_location('meetup', $1, 13.76, 100.51) as ok`, [liveId]);
check("the sender moves their live location", r.rows?.[0]?.ok === true);
r = await tryQuery("authenticated", g0, `select public.update_live_location('meetup', $1, 0, 0) as ok`, [liveId]);
check("nobody else can move it", r.rows?.[0]?.ok === false);
r = await tryQuery("authenticated", g0, `select lat from public.meetup_messages where id = $1`, [liveId]);
check("members see the latest position", r.rows?.[0]?.lat === 13.76);
r = await tryQuery("authenticated", user, `select public.stop_live_location('meetup', $1)`, [liveId]);
r = await tryQuery("authenticated", user, `select public.update_live_location('meetup', $1, 13.77, 100.52) as ok`, [liveId]);
check("a stopped live location can't move", !r.error && r.rows?.[0]?.ok === false);

const voicePath = `dm/${g2ThreadId}/${user}/v1.m4a`;
r = await upload(user, voicePath, "audio/mp4");
check("upload a voice note in an accepted private chat", !r.error);
r = await attach(user, "dm", g2ThreadId, "voice", voicePath, { duration: 4200 });
check("send a voice note", !r.error);
r = await upload(g1, `dm/${reqId}/${g1}/x.jpg`);
check("a declined requester can't upload", !!r.error);
r = await attach(g1, "dm", reqId, "location", null, { lat: 13.75, lng: 100.5, minutes: 15 });
check("a declined requester can't send attachments", /request_declined/.test(r.error ?? ""));
// A pending request (g1 asked g2): g1 waits, g2 can reply with an attachment, which accepts it.
const [pa, pb] = [g1, g2].sort();
const pendingId = (await tryQuery("service_role", null,
  `insert into public.direct_threads (user_a, user_b, requested_by) values ($1, $2, $3) returning id`, [pa, pb, g1])).rows?.[0]?.id;
await tryQuery("service_role", null, `insert into public.direct_messages (thread_id, sender_id, body) values ($1, $2, 'Hi!')`, [pendingId, g1]);
r = await upload(g1, `dm/${pendingId}/${g1}/x.jpg`);
check("the requester can't upload before a reply", !!r.error);
r = await attach(g1, "dm", pendingId, "location", null, { lat: 13.75, lng: 100.5, minutes: 15 });
check("the requester can't send attachments before a reply", /request_pending/.test(r.error ?? ""));
r = await upload(g2, `dm/${pendingId}/${g2}/reply.jpg`);
check("the receiver can upload a reply to a request", !r.error);
r = await attach(g2, "dm", pendingId, "photo", `dm/${pendingId}/${g2}/reply.jpg`);
check("the receiver replies with a photo", !r.error);
r = await tryQuery("service_role", null, `select status from public.direct_threads where id = $1`, [pendingId]);
check("replying with a photo accepts the request", r.rows?.[0]?.status === "accepted");
inbox = await chats(user);
row = inbox.find((c) => c.chat_id === g2ThreadId);
check("the inbox knows the last message was a voice note", row?.last_kind === "voice");

// --- Edit / unsend messages, pin / archive chats
r = await tryQuery("authenticated", user, `insert into public.meetup_messages (meetup_id, sender_id, body) values ($1, $2, 'See you at 7') returning id`, [parisWalk, user]);
const textId = r.rows?.[0]?.id;
r = await tryQuery("authenticated", user, `select public.edit_chat_message('meetup', $1, 'See you at 8')`, [textId]);
check("edit my message", !r.error);
r = await tryQuery("authenticated", g0, `select body, edited_at from public.meetup_messages where id = $1`, [textId]);
check("others see the edit, marked edited", r.rows?.[0]?.body === "See you at 8" && !!r.rows[0].edited_at);
r = await tryQuery("authenticated", g0, `select public.edit_chat_message('meetup', $1, 'hacked')`, [textId]);
check("can't edit someone else's message", /not_found/.test(r.error ?? ""));
r = await tryQuery("authenticated", user, `select public.edit_chat_message('meetup', $1, '   ')`, [textId]);
check("an edit can't be empty", /empty_message/.test(r.error ?? ""));
await tryQuery("authenticated", user, `update public.meetup_messages set body = 'direct' where id = $1`, [textId]);
r = await tryQuery("authenticated", g0, `select body from public.meetup_messages where id = $1`, [textId]);
check("messages can't be changed directly", r.rows?.[0]?.body === "See you at 8");
const photoMsgId = (await tryQuery("authenticated", g0, `select id from public.meetup_messages where meetup_id = $1 and kind = 'photo'`, [parisWalk])).rows?.[0]?.id;
r = await tryQuery("authenticated", g0, `select public.unsend_chat_message('meetup', $1)`, [photoMsgId]);
check("can't unsend someone else's photo", /not_found/.test(r.error ?? ""));
r = await tryQuery("authenticated", user, `select public.unsend_chat_message('meetup', $1) as path`, [photoMsgId]);
check("unsend my photo; the file path comes back to delete", r.rows?.[0]?.path === photoPath);
r = await tryQuery("authenticated", g0, `select kind, media_path, body from public.meetup_messages where id = $1`, [photoMsgId]);
check("an unsent message keeps nothing", r.rows?.[0]?.kind === "unsent" && r.rows[0].media_path === null && r.rows[0].body === "");
r = await tryQuery("authenticated", user, `select public.unsend_chat_message('meetup', $1) as path`, [textId]);
inbox = await chats(g0);
check("the inbox knows the last message was unsent", inbox.find((c) => c.chat_id === parisWalk)?.last_kind === "unsent");

r = await tryQuery("authenticated", user, `select public.set_chat_flag('meetup', $1, 'pin', true)`, [parisWalk]);
check("pin a chat", !r.error);
inbox = await chats(user);
check("pinned chats come first", inbox[0]?.chat_id === parisWalk && inbox[0].pinned === true);
r = await tryQuery("authenticated", user, `select public.set_chat_flag('dm', $1, 'archive', true)`, [g2ThreadId]);
check("archive a chat", !r.error);
inbox = await chats(user);
check("archived chats are flagged", inbox.find((c) => c.chat_id === g2ThreadId)?.archived === true);
await tryQuery("authenticated", g0, `select public.set_chat_flag('meetup', $1, 'pin', false)`, [parisWalk]);
inbox = await chats(user);
check("pins are per person", inbox.find((c) => c.chat_id === parisWalk)?.pinned === true);
r = await tryQuery("authenticated", g1, `select public.set_chat_flag('meetup', $1, 'pin', true)`, [parisWalk]);
check("can't pin a chat I'm not in", /not_found/.test(r.error ?? ""));
await tryQuery("authenticated", user, `select public.set_chat_flag('dm', $1, 'archive', false)`, [g2ThreadId]);
inbox = await chats(user);
check("unarchive", inbox.find((c) => c.chat_id === g2ThreadId)?.archived === false);

// --- Check-ins, redemption QR, venue staff page, redemptions
const [c1, c2, c3, c4, outsider] = [
  "55555555-5555-5555-5555-555555555551", "55555555-5555-5555-5555-555555555552", "55555555-5555-5555-5555-555555555553",
  "55555555-5555-5555-5555-555555555554", "55555555-5555-5555-5555-555555555555",
];
await db.exec(`insert into auth.users (id, email, raw_user_meta_data, phone_confirmed_at) values
  ${[c1, c2, c3, c4, outsider].map((id, i) => `('${id}', 'c${i}@x.com', '{"full_name": "Diner ${i + 1}"}', now())`).join(", ")}`);
r = await tryQuery("authenticated", admin,
  `insert into public.venues (name_en, name_th, category, lat, lng, is_active) values ('Check Cafe', 'เช็คคาเฟ่', 'cafe', 13.80, 100.55, true) returning id`);
const cafeId = r.rows?.[0]?.id;
r = await tryQuery("authenticated", admin,
  `select public.admin_save_promotion($1, null, 'discount', '10% off', 'ลด 10%', '', '', 'percent', 10, 'CAFE10', null, null, true) as id`, [cafeId]);
const cafeDealId = r.rows?.[0]?.id;
await tryQuery("authenticated", admin, `select public.admin_create_venue_account($1, 'cafe-staff', 'cafepass1')`, [cafeId]);
r = await tryQuery("authenticated", admin,
  `insert into public.venues (name_en, name_th, category, lat, lng, is_active) values ('Other Bar', 'บาร์อื่น', 'bar', 13.81, 100.56, true) returning id`);
await tryQuery("authenticated", admin, `select public.admin_create_venue_account($1, 'other-staff', 'otherpass1')`, [r.rows?.[0]?.id]);

r = await tryQuery("authenticated", c1, `select public.create_meetup($1, now(), 6) as id`, [cafeId]);
check("table starting now at a partner venue", !r.error);
const liveTable = r.rows?.[0]?.id;
for (const who of [c2, c3, c4]) await tryQuery("authenticated", who, `select public.join_meetup($1)`, [liveTable]);
const atCafe = [13.8001, 100.5501];
r = await tryQuery("authenticated", outsider, `select public.check_in($1, $2, $3)`, [liveTable, ...atCafe]);
check("non-members can't check in", /not_member/.test(r.error ?? ""));
r = await tryQuery("authenticated", c1, `select public.check_in($1, 13.81, 100.55)`, [liveTable]);
check("check-in more than 50 m away rejected by the server", /too_far/.test(r.error ?? ""));
r = await tryQuery("authenticated", c1, `select public.check_in($1, $2, $3) as n`, [liveTable, ...atCafe]);
check("check-in at the venue", r.rows?.[0]?.n === 1);
r = await tryQuery("authenticated", c2, `select public.create_meetup($1, $2, 3) as id`, [cafeId, inHours(3)]);
r = await tryQuery("authenticated", c2, `select public.check_in($1, $2, $3)`, [r.rows?.[0]?.id, ...atCafe]);
check("can't check in long before the table starts", /not_now/.test(r.error ?? ""));
r = await tryQuery("authenticated", c1, `insert into public.meetup_checkins (meetup_id, user_id) values ($1, $2)`, [liveTable, c4]);
check("check-ins can't be written directly", !!r.error);

const couponState = async (who) => (await tryQuery("authenticated", who, `select public.meetup_coupon_state($1) as s`, [liveTable])).rows?.[0]?.s;
let state = await couponState(c1);
check("coupon state: 1 checked in, the discount needs 3", state?.checked_in === 1 && state.me_checked_in === true && state.window_open === true
  && state.deals.length === 1 && state.deals[0].needed === 3 && state.venue?.radius_m === 50);
r = await tryQuery("authenticated", outsider, `select public.meetup_coupon_state($1)`, [liveTable]);
check("non-members can't see the coupon state", /not_member/.test(r.error ?? ""));
r = await tryQuery("authenticated", c1, `select * from public.issue_redemption_qr($1, $2)`, [liveTable, cafeDealId]);
check("no QR with fewer than 3 checked in", /need_more_people/.test(r.error ?? ""));
r = await tryQuery("authenticated", c4, `select * from public.issue_redemption_qr($1, $2)`, [liveTable, cafeDealId]);
check("members who aren't checked in can't get the QR", /not_checked_in/.test(r.error ?? ""));
await tryQuery("authenticated", c2, `select public.check_in($1, $2, $3)`, [liveTable, ...atCafe]);
await tryQuery("authenticated", c3, `select public.check_in($1, $2, $3)`, [liveTable, ...atCafe]);
r = await tryQuery("authenticated", c1, `select * from public.issue_redemption_qr($1, $2)`, [liveTable, cafeDealId]);
const qrToken = r.rows?.[0]?.token;
check("QR issued once 3 are checked in, valid 15 minutes", /^[0-9a-f]{48}$/.test(qrToken ?? "")
  && Math.abs(new Date(r.rows[0].expires_at) - Date.now() - 15 * 60_000) < 60_000);
r = await tryQuery("authenticated", c2, `select * from public.issue_redemption_qr($1, $2)`, [liveTable, cafeDealId]);
check("asking again gives the same code", r.rows?.[0]?.token === qrToken);
check("checked-in members see the QR", (await couponState(c3))?.deals[0].qr_token === qrToken);
check("members who aren't checked in don't", (await couponState(c4))?.deals[0].qr_token === null);
for (const [what, sql] of [
  ["QR tokens", "select * from public.redemption_qrs"], ["redemptions", "select * from public.redemptions"],
  ["staff sessions", "select * from public.venue_staff_sessions"],
]) {
  r = await tryQuery("authenticated", c1, sql);
  check(`app users can't read ${what}`, !!r.error || r.rows.length === 0);
}
r = await tryQuery("authenticated", c1, `select public.staff_redeem('x', $1)`, [qrToken]);
check("app users can't call staff_redeem", !!r.error);
r = await tryQuery("anon", null, `select * from public.staff_sign_in('cafe-staff', 'cafepass1', null)`);
check("anon can't call staff_sign_in", !!r.error);

r = await tryQuery("service_role", null, `select * from public.staff_sign_in('cafe-staff', 'wrong', '1.2.3.4')`);
check("wrong staff password: no session", r.rows?.length === 0);
r = await tryQuery("service_role", null, `select * from public.staff_sign_in('Cafe-Staff', 'cafepass1', '1.2.3.4')`);
const cafeSession = r.rows?.[0]?.session_token;
check("staff log in and get a session for their venue", !!cafeSession && r.rows[0].venue_id === cafeId);
r = await tryQuery("service_role", null, `select * from public.staff_session($1)`, [cafeSession]);
check("the session is remembered", r.rows?.[0]?.venue_id === cafeId);
r = await tryQuery("service_role", null, `select session_token from public.staff_sign_in('other-staff', 'otherpass1', null)`);
const otherSession = r.rows?.[0]?.session_token;
r = await tryQuery("service_role", null, `select public.staff_redeem($1, $2) as r`, [otherSession, qrToken]);
check("another venue's login is rejected", r.rows?.[0]?.r?.status === "wrong_venue");
r = await tryQuery("service_role", null, `select public.staff_check_qr($1, $2) as r`, [cafeSession, qrToken]);
check("staff see what the QR is for (3 checked in)", r.rows?.[0]?.r?.status === "ok" && r.rows[0].r.checked_in === 3);
r = await tryQuery("service_role", null, `select public.staff_redeem($1, $2) as r`, [cafeSession, qrToken]);
const redeemed = r.rows?.[0]?.r;
check("right venue login gets the coupon code", redeemed?.status === "ok" && redeemed.coupon_code === "CAFE10" && redeemed.member_names.length === 3);
r = await tryQuery("service_role", null, `select public.staff_redeem($1, $2) as r`, [cafeSession, qrToken]);
check("a QR works only once", r.rows?.[0]?.r?.status === "used");
r = await tryQuery("authenticated", c1, `select * from public.issue_redemption_qr($1, $2)`, [liveTable, cafeDealId]);
check("one redemption per table and promotion", /already_redeemed/.test(r.error ?? ""));
check("the group sees it was redeemed", !!(await couponState(c1))?.deals[0].redeemed_at);
r = await tryQuery("authenticated", admin, `select venue_name, deal_title, checked_in_count, staff_login, member_names from public.redemptions where meetup_id = $1`, [liveTable]);
check("founder sees the redemption (venue, group, staff login)", r.rows?.length === 1 && r.rows[0].venue_name === "Check Cafe"
  && r.rows[0].checked_in_count === 3 && r.rows[0].staff_login === "cafe-staff" && r.rows[0].member_names.includes("Diner 1"));
r = await tryQuery("service_role", null, `select public.staff_redeem($1, 'nonexistent') as r`, [cafeSession]);
check("unknown QR is invalid", r.rows?.[0]?.r?.status === "invalid");

// Expired code (a ticket discount at a hangout venue needs only 1 person).
r = await tryQuery("authenticated", admin,
  `insert into public.venues (name_en, name_th, category, lat, lng, is_active) values ('Zoo', 'สวนสัตว์', 'attraction', 13.70, 100.60, true) returning id`);
const zooId = r.rows?.[0]?.id;
r = await tryQuery("authenticated", admin,
  `select public.admin_save_promotion($1, null, 'ticket', '20% off', 'ลด 20%', '', '', 'percent', 20, 'ZOO20', null, null, true) as id`, [zooId]);
const zooDealId = r.rows?.[0]?.id;
r = await hangout(c4, { venueId: zooId, startsAt: new Date().toISOString() });
const zooHangout = r.rows?.[0]?.id;
await tryQuery("authenticated", c4, `select public.check_in($1, 13.7001, 100.6001)`, [zooHangout]);
r = await tryQuery("authenticated", c4, `select * from public.issue_redemption_qr($1, $2)`, [zooHangout, zooDealId]);
const zooToken = r.rows?.[0]?.token;
check("ticket discount: one checked-in member gets the QR", !!zooToken);
r = await tryQuery("authenticated", c4, `select * from public.issue_redemption_qr($1, $2)`, [zooHangout, cafeDealId]);
check("a promotion of another venue can't be used", /no_coupon/.test(r.error ?? ""));
await db.exec(`update public.redemption_qrs set expires_at = now() - interval '1 minute' where token = '${zooToken}'`);
await tryQuery("authenticated", admin, `select public.admin_create_venue_account($1, 'zoo-staff', 'zoopass12')`, [zooId]);
r = await tryQuery("service_role", null, `select session_token from public.staff_sign_in('zoo-staff', 'zoopass12', null)`);
r = await tryQuery("service_role", null, `select public.staff_redeem($1, $2) as r`, [r.rows?.[0]?.session_token, zooToken]);
check("an expired QR can't be used", r.rows?.[0]?.r?.status === "expired");

await tryQuery("service_role", null, `select public.staff_sign_out($1)`, [cafeSession]);
r = await tryQuery("service_role", null, `select public.staff_check_qr($1, $2) as r`, [cafeSession, qrToken]);
check("signed-out staff must log in again", r.rows?.[0]?.r?.status === "signed_out");
for (let i = 0; i < 20; i++) await tryQuery("service_role", null, `select * from public.staff_sign_in('nobody${i}', 'x', '9.9.9.9')`);
r = await tryQuery("service_role", null, `select * from public.staff_sign_in('cafe-staff', 'cafepass1', '9.9.9.9')`);
check("20 failed staff logins from one IP: blocked for 15 minutes", /too_many_attempts/.test(r.error ?? ""));

// --- Deleting your own account
const [d1, d2] = ["66666666-6666-6666-6666-666666666661", "66666666-6666-6666-6666-666666666662"];
await db.exec(`insert into auth.users (id, email, phone_confirmed_at) values ('${d1}', 'd1@x.com', now()), ('${d2}', 'd2@x.com', now())`);
r = await tryQuery("authenticated", d1, `select public.create_meetup($1, $2, 4) as id`, [cafeId, inHours(5)]);
const d1Table = r.rows?.[0]?.id;
await tryQuery("authenticated", d2, `select public.join_meetup($1)`, [d1Table]);
r = await tryQuery("authenticated", d1, `select public.create_meetup($1, $2, 4) as id`, [cafeId, inHours(6)]);
const d1Alone = r.rows?.[0]?.id;
await tryQuery("authenticated", d1, `insert into public.meetup_messages (meetup_id, sender_id, body) values ($1, $2, 'hi')`, [d1Table, d1]);
r = await tryQuery("authenticated", d1, `select * from public.my_account_files()`);
check("my_account_files works", !r.error);
r = await tryQuery("anon", null, `select public.delete_my_account()`);
check("anon can't delete accounts", !!r.error);
r = await tryQuery("authenticated", d1, `select public.delete_my_account()`);
check("delete my account", !r.error);
r = await db.query(`select (select count(*)::int from auth.users where id = $1) u, (select count(*)::int from public.profiles where id = $1) p`, [d1]);
check("login and profile are gone", r.rows?.[0]?.u === 0 && r.rows[0].p === 0);
r = await tryQuery("service_role", null, `select host_id, status from public.meetups where id = $1`, [d1Table]);
check("their table with others is cancelled and passes to another member", r.rows?.[0]?.host_id === d2 && r.rows[0].status === "cancelled");
r = await tryQuery("service_role", null, `select count(*)::int n from public.meetups where id = $1`, [d1Alone]);
check("their table nobody joined is deleted", r.rows?.[0]?.n === 0);
r = await tryQuery("service_role", null, `select count(*)::int n from public.meetup_messages where sender_id = $1`, [d1]);
check("their messages are deleted", r.rows?.[0]?.n === 0);

// --- Feed: expected cost, meeting point, area
r = await tryQuery("authenticated", c1, `select public.create_meetup($1, $2, 4) as id`, [cafeId, inHours(4)]);
const feedTable = r.rows?.[0]?.id;
r = await tryQuery("authenticated", c1, `select public.set_meetup_details($1, 1::smallint, '  At the counter  ')`, [feedTable]);
check("host sets expected cost and meeting point", !r.error);
r = await tryQuery("authenticated", c2, `select public.set_meetup_details($1, 4::smallint, 'x')`, [feedTable]);
check("only the host sets them", /not_host/.test(r.error ?? ""));
r = await tryQuery("authenticated", c1, `select public.set_meetup_details($1, 9::smallint, null)`, [feedTable]);
check("cost band out of range rejected", /invalid_cost/.test(r.error ?? ""));
r = await tryQuery("authenticated", c2, `select cost_level, meeting_point, area_name from public.list_open_meetups() where id = $1`, [feedTable]);
check("list shows cost, trimmed meeting point and a Bangkok area", r.rows?.[0]?.cost_level === 1
  && r.rows[0].meeting_point === "At the counter" && typeof r.rows[0].area_name === "string");
r = await tryQuery("authenticated", c1, `update public.meetups set cost_level = 0 where id = $1 returning id`, [feedTable]);
check("meetups still can't be changed directly", !!r.error || r.rows.length === 0);

// --- Rewards Passport
const passport = async (who) => (await tryQuery("authenticated", who, `select public.my_passport() as p`)).rows?.[0]?.p;
const endMeetup = (id) => db.exec(`update public.meetups set starts_at = now() - interval '4 hours', ends_at = now() - interval '1 hour' where id = '${id}'`);
r = await tryQuery("authenticated", c4, `select public.check_in($1, $2, $3) as n`, [liveTable, ...atCafe]);
check("4th member checks in", r.rows?.[0]?.n === 4);
let pass = await passport(c1);
check("nothing counts before the meetup ends", pass?.verified === 0 && pass.points === 0);
await endMeetup(liveTable);
pass = await passport(c1);
check("GPS-verified meetup counts: host gets 15 points and a district stamp", pass?.verified === 1 && pass.points === 15
  && pass.stamps.length === 1 && pass.meetups[0].method === "gps" && pass.next_milestone === 3);
check("members get 10 points", (await passport(c4))?.points === 10);
r = await tryQuery("authenticated", c1, `select public.create_meetup($1, now(), 4) as id`, [cafeId]);
const sameDay = r.rows?.[0]?.id;
for (const who of [c2, c3, c4]) await tryQuery("authenticated", who, `select public.join_meetup($1)`, [sameDay]);
for (const who of [c1, c2, c3, c4]) await tryQuery("authenticated", who, `select public.check_in($1, $2, $3)`, [sameDay, ...atCafe]);
await endMeetup(sameDay);
pass = await passport(c1);
check("a second meetup on the same day doesn't count", pass?.verified === 1 && pass.points === 15 && pass.meetups.length === 2);

const [e1, e2, e3, e4] = ["dddddddd-dddd-4ddd-8ddd-ddddddddddd1", "dddddddd-dddd-4ddd-8ddd-ddddddddddd2",
  "77777777-7777-7777-7777-777777777773", "77777777-7777-7777-7777-777777777774"];
await db.exec(`insert into auth.users (id, email, phone_confirmed_at) values ${[e1, e2, e3, e4].map((id, i) => `('${id}', 'e${i}@x.com', now())`).join(", ")}`);
r = await hangout(e1, { lat: 13.7466, lng: 100.5393, spotName: "Siam steps", startsAt: new Date().toISOString(), size: 6 });
const spotHangout = r.rows?.[0]?.id;
for (const who of [e2, e3, e4]) await tryQuery("authenticated", who, `select public.join_meetup($1)`, [spotHangout]);
r = await tryQuery("authenticated", e2, `select public.check_in($1, 13.7470, 100.5393) as n`, [spotHangout]);
check("check-in works at a dropped pin (within 100 m)", r.rows?.[0]?.n === 1);
r = await tryQuery("authenticated", e3, `select public.check_in($1, 13.7490, 100.5393)`, [spotHangout]);
check("but not 250 m away", /too_far/.test(r.error ?? ""));
const challengeId = (await tryQuery("authenticated", e1, `select id from public.challenges order by sort limit 1`)).rows?.[0]?.id;
r = await tryQuery("authenticated", e2, `select public.set_meetup_challenge($1, $2)`, [spotHangout, challengeId]);
check("only the host picks a challenge", /not_host/.test(r.error ?? ""));
r = await tryQuery("authenticated", e1, `select public.set_meetup_challenge($1, $2)`, [spotHangout, challengeId]);
check("host picks a challenge", !r.error);
r = await tryQuery("authenticated", e2, `select public.start_completion_code($1)`, [spotHangout]);
check("only the host can show the completion code", /not_host/.test(r.error ?? ""));
r = await tryQuery("authenticated", e2, `select public.confirm_completion_code($1, '123456')`, [spotHangout]);
check("no code before the host shows one", /no_code/.test(r.error ?? ""));
r = await tryQuery("authenticated", e1, `select public.start_completion_code($1) as code`, [spotHangout]);
const completionCode = r.rows?.[0]?.code;
check("host gets a 6-digit code", /^[0-9]{6}$/.test(completionCode ?? ""));
const wrongCode = completionCode === "000000" ? "111111" : "000000";
r = await tryQuery("authenticated", e2, `select public.confirm_completion_code($1, $2) as s`, [spotHangout, wrongCode]);
check("a wrong code is counted, not accepted", r.rows?.[0]?.s === "wrong_code");
for (let i = 0; i < 4; i++) await tryQuery("authenticated", e2, `select public.confirm_completion_code($1, $2)`, [spotHangout, wrongCode]);
r = await tryQuery("authenticated", e2, `select public.confirm_completion_code($1, $2)`, [spotHangout, completionCode]);
check("5 wrong tries lock the code for an hour", /too_many_attempts/.test(r.error ?? ""));
await db.exec(`delete from public.meetup_code_failures where user_id = '${e2}'`);
for (const who of [e2, e3, e4]) await tryQuery("authenticated", who, `select public.confirm_completion_code($1, $2)`, [spotHangout, completionCode]);
r = await tryQuery("authenticated", admin, `select status from public.meetup_completions where meetup_id = $1`, [spotHangout]);
check("4 confirmations send it to the founder", r.rows?.[0]?.status === "pending");
r = await tryQuery("authenticated", e1, `select * from public.meetup_completions`);
check("app users can't read completion codes", !r.error && r.rows.length === 0);
r = await tryQuery("authenticated", e1, `select public.admin_review_completion($1, true, null)`, [spotHangout]);
check("only the founder can approve", !!r.error);
r = await tryQuery("authenticated", admin, `select public.admin_review_completion($1, true, 'Looks real')`, [spotHangout]);
check("founder approves", !r.error);
await endMeetup(spotHangout);
pass = await passport(e3);
check("code-verified meetup with a challenge: 10 + 10 points", pass?.verified === 1 && pass.points === 20 && pass.meetups[0].method === "code");
check("host gets the host bonus too", (await passport(e1))?.points === 25);
r = await tryQuery("authenticated", admin,
  `insert into public.passport_rewards (milestone, title_en, title_th, coupon_code) values (3, 'Free coffee', 'กาแฟฟรี', 'PASS3') returning id`);
check("founder adds a milestone reward", !r.error);
pass = await passport(e3);
check("locked rewards show without their code", pass?.rewards.length === 1 && pass.rewards[0].unlocked === false && pass.rewards[0].coupon_code === null);
r = await tryQuery("authenticated", e3, `select * from public.passport_rewards`);
check("app users can't read reward codes directly", !r.error && r.rows.length === 0);
r = await tryQuery("authenticated", c2, `select public.passport_summary($1) as s`, [e1]);
check("anyone signed in sees a profile's passport summary", r.rows?.[0]?.s?.points === 25 && r.rows[0].s.verified === 1);

// --- Hidden Gems
r = await tryQuery("authenticated", admin, `select count(*)::int n, count(*) filter (where is_published)::int published, count(place_id)::int linked from public.gems`);
check("121 gems seeded; 118 published, 3 drafts that can't be placed yet; most linked to OSM places", r.rows?.[0]?.n === 121 && r.rows[0].published === 118 && r.rows[0].linked >= 80);
r = await tryQuery("authenticated", admin, `select number, name_en, category from public.gems where number in (1, 17, 18, 31, 66, 95, 103) order by number`);
check("the founder's 100 come first (existing gems reuse their numbers), the rest from 101 in their old order",
  JSON.stringify(r.rows?.map((g) => [g.number, g.name_en, g.category])) === JSON.stringify([
    [1, "Song Wat Road", "culture"], [17, "Phra Sumen Fort", "culture"], [18, "Santichaiprakarn Park", "outdoor"],
    [31, "NANA Coffee Roasters Ari", "cafes"], [66, "Jay Fai", "food"], [95, "Nai Ek Roll Noodle", "food"],
    [103, "Wat Mangkon Kamalawat", "culture"],
  ]));
r = await tryQuery("authenticated", admin, `select count(distinct number)::int n from public.gems where number between 1 and 100`);
check("numbers 1–100 are each used once", r.rows?.[0]?.n === 100);
r = await tryQuery("authenticated", c2, `select * from public.list_gems()`);
check("app users list the published gems", r.rows?.length === 118 && !r.rows.some((g) => g.name_en === "Old Town White Coffee"));
const lumphiniGem = r.rows?.find((g) => g.name_en === "Lumphini Park");
r = await tryQuery("authenticated", c2, `select * from public.gems where not is_published`);
check("drafts are hidden from app users", !r.error && r.rows.length === 0);
r = await tryQuery("authenticated", c2, `update public.gems set name_en = 'x' returning id`);
check("app users can't edit gems", !!r.error || r.rows.length === 0);
r = await tryQuery("authenticated", c2, `insert into public.gem_saves (gem_id) values ($1)`, [lumphiniGem?.id]);
check("save a gem", !r.error);
await tryQuery("authenticated", c2, `insert into public.gem_votes (gem_id) values ($1)`, [lumphiniGem?.id]);
r = await tryQuery("authenticated", c3, `insert into public.gem_votes (gem_id, user_id) values ($1, $2)`, [lumphiniGem?.id, c2]);
check("can't vote in someone else's name", !!r.error);
r = await tryQuery("authenticated", c2, `select saved, useful, i_found_useful from public.list_gems() where id = $1`, [lumphiniGem?.id]);
check("list shows saved and useful", r.rows?.[0]?.saved === true && r.rows[0].useful === 1 && r.rows[0].i_found_useful === true);
r = await tryQuery("authenticated", c3, `select saved, useful from public.list_gems() where id = $1`, [lumphiniGem?.id]);
check("saves are private, useful totals public", r.rows?.[0]?.saved === false && r.rows[0].useful === 1);
r = await tryQuery("authenticated", c1, `select visited from public.list_gems() where name_en = 'Lumphini Park'`);
check("not visited without a verified meetup nearby", r.rows?.[0]?.visited === false);
r = await tryQuery("authenticated", c3, `select public.suggest_gem('Secret noodle stall', 'food', 'Great', 'Go early', '฿60', 13.75, 100.50, null) as id`);
check("users suggest a gem", !r.error);
const suggestionId = r.rows?.[0]?.id;
r = await tryQuery("authenticated", c3, `select public.suggest_gem('x', 'food', '', '', '', 18.79, 98.98, null)`);
check("suggestions must be in Bangkok", /outside_bangkok/.test(r.error ?? ""));
r = await tryQuery("authenticated", c3, `select public.suggest_gem('x', 'food', '', '', '', 13.75, 100.5, '${c2}/photo.jpg')`);
check("a suggestion's photo must be in my own folder", /invalid_photo/.test(r.error ?? ""));
r = await tryQuery("authenticated", c2, `select * from public.gem_suggestions`);
check("other people's suggestions are private", !r.error && r.rows.length === 0);
r = await tryQuery("authenticated", c3, `select public.admin_accept_gem_suggestion($1)`, [suggestionId]);
check("only the founder accepts suggestions", !!r.error);
r = await tryQuery("authenticated", admin, `select public.admin_accept_gem_suggestion($1) as id`, [suggestionId]);
r = await tryQuery("authenticated", admin, `select is_published, contributor_id from public.gems where id = $1`, [r.rows?.[0]?.id]);
check("accepted suggestion becomes an unpublished gem credited to its author", r.rows?.[0]?.is_published === false && r.rows[0].contributor_id === c3);

// --- Map stories
const [s1, s2, s3, s4, s5, s6, sNoPhone] = [1, 2, 3, 4, 5, 6, 7].map((n) => `5f000000-0000-4000-8000-00000000000${n}`);
await db.exec(`insert into auth.users (id, email, raw_user_meta_data, phone_confirmed_at) values
  ${[s1, s2, s3, s4, s5, s6].map((id, i) => `('${id}', 'story${i}@x.com', '{"full_name": "Story ${i}"}', now())`).join(", ")},
  ('${sNoPhone}', 'nophone@x.com', '{}', null);`);
const storyPath = `${s1}/story-1.jpg`;
await tryQuery("authenticated", s1, `insert into storage.objects (bucket_id, name) values ('story-photos', $1)`, [storyPath]);
await tryQuery("authenticated", s1, `insert into storage.objects (bucket_id, name) values ('story-photos', $1)`, [`${s1}/not-a-story.jpg`]);
r = await tryQuery("authenticated", s1, `select public.post_story($1, ' Sunset at the river ', 13.7563, 100.5018) as id`, [storyPath]);
check("post a story", !r.error && !!r.rows?.[0]?.id);
const storyId = r.rows?.[0]?.id;
r = await db.query(`select lat, lng, caption, area_name_en, expires_at > now() + interval '23 hours' as day from public.stories where id = $1`, [storyId]);
const moved = r.rows[0] && 6371000 * 2 * Math.asin(Math.sqrt(
  Math.sin(((r.rows[0].lat - 13.7563) * Math.PI) / 360) ** 2 +
    Math.cos((13.7563 * Math.PI) / 180) * Math.cos((r.rows[0].lat * Math.PI) / 180) * Math.sin(((r.rows[0].lng - 100.5018) * Math.PI) / 360) ** 2,
));
check("only a point 100–250 m away is stored, for 24 hours", moved >= 95 && moved <= 255 && r.rows[0].day && r.rows[0].caption === "Sunset at the river");
r = await tryQuery("authenticated", s1, `select public.post_story($1, '', 13.75, 100.5)`, [`${s2}/x.jpg`]);
check("a story's photo must be in my own folder", /invalid_photo/.test(r.error ?? ""));
r = await tryQuery("authenticated", s1, `select public.post_story($1, $2, 13.75, 100.5)`, [storyPath, "x".repeat(151)]);
check("captions are 150 characters max", /invalid_caption/.test(r.error ?? ""));
const phoneSetting = (await db.query(`select require_phone_verification v from public.app_settings`)).rows[0].v;
await db.exec(`update public.app_settings set require_phone_verification = true`);
r = await tryQuery("authenticated", sNoPhone, `select public.post_story($1, '', 13.75, 100.5)`, [`${sNoPhone}/a.jpg`]);
await db.query(`update public.app_settings set require_phone_verification = $1`, [phoneSetting]);
check("posting follows the phone rule", /not_allowed/.test(r.error ?? ""));
r = await tryQuery("authenticated", s2, `insert into public.stories (user_id, photo_path, lat, lng) values ($1, $2, 13.75, 100.5)`, [s2, `${s2}/a.jpg`]);
check("stories can't be written directly", !!r.error);
r = await tryQuery("authenticated", s2, `select id, display_name from public.map_stories()`);
check("others see the story on the map with the poster's name", r.rows?.some((s) => s.id === storyId && s.display_name === "Story 0"));
r = await tryQuery("authenticated", "", `select * from public.map_stories()`);
check("signed-out callers see no stories", !!r.error || r.rows.length === 0);
r = await tryQuery("authenticated", s2, `select name from storage.objects where bucket_id = 'story-photos'`);
check("others open a live story's photo, not other files in the folder",
  r.rows?.length === 1 && r.rows[0].name === storyPath);
await tryQuery("authenticated", s3, `insert into public.blocks (blocker_id, blocked_id) values ($1, $2)`, [s3, s1]);
r = await tryQuery("authenticated", s3, `select id from public.map_stories()`);
check("blocking hides stories", r.rows?.length === 0);
r = await tryQuery("authenticated", s2, `insert into public.reports (reporter_id, reported_id, context, context_id, reason) values ($1, $2, 'story', $3, 'spam')`, [s2, s1, storyId]);
check("report a story", !r.error);
r = await tryQuery("authenticated", s2, `select id from public.map_stories()`);
const s4Sees = (await tryQuery("authenticated", s4, `select id from public.map_stories()`)).rows?.length === 1;
check("the reporter stops seeing it at once, others still do", r.rows?.length === 0 && s4Sees);
for (const who of [s4, s5]) {
  await tryQuery("authenticated", who, `insert into public.reports (reporter_id, reported_id, context, context_id, reason) values ($1, $2, 'story', $3, 'harassment')`, [who, s1, storyId]);
}
r = await tryQuery("authenticated", s6, `select id from public.map_stories()`);
const ownerSees = (await tryQuery("authenticated", s1, `select id from public.map_stories()`)).rows?.length === 1;
check("hidden for everyone at 3 reports (the poster still sees it)", r.rows?.length === 0 && ownerSees);
r = await tryQuery("authenticated", s6, `select name from storage.objects where bucket_id = 'story-photos'`);
check("a hidden story's photo can't be opened", r.rows?.length === 0);
await db.query(`update public.reports set resolved = true where context_id = $1`, [storyId]);
r = await tryQuery("authenticated", s6, `select id from public.map_stories()`);
check("shown again when the founder resolves the reports", r.rows?.length === 1);
r = await tryQuery("authenticated", s6, `select public.delete_story($1)`, [storyId]);
check("can't delete someone else's story", /not_found/.test(r.error ?? ""));
await db.query(`update public.stories set expires_at = now() - interval '1 minute' where id = $1`, [storyId]);
r = await tryQuery("authenticated", s6, `select id from public.map_stories()`);
check("stories disappear after 24 hours", r.rows?.length === 0);
r = await tryQuery("authenticated", s6, `select public.clear_my_expired_stories() as path`);
check("clearing expired stories only touches my own", r.rows?.length === 0);
r = await tryQuery("authenticated", s1, `select public.clear_my_expired_stories() as path`);
check("clear my expired stories (returns the photos to remove)", r.rows?.length === 1 && r.rows[0].path === storyPath);
r = await tryQuery("authenticated", s1, `select public.delete_story($1) as path`, [storyId]);
check("a deleted story is gone", /not_found/.test(r.error ?? ""));
await db.query(`insert into public.stories (user_id, photo_path, lat, lng) select $1::uuid, $1::text || '/s' || g || '.jpg', 13.75, 100.5 from generate_series(1, 10) g`, [s2]);
r = await tryQuery("authenticated", s2, `select public.post_story($1, '', 13.75, 100.5)`, [`${s2}/eleventh.jpg`]);
check("max 10 stories per person per 24 hours", /too_many_stories/.test(r.error ?? ""));

// --- TableMeet Plus
await db.exec(`update public.app_settings set plus_locked = true`);
r = await tryQuery("authenticated", s4, `select * from public.list_gems()`);
check("Hidden Gems are empty without Plus", !r.error && r.rows.length === 0);
r = await tryQuery("authenticated", s4, `select public.my_passport()`);
check("the Passport needs Plus", /plus_required/.test(r.error ?? ""));
r = await tryQuery("authenticated", s4, `select * from public.plan_candidates(13.75, 100.5, 3000, array['temple'])`);
check("the day planner finds nothing without Plus", !r.error && r.rows.length === 0);
r = await tryQuery("authenticated", s4, `insert into public.day_plans (owner_id, title, day, start_minutes, end_minutes, stops) values ($1, 'x', current_date, 540, 720, '[]')`, [s4]);
check("saving a day plan needs Plus", !!r.error);
r = await tryQuery("authenticated", s4, `select public.suggest_gem('x', 'food', '', '', '', 13.75, 100.5, null)`);
check("suggesting a gem needs Plus", /plus_required/.test(r.error ?? ""));
r = await tryQuery("authenticated", s4, `select public.list_gems_all()`);
check("the inner functions have no API access", !!r.error);
r = await tryQuery("authenticated", s4, `select public.my_plus() as p`);
check("my Plus status: not a member", r.rows?.[0]?.p?.member === false && r.rows[0].p.unlocked === false);
r = await tryQuery("authenticated", s4, `select public.admin_grant_plus($1, 'monthly', null)`, [s4]);
check("only the founder gives Plus", !!r.error);
r = await tryQuery("authenticated", s4, `select * from public.admin_find_users('story')`);
check("only the founder searches users", !!r.error);
r = await tryQuery("authenticated", admin, `select id, email from public.admin_find_users('story3')`);
check("the founder finds people by email", r.rows?.length === 1 && r.rows[0].id === s4);
r = await tryQuery("authenticated", admin, `select public.admin_grant_plus($1, 'monthly', 'Launch friend') as ends`, [s4]);
const monthEnd = r.rows?.[0]?.ends ? new Date(r.rows[0].ends).getTime() : 0;
check("give Plus for a month", !r.error && monthEnd > Date.now() + 27 * 86400000 && monthEnd < Date.now() + 32 * 86400000);
r = await tryQuery("authenticated", admin, `select public.admin_grant_plus($1, 'yearly', null) as ends`, [s4]);
check("a yearly plan is added after the current end", new Date(r.rows?.[0]?.ends).getTime() - monthEnd > 364 * 86400000);
r = await tryQuery("authenticated", s4, `select public.my_plus() as p`);
check("my Plus status: member, yearly", r.rows?.[0]?.p?.member === true && r.rows[0].p.unlocked === true && r.rows[0].p.plan === "yearly");
r = await tryQuery("authenticated", s4, `select count(*)::int n from public.list_gems()`);
check("Plus members see the Hidden Gems", r.rows?.[0]?.n > 100);
r = await tryQuery("authenticated", s4, `select public.my_passport() as p`);
check("Plus members open the Passport", !r.error && r.rows?.[0]?.p !== null);
r = await tryQuery("authenticated", s5, `select * from public.plus_members`);
check("Plus rows are private", !r.error && r.rows.length === 0);
r = await tryQuery("authenticated", s4, `update public.plus_members set ends_at = now() + interval '10 years' returning user_id`);
check("members can't extend Plus themselves", !!r.error || r.rows.length === 0);
r = await tryQuery("authenticated", admin, `select user_id, note from public.admin_list_plus()`);
check("the founder lists Plus members", r.rows?.length === 1 && r.rows[0].note === "Launch friend");
await tryQuery("authenticated", admin, `select public.admin_end_plus($1)`, [s4]);
r = await tryQuery("authenticated", s4, `select count(*)::int n from public.list_gems()`);
check("ending Plus locks the features again", r.rows?.[0]?.n === 0);
r = await tryQuery("authenticated", admin, `select count(*)::int n from public.list_gems()`);
check("the founder always has Plus", r.rows?.[0]?.n > 100);
await db.exec(`update public.app_settings set plus_locked = false`);
r = await tryQuery("authenticated", s5, `select count(*)::int n from public.list_gems()`);
check("turning plus_locked off opens the features to everyone", r.rows?.[0]?.n > 100);

// --- Phone (push) notifications
const pushToken = (n) => `ExponentPushToken[pushTestToken000${n}]`;
const pushesTo = async (token) =>
  (await db.query(`select e from net.calls c, jsonb_array_elements(c.body) e where e->>'to' = $1 order by c.id`, [token])).rows.map((row) => row.e);
r = await tryQuery("authenticated", s2, `select public.register_push_device($1, 'android', 'en', 13.7563, 100.5018)`, [pushToken(2)]);
check("register this phone for notifications", !r.error);
r = await tryQuery("authenticated", s2, `select public.register_push_device('not-a-token', 'android', 'en', null, null)`);
check("only Expo push tokens are accepted", /invalid_device/.test(r.error ?? ""));
r = await db.query(`select area_lat, area_lng from public.push_devices where token = $1`, [pushToken(2)]);
check("only a rough area (0.05°) is kept", r.rows[0]?.area_lat === 13.75 && r.rows[0]?.area_lng === 100.5);
r = await tryQuery("authenticated", s3, `select * from public.push_devices`);
check("phones can't be read through the API", !!r.error);
await tryQuery("authenticated", s3, `select public.register_push_device($1, 'android', 'th', null, null)`, [pushToken(3)]);
await db.exec(`truncate net.calls`);
const pushThread = (await db.query(`insert into public.direct_threads (user_a, user_b, requested_by) values ($1, $2, $2) returning id`, [s2, s5])).rows[0].id;
const pushDm = (body) => db.query(`insert into public.direct_messages (thread_id, sender_id, body) values ($1, $2, $3)`, [pushThread, s5, body]);
await pushDm("Hi, are you at the market?");
let pushes = await pushesTo(pushToken(2));
check("a private message reaches the phone (as a request the first time)",
  pushes.length === 1 && pushes[0].title === "Message request from Story 4" && pushes[0].body === "Hi, are you at the market?" && pushes[0].data.url === `/dm/${s5}`);
await tryQuery("authenticated", s5, `select public.follow_user($1)`, [s3]);
pushes = await pushesTo(pushToken(3));
check("new follower, in the phone's language (Thai)", pushes.length === 1 && pushes[0].title === "ผู้ติดตามใหม่" && pushes[0].body === "Story 4 เริ่มติดตามคุณ");
// s3 blocked s1 earlier (stories): nothing from s1 reaches s3.
await db.exec(`truncate net.calls`);
const blockedThread = (await db.query(`insert into public.direct_threads (user_a, user_b, requested_by) values ($1, $2, $1) returning id`, [s1, s3])).rows[0].id;
await db.query(`insert into public.direct_messages (thread_id, sender_id, body) values ($1, $2, 'hello')`, [blockedThread, s1]);
await db.query(`insert into public.follows (follower_id, followee_id) values ($1, $2)`, [s6, s3]);
check("the check itself works: a follow from someone else does arrive", (await pushesTo(pushToken(3))).length === 1);
check("nothing across a block", !(await pushesTo(pushToken(3))).some((push) => push.body === "hello"));
await db.query(`insert into public.meetups (kind, spot_name, spot_lat, spot_lng, host_id, title, starts_at, ends_at, max_people)
  values ('hangout', 'Lumphini', 13.73, 100.54, $1, 'Morning run', now() + interval '1 day', now() + interval '1 day 2 hours', 5)`, [s6]);
pushes = await pushesTo(pushToken(2));
check("a new hangout within 20 km of my area, with who made it and the title", pushes.length === 1 && pushes[0].title === "New hangout near you" && pushes[0].body.startsWith("Story 5 created \"Morning run\" · "));
for (let i = 0; i < 3; i++) {
  await db.query(`insert into public.meetups (kind, spot_name, spot_lat, spot_lng, host_id, title, starts_at, ends_at, max_people)
    values ('hangout', 'x', 13.74, 100.55, $1, 'More ' || $2, now() + interval '1 day', now() + interval '1 day 2 hours', 5)`, [s6, i]);
}
check("max 3 nearby notifications a day", (await pushesTo(pushToken(2))).length === 3);
await db.exec(`truncate net.calls`);
await db.query(`insert into public.meetups (kind, spot_name, spot_lat, spot_lng, host_id, title, starts_at, ends_at, max_people)
  values ('hangout', 'Paris', 48.85, 2.35, $1, 'Far away', now() + interval '1 day', now() + interval '1 day 2 hours', 5)`, [s5]);
check("nothing for hangouts far away", (await pushesTo(pushToken(2))).length === 0);
await tryQuery("authenticated", s2, `select public.unregister_push_device($1)`, [pushToken(2)]);
await pushDm("still there?");
check("turned off: nothing reaches the phone", (await pushesTo(pushToken(2))).length === 0);
r = await tryQuery("authenticated", s4, `select public.push_send($1, 'chat', 'x', 'x', 'x', 'x', '/')`, [s3]);
check("nobody can send notifications through the API", !!r.error);

// --- Private tables / hangouts (join requests)
await db.exec(`truncate net.calls`);
await tryQuery("authenticated", s6, `select public.register_push_device($1, 'android', 'en', null, null)`, [pushToken(6)]);
await tryQuery("authenticated", s4, `select public.register_push_device($1, 'android', 'en', null, null)`, [pushToken(4)]);
const privateId = (await db.query(`insert into public.meetups (kind, spot_name, spot_lat, spot_lng, host_id, title, starts_at, ends_at, max_people)
  values ('hangout', 'Rooftop', 13.74, 100.53, $1, 'Sunset crew', now() + interval '1 day', now() + interval '1 day 2 hours', 2) returning id`, [s6])).rows[0].id;
await db.query(`insert into public.meetup_members (meetup_id, user_id) values ($1, $2)`, [privateId, s6]);
r = await tryQuery("authenticated", s4, `select public.set_meetup_join_mode($1, 'private')`, [privateId]);
check("only the host makes a hangout private", /not_host/.test(r.error ?? ""));
r = await tryQuery("authenticated", s6, `select public.set_meetup_join_mode($1, 'private')`, [privateId]);
check("host makes it private", !r.error);
r = await tryQuery("authenticated", s4, `select public.join_meetup($1)`, [privateId]);
check("a private hangout can't be joined directly", /approval_required/.test(r.error ?? ""));
r = await tryQuery("authenticated", s4, `select public.request_to_join($1)`, [privateId]);
check("ask to join a private hangout", !r.error);
pushes = await pushesTo(pushToken(6));
check("the host's phone gets the join request", pushes.length === 1 && pushes[0].title === "Join request" && pushes[0].body.startsWith("Story 3 asked to join"));
r = await tryQuery("authenticated", s4, `select join_mode, my_request, joined from public.list_open_meetups() where id = $1`, [privateId]);
check("the list shows it's private and my request is waiting", r.rows?.[0]?.join_mode === "private" && r.rows[0].my_request === "pending" && r.rows[0].joined === false);
r = await tryQuery("authenticated", s5, `select * from public.meetup_join_requests where meetup_id = $1`, [privateId]);
check("other people can't see join requests", !r.error && r.rows.length === 0);
r = await tryQuery("authenticated", s6, `select user_id from public.meetup_join_requests where meetup_id = $1`, [privateId]);
check("the host sees the requests", r.rows?.length === 1 && r.rows[0].user_id === s4);
r = await tryQuery("authenticated", s6, `select kind from public.my_notifications(60, null, null) where kind = 'join_request'`);
check("the request is in the host's bell", r.rows?.length === 1);
r = await tryQuery("authenticated", s4, `insert into public.meetup_join_requests (meetup_id, user_id, status) values ($1, $2, 'approved')`, [privateId, s4]);
check("requests can't be written directly", !!r.error);
r = await tryQuery("authenticated", s4, `select public.decide_join_request($1, $2, true)`, [privateId, s4]);
check("only the host approves", /not_host/.test(r.error ?? ""));
r = await tryQuery("authenticated", s6, `select public.decide_join_request($1, $2, true)`, [privateId, s4]);
r = await db.query(`select count(*)::int n from public.meetup_members where meetup_id = $1 and user_id = $2`, [privateId, s4]);
check("approving adds the member", r.rows[0].n === 1);
pushes = await pushesTo(pushToken(4));
check("the person's phone hears they're in", pushes.some((push) => push.title === "You're in!"));
r = await tryQuery("authenticated", s4, `select kind from public.my_notifications(60, null, null) where kind = 'request_approved'`);
check("and their bell too", r.rows?.length === 1);
r = await tryQuery("authenticated", s5, `select public.request_to_join($1)`, [privateId]);
check("no requests once it's full", /meetup_full/.test(r.error ?? ""));
await db.query(`update public.meetups set max_people = 5 where id = $1`, [privateId]);
await tryQuery("authenticated", s5, `select public.request_to_join($1)`, [privateId]);
await tryQuery("authenticated", s6, `select public.decide_join_request($1, $2, false)`, [privateId, s5]);
r = await tryQuery("authenticated", s5, `select public.request_to_join($1)`, [privateId]);
check("a declined person can't ask again", /request_declined/.test(r.error ?? ""));

// --- Story audience (friends / everyone)
await db.query(`insert into public.follows (follower_id, followee_id) values ($1, $2), ($2, $1)`, [s5, s6]);
r = await tryQuery("authenticated", s5, `select public.post_story($1, 'Friends only', 13.75, 100.5, 'friends') as id`, [`${s5}/friends.jpg`]);
check("post a friends-only story", !r.error);
const friendsStory = r.rows?.[0]?.id;
r = await tryQuery("authenticated", s6, `select id, audience from public.map_stories() where id = $1`, [friendsStory]);
check("friends see a friends-only story", r.rows?.length === 1 && r.rows[0].audience === "friends");
r = await tryQuery("authenticated", s4, `select id from public.map_stories() where id = $1`, [friendsStory]);
check("others don't", !r.error && r.rows.length === 0);
r = await tryQuery("authenticated", s5, `select public.post_story($1, 'For all', 13.75, 100.5) as id`, [`${s5}/all.jpg`]);
const everyoneStory = r.rows?.[0]?.id;
r = await tryQuery("authenticated", s4, `select audience from public.map_stories() where id = $1`, [everyoneStory]);
check("stories are for everyone by default", r.rows?.[0]?.audience === "everyone");
r = await tryQuery("authenticated", s5, `select public.post_story($1, '', 13.75, 100.5, 'nobody')`, [`${s5}/x.jpg`]);
check("only everyone / friends", /invalid_audience/.test(r.error ?? ""));

// --- The founder deletes someone's account (emailed deletion requests)
const [x1, x2] = ["0de1e7e0-0000-4000-8000-000000000001", "0de1e7e0-0000-4000-8000-000000000002"];
await db.exec(`insert into auth.users (id, email, phone_confirmed_at) values ('${x1}', 'x1@x.com', now()), ('${x2}', 'x2@x.com', now())`);
r = await tryQuery("authenticated", x1, `select public.create_meetup($1, $2, 4) as id`, [cafeId, inHours(7)]);
const x1Table = r.rows?.[0]?.id;
await tryQuery("authenticated", x2, `select public.join_meetup($1)`, [x1Table]);
r = await db.query(`insert into public.chat_groups (name, emoji, owner_id) values ('Delete test', '🍜', $1) returning id`, [x1]);
const xGroup = r.rows[0].id;
await db.query(`insert into public.chat_group_members (group_id, user_id, joined_at) values ($1, $2, now() - interval '1 hour'), ($1, $3, now())`, [xGroup, x1, x2]);
await tryQuery("authenticated", x1, `insert into storage.objects (bucket_id, name) values ('profile-photos', $1)`, [`${x1}/avatar.jpg`]);
r = await tryQuery("authenticated", x2, `select public.admin_delete_user($1)`, [x1]);
check("only admins delete other people's accounts", /not allowed/.test(r.error ?? ""));
r = await tryQuery("authenticated", x2, `select * from public.admin_account_files($1)`, [x1]);
check("only admins list other people's chat files", /not allowed/.test(r.error ?? ""));
r = await tryQuery("authenticated", x2, `delete from storage.objects where name = $1 returning id`, [`${x1}/avatar.jpg`]);
check("people can't delete other people's files", !r.error && r.rows.length === 0);
r = await tryQuery("authenticated", admin, `select * from public.admin_account_files($1)`, [x1]);
check("the founder lists someone's chat files", !r.error);
r = await tryQuery("authenticated", admin, `select name from storage.objects where bucket_id = 'profile-photos' and name like $1`, [`${x1}/%`]);
check("the founder lists someone's photos", r.rows?.length === 1);
r = await tryQuery("authenticated", admin, `delete from storage.objects where bucket_id = 'profile-photos' and name = $1 returning id`, [`${x1}/avatar.jpg`]);
check("the founder deletes someone's photos", r.rows?.length === 1);
r = await tryQuery("authenticated", admin, `select public.admin_delete_user($1)`, [admin]);
check("admins can't be deleted from the panel", /cannot_delete_admin/.test(r.error ?? ""));
r = await tryQuery("authenticated", admin, `select public.admin_delete_user($1)`, [x1]);
check("the founder deletes an account", !r.error);
r = await db.query(`select (select count(*)::int from auth.users where id = $1) u, (select count(*)::int from public.profiles where id = $1) p`, [x1]);
check("their login and profile are gone", r.rows?.[0]?.u === 0 && r.rows[0].p === 0);
r = await tryQuery("service_role", null, `select host_id, status from public.meetups where id = $1`, [x1Table]);
check("their table with others is cancelled and passes on", r.rows?.[0]?.host_id === x2 && r.rows[0].status === "cancelled");
r = await db.query(`select owner_id from public.chat_groups where id = $1`, [xGroup]);
check("their group passes to the next member", r.rows?.[0]?.owner_id === x2);
r = await tryQuery("authenticated", admin, `select public.admin_delete_user($1)`, [x1]);
check("deleting a missing account says not_found", /not_found/.test(r.error ?? ""));
r = await tryQuery("authenticated", x2, `select public.leave_group($1)`, [xGroup]);
check("leave_group still works", !r.error);
r = await db.query(`select count(*)::int n from public.chat_groups where id = $1`, [xGroup]);
check("the last one out deletes the group", r.rows?.[0]?.n === 0);
r = await tryQuery("authenticated", x2, `select public.leave_group($1)`, [xGroup]);
check("leaving a group you're not in says not_found", /not_found/.test(r.error ?? ""));

// --- Story likes
const [lA, lB, lC, lD] = [1, 2, 3, 4].map((n) => `1a000000-0000-4000-8000-00000000000${n}`);
await db.exec(`insert into auth.users (id, email, raw_user_meta_data, phone_confirmed_at) values
  ${[lA, lB, lC, lD].map((id, i) => `('${id}', 'like${i}@x.com', '{"full_name": "Liker ${i + 1}"}', now())`).join(", ")}`);
r = await tryQuery("authenticated", lA, `select public.post_story($1, 'Look', 13.75, 100.5) as id`, [`${lA}/likes.jpg`]);
const likedStory = r.rows?.[0]?.id;
r = await tryQuery("authenticated", lB, `select public.like_story($1)`, [likedStory]);
check("like someone's story", !r.error);
r = await tryQuery("authenticated", lB, `select public.like_story($1, true)`, [likedStory]);
check("liking twice is harmless", !r.error);
r = await tryQuery("authenticated", lA, `select public.like_story($1)`, [likedStory]);
check("can't like your own story", /own_story/.test(r.error ?? ""));
r = await tryQuery("authenticated", lB, `select liked, like_count from public.map_stories() where id = $1`, [likedStory]);
check("the map says I liked it, without the count", r.rows?.[0]?.liked === true && r.rows[0].like_count === null);
r = await tryQuery("authenticated", lA, `select liked, like_count from public.map_stories() where id = $1`, [likedStory]);
check("the poster sees how many liked it", r.rows?.[0]?.liked === false && r.rows[0].like_count === 1);
r = await tryQuery("authenticated", lA, `select user_id, display_name from public.story_likers($1)`, [likedStory]);
check("the poster sees who liked it", r.rows?.length === 1 && r.rows[0].user_id === lB && r.rows[0].display_name === "Liker 2");
r = await tryQuery("authenticated", lB, `select * from public.story_likers($1)`, [likedStory]);
check("others can't see who liked it", /not_owner/.test(r.error ?? ""));
r = await tryQuery("authenticated", lC, `select * from public.story_likes where story_id = $1`, [likedStory]);
check("other people's likes can't be read", !r.error && r.rows.length === 0);
r = await tryQuery("authenticated", lA, `select user_id from public.story_likes where story_id = $1`, [likedStory]);
check("the poster can read the likes (Realtime)", r.rows?.length === 1);
r = await tryQuery("authenticated", lC, `insert into public.story_likes (story_id, user_id) values ($1, $2)`, [likedStory, lC]);
check("likes can't be written directly", !!r.error);
await tryQuery("authenticated", lB, `select public.like_story($1, false)`, [likedStory]);
r = await tryQuery("authenticated", lA, `select like_count from public.map_stories() where id = $1`, [likedStory]);
check("unlike", r.rows?.[0]?.like_count === 0);
await tryQuery("authenticated", lB, `select public.like_story($1)`, [likedStory]);
r = await tryQuery("authenticated", lA, `select public.post_story($1, 'Friends', 13.75, 100.5, 'friends') as id`, [`${lA}/friends.jpg`]);
const friendsOnlyStory = r.rows?.[0]?.id;
r = await tryQuery("authenticated", lC, `select public.like_story($1)`, [friendsOnlyStory]);
check("only friends can like a friends-only story", /not_found/.test(r.error ?? ""));
await db.query(`insert into public.follows (follower_id, followee_id) values ($1, $2), ($2, $1)`, [lA, lC]);
r = await tryQuery("authenticated", lC, `select public.like_story($1)`, [friendsOnlyStory]);
check("a friend can like it", !r.error);
r = await tryQuery("authenticated", lA, `select user_id from public.story_likers($1)`, [friendsOnlyStory]);
check("and the poster sees the friend", r.rows?.length === 1 && r.rows[0].user_id === lC);
await tryQuery("authenticated", lD, `select public.like_story($1)`, [likedStory]);
await db.query(`insert into public.blocks (blocker_id, blocked_id) values ($1, $2)`, [lA, lD]);
r = await tryQuery("authenticated", lA, `select user_id from public.story_likers($1)`, [likedStory]);
check("likers across a block are left out", r.rows?.length === 1 && r.rows[0].user_id === lB);
r = await tryQuery("authenticated", lA, `select like_count from public.map_stories() where id = $1`, [likedStory]);
check("and not counted", r.rows?.[0]?.like_count === 1);
r = await tryQuery("authenticated", lD, `select public.like_story($1)`, [friendsOnlyStory]);
check("no likes across a block", /not_found/.test(r.error ?? ""));
await tryQuery("authenticated", lA, `select public.delete_story($1)`, [likedStory]);
r = await db.query(`select count(*)::int n from public.story_likes where story_id = $1`, [likedStory]);
check("deleting a story deletes its likes", r.rows[0].n === 0);
r = await db.query(`select count(*)::int n from public.level_activity where user_id = $1 and kind = 'like_received'`, [lA]);
check("likes received are remembered for challenges (once per person)", r.rows[0].n === 3);

// --- Levels
const myLevel = async (who) => (await tryQuery("authenticated", who, `select public.my_level() as l`)).rows?.[0]?.l;
const levelChallenge = (lvl, id) => lvl?.challenges.find((ch) => ch.id === id);
const [v1, v2, v3, v4, v5] = [1, 2, 3, 4, 5].map((n) => `1e000000-0000-4000-8000-00000000000${n}`);
await db.exec(`insert into auth.users (id, email, raw_user_meta_data, phone_confirmed_at) values
  ${[v1, v2, v3, v4, v5].map((id, i) => `('${id}', 'level${i}@x.com', '{"full_name": "Leveller ${i + 1}"}', now())`).join(", ")}`);
let lvl = await myLevel(v1);
check("new people start at level 1 with 0 points", lvl?.level === 1 && lvl.points === 0 && lvl.per_level === 100 && lvl.plus_level === 15);
check("level 1 has 3 challenges and level 2's are shown locked",
  lvl?.challenges.filter((ch) => ch.level === 1 && !ch.locked).length === 3 && lvl.challenges.filter((ch) => ch.level === 2 && ch.locked).length === 3);
await db.query(`update public.profiles set avatar_path = id::text || '/a.jpg', profession = 'engineer' where id = $1`, [v1]);
lvl = await myLevel(v1);
check("profile challenges finish on their own: 2 × 20 points", lvl?.points === 40 && levelChallenge(lvl, "l1-photo")?.done && levelChallenge(lvl, "l1-about")?.done
  && !levelChallenge(lvl, "l1-story")?.done && levelChallenge(lvl, "l1-story")?.progress === 0);
check("a finished challenge counts once", (await myLevel(v1))?.points === 40);

const levelTable = async (host, checkInOrder) => {
  const id = (await tryQuery("authenticated", host, `select public.create_meetup($1, now(), 6) as id`, [cafeId])).rows?.[0]?.id;
  for (const who of [v1, v2, v3, v4].filter((w) => w !== host)) await tryQuery("authenticated", who, `select public.join_meetup($1)`, [id]);
  for (const who of checkInOrder) await tryQuery("authenticated", who, `select public.check_in($1, $2, $3)`, [id, ...atCafe]);
  return id;
};
const pointsFor = async (who, meetupId) =>
  (await db.query(`select count(*)::int n from public.level_points where user_id = $1 and source = 'meetup' and ref = $2`, [who, meetupId])).rows[0].n;
const tableA = await levelTable(v1, [v1, v2, v3]);
check("no points with 3 check-ins", (await pointsFor(v1, tableA)) === 0);
await tryQuery("authenticated", v4, `select public.check_in($1, $2, $3)`, [tableA, ...atCafe]);
check("the 4th check-in gives every checked-in member 20 points",
  (await pointsFor(v1, tableA)) === 1 && (await pointsFor(v4, tableA)) === 1 && (await myLevel(v2))?.points === 20);
check("not to people who didn't check in", (await pointsFor(v5, tableA)) === 0);
await tryQuery("authenticated", v1, `select public.post_story($1, '', 13.75, 100.5)`, [`${v1}/level.jpg`]);
lvl = await myLevel(v1);
check("posting a story finishes its challenge", lvl?.points === 80 && lvl.level === 1 && lvl.level_points === 80);
const tableB = await levelTable(v2, [v1, v2, v3, v4]);
lvl = await myLevel(v1);
check("100 points = level 2", lvl?.level === 2 && lvl.points === 100 && lvl.level_points === 0 && lvl.level_started_at);
check("level 2's challenges open and count only what happens from now on",
  levelChallenge(lvl, "l2-checkin")?.locked === false && levelChallenge(lvl, "l2-checkin")?.progress === 0 && levelChallenge(lvl, "l3-table")?.locked === true);
const tableC = await levelTable(v3, [v1, v2, v3, v4]);
check("max 2 tables / hangouts a day count", (await pointsFor(v1, tableC)) === 0 && (await pointsFor(v1, tableB)) === 1);
lvl = await myLevel(v1);
check("but the check-in counts for the level 2 challenge", levelChallenge(lvl, "l2-checkin")?.done === true && lvl.points === 120);
await db.query(`insert into public.follows (follower_id, followee_id) values ($1, $2), ($2, $1)`, [v1, v5]);
await db.query(`delete from public.follows where follower_id = $1 and followee_id = $2`, [v5, v1]);
await db.query(`insert into public.follows (follower_id, followee_id) values ($1, $2)`, [v5, v1]);
r = await db.query(`select count(*)::int n from public.level_activity where user_id = $1 and kind = 'friend'`, [v1]);
check("a friend counts once, even after unfollow + follow", r.rows[0].n === 1);
lvl = await myLevel(v1);
check("making a friend finishes the friend challenge", levelChallenge(lvl, "l2-friend")?.done === true && lvl.points === 140);
const meetupEntry = lvl?.history.find((h) => h.source === "meetup" && h.ref === tableA);
check("points history shows the table", meetupEntry?.points === 20 && meetupEntry.meetup_kind === "table" && meetupEntry.place_name === "Check Cafe");
check("weekly chart: 8 weeks, this week has all the points", lvl?.weekly.length === 8 && lvl.weekly[7].points === 140);
const cancelledTable = (await tryQuery("authenticated", v4, `select public.create_meetup($1, now(), 6) as id`, [cafeId])).rows?.[0]?.id;
for (const who of [v1, v2, v3]) await tryQuery("authenticated", who, `select public.join_meetup($1)`, [cancelledTable]);
for (const who of [v4, v1, v2]) await tryQuery("authenticated", who, `select public.check_in($1, $2, $3)`, [cancelledTable, ...atCafe]);
await db.query(`update public.meetups set status = 'cancelled' where id = $1`, [cancelledTable]);
await db.query(`insert into public.meetup_checkins (meetup_id, user_id) values ($1, $2)`, [cancelledTable, v3]);
check("no points for a cancelled table", (await pointsFor(v4, cancelledTable)) === 0);
r = await tryQuery("authenticated", v1, `insert into public.level_points (user_id, source, ref, points) values ($1, 'challenge', 'free', 100)`, [v1]);
check("points can't be written directly", !!r.error);
r = await tryQuery("authenticated", v1, `select public.level_award($1, 'challenge', 'free', 100)`, [v1]);
check("points can't be given through the API", !!r.error);
r = await tryQuery("authenticated", v1, `select * from public.level_activity`);
check("activity isn't readable", !!r.error);
r = await tryQuery("authenticated", v2, `select ref from public.level_points where user_id = $1`, [v1]);
check("other people's points are private", !r.error && r.rows.length === 0);
r = await tryQuery("authenticated", v1, `update public.level_challenges set target = 1 where id = 'l3-feedback' returning id`);
check("only the founder changes challenges", !!r.error || r.rows.length === 0);

// Level 15: Plus (no ads, Plus features) and every travel deal.
await db.exec(`update public.app_settings set plus_locked = true`);
r = await tryQuery("authenticated", v5, `select public.my_plus() as p`);
check("below level 15: no Plus", r.rows?.[0]?.p?.member === false && r.rows[0].p.by_level === false && r.rows[0].p.level === 1);
await db.query(`insert into public.level_points (user_id, source, ref, points) select $1, 'challenge', 'test-' || g, 100 from generate_series(1, 14) g`, [v5]);
r = await tryQuery("authenticated", v5, `select public.my_plus() as p`);
check("level 15 = Plus", r.rows?.[0]?.p?.member === true && r.rows[0].p.unlocked === true && r.rows[0].p.by_level === true && r.rows[0].p.level === 15);
r = await tryQuery("authenticated", v5, `select count(*)::int n from public.list_gems()`);
check("level 15 opens the Plus features", r.rows?.[0]?.n > 100);
r = await tryQuery("authenticated", v1, `select count(*)::int n from public.list_gems()`);
check("level 2 doesn't", r.rows?.[0]?.n === 0);
await db.exec(`update public.app_settings set plus_locked = false`);
r = await tryQuery("authenticated", admin, `insert into public.travel_deals (brand, category, title_en, title_th, code, scope) values ('Klook', 'activity', '10% off', 'ลด 10%', 'LEVEL15', 'world') returning id`);
const levelDealId = r.rows?.[0]?.id;
r = await tryQuery("authenticated", v5, `select id, code from public.level_deals()`);
check("level 15 sees the travel deals", r.rows?.some((d) => d.id === levelDealId && d.code === "LEVEL15"));
r = await tryQuery("authenticated", v1, `select id from public.level_deals()`);
check("lower levels don't", !r.error && r.rows.length === 0);
r = await tryQuery("authenticated", v5, `select public.report_travel_deal($1)`, [levelDealId]);
check("level 15 can report a deal that didn't work", !r.error);
r = await tryQuery("authenticated", v5, `select id from public.level_deals() where id = $1`, [levelDealId]);
check("and it's hidden for them", !r.error && r.rows.length === 0);
r = await tryQuery("authenticated", v3, `select public.report_travel_deal($1)`, [levelDealId]);
check("people without a reward or level 15 can't report", /not_allowed/.test(r.error ?? ""));

console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
