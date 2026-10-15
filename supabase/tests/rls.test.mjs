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
  create table auth.users (id uuid primary key default gen_random_uuid(), email text);
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
await db.exec(`insert into auth.users (id, email) values ('${admin}', 'founder@x.com'), ('${user}', 'user@x.com');
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
  `select public.admin_save_deal($1, null, '15% off', 'ลด 15%', '', '', 'percent', 15, 'TM15', true) as id`, [venueId]);
check("admin can save deal", !r.error);
const dealId = r.rows?.[0]?.id;
r = await tryQuery("authenticated", admin,
  `select public.admin_save_deal($1, $2, '20% off', 'ลด 20%', '', '', 'percent', 20, 'TM20', true) as id`, [venueId, dealId]);
check("admin can update deal", r.rows?.[0]?.id === dealId);
r = await tryQuery("authenticated", admin, `select coupon_code from public.deal_coupons where deal_id = $1`, [dealId]);
check("coupon code updated", r.rows?.[0]?.coupon_code === "TM20");
r = await tryQuery("authenticated", admin,
  `select public.admin_save_deal($1, null, 'x', 'x', '', '', 'percent', 150, 'X', true)`, [venueId]);
check("percent over 100 rejected", !!r.error);
r = await tryQuery("authenticated", admin,
  `select public.admin_save_deal($1, null, 'Free drink', 'ฟรี', '', '', 'other', null, 'FREE', true)`, [venueId]);
check("second active deal for same venue rejected", !!r.error);

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
check("app user sees active deal", r.rows?.length === 1);
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
r = await tryQuery("authenticated", user, `select public.admin_save_deal($1, $2, 'x', 'x', '', '', 'percent', 99, 'X', true)`, [venueId, dealId]);
check("app user can't edit deals", !!r.error);
r = await tryQuery("authenticated", user, `update public.venues set name_en = 'hacked' where id = $1 returning id`, [venueId]);
check("app user can't update venues", !r.error && r.rows.length === 0);
r = await tryQuery("authenticated", user, `select public.is_admin() as a`);
check("is_admin false for app user", r.rows?.[0]?.a === false);

// --- Deleting a venue cascades
await tryQuery("authenticated", admin, `delete from public.venues where id = $1`, [venueId]);
r = await tryQuery("service_role", null, `select (select count(*) from public.deals)::int d, (select count(*) from public.deal_coupons)::int c, (select count(*) from public.venue_accounts)::int a, (select count(*) from public.venue_account_secrets)::int s`);
const c = r.rows?.[0];
check("deleting venue removes deal, coupon, logins", c && c.d + c.c + c.a + c.s === 0);

console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
