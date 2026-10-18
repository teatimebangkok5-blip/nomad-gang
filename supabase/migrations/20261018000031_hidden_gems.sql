-- Hidden Gems: a curated map of Bangkok places tourists often miss (the founder's list of 32, in four areas), with
-- category, price, opening info, a local tip and a suggested TableMeet activity, in English and Thai.
--
-- * gems: published ones are readable by everyone signed in; the founder edits them in the admin panel. Gems that
--   match an OpenStreetMap place are linked to it (place_id; its Wikimedia photo is used). Four whose exact spot
--   isn't confirmed start unpublished (check_note says what to check).
-- * gem_saves: my saved gems (private). gem_votes: "useful" (one per person per gem; totals are public).
-- * gem_suggestions: anyone signed in can suggest a place (with an optional photo in the public "gem-photos" bucket,
--   own folder only); the founder accepts one into an unpublished gem, then edits and publishes it.
-- * list_gems(): published gems with useful / saved / visited flags. Visited = a verified meetup of mine (Rewards
--   Passport, counted) within 150 m of the gem.

create table public.gems (
  id uuid primary key default gen_random_uuid(),
  number integer,
  area_en text not null check (length(trim(area_en)) between 1 and 60),
  area_th text not null check (length(trim(area_th)) between 1 and 60),
  category text not null check (category in ('food', 'cafes', 'culture', 'markets', 'nightlife', 'outdoor', 'group')),
  name_en text not null check (length(trim(name_en)) between 1 and 120),
  name_th text not null check (length(trim(name_th)) between 1 and 120),
  subtitle_en text not null default '' check (length(subtitle_en) <= 80),
  subtitle_th text not null default '' check (length(subtitle_th) <= 80),
  description_en text not null default '' check (length(description_en) <= 600),
  description_th text not null default '' check (length(description_th) <= 600),
  budget_en text not null default '' check (length(budget_en) <= 160),
  budget_th text not null default '' check (length(budget_th) <= 160),
  -- Starting spend per person in baht (0 = free), for the budget filter.
  min_spend integer not null default 0 check (min_spend between 0 and 100000),
  hours_en text not null default '' check (length(hours_en) <= 200),
  hours_th text not null default '' check (length(hours_th) <= 200),
  tip_en text not null default '' check (length(tip_en) <= 400),
  tip_th text not null default '' check (length(tip_th) <= 400),
  activity_en text not null default '' check (length(activity_en) <= 80),
  activity_th text not null default '' check (length(activity_th) <= 80),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  place_id uuid references public.places (id) on delete set null,
  -- Uploaded photo (public "gem-photos" bucket), else the linked place's Wikimedia photo.
  photo_path text check (photo_path is null or length(photo_path) <= 300),
  -- Suggested by a user (credited on the gem); Local Pick = recommended by a verified local.
  contributor_id uuid references public.profiles (id) on delete set null,
  local_pick boolean not null default false,
  is_published boolean not null default false,
  -- For the founder: what to check before publishing.
  check_note text check (check_note is null or length(check_note) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger gems_set_updated_at
before update on public.gems
for each row execute function public.set_updated_at();

alter table public.gems enable row level security;

create policy "Signed-in users read published gems; admins read all"
on public.gems for select
to authenticated
using (is_published or (select public.is_admin()));

create policy "Admins manage gems"
on public.gems for all
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create table public.gem_saves (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  gem_id uuid not null references public.gems (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, gem_id)
);

alter table public.gem_saves enable row level security;
revoke update on public.gem_saves from anon, authenticated;

create policy "People read their saved gems" on public.gem_saves for select to authenticated
using (user_id = (select auth.uid()));
create policy "People save gems" on public.gem_saves for insert to authenticated
with check (user_id = (select auth.uid()));
create policy "People unsave gems" on public.gem_saves for delete to authenticated
using (user_id = (select auth.uid()));

create table public.gem_votes (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  gem_id uuid not null references public.gems (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, gem_id)
);

alter table public.gem_votes enable row level security;
revoke update on public.gem_votes from anon, authenticated;

create policy "People read their own votes" on public.gem_votes for select to authenticated
using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy "People mark gems useful" on public.gem_votes for insert to authenticated
with check (user_id = (select auth.uid()));
create policy "People take back their vote" on public.gem_votes for delete to authenticated
using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Suggestions from users
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gem-photos', 'gem-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "People list their own gem photos"
on storage.objects for select
to authenticated
using (bucket_id = 'gem-photos' and (split_part(name, '/', 1) = (select auth.uid())::text or (select public.is_admin())));

create policy "People upload gem photos to their own folder"
on storage.objects for insert
to authenticated
with check (bucket_id = 'gem-photos' and (split_part(name, '/', 1) = (select auth.uid())::text or (select public.is_admin())));

create policy "People delete their own gem photos"
on storage.objects for delete
to authenticated
using (bucket_id = 'gem-photos' and (split_part(name, '/', 1) = (select auth.uid())::text or (select public.is_admin())));

create table public.gem_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  category text not null check (category in ('food', 'cafes', 'culture', 'markets', 'nightlife', 'outdoor', 'group')),
  description text not null default '' check (length(description) <= 600),
  tip text not null default '' check (length(tip) <= 400),
  price text not null default '' check (length(price) <= 160),
  lat double precision not null check (lat between 13.45 and 14.10),
  lng double precision not null check (lng between 100.25 and 100.95),
  photo_path text check (photo_path is null or length(photo_path) <= 300),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  gem_id uuid references public.gems (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.gem_suggestions enable row level security;

create policy "People see their suggestions; admins see all"
on public.gem_suggestions for select
to authenticated
using (user_id = (select auth.uid()) or (select public.is_admin()));

create policy "Admins update suggestions"
on public.gem_suggestions for update
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

-- Suggest a Bangkok place. Max 5 waiting per person. Errors: auth_required, invalid_suggestion, outside_bangkok,
-- invalid_photo, too_many_suggestions.
create function public.suggest_gem(
  p_name text,
  p_category text,
  p_description text,
  p_tip text,
  p_price text,
  p_lat double precision,
  p_lng double precision,
  p_photo_path text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_name, ''))) = 0 or length(p_name) > 120
     or p_category not in ('food', 'cafes', 'culture', 'markets', 'nightlife', 'outdoor', 'group')
     or length(coalesce(p_description, '')) > 600 or length(coalesce(p_tip, '')) > 400
     or length(coalesce(p_price, '')) > 160 then
    raise exception 'invalid_suggestion';
  end if;
  if p_lat is null or p_lng is null or p_lat not between 13.45 and 14.10 or p_lng not between 100.25 and 100.95 then
    raise exception 'outside_bangkok';
  end if;
  if p_photo_path is not null and split_part(p_photo_path, '/', 1) <> v_uid::text then
    raise exception 'invalid_photo';
  end if;
  if (select count(*) from public.gem_suggestions s where s.user_id = v_uid and s.status = 'pending') >= 5 then
    raise exception 'too_many_suggestions';
  end if;
  insert into public.gem_suggestions (user_id, name, category, description, tip, price, lat, lng, photo_path)
  values (v_uid, trim(p_name), p_category, trim(coalesce(p_description, '')), trim(coalesce(p_tip, '')),
          trim(coalesce(p_price, '')), p_lat, p_lng, p_photo_path)
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.suggest_gem(text, text, text, text, text, double precision, double precision, text) from public, anon;
grant execute on function public.suggest_gem(text, text, text, text, text, double precision, double precision, text) to authenticated;

-- Founder: turn a suggestion into an unpublished gem (texts copied to both languages for editing). Returns its id.
create function public.admin_accept_gem_suggestion(p_suggestion_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_suggestion public.gem_suggestions%rowtype;
  v_area record;
  v_gem uuid;
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into v_suggestion from public.gem_suggestions s where s.id = p_suggestion_id and s.status = 'pending' for update;
  if not found then
    raise exception 'not_pending';
  end if;
  select * into v_area from public.area_near(v_suggestion.lat, v_suggestion.lng);
  insert into public.gems (
    area_en, area_th, category, name_en, name_th, description_en, description_th, budget_en, budget_th,
    tip_en, tip_th, lat, lng, photo_path, contributor_id, is_published, check_note
  ) values (
    coalesce(v_area.name_en, v_area.name, 'Bangkok'), coalesce(v_area.name_th, v_area.name, 'กรุงเทพฯ'),
    v_suggestion.category, v_suggestion.name, v_suggestion.name, v_suggestion.description, v_suggestion.description,
    v_suggestion.price, v_suggestion.price, v_suggestion.tip, v_suggestion.tip, v_suggestion.lat, v_suggestion.lng,
    v_suggestion.photo_path, v_suggestion.user_id, false, 'Suggested by a user: translate, check and publish.'
  )
  returning id into v_gem;
  update public.gem_suggestions s set status = 'accepted', gem_id = v_gem where s.id = p_suggestion_id;
  return v_gem;
end;
$$;

revoke execute on function public.admin_accept_gem_suggestion(uuid) from public, anon;
grant execute on function public.admin_accept_gem_suggestion(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- The app's list
-- ---------------------------------------------------------------------------

create function public.list_gems()
returns table (
  id uuid,
  number integer,
  area_en text,
  area_th text,
  category text,
  name_en text,
  name_th text,
  subtitle_en text,
  subtitle_th text,
  description_en text,
  description_th text,
  budget_en text,
  budget_th text,
  min_spend integer,
  hours_en text,
  hours_th text,
  tip_en text,
  tip_th text,
  activity_en text,
  activity_th text,
  lat double precision,
  lng double precision,
  place_id uuid,
  photo_path text,
  image_url text,
  image_credit text,
  local_pick boolean,
  contributor_id uuid,
  contributor_name text,
  useful integer,
  i_found_useful boolean,
  saved boolean,
  visited boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with visits as (
    select e.lat, e.lng from public.passport_entries((select auth.uid())) e where e.counted and e.lat is not null
  )
  select
    g.id, g.number, g.area_en, g.area_th, g.category, g.name_en, g.name_th, g.subtitle_en, g.subtitle_th,
    g.description_en, g.description_th, g.budget_en, g.budget_th, g.min_spend, g.hours_en, g.hours_th,
    g.tip_en, g.tip_th, g.activity_en, g.activity_th, g.lat, g.lng, g.place_id, g.photo_path,
    p.image_url, p.image_credit, g.local_pick, g.contributor_id, pr.display_name,
    (select count(*)::integer from public.gem_votes v where v.gem_id = g.id),
    exists (select 1 from public.gem_votes v where v.gem_id = g.id and v.user_id = (select auth.uid())),
    exists (select 1 from public.gem_saves s where s.gem_id = g.id and s.user_id = (select auth.uid())),
    exists (
      select 1 from visits v
      where extensions.st_dwithin(
        extensions.st_setsrid(extensions.st_makepoint(g.lng, g.lat), 4326)::extensions.geography,
        extensions.st_setsrid(extensions.st_makepoint(v.lng, v.lat), 4326)::extensions.geography,
        150
      )
    )
  from public.gems g
  left join public.places p on p.id = g.place_id
  left join public.profiles pr on pr.id = g.contributor_id
  where g.is_published and (select auth.uid()) is not null
  order by g.number nulls last, g.created_at;
$$;

revoke execute on function public.list_gems() from public, anon;
grant execute on function public.list_gems() to authenticated;

-- ---------------------------------------------------------------------------
-- The founder's first 32 gems
-- ---------------------------------------------------------------------------

with seed (
  number, area_en, area_th, category, name_en, name_th, subtitle_en, subtitle_th, description_en, description_th,
  budget_en, budget_th, min_spend, hours_en, hours_th, tip_en, tip_th, activity_en, activity_th,
  osm_type, osm_id, lat, lng, published, check_note
) as (values
(1, 'Yaowarat & Chinatown', 'เยาวราชและไชน่าทาวน์', 'culture', 'Song Wat Road', 'ถนนทรงวาด', 'Heritage & cafés', 'มรดกเก่าและคาเฟ่',
 'Explore old trading shophouses, murals, specialty coffee and small shops.', 'เดินชมตึกแถวการค้าเก่า ภาพวาดฝาผนัง กาแฟพิเศษ และร้านเล็กๆ',
 '฿50–300 per person', '฿50–300 ต่อคน', 50,
 'Street open all day; shops vary. Best: morning to late afternoon.', 'ถนนเปิดตลอดวัน ร้านค้าเวลาต่างกัน ช่วงที่ดีที่สุด: เช้าถึงบ่ายแก่',
 'Walk into the smaller lanes respectfully and look for older warehouse details.', 'เดินเข้าซอยเล็กอย่างสุภาพ แล้วสังเกตรายละเอียดของโกดังเก่า',
 'Chinatown photo walk + coffee', 'เดินถ่ายรูปไชน่าทาวน์ + กาแฟ', null, null, 13.7380887, 100.5076110, true, null),
(2, 'Yaowarat & Chinatown', 'เยาวราชและไชน่าทาวน์', 'culture', 'Talat Noi', 'ตลาดน้อย', 'Street art & culture', 'สตรีทอาร์ตและวัฒนธรรม',
 'Discover old Chinese-Thai streets, workshops, murals and hidden cafés.', 'ค้นพบถนนจีน-ไทยเก่า โรงงานเล็ก ภาพวาดฝาผนัง และคาเฟ่ลับ',
 'Free walk; ฿80–300 with café stops', 'เดินฟรี ฿80–300 หากแวะคาเฟ่', 80,
 'Outdoor lanes open all day; visit 8 AM–5 PM.', 'ซอยกลางแจ้งเปิดตลอดวัน แนะนำ 8:00–17:00 น.',
 'Go in the morning or late afternoon to avoid the strongest heat.', 'ไปช่วงเช้าหรือบ่ายแก่เพื่อหลบแดดจัด',
 'Street-art photo hunt', 'ล่าภาพสตรีทอาร์ต', 'relation', 17609885, null, null, true, null),
(3, 'Yaowarat & Chinatown', 'เยาวราชและไชน่าทาวน์', 'culture', 'Wat Mangkon Kamalawat', 'วัดมังกรกมลาวาส', 'Culture', 'วัฒนธรรม',
 'Visit one of Bangkok''s best-known Chinese Buddhist temples.', 'ชมวัดพุทธจีนที่มีชื่อเสียงที่สุดแห่งหนึ่งของกรุงเทพฯ',
 'Free entry; donations optional', 'เข้าฟรี ทำบุญตามศรัทธา', 0,
 'About 8 AM–4:30 PM; some days vary.', 'ประมาณ 8:00–16:30 น. บางวันอาจต่างไป',
 'Cover shoulders and knees, and follow photography restrictions.', 'แต่งกายปิดไหล่และเข่า และทำตามข้อห้ามการถ่ายรูป',
 'Chinese-Thai heritage walk', 'เดินชมมรดกจีน-ไทย', 'way', 301157259, null, null, true, null),
(4, 'Yaowarat & Chinatown', 'เยาวราชและไชน่าทาวน์', 'food', 'Nai Ek Roll Noodle', 'ก๋วยจั๊บนายเอ็ก', 'Local food', 'อาหารท้องถิ่น',
 'Try the signature peppery rolled-rice-noodle soup.', 'ลองก๋วยจั๊บน้ำใสพริกไทยต้นตำรับ',
 '฿50–150 per person', '฿50–150 ต่อคน', 50,
 'About 7:30 AM–12:30 AM; check before visiting.', 'ประมาณ 7:30–00:30 น. ตรวจสอบก่อนไป',
 'Confirm pork ingredients and alternatives before ordering.', 'สอบถามส่วนผสมหมูและตัวเลือกอื่นก่อนสั่ง',
 'Chinatown noodle challenge', 'ชาเลนจ์ก๋วยเตี๋ยวไชน่าทาวน์', 'node', 4459548647, null, null, true, null),
(5, 'Yaowarat & Chinatown', 'เยาวราชและไชน่าทาวน์', 'markets', 'Sampeng Lane Market', 'ตลาดสำเพ็ง', 'Shopping & street life', 'ช้อปปิ้งและชีวิตริมถนน',
 'Browse narrow wholesale lanes filled with accessories, fabrics and small goods.', 'เดินชมซอยค้าส่งแคบๆ ที่เต็มไปด้วยเครื่องประดับ ผ้า และของจุกจิก',
 'Free entry; ฿50–300 shopping budget', 'เข้าฟรี งบช้อป ฿50–300', 50,
 'Busiest in the morning through the afternoon.', 'คึกคักที่สุดช่วงเช้าถึงบ่าย',
 'Visit early, carry small cash and keep valuables secure.', 'ไปแต่เช้า พกเงินสดย่อย และระวังของมีค่า',
 '฿200 market-shopping challenge', 'ชาเลนจ์ช้อปตลาด 200 บาท', 'relation', 20440796, null, null, true, null),
(6, 'Yaowarat & Chinatown', 'เยาวราชและไชน่าทาวน์', 'culture', 'Wat Traimit (Golden Buddha)', 'วัดไตรมิตรวิทยาราม (พระพุทธรูปทองคำ)', 'Culture & architecture', 'วัฒนธรรมและสถาปัตยกรรม',
 'See the famous solid-gold Buddha near Chinatown''s entrance.', 'ชมพระพุทธรูปทองคำอันโด่งดังใกล้ทางเข้าเยาวราช',
 'About ฿40 for the Buddha; the museum may cost extra', 'ประมาณ ฿40 สำหรับชมพระพุทธรูป พิพิธภัณฑ์อาจมีค่าเข้าเพิ่ม', 40,
 'About 8 AM–5 PM; confirm ticket access.', 'ประมาณ 8:00–17:00 น. ตรวจสอบการซื้อบัตร',
 'Combine it with a daytime Chinatown walk before the evening food crowds.', 'ไปพร้อมเดินเที่ยวเยาวราชช่วงกลางวัน ก่อนคนจะมาเยอะตอนเย็น',
 'Heritage walk and local lunch', 'เดินชมมรดกและมื้อกลางวันท้องถิ่น', 'way', 241879483, null, null, true, null),
(7, 'Yaowarat & Chinatown', 'เยาวราชและไชน่าทาวน์', 'nightlife', 'Soi Nana, Chinatown', 'ซอยนานา เยาวราช', 'Creative nightlife', 'ไนต์ไลฟ์สร้างสรรค์',
 'Explore creative bars, independent spaces and converted shophouses.', 'สำรวจบาร์สร้างสรรค์ พื้นที่อิสระ และตึกแถวที่ปรับปรุงใหม่',
 'Free to walk; about ฿150–500 at venues', 'เดินฟรี ประมาณ ฿150–500 ที่ร้าน', 150,
 'Best from late afternoon into the evening; venues vary.', 'ดีที่สุดช่วงบ่ายแก่ถึงค่ำ ร้านเปิดเวลาต่างกัน',
 'Check each venue''s hours and minimum spend before joining a group.', 'ตรวจสอบเวลาเปิดและยอดขั้นต่ำของแต่ละร้านก่อนไปเป็นกลุ่ม',
 'Small-group evening discovery', 'สำรวจยามเย็นกลุ่มเล็ก', null, null, 13.7397, 100.5141, false,
 'Pin is approximate: set the exact start of Soi Nana (off Maitri Chit Rd) before publishing.'),
(8, 'Yaowarat & Chinatown', 'เยาวราชและไชน่าทาวน์', 'markets', 'Pak Khlong Talat Flower Market', 'ปากคลองตลาด', 'Markets & photography', 'ตลาดและการถ่ายภาพ',
 'See flower vendors preparing garlands and colourful arrangements.', 'ชมแม่ค้าดอกไม้ร้อยพวงมาลัยและจัดดอกไม้หลากสี',
 'Free entry; ฿50–200 for flowers or snacks', 'เข้าฟรี ฿50–200 สำหรับดอกไม้หรือขนม', 50,
 'Open around the clock; activity varies by time.', 'เปิดตลอด 24 ชั่วโมง บรรยากาศต่างกันตามเวลา',
 'Try a late-evening or early-morning visit for a different atmosphere.', 'ลองไปช่วงดึกหรือเช้ามืดเพื่อบรรยากาศที่ต่างออกไป',
 'Flower photography and Thai dessert walk', 'ถ่ายรูปดอกไม้และเดินกินขนมไทย', 'way', 1423814928, null, null, true, null),
(9, 'Ari', 'อารีย์', 'cafes', 'NANA Coffee Roasters Ari', 'NANA Coffee Roasters อารีย์', 'Coffee', 'กาแฟ',
 'A specialty coffee destination with a garden-like setting.', 'ร้านกาแฟพิเศษบรรยากาศเหมือนอยู่ในสวน',
 '฿100–300 per person', '฿100–300 ต่อคน', 100,
 'Roughly 7 AM–6 PM weekdays, 8 AM–6 PM weekends.', 'ประมาณ 7:00–18:00 น. วันธรรมดา 8:00–18:00 น. วันหยุด',
 'Go early for a relaxed coffee meetup.', 'ไปแต่เช้าเพื่อนัดดื่มกาแฟแบบสบายๆ',
 'Coffee tasting with new travellers', 'ชิมกาแฟกับนักเดินทางใหม่', 'node', 13235748218, null, null, true, null),
(10, 'Ari', 'อารีย์', 'food', 'Ongtong Khaosoi', 'อองตองข้าวซอย', 'Thai food', 'อาหารไทย',
 'Try Northern Thai curry noodles near BTS Ari.', 'ลองข้าวซอยอาหารเหนือใกล้ BTS อารีย์',
 '฿100–250 per person', '฿100–250 ต่อคน', 100,
 'About 9 AM–8:30 PM.', 'ประมาณ 9:00–20:30 น.',
 'Go outside the lunch rush if your group wants to sit together.', 'เลี่ยงช่วงพักเที่ยงหากกลุ่มอยากนั่งด้วยกัน',
 'Northern Thai food tasting', 'ชิมอาหารเหนือ', 'node', 9759642618, null, null, true, null),
(11, 'Ari', 'อารีย์', 'cafes', 'Soi Ari café lanes', 'ซอยคาเฟ่อารีย์', 'Neighbourhood discovery', 'สำรวจย่าน',
 'Wander the leafy lanes and discover independent cafés and small eateries.', 'เดินเล่นในซอยร่มรื่น ค้นพบคาเฟ่อิสระและร้านอาหารเล็กๆ',
 '฿50–250 per person', '฿50–250 ต่อคน', 50,
 'Daytime; each business has its own hours.', 'ช่วงกลางวัน แต่ละร้านเปิดเวลาต่างกัน',
 'Save a few nearby stops instead of planning a long route in the heat.', 'เลือกแวะไม่กี่ร้านที่อยู่ใกล้กัน แทนการเดินไกลกลางแดด',
 'Pick-your-own café crawl', 'ตะลุยคาเฟ่ตามใจ', null, null, 13.7804591, 100.5409757, true, null),
(12, 'Ari', 'อารีย์', 'cafes', 'Yellow Lane', 'Yellow Lane', 'Garden café', 'คาเฟ่ในสวน',
 'A relaxed garden-style café and brunch stop in the Ari area.', 'คาเฟ่และร้านบรันช์สไตล์สวนบรรยากาศสบายในย่านอารีย์',
 '฿150–400 per person', '฿150–400 ต่อคน', 150,
 'Check the current opening hours before going.', 'ตรวจสอบเวลาเปิดล่าสุดก่อนไป',
 'Check whether its weekend market or special events are on before going.', 'ตรวจสอบว่ามีตลาดนัดสุดสัปดาห์หรืออีเวนต์พิเศษหรือไม่ก่อนไป',
 'Weekend brunch meetup', 'นัดบรันช์วันหยุด', 'node', 9951920417, null, null, true, null),
(13, 'Ari', 'อารีย์', 'group', 'La Villa Ari', 'ลา วิลล่า อารีย์', 'Social meeting point', 'จุดนัดพบ',
 'A community mall beside BTS Ari with cafés, shops and restaurants.', 'คอมมูนิตี้มอลล์ข้าง BTS อารีย์ มีคาเฟ่ ร้านค้า และร้านอาหาร',
 'Free entry; ฿100–350 for food or drinks', 'เข้าฟรี ฿100–350 สำหรับอาหารหรือเครื่องดื่ม', 100,
 'Mall hours; shops vary.', 'ตามเวลาห้าง ร้านเปิดเวลาต่างกัน',
 'Use it as a meetup landmark before exploring the surrounding lanes.', 'ใช้เป็นจุดนัดพบก่อนออกเดินสำรวจซอยรอบๆ',
 'Choose-a-cuisine group lunch', 'มื้อกลางวันกลุ่ม เลือกอาหารที่ชอบ', 'way', 164625405, null, null, true, null),
(14, 'Ari', 'อารีย์', 'food', 'Guss Damn Good', 'กัสส์แดมน์กู้ด', 'Dessert', 'ของหวาน',
 'Try inventive ice cream flavours in a casual dessert stop.', 'ลองไอศกรีมรสแปลกใหม่ในร้านของหวานสบายๆ',
 '฿100–200 per person', '฿100–200 ต่อคน', 100,
 'Check the nearest outlet''s hours.', 'ตรวจสอบเวลาเปิดของสาขาที่ใกล้ที่สุด',
 'Confirm the nearest outlet before going.', 'ตรวจสอบสาขาที่ใกล้ที่สุดก่อนไป',
 'Dessert tasting challenge', 'ชาเลนจ์ชิมของหวาน', null, null, 13.7800, 100.5440, false,
 'No Ari outlet in OpenStreetMap: set the pin to the right outlet before publishing.'),
(15, 'Ari', 'อารีย์', 'food', 'Thanee Crispy Pork', 'ธานี หมูกรอบ', 'Local food', 'อาหารท้องถิ่น',
 'A starting point for Ari''s traditional, affordable shophouse food.', 'จุดเริ่มต้นสำรวจอาหารร้านห้องแถวราคาประหยัดแบบดั้งเดิมของอารีย์',
 '฿50–120 per person', '฿50–120 ต่อคน', 50,
 'Daytime; check the current schedule.', 'ช่วงกลางวัน ตรวจสอบเวลาล่าสุด',
 'Confirm the exact current location with the shop before going.', 'ยืนยันตำแหน่งร้านล่าสุดก่อนไป',
 'Local lunch under ฿150', 'มื้อกลางวันท้องถิ่นไม่เกิน 150 บาท', 'way', 1427703273, null, null, true, null),
(16, 'Ari', 'อารีย์', 'group', 'FEAST Ratchakru', 'FEAST ราชครู', 'Group dining', 'กินเป็นกลุ่ม',
 'A casual multi-vendor dining spot that suits groups with different tastes.', 'พื้นที่กินสบายๆ หลายร้านในที่เดียว เหมาะกับกลุ่มที่ชอบต่างกัน',
 '฿100–350 per person', '฿100–350 ต่อคน', 100,
 'Vendor schedules vary.', 'แต่ละร้านเปิดเวลาต่างกัน',
 'Check which vendors are open and the seating before bringing a big group.', 'ตรวจสอบร้านที่เปิดและที่นั่งก่อนพากลุ่มใหญ่ไป',
 'Group food court meetup', 'นัดกินฟู้ดคอร์ทเป็นกลุ่ม', 'way', 1427711804, null, null, true, null),
(17, 'Khao San & Banglamphu', 'ข้าวสารและบางลำพู', 'cafes', 'Phra Athit Road', 'ถนนพระอาทิตย์', 'Riverside discovery', 'สำรวจริมน้ำ',
 'Riverside cafés, historic buildings and a more relaxed side of the Old Town.', 'คาเฟ่ริมน้ำ อาคารเก่า และอีกมุมที่ผ่อนคลายของเมืองเก่า',
 'Free walk; ฿100–350 at cafés', 'เดินฟรี ฿100–350 ที่คาเฟ่', 100,
 'Best in the late afternoon.', 'ดีที่สุดช่วงบ่ายแก่',
 'Meet near a clear landmark rather than in a narrow lane.', 'นัดเจอที่จุดสังเกตชัดเจน แทนในซอยแคบ',
 'Riverside café and conversation walk', 'เดินคุยและแวะคาเฟ่ริมน้ำ', null, null, 13.7626957, 100.4948366, true, null),
(18, 'Khao San & Banglamphu', 'ข้าวสารและบางลำพู', 'culture', 'Phra Sumen Fort & Santichaiprakarn Park', 'ป้อมพระสุเมรุและสวนสันติชัยปราการ', 'History & green space', 'ประวัติศาสตร์และพื้นที่สีเขียว',
 'Visit the historic fort and the riverside park.', 'ชมป้อมประวัติศาสตร์และสวนริมแม่น้ำ',
 'Free', 'ฟรี', 0,
 'Park open daytime to evening.', 'สวนเปิดกลางวันถึงค่ำ',
 'Go in the late afternoon and keep group activities clear of public paths.', 'ไปช่วงบ่ายแก่ และทำกิจกรรมกลุ่มโดยไม่กีดขวางทางเดิน',
 'Sunset photo walk', 'เดินถ่ายรูปพระอาทิตย์ตก', 'way', 107936513, null, null, true, null),
(19, 'Khao San & Banglamphu', 'ข้าวสารและบางลำพู', 'culture', 'Wat Bowonniwet Vihara', 'วัดบวรนิเวศวิหาร', 'Culture', 'วัฒนธรรม',
 'An important Buddhist temple in Banglamphu.', 'วัดพุทธที่สำคัญในย่านบางลำพู',
 'Usually free entry; donations optional', 'ปกติเข้าฟรี ทำบุญตามศรัทธา', 0,
 'Check access rules for worship areas.', 'ตรวจสอบกฎการเข้าพื้นที่ประกอบพิธี',
 'Dress respectfully and follow the rules for worship areas.', 'แต่งกายสุภาพและทำตามกฎในพื้นที่ประกอบพิธี',
 'Old Town temple walk', 'เดินชมวัดในเมืองเก่า', 'way', 233810865, null, null, true, null),
(20, 'Khao San & Banglamphu', 'ข้าวสารและบางลำพู', 'culture', 'Pipit Banglamphu Museum', 'พิพิธบางลำพู', 'Local history', 'ประวัติศาสตร์ท้องถิ่น',
 'Learn about Banglamphu''s history, trades and local life.', 'เรียนรู้ประวัติศาสตร์ อาชีพ และวิถีชีวิตของชาวบางลำพู',
 'Allow ฿50–200 until admission is confirmed', 'เผื่อ ฿50–200 จนกว่าจะยืนยันค่าเข้า', 50,
 'Confirm opening days and admission before going.', 'ตรวจสอบวันเปิดและค่าเข้าก่อนไป',
 'Confirm opening days and admission with the museum before planning a visit.', 'ตรวจสอบวันเปิดและค่าเข้ากับพิพิธภัณฑ์ก่อนวางแผน',
 'Local-history discovery walk', 'เดินสำรวจประวัติศาสตร์ท้องถิ่น', 'way', 1294703709, null, null, true, null),
(21, 'Khao San & Banglamphu', 'ข้าวสารและบางลำพู', 'nightlife', 'Rambuttri Alley', 'ตรอกรามบุตรี', 'Food & social life', 'อาหารและการพบปะ',
 'A more relaxed alternative to the busiest parts of Khao San, with food and casual hangouts.', 'ทางเลือกที่สบายกว่าส่วนที่คึกคักที่สุดของข้าวสาร มีอาหารและที่นั่งชิล',
 'Free walk; ฿100–350 for food', 'เดินฟรี ฿100–350 สำหรับอาหาร', 100,
 'Best in the evening.', 'ดีที่สุดช่วงเย็น',
 'Compare menus before choosing a restaurant for your group.', 'เทียบเมนูก่อนเลือกร้านให้กลุ่ม',
 'Backpacker dinner meetup', 'นัดกินมื้อเย็นแบ็กแพ็กเกอร์', null, null, 13.7612729, 100.4960757, true, null),
(22, 'Khao San & Banglamphu', 'ข้าวสารและบางลำพู', 'food', 'Khao San Road food stretch', 'ถนนข้าวสาร', 'Street food & nightlife', 'สตรีทฟู้ดและไนต์ไลฟ์',
 'Street food, casual restaurants and international backpacker culture.', 'สตรีทฟู้ด ร้านอาหารสบายๆ และวัฒนธรรมแบ็กแพ็กเกอร์นานาชาติ',
 '฿100–400 per person', '฿100–400 ต่อคน', 100,
 'Best in the evening and at night.', 'ดีที่สุดช่วงเย็นและกลางคืน',
 'Choose a public meeting point and agree on how everyone gets home.', 'เลือกจุดนัดพบที่เป็นที่สาธารณะ และตกลงวิธีกลับบ้านกันไว้',
 'Street-food group challenge', 'ชาเลนจ์สตรีทฟู้ดกลุ่ม', 'way', 23610119, null, null, true, null),
(23, 'Khao San & Banglamphu', 'ข้าวสารและบางลำพู', 'markets', 'Banglamphu Market area', 'ย่านตลาดบางลำพู', 'Local market', 'ตลาดท้องถิ่น',
 'Local food vendors and traditional shops around Banglamphu.', 'ร้านอาหารท้องถิ่นและร้านค้าดั้งเดิมรอบบางลำพู',
 '฿50–200 per person', '฿50–200 ต่อคน', 50,
 'Mostly daytime; stalls vary.', 'ส่วนใหญ่ช่วงกลางวัน แต่ละแผงเปิดเวลาต่างกัน',
 'Treat it as a market area to explore rather than a single shop.', 'มองว่าเป็นย่านตลาดให้เดินสำรวจ มากกว่าร้านเดียว',
 'Try three Thai snacks together', 'ลองขนมไทยสามอย่างด้วยกัน', null, null, 13.7609891, 100.4983727, true, null),
(24, 'Khao San & Banglamphu', 'ข้าวสารและบางลำพู', 'culture', 'Old Town canal-side walk', 'เดินริมคลองเมืองเก่า', 'Walking & photography', 'เดินเล่นและถ่ายภาพ',
 'A short self-guided route through public streets and canal-side scenery.', 'เส้นทางเดินเองสั้นๆ ผ่านถนนสาธารณะและวิวริมคลอง',
 'Free', 'ฟรี', 0,
 'Best early morning or late afternoon.', 'ดีที่สุดช่วงเช้าตรู่หรือบ่ายแก่',
 'Keep to safe public paths; don''t walk into private property.', 'เดินบนทางสาธารณะที่ปลอดภัย อย่าเข้าไปในพื้นที่ส่วนบุคคล',
 'Hidden-lane photo bingo', 'บิงโกถ่ายรูปซอยลับ', null, null, 13.7570, 100.5020, false,
 'Define the route (start point and public paths) and set the pin before publishing.'),
(25, 'Sukhumvit', 'สุขุมวิท', 'outdoor', 'Benjakitti Forest Park', 'สวนป่าเบญจกิติ', 'Nature & photography', 'ธรรมชาติและการถ่ายภาพ',
 'Walk the wetland boardwalks with skyline views in the middle of Bangkok.', 'เดินบนสะพานไม้กลางพื้นที่ชุ่มน้ำ พร้อมวิวตึกสูงใจกลางกรุงเทพฯ',
 'Free', 'ฟรี', 0,
 'About 4:30 AM–9 PM.', 'ประมาณ 4:30–21:00 น.',
 'Go near sunset and bring water and mosquito repellent.', 'ไปช่วงใกล้พระอาทิตย์ตก พกน้ำและยากันยุง',
 'Sunset walk and photo challenge', 'เดินชมพระอาทิตย์ตกและชาเลนจ์ถ่ายรูป', 'way', 1306732424, null, null, true, null),
(26, 'Sukhumvit', 'สุขุมวิท', 'markets', 'Khlong Toei Market', 'ตลาดคลองเตย', 'Local food culture', 'วัฒนธรรมอาหารท้องถิ่น',
 'A bustling fresh market where Bangkok residents shop for everyday ingredients.', 'ตลาดสดคึกคักที่คนกรุงเทพฯ มาซื้อวัตถุดิบประจำวัน',
 '฿50–250 per person', '฿50–250 ต่อคน', 50,
 'Best early in the morning.', 'ดีที่สุดช่วงเช้าตรู่',
 'Wear comfortable shoes, watch for delivery carts and ask before photographing vendors.', 'ใส่รองเท้าที่สบาย ระวังรถเข็นส่งของ และขออนุญาตก่อนถ่ายรูปแม่ค้า',
 'Thai ingredient discovery walk', 'เดินสำรวจวัตถุดิบไทย', 'relation', 20443109, null, null, true, null),
(27, 'Sukhumvit', 'สุขุมวิท', 'group', 'theCOMMONS Thonglor', 'เดอะคอมมอนส์ ทองหล่อ', 'Group dining', 'กินเป็นกลุ่ม',
 'A communal food and lifestyle space with many vendors and shared seating.', 'พื้นที่อาหารและไลฟ์สไตล์ มีหลายร้านและที่นั่งส่วนกลาง',
 '฿200–600 per person', '฿200–600 ต่อคน', 200,
 'About 8 AM–1 AM.', 'ประมาณ 8:00–01:00 น.',
 'Agree on a meeting floor and budget before everyone orders.', 'ตกลงชั้นที่นัดเจอและงบประมาณก่อนทุกคนสั่ง',
 'Meet-and-eat mixed-cuisine challenge', 'นัดกินชาเลนจ์อาหารหลายชาติ', 'way', 325613818, null, null, true, null),
(28, 'Sukhumvit', 'สุขุมวิท', 'cafes', 'Ekkamai side-street café trail', 'เส้นทางคาเฟ่ซอยเอกมัย', 'Cafés & discovery', 'คาเฟ่และการสำรวจ',
 'Independent cafés and eateries along Ekkamai''s side streets.', 'คาเฟ่และร้านอาหารอิสระตามซอยย่อยของเอกมัย',
 '฿100–350 per person', '฿100–350 ต่อคน', 100,
 'Each café has its own hours.', 'แต่ละคาเฟ่เปิดเวลาต่างกัน',
 'Plan a short route with three confirmed stops rather than the whole road.', 'วางเส้นทางสั้นๆ แวะสามร้านที่ยืนยันแล้ว แทนการเดินทั้งถนน',
 'Three-café hopping meetup', 'นัดตะลุยสามคาเฟ่', null, null, 13.7294, 100.5862, true, null),
(29, 'Sukhumvit', 'สุขุมวิท', 'group', 'W District, Phra Khanong', 'W District พระโขนง', 'Casual food & socialising', 'อาหารสบายๆ และพบปะ',
 'A casual outdoor dining and social space near BTS Phra Khanong.', 'พื้นที่กินดื่มกลางแจ้งสบายๆ ใกล้ BTS พระโขนง',
 '฿150–400 per person', '฿150–400 ต่อคน', 150,
 'Best late afternoon to evening.', 'ดีที่สุดช่วงบ่ายแก่ถึงค่ำ',
 'Check which vendors are open and the latest venue rules.', 'ตรวจสอบร้านที่เปิดและกฎล่าสุดของสถานที่',
 'Affordable international-food meetup', 'นัดกินอาหารนานาชาติราคาประหยัด', null, null, 13.7146, 100.5918, false,
 'Not in OpenStreetMap: confirm it is open and set the exact pin before publishing.'),
(30, 'Sukhumvit', 'สุขุมวิท', 'outdoor', 'Lumphini Park', 'สวนลุมพินี', 'Outdoor activities', 'กิจกรรมกลางแจ้ง',
 'Walking paths, lake views, greenery and local exercise groups.', 'ทางเดิน วิวทะเลสาบ ต้นไม้ และกลุ่มออกกำลังกายของคนท้องถิ่น',
 'Free', 'ฟรี', 0,
 'About 4:30 AM–10 PM.', 'ประมาณ 4:30–22:00 น.',
 'Go early in the morning or late in the afternoon when it''s cooler.', 'ไปช่วงเช้าหรือบ่ายแก่ที่อากาศเย็นกว่า',
 'Group walk or beginner-friendly fitness meetup', 'เดินเป็นกลุ่มหรือนัดออกกำลังกายสำหรับมือใหม่', 'way', 23483299, null, null, true, null),
(31, 'Sukhumvit', 'สุขุมวิท', 'food', 'On Nut local food streets', 'ถนนอาหารท้องถิ่นอ่อนนุช', 'Budget food', 'อาหารราคาประหยัด',
 'Neighbourhood food stalls and casual dining away from the premium shopping areas.', 'แผงอาหารในชุมชนและร้านสบายๆ ห่างจากย่านช้อปปิ้งหรู',
 '฿50–200 per person', '฿50–200 ต่อคน', 50,
 'Best late afternoon to evening.', 'ดีที่สุดช่วงบ่ายแก่ถึงค่ำ',
 'Stalls change; check what''s open when you arrive.', 'แผงเปลี่ยนบ่อย ตรวจสอบว่าร้านไหนเปิดเมื่อไปถึง',
 'Eat well under ฿200 per person', 'กินอิ่มไม่เกิน 200 บาทต่อคน', null, null, 13.7114216, 100.6099283, true, null),
(32, 'Sukhumvit', 'สุขุมวิท', 'culture', 'Erawan Museum', 'พิพิธภัณฑ์ช้างเอราวัณ', 'Architecture & culture', 'สถาปัตยกรรมและวัฒนธรรม',
 'The striking three-headed elephant museum in Samut Prakan, outside central Bangkok.', 'พิพิธภัณฑ์ช้างสามเศียรอันโดดเด่นในสมุทรปราการ นอกใจกลางกรุงเทพฯ',
 'Allow about ฿500 per adult; check current admission', 'เผื่อประมาณ ฿500 ต่อผู้ใหญ่ ตรวจสอบค่าเข้าล่าสุด', 500,
 'Check opening hours and ticket price before going.', 'ตรวจสอบเวลาเปิดและราคาบัตรก่อนไป',
 'Check the ticket price and travel time first: it''s a longer trip than central Sukhumvit.', 'ตรวจสอบราคาบัตรและเวลาเดินทางก่อน เพราะไกลกว่าย่านสุขุมวิทตอนกลาง',
 'Architecture and photography day trip', 'ทริปวันเดียวชมสถาปัตยกรรมและถ่ายรูป', 'way', 666021136, null, null, true, null)
)
insert into public.gems (
  number, area_en, area_th, category, name_en, name_th, subtitle_en, subtitle_th, description_en, description_th,
  budget_en, budget_th, min_spend, hours_en, hours_th, tip_en, tip_th, activity_en, activity_th,
  lat, lng, place_id, is_published, check_note
)
select
  s.number, s.area_en, s.area_th, s.category, s.name_en, s.name_th, s.subtitle_en, s.subtitle_th,
  s.description_en, s.description_th, s.budget_en, s.budget_th, s.min_spend, s.hours_en, s.hours_th,
  s.tip_en, s.tip_th, s.activity_en, s.activity_th,
  coalesce(p.lat, s.lat, 13.7563), coalesce(p.lng, s.lng, 100.5018), p.id,
  -- A linked gem whose place is missing (not in the database) stays hidden until the founder sets its pin.
  s.published and (s.osm_type is null or p.id is not null),
  case when s.osm_type is not null and p.id is null then 'OpenStreetMap place not found: set the pin.' else s.check_note end
from seed s
left join public.places p on p.osm_type = s.osm_type and p.osm_id = s.osm_id;
