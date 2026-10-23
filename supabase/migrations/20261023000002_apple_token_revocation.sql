-- Sign in with Apple: Apple requires that deleting an account also revokes the app's Apple tokens (App Store
-- guideline 5.1.1(v)). After an Apple sign-in, the Edge Function supabase/functions/apple-account swaps the one-time
-- authorization code for a refresh token and keeps it here; before an account is deleted (in the app or at
-- /admin/users) the same function revokes it with Apple. The row goes with the account (cascade).
--
-- The function calls these with the person's own session (or the founder's), so no service key is needed there.

create table public.apple_tokens (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  refresh_token text not null check (length(refresh_token) between 1 and 2000),
  updated_at timestamptz not null default now()
);

alter table public.apple_tokens enable row level security;
-- No policies: only the functions below read or write it.
revoke all on public.apple_tokens from anon, authenticated;

-- Keep (or replace) the caller's Apple refresh token.
create function public.save_apple_token(p_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;
  if p_token is null or length(p_token) not between 1 and 2000 then
    raise exception 'invalid_token' using errcode = '22023';
  end if;
  insert into public.apple_tokens (user_id, refresh_token, updated_at)
  values (auth.uid(), p_token, now())
  on conflict (user_id) do update set refresh_token = excluded.refresh_token, updated_at = excluded.updated_at;
end;
$$;

-- The kept token of the caller, or of anyone for an admin (to revoke before deleting). Null when there is none.
create function public.apple_token_for(p_user uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;
  if p_user is distinct from auth.uid() and not public.is_admin() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return (select t.refresh_token from public.apple_tokens t where t.user_id = p_user);
end;
$$;

revoke execute on function public.save_apple_token(text) from public, anon;
revoke execute on function public.apple_token_for(uuid) from public, anon;
grant execute on function public.save_apple_token(text) to authenticated;
grant execute on function public.apple_token_for(uuid) to authenticated;
