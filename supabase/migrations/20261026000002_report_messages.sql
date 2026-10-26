-- Reporting chat messages + the admin panel's Reports page (App Review, Guideline 1.2: people must be able to report
-- objectionable content, and the developer must act on reports).
--
-- * report_message(chat kind, message, reason): press and hold someone else's message in a table / hangout, private or
--   group chat → Report. Only messages the caller can read, not their own, not unsent ones. Reasons: spam,
--   harassment, inappropriate. One report per person and message (again = no new row), max 50 a day.
--   The report keeps a copy of the message (reports.excerpt, and the photo / voice note file in media_path) so the
--   founder sees what was sent even after it's unsent; context 'message', context_id = message id, chat_kind.
--   Those columns can only be filled by report_message (direct inserts can't fake them).
-- * admin_reports(open only, limit): every report with names, what was reported (message copy, story caption + photo,
--   tip text) and how many open reports the person has. admin_remove_message: the founder unsends a message
--   (returns its file to delete). Reports are closed with the existing admin update policy (resolved = true).
--
-- Errors: auth_required, not_found, invalid_reason, too_many_requests.

alter table public.reports
  add column chat_kind text check (chat_kind in ('dm', 'meetup', 'group')),
  add column excerpt text check (length(excerpt) <= 1000),
  add column media_path text;

create index reports_open_idx on public.reports (created_at desc) where not resolved;
create index reports_reported_idx on public.reports (reported_id) where not resolved;

drop policy "Users file reports as themselves" on public.reports;
create policy "Users file reports as themselves"
on public.reports for insert to authenticated
with check (
  reporter_id = (select auth.uid())
  and context::text <> 'message'
  and chat_kind is null and excerpt is null and media_path is null
);

create function public.report_message(p_chat_kind text, p_message_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_chat uuid;
  v_sender uuid;
  v_kind text;
  v_body text;
  v_path text;
begin
  if auth.uid() is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;
  if p_reason is null or p_reason not in ('spam', 'harassment', 'inappropriate') then
    raise exception 'invalid_reason';
  end if;

  if p_chat_kind = 'meetup' then
    select m.meetup_id, m.sender_id, m.kind, m.body, m.media_path into v_chat, v_sender, v_kind, v_body, v_path
    from public.meetup_messages m where m.id = p_message_id;
  elsif p_chat_kind = 'group' then
    select m.group_id, m.sender_id, m.kind, m.body, m.media_path into v_chat, v_sender, v_kind, v_body, v_path
    from public.chat_group_messages m where m.id = p_message_id;
  elsif p_chat_kind = 'dm' then
    select m.thread_id, m.sender_id, m.kind, m.body, m.media_path into v_chat, v_sender, v_kind, v_body, v_path
    from public.direct_messages m where m.id = p_message_id;
  end if;
  if v_chat is null or v_sender = auth.uid() or v_kind = 'unsent'
     or not public.chat_access(p_chat_kind, v_chat, false) then
    raise exception 'not_found';
  end if;

  if exists (
    select 1 from public.reports r
    where r.reporter_id = auth.uid() and r.context::text = 'message' and r.context_id = p_message_id
  ) then
    return;
  end if;
  if (select count(*) from public.reports r
      where r.reporter_id = auth.uid() and r.context::text = 'message' and r.created_at > now() - interval '1 day') >= 50 then
    raise exception 'too_many_requests';
  end if;

  insert into public.reports (reporter_id, reported_id, context, context_id, reason, chat_kind, excerpt, media_path)
  values (
    auth.uid(), v_sender, 'message', p_message_id, p_reason, p_chat_kind,
    left(case when v_kind in ('text', 'card') then v_body else '[' || v_kind || '] ' || coalesce(v_body, '') end, 1000),
    v_path
  );
end;
$$;

revoke execute on function public.report_message(text, uuid, text) from public, anon;
grant execute on function public.report_message(text, uuid, text) to authenticated;

-- The founder unsends someone's message (like unsend_chat_message, for any sender). Returns its file to delete.
create function public.admin_remove_message(p_chat_kind text, p_message_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_path text;
  v_found integer := 0;
begin
  if not public.is_admin() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_chat_kind = 'meetup' then
    update public.meetup_messages m
    set kind = 'unsent', body = '', media_path = null, duration_ms = null, lat = null, lng = null, live_until = null,
        location_updated_at = null, edited_at = null
    from (select id, media_path from public.meetup_messages where id = p_message_id) old
    where m.id = old.id and m.kind <> 'unsent'
    returning old.media_path into v_path;
  elsif p_chat_kind = 'group' then
    update public.chat_group_messages m
    set kind = 'unsent', body = '', media_path = null, duration_ms = null, lat = null, lng = null, live_until = null,
        location_updated_at = null, edited_at = null
    from (select id, media_path from public.chat_group_messages where id = p_message_id) old
    where m.id = old.id and m.kind <> 'unsent'
    returning old.media_path into v_path;
  elsif p_chat_kind = 'dm' then
    update public.direct_messages m
    set kind = 'unsent', body = '', media_path = null, duration_ms = null, lat = null, lng = null, live_until = null,
        location_updated_at = null, edited_at = null
    from (select id, media_path from public.direct_messages where id = p_message_id) old
    where m.id = old.id and m.kind <> 'unsent'
    returning old.media_path into v_path;
  end if;
  get diagnostics v_found = row_count;
  if v_found = 0 then
    raise exception 'not_found';
  end if;
  return v_path;
end;
$$;

revoke execute on function public.admin_remove_message(text, uuid) from public, anon;
grant execute on function public.admin_remove_message(text, uuid) to authenticated;

-- Every report for the admin panel, newest first. Story / tip details are joined in while the story or tip exists.
create function public.admin_reports(p_open_only boolean, p_limit integer)
returns table (
  id uuid,
  created_at timestamptz,
  context text,
  context_id uuid,
  chat_kind text,
  reason text,
  resolved boolean,
  excerpt text,
  media_path text,
  reporter_id uuid,
  reporter_name text,
  reported_id uuid,
  reported_name text,
  reported_open_reports integer,
  story_caption text,
  story_photo_path text,
  tip_body text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return query
  select r.id, r.created_at, r.context::text, r.context_id, r.chat_kind, r.reason, r.resolved, r.excerpt, r.media_path,
         r.reporter_id, rp.display_name, r.reported_id, dp.display_name,
         (select count(*)::integer from public.reports o where o.reported_id = r.reported_id and not o.resolved),
         s.caption, s.photo_path, t.body
  from public.reports r
  join public.profiles rp on rp.id = r.reporter_id
  join public.profiles dp on dp.id = r.reported_id
  left join public.stories s on r.context::text = 'story' and s.id = r.context_id
  left join public.place_tips t on r.context::text = 'tip' and t.id = r.context_id
  where not p_open_only or not r.resolved
  order by r.created_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
end;
$$;

revoke execute on function public.admin_reports(boolean, integer) from public, anon;
grant execute on function public.admin_reports(boolean, integer) to authenticated;
