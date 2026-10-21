-- Split the bill: people who aren't in the chat (founder, 2026-10-21: "choose the person count manually").
--
-- * When a bill is split equally, the payer may count more people than the chat's members ("we were 6, only 4 use
--   TableMeet"). The extra people are guests: chat_bills.guests (how many), guest_subtotal (their parts together,
--   before extras) and guest_amount (what they owe together, after discount, service, VAT and tip). They have no share
--   rows and no paid ticks: the payer settles with them outside the app.
-- * create_bill gets p_guests and p_guest_subtotal (both default 0, so older app versions keep working). The bill's
--   subtotal and total include the guests.
--
-- Errors: as create_bill (invalid_bill, not_in_chat, auth_required).

alter table public.chat_bills
  add column guests integer not null default 0 check (guests between 0 and 50),
  add column guest_subtotal numeric(12, 2) not null default 0 check (guest_subtotal >= 0),
  add column guest_amount numeric(12, 2) not null default 0 check (guest_amount >= 0),
  add check ((guests = 0) = (guest_subtotal = 0));

drop function public.create_bill(text, uuid, text, text, numeric, numeric, numeric, numeric, jsonb);

create function public.create_bill(
  p_chat_kind text,
  p_chat_id uuid,
  p_title text,
  p_currency text,
  p_discount_pct numeric,
  p_service_pct numeric,
  p_vat_pct numeric,
  p_tip_pct numeric,
  p_shares jsonb,
  p_guests integer default 0,
  p_guest_subtotal numeric default 0
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
  v_guests integer := coalesce(p_guests, 0);
  v_guest_subtotal numeric := round(coalesce(p_guest_subtotal, 0), 2);
begin
  if v_me is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;
  if p_currency is null or p_currency !~ '^[A-Z]{3}$'
     or coalesce(p_discount_pct, 0) not between 0 and 100 or coalesce(p_service_pct, 0) not between 0 and 30
     or coalesce(p_vat_pct, 0) not between 0 and 30 or coalesce(p_tip_pct, 0) not between 0 and 50
     or jsonb_typeof(p_shares) is distinct from 'array'
     or v_guests not between 0 and 50 or v_guest_subtotal not between 0 and 10000000
     or (v_guests = 0) <> (v_guest_subtotal = 0) then
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
    chat_kind, chat_id, payer_id, title, currency, discount_pct, service_pct, vat_pct, tip_pct, subtotal, total,
    guests, guest_subtotal, guest_amount
  )
  select p_chat_kind, p_chat_id, v_me, left(trim(coalesce(p_title, '')), 80), p_currency,
         coalesce(p_discount_pct, 0), coalesce(p_service_pct, 0), coalesce(p_vat_pct, 0), coalesce(p_tip_pct, 0),
         sum(s.subtotal) + v_guest_subtotal, sum(round(s.subtotal * v_factor, 2)) + round(v_guest_subtotal * v_factor, 2),
         v_guests, v_guest_subtotal, round(v_guest_subtotal * v_factor, 2)
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

revoke execute on function public.create_bill(text, uuid, text, text, numeric, numeric, numeric, numeric, jsonb, integer, numeric)
  from public, anon;
grant execute on function public.create_bill(text, uuid, text, text, numeric, numeric, numeric, numeric, jsonb, integer, numeric)
  to authenticated;
