-- ============================================================
-- TimeTrack — Patch (run this if you already ran schema.sql)
-- Safe to run multiple times (uses OR REPLACE / IF NOT EXISTS).
-- ============================================================

-- 1. ensure_profile: called by the app when the profile row is missing.
--    Security definer bypasses RLS so it can always write to profiles.
--    First user to sign up automatically becomes admin.
create or replace function public.ensure_profile()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user  auth.users%rowtype;
  v_role  text;
  v_count int;
begin
  select * into v_user from auth.users where id = auth.uid();
  if not found then return; end if;

  -- Skip if the profile already exists
  if exists (select 1 from public.profiles where id = auth.uid()) then return; end if;

  -- Check for a pending invite
  select role into v_role
  from public.invites
  where lower(email) = lower(v_user.email)
    and accepted_at is null
    and expires_at > now()
  order by created_at desc
  limit 1;

  -- No invite → first user becomes admin, everyone else is member
  if v_role is null then
    select count(*) into v_count from public.profiles;
    v_role := case when v_count = 0 then 'admin' else 'member' end;
  end if;

  insert into public.profiles (id, email, full_name, role)
  values (
    auth.uid(),
    v_user.email,
    coalesce(v_user.raw_user_meta_data->>'full_name', split_part(v_user.email, '@', 1)),
    v_role
  )
  on conflict (id) do nothing;

  -- Mark any matching invite accepted
  update public.invites
  set accepted_at = now()
  where lower(email) = lower(v_user.email)
    and accepted_at is null;
end;
$$;

-- Allow authenticated users to call ensure_profile
grant execute on function public.ensure_profile() to authenticated;

-- 2. Also update the signup trigger so future signups get first-user-admin too.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role  text;
  v_count int;
begin
  select role into v_role
  from public.invites
  where lower(email) = lower(new.email)
    and accepted_at is null
    and expires_at > now()
  order by created_at desc
  limit 1;

  if v_role is null then
    select count(*) into v_count from public.profiles;
    v_role := case when v_count = 0 then 'admin' else 'member' end;
  end if;

  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    v_role
  )
  on conflict (id) do nothing;

  update public.invites
  set accepted_at = now()
  where lower(email) = lower(new.email)
    and accepted_at is null;

  return new;
end;
$$;
