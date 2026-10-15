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

// --- Tables at Google places
const fn = `select public.create_meetup_at_place($1, $2, $3, $4, $5, 4) as id`;
r = await tryQuery("authenticated", user, fn, ["ChIJgoogle1", "Somtam Der", 13.7290, 100.5340, inHours(2)]);
check("table at any Google place", !r.error);
const placeMeetupId = r.rows?.[0]?.id;
r = await tryQuery("authenticated", user, `select venue_id, place_name from public.list_open_meetups() where id = $1`, [placeMeetupId]);
check("Google-place table listed with its name", r.rows?.[0]?.venue_id === null && r.rows?.[0]?.place_name === "Somtam Der");
r = await tryQuery("authenticated", guests[1], `select public.join_meetup($1)`, [placeMeetupId]);
check("people can join a Google-place table", !r.error);
r = await tryQuery("authenticated", user, fn, ["ChIJgoogle2", "Far away", 48.85, 2.35, inHours(2)]);
check("place outside Thailand rejected", /venue_unavailable/.test(r.error ?? ""));
r = await tryQuery("authenticated", user, fn, ["ChIJchiangmai", "Chiang Mai cafe", 18.79, 98.98, inHours(2)]);
check("place in Thailand but outside Bangkok rejected", /venue_unavailable/.test(r.error ?? ""));
r = await tryQuery("authenticated", user, fn, ["", "No id", 13.7, 100.5, inHours(2)]);
check("place without id rejected", /venue_unavailable/.test(r.error ?? ""));
await tryQuery("authenticated", admin, `update public.venues set google_place_id = 'ChIJskybar' where id = $1`, [venueId]);
r = await tryQuery("authenticated", user, fn, ["ChIJskybar", "Sky Bar (Google name)", 13.75, 100.49, inHours(4)]);
const linkedId = r.rows?.[0]?.id;
r = await tryQuery("authenticated", user, `select venue_id, place_name from public.meetups where id = $1`, [linkedId]);
check("Google place linked to a partner venue becomes a venue table", r.rows?.[0]?.venue_id === venueId && r.rows?.[0]?.place_name === null);
r = await tryQuery("authenticated", unverified, fn, ["ChIJgoogle3", "Cafe", 13.7, 100.5, inHours(2)]);
check("unverified user can't create at a Google place", /not_allowed/.test(r.error ?? ""));
r = await tryQuery("authenticated", user, `insert into public.meetups (google_place_id, place_name, place_lat, place_lng, host_id, starts_at, ends_at, max_people) values ('x', 'x', 13.7, 100.5, $1, now(), now() + interval '1 hour', 3)`, [user]);
check("direct insert of a Google-place table blocked", !!r.error);

await tryQuery("authenticated", admin, `update public.venues set is_active = false where id = $1`, [venueId]);
r = await tryQuery("authenticated", user, `select public.create_meetup($1, $2, 3)`, [venueId, inHours(2)]);
check("can't create a table at a hidden venue", /venue_unavailable/.test(r.error ?? ""));
r = await tryQuery("authenticated", user, `select count(*)::int n from public.list_open_meetups()`);
check("tables at hidden venues aren't listed; Google-place tables still are", r.rows?.[0]?.n === 1);
r = await tryQuery("anon", null, `select count(*)::int n from public.meetups`);
check("signed-out visitors can't read tables", !r.error && r.rows[0].n === 0);

// --- Deleting a venue cascades
await tryQuery("authenticated", admin, `delete from public.venues where id = $1`, [venueId]);
r = await tryQuery("service_role", null, `select (select count(*) from public.deals)::int d, (select count(*) from public.deal_coupons)::int c, (select count(*) from public.venue_accounts)::int a, (select count(*) from public.venue_account_secrets)::int s, (select count(*) from public.meetups where venue_id is not null)::int m, (select count(*) from public.meetup_members mm join public.meetups m on m.id = mm.meetup_id where m.venue_id is not null)::int mm`);
const c = r.rows?.[0];
check("deleting venue removes deal, coupon, logins, tables", c && c.d + c.c + c.a + c.s + c.m + c.mm === 0);

console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
