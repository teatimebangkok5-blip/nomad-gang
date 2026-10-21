-- Icebreaker cards and the split-the-bill calculator in chats (founder, 2026-10-21).
--
-- * Two new message kinds in every chat (table / hangout, group, private):
--   - 'card': body 'ice:<deck>:<number>' (an icebreaker card; the decks and their wording, English and Thai, live in
--     the app, so everyone reads the card in their own language) or 'meetup:<id>' (an invite to a table / hangout,
--     e.g. a second round). Sent with send_chat_card.
--   - 'bill': body = a chat_bills id. Sent with create_bill.
--   Private chats only once the request is accepted.
-- * Split the bill (calculator only: no payments in the app, founder's choice): the payer enters each person's part
--   of the bill (or splits it equally in the app), the partner discount, service charge, VAT and tip. The server works
--   out what everyone owes: part × (1 − discount) × (1 + service) × (1 + VAT) × (1 + tip), rounded to 2 decimals
--   (Thai "++" prices: service first, then VAT on top). The payer's own share counts as paid; the payer, or each
--   person for themself, ticks shares as paid (set_bill_paid). Readable by the chat's members.
--
-- Errors: auth_required, not_found, invalid_card, invalid_bill, not_in_chat.

-- ---------------------------------------------------------------------------
-- Message kinds
-- ---------------------------------------------------------------------------

alter table public.meetup_messages
  drop constraint meetup_messages_kind_check,
  add constraint meetup_messages_kind_check check (kind in ('text', 'photo', 'voice', 'location', 'unsent', 'card', 'bill')),
  drop constraint meetup_messages_content_check,
  add constraint meetup_messages_content_check check (
    case kind
      when 'text' then length(trim(body)) between 1 and 1000 and media_path is null and duration_ms is null
        and lat is null and lng is null and live_until is null
      when 'photo' then media_path is not null and length(body) <= 1000 and duration_ms is null
        and lat is null and lng is null and live_until is null
      when 'voice' then media_path is not null and body = '' and duration_ms is not null
        and lat is null and lng is null and live_until is null
      when 'location' then media_path is null and body = '' and duration_ms is null
        and lat is not null and lng is not null and live_until is not null
      when 'unsent' then media_path is null and body = '' and duration_ms is null
        and lat is null and lng is null and live_until is null
      else media_path is null and duration_ms is null and lat is null and lng is null and live_until is null
        and length(body) between 1 and 60
    end
  );

alter table public.direct_messages
  drop constraint direct_messages_kind_check,
  add constraint direct_messages_kind_check check (kind in ('text', 'photo', 'voice', 'location', 'unsent', 'card', 'bill')),
  drop constraint direct_messages_content_check,
  add constraint direct_messages_content_check check (
    case kind
      when 'text' then length(trim(body)) between 1 and 1000 and media_path is null and duration_ms is null
        and lat is null and lng is null and live_until is null
      when 'photo' then media_path is not null and length(body) <= 1000 and duration_ms is null
        and lat is null and lng is null and live_until is null
      when 'voice' then media_path is not null and body = '' and duration_ms is not null
        and lat is null and lng is null and live_until is null
      when 'location' then media_path is null and body = '' and duration_ms is null
        and lat is not null and lng is not null and live_until is not null
      when 'unsent' then media_path is null and body = '' and duration_ms is null
        and lat is null and lng is null and live_until is null
      else media_path is null and duration_ms is null and lat is null and lng is null and live_until is null
        and length(body) between 1 and 60
    end
  );

alter table public.chat_group_messages
  drop constraint chat_group_messages_kind_check,
  add constraint chat_group_messages_kind_check check (kind in ('text', 'photo', 'voice', 'location', 'unsent', 'card', 'bill')),
  drop constraint chat_group_messages_content_check,
  add constraint chat_group_messages_content_check check (
    case kind
      when 'text' then length(trim(body)) between 1 and 1000 and media_path is null and duration_ms is null
        and lat is null and lng is null and live_until is null
      when 'photo' then media_path is not null and length(body) <= 1000 and duration_ms is null
        and lat is null and lng is null and live_until is null
      when 'voice' then media_path is not null and body = '' and duration_ms is not null
        and lat is null and lng is null and live_until is null
      when 'location' then media_path is null and body = '' and duration_ms is null
        and lat is not null and lng is not null and live_until is not null
      when 'unsent' then media_path is null and body = '' and duration_ms is null
        and lat is null and lng is null and live_until is null
      else media_path is null and duration_ms is null and lat is null and lng is null and live_until is null
        and length(body) between 1 and 60
    end
  );

-- Posts a card / bill message as the caller, if they may write in the chat (private chats: accepted ones only).
-- Not callable through the API.
create function public.post_chat_message(p_chat_kind text, p_chat_id uuid, p_kind text, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_chat_kind not in ('meetup', 'group', 'dm') or not public.chat_access(p_chat_kind, p_chat_id, true)
     or (p_chat_kind = 'dm' and not exists (
           select 1 from public.direct_threads t where t.id = p_chat_id and t.status = 'accepted')) then
    raise exception 'not_found';
  end if;
  if p_chat_kind = 'meetup' then
    insert into public.meetup_messages (meetup_id, sender_id, kind, body)
    values (p_chat_id, auth.uid(), p_kind, p_body) returning id into v_id;
  elsif p_chat_kind = 'group' then
    insert into public.chat_group_messages (group_id, sender_id, kind, body)
    values (p_chat_id, auth.uid(), p_kind, p_body) returning id into v_id;
  else
    insert into public.direct_messages (thread_id, sender_id, kind, body)
    values (p_chat_id, auth.uid(), p_kind, p_body) returning id into v_id;
    update public.direct_threads set last_message_at = now() where id = p_chat_id;
  end if;
  return v_id;
end;
$$;

revoke execute on function public.post_chat_message(text, uuid, text, text) from public, anon, authenticated;

-- An icebreaker card ('ice:<deck>:<number>') or an invite to a table / hangout ('meetup:<id>') in a chat.
create function public.send_chat_card(p_chat_kind text, p_chat_id uuid, p_card text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;
  if p_card is null or not (
       p_card ~ '^ice:[a-z]{2,20}:[0-9]{1,3}$'
       or (p_card ~ '^meetup:[0-9a-f-]{36}$'
           and exists (select 1 from public.meetups m where m.id = substr(p_card, 8)::uuid and m.status = 'open'))) then
    raise exception 'invalid_card';
  end if;
  return public.post_chat_message(p_chat_kind, p_chat_id, 'card', p_card);
end;
$$;

revoke execute on function public.send_chat_card(text, uuid, text) from public, anon;
grant execute on function public.send_chat_card(text, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Split the bill
-- ---------------------------------------------------------------------------

create table public.chat_bills (
  id uuid primary key default gen_random_uuid(),
  chat_kind text not null check (chat_kind in ('meetup', 'group', 'dm')),
  chat_id uuid not null,
  payer_id uuid not null references public.profiles (id) on delete cascade,
  title text not null default '' check (length(title) <= 80),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  discount_pct numeric(5, 2) not null default 0 check (discount_pct between 0 and 100),
  service_pct numeric(5, 2) not null default 0 check (service_pct between 0 and 30),
  vat_pct numeric(5, 2) not null default 0 check (vat_pct between 0 and 30),
  tip_pct numeric(5, 2) not null default 0 check (tip_pct between 0 and 50),
  subtotal numeric(12, 2) not null check (subtotal > 0),
  total numeric(12, 2) not null check (total >= 0),
  created_at timestamptz not null default now()
);

create index chat_bills_chat_idx on public.chat_bills (chat_kind, chat_id);
create index chat_bills_payer_idx on public.chat_bills (payer_id);

create table public.chat_bill_shares (
  bill_id uuid not null references public.chat_bills (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- Their part of the bill as entered (before discount, service, VAT and tip).
  subtotal numeric(12, 2) not null check (subtotal >= 0),
  -- What they owe the payer.
  amount numeric(12, 2) not null check (amount >= 0),
  paid_at timestamptz,
  primary key (bill_id, user_id)
);

create index chat_bill_shares_user_idx on public.chat_bill_shares (user_id);

alter table public.chat_bills enable row level security;
alter table public.chat_bill_shares enable row level security;
revoke insert, update, delete on public.chat_bills, public.chat_bill_shares from anon, authenticated;

create policy "Chat members read the chat's bills"
on public.chat_bills for select to authenticated
using ((select public.chat_access(chat_kind, chat_id, false)));

create policy "Chat members read the chat's bill shares"
on public.chat_bill_shares for select to authenticated
using (exists (select 1 from public.chat_bills b where b.id = bill_id));

-- Whether someone is in a chat (any person, not just the caller).
create function public.chat_has_member(p_chat_kind text, p_chat_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_chat_kind
    when 'meetup' then exists (
      select 1 from public.meetup_members mm where mm.meetup_id = p_chat_id and mm.user_id = p_user_id)
    when 'group' then exists (
      select 1 from public.chat_group_members gm where gm.group_id = p_chat_id and gm.user_id = p_user_id)
    when 'dm' then exists (
      select 1 from public.direct_threads t where t.id = p_chat_id and p_user_id in (t.user_a, t.user_b))
    else false
  end;
$$;

revoke execute on function public.chat_has_member(text, uuid, uuid) from public, anon, authenticated;

-- The caller paid; p_shares = [{"user_id": …, "subtotal": …}, …] (1–30 people in the chat, the caller may be one of
-- them). Posts the bill in the chat and returns its id.
create function public.create_bill(
  p_chat_kind text,
  p_chat_id uuid,
  p_title text,
  p_currency text,
  p_discount_pct numeric,
  p_service_pct numeric,
  p_vat_pct numeric,
  p_tip_pct numeric,
  p_shares jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_bill uuid;
  v_factor numeric;
  v_share record;
  v_count integer;
begin
  if v_me is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;
  if p_currency is null or p_currency !~ '^[A-Z]{3}$'
     or coalesce(p_discount_pct, 0) not between 0 and 100 or coalesce(p_service_pct, 0) not between 0 and 30
     or coalesce(p_vat_pct, 0) not between 0 and 30 or coalesce(p_tip_pct, 0) not between 0 and 50
     or jsonb_typeof(p_shares) is distinct from 'array' then
    raise exception 'invalid_bill';
  end if;
  select count(*) into v_count from jsonb_to_recordset(p_shares) as s (user_id uuid, subtotal numeric);
  if v_count not between 1 and 30
     or v_count <> (select count(distinct s.user_id) from jsonb_to_recordset(p_shares) as s (user_id uuid, subtotal numeric))
     or exists (select 1 from jsonb_to_recordset(p_shares) as s (user_id uuid, subtotal numeric)
                where s.user_id is null or s.subtotal is null or s.subtotal < 0 or s.subtotal > 10000000)
     or (select sum(s.subtotal) from jsonb_to_recordset(p_shares) as s (user_id uuid, subtotal numeric)) <= 0 then
    raise exception 'invalid_bill';
  end if;
  if not public.chat_has_member(p_chat_kind, p_chat_id, v_me)
     or exists (select 1 from jsonb_to_recordset(p_shares) as s (user_id uuid, subtotal numeric)
                where not public.chat_has_member(p_chat_kind, p_chat_id, s.user_id)) then
    raise exception 'not_in_chat';
  end if;

  v_factor := (1 - coalesce(p_discount_pct, 0) / 100) * (1 + coalesce(p_service_pct, 0) / 100)
              * (1 + coalesce(p_vat_pct, 0) / 100) * (1 + coalesce(p_tip_pct, 0) / 100);
  insert into public.chat_bills (
    chat_kind, chat_id, payer_id, title, currency, discount_pct, service_pct, vat_pct, tip_pct, subtotal, total
  )
  select p_chat_kind, p_chat_id, v_me, left(trim(coalesce(p_title, '')), 80), p_currency,
         coalesce(p_discount_pct, 0), coalesce(p_service_pct, 0), coalesce(p_vat_pct, 0), coalesce(p_tip_pct, 0),
         sum(s.subtotal), sum(round(s.subtotal * v_factor, 2))
  from jsonb_to_recordset(p_shares) as s (user_id uuid, subtotal numeric)
  returning id into v_bill;
  for v_share in select * from jsonb_to_recordset(p_shares) as s (user_id uuid, subtotal numeric) loop
    insert into public.chat_bill_shares (bill_id, user_id, subtotal, amount, paid_at)
    values (v_bill, v_share.user_id, round(v_share.subtotal, 2), round(v_share.subtotal * v_factor, 2),
            case when v_share.user_id = v_me then now() end);
  end loop;

  perform public.post_chat_message(p_chat_kind, p_chat_id, 'bill', v_bill::text);
  return v_bill;
end;
$$;

revoke execute on function public.create_bill(text, uuid, text, text, numeric, numeric, numeric, numeric, jsonb) from public, anon;
grant execute on function public.create_bill(text, uuid, text, text, numeric, numeric, numeric, numeric, jsonb) to authenticated;

-- Ticks a share as paid (or not). The payer for anyone, everyone else only for themself.
create function public.set_bill_paid(p_bill_id uuid, p_user_id uuid, p_paid boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;
  update public.chat_bill_shares s
  set paid_at = case when p_paid then coalesce(s.paid_at, now()) end
  from public.chat_bills b
  where s.bill_id = p_bill_id and s.user_id = p_user_id and b.id = s.bill_id
    and (b.payer_id = auth.uid() or s.user_id = auth.uid())
    and public.chat_access(b.chat_kind, b.chat_id, false);
  if not found then
    raise exception 'not_found';
  end if;
end;
$$;

revoke execute on function public.set_bill_paid(uuid, uuid, boolean) from public, anon;
grant execute on function public.set_bill_paid(uuid, uuid, boolean) to authenticated;

alter publication supabase_realtime add table public.chat_bill_shares;

-- ---------------------------------------------------------------------------
-- Notifications: cards and bills as words
-- ---------------------------------------------------------------------------

create or replace function public.push_preview(p_kind text, p_body text, p_language text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_text text := coalesce(p_body, '');
  v_greeting record;
begin
  if p_kind = 'photo' then
    return case when p_language = 'th' then '📷 รูปภาพ' else '📷 Photo' end;
  elsif p_kind = 'voice' then
    return case when p_language = 'th' then '🎤 ข้อความเสียง' else '🎤 Voice message' end;
  elsif p_kind = 'location' then
    return case when p_language = 'th' then '📍 ตำแหน่งสด' else '📍 Live location' end;
  elsif p_kind = 'card' and v_text like 'meetup:%' then
    return case when p_language = 'th' then '🍻 ชวนไปต่อ' else '🍻 Join us for the next round' end;
  elsif p_kind = 'card' then
    return case when p_language = 'th' then '🎲 การ์ดละลายพฤติกรรม' else '🎲 Icebreaker card' end;
  elsif p_kind = 'bill' then
    return case when p_language = 'th' then '🧾 หารค่าอาหาร' else '🧾 Split the bill' end;
  end if;
  if v_text like '%:tm\_%' then
    for v_greeting in
      select * from (values
        ('sawasdee', 'Sawasdee', 'สวัสดี'), ('hola', 'Hola', 'Hola'), ('ciao', 'Ciao', 'Ciao'),
        ('bonjour', 'Bonjour', 'Bonjour'), ('konnichiwa', 'Konnichiwa', 'Konnichiwa'),
        ('annyeong', 'Annyeong', 'Annyeong'), ('namaste', 'Namaste', 'Namaste'), ('xinchao', 'Xin chào', 'Xin chào')
      ) as g (id, word_en, word_th)
    loop
      v_text := replace(v_text, ':tm_' || v_greeting.id || ':',
        '👋 ' || case when p_language = 'th' then v_greeting.word_th else v_greeting.word_en end);
    end loop;
  end if;
  return left(v_text, 160);
end;
$$;
