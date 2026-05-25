-- ============================================================
-- TimeTrack — Full Supabase Schema
-- Run this entire file in the Supabase SQL Editor once.
-- ============================================================

-- Required extension (already enabled on Supabase)
create extension if not exists "pgcrypto";

-- ============================================================
-- TABLES
-- ============================================================

create table if not exists public.profiles (
  id          uuid primary key references auth.users on delete cascade,
  email       text not null,
  full_name   text not null default '',
  role        text not null default 'member'
                check (role in ('admin', 'manager', 'member')),
  created_at  timestamptz not null default now()
);

create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  color       text not null default '#3B82F6',
  archived    boolean not null default false,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists public.tags (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists public.time_entries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  project_id  uuid references public.projects(id) on delete set null,
  description text not null default '',
  billable    boolean not null default false,
  start_time  timestamptz not null,
  end_time    timestamptz,
  duration    integer,          -- seconds; null while timer is running
  is_running  boolean not null default false,
  created_at  timestamptz not null default now()
);

create table if not exists public.time_entry_tags (
  time_entry_id uuid not null references public.time_entries(id) on delete cascade,
  tag_id        uuid not null references public.tags(id) on delete cascade,
  primary key (time_entry_id, tag_id)
);

create table if not exists public.invites (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  role        text not null default 'member'
                check (role in ('admin', 'manager', 'member')),
  token       text not null unique default encode(gen_random_bytes(32), 'hex'),
  invited_by  uuid references public.profiles(id) on delete set null,
  accepted_at timestamptz,
  expires_at  timestamptz not null default (now() + interval '7 days'),
  created_at  timestamptz not null default now()
);

-- ============================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================

alter table public.profiles        enable row level security;
alter table public.projects        enable row level security;
alter table public.tags            enable row level security;
alter table public.time_entries    enable row level security;
alter table public.time_entry_tags enable row level security;
alter table public.invites         enable row level security;

-- ============================================================
-- HELPER: get current user's role (security definer = no RLS loop)
-- ============================================================

create or replace function public.get_my_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

-- ============================================================
-- TRIGGER: auto-create profile on signup, inherit role from invite
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  -- Honour a pending invite for this email
  select role into v_role
  from public.invites
  where lower(email) = lower(new.email)
    and accepted_at is null
    and expires_at > now()
  order by created_at desc
  limit 1;

  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce(v_role, 'member')
  )
  on conflict (id) do nothing;

  -- Mark invite accepted
  if v_role is not null then
    update public.invites
    set accepted_at = now()
    where lower(email) = lower(new.email)
      and accepted_at is null;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- RLS POLICIES — profiles
-- ============================================================

create policy "select_own_profile" on public.profiles
  for select using (auth.uid() = id);

create policy "managers_select_all_profiles" on public.profiles
  for select using (public.get_my_role() in ('admin', 'manager'));

create policy "update_own_profile" on public.profiles
  for update using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "admin_update_any_profile" on public.profiles
  for update using (public.get_my_role() = 'admin');

-- ============================================================
-- RLS POLICIES — projects
-- ============================================================

create policy "authenticated_read_projects" on public.projects
  for select using (auth.uid() is not null);

create policy "authenticated_create_projects" on public.projects
  for insert with check (auth.uid() is not null);

create policy "authenticated_update_projects" on public.projects
  for update using (auth.uid() is not null);

create policy "admin_delete_projects" on public.projects
  for delete using (public.get_my_role() = 'admin');

-- ============================================================
-- RLS POLICIES — tags
-- ============================================================

create policy "authenticated_read_tags" on public.tags
  for select using (auth.uid() is not null);

create policy "authenticated_create_tags" on public.tags
  for insert with check (auth.uid() is not null);

-- ============================================================
-- RLS POLICIES — time_entries
-- ============================================================

create policy "select_own_entries" on public.time_entries
  for select using (auth.uid() = user_id);

create policy "managers_select_all_entries" on public.time_entries
  for select using (public.get_my_role() in ('admin', 'manager'));

create policy "insert_own_entries" on public.time_entries
  for insert with check (auth.uid() = user_id);

create policy "update_own_entries" on public.time_entries
  for update using (auth.uid() = user_id);

create policy "delete_own_entries" on public.time_entries
  for delete using (auth.uid() = user_id);

create policy "admin_delete_any_entry" on public.time_entries
  for delete using (public.get_my_role() = 'admin');

-- ============================================================
-- RLS POLICIES — time_entry_tags
-- ============================================================

create policy "authenticated_read_entry_tags" on public.time_entry_tags
  for select using (auth.uid() is not null);

create policy "manage_own_entry_tags" on public.time_entry_tags
  for all using (
    exists (
      select 1 from public.time_entries te
      where te.id = time_entry_id and te.user_id = auth.uid()
    )
  );

-- ============================================================
-- RLS POLICIES — invites
-- ============================================================

create policy "admin_manage_invites" on public.invites
  for all using (public.get_my_role() = 'admin');

-- Anyone can read an invite by token (needed for /accept-invite page)
create policy "public_read_invites" on public.invites
  for select using (true);

-- ============================================================
-- AFTER SETUP: make your first user an admin
-- Run this manually after signing up for the first time:
--
--   UPDATE public.profiles SET role = 'admin' WHERE email = 'your@email.com';
--
-- ============================================================
