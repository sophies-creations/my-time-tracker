-- ============================================================
-- TimeTrack — Complete Grants + RLS + Schema Fix
-- Safe to run multiple times (fully idempotent).
-- Paste the entire file into Supabase SQL Editor and run.
-- ============================================================

-- -------------------------------------------------------
-- 0. Extensions
-- -------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -------------------------------------------------------
-- 1. Schema usage (PostgREST must see the schema at all)
-- -------------------------------------------------------
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- -------------------------------------------------------
-- 2. Ensure every table exists
-- -------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.profiles (
  id         uuid        PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  email      text        NOT NULL,
  full_name  text        NOT NULL DEFAULT '',
  role       text        NOT NULL DEFAULT 'member',
  active     boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.clients (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL,
  email      text,
  notes      text,
  profile_id uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.projects (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL,
  color      text        NOT NULL DEFAULT '#3B82F6',
  archived   boolean     NOT NULL DEFAULT false,
  created_by uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  client_id  uuid        REFERENCES public.clients(id)  ON DELETE SET NULL,
  visibility text        NOT NULL DEFAULT 'public',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tags (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL UNIQUE,
  created_by uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.time_entries (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  project_id  uuid        REFERENCES public.projects(id) ON DELETE SET NULL,
  description text        NOT NULL DEFAULT '',
  billable    boolean     NOT NULL DEFAULT false,
  start_time  timestamptz NOT NULL,
  end_time    timestamptz,
  duration    integer,
  is_running  boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.time_entry_tags (
  time_entry_id uuid NOT NULL REFERENCES public.time_entries(id) ON DELETE CASCADE,
  tag_id        uuid NOT NULL REFERENCES public.tags(id)         ON DELETE CASCADE,
  PRIMARY KEY (time_entry_id, tag_id)
);

CREATE TABLE IF NOT EXISTS public.invites (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text        NOT NULL,
  role        text        NOT NULL DEFAULT 'member',
  token       text        NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  invited_by  uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  client_id   uuid        REFERENCES public.clients(id)  ON DELETE SET NULL,
  accepted_at timestamptz,
  expires_at  timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.client_projects (
  client_id  uuid NOT NULL REFERENCES public.clients(id)  ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  PRIMARY KEY (client_id, project_id)
);

-- -------------------------------------------------------
-- 3. Add any columns that migrations might have missed
-- -------------------------------------------------------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS active     boolean NOT NULL DEFAULT true;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS client_id  uuid    REFERENCES public.clients(id) ON DELETE SET NULL;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS visibility text    NOT NULL DEFAULT 'public';
ALTER TABLE public.invites  ADD COLUMN IF NOT EXISTS client_id  uuid    REFERENCES public.clients(id) ON DELETE SET NULL;

-- -------------------------------------------------------
-- 4. Fix CHECK constraints (drop first so re-runs are clean)
-- -------------------------------------------------------
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD  CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'manager', 'member', 'client'));

ALTER TABLE public.invites DROP CONSTRAINT IF EXISTS invites_role_check;
ALTER TABLE public.invites ADD  CONSTRAINT invites_role_check
  CHECK (role IN ('admin', 'manager', 'member', 'client'));

ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_visibility_check;
ALTER TABLE public.projects ADD  CONSTRAINT projects_visibility_check
  CHECK (visibility IN ('public', 'private'));

-- -------------------------------------------------------
-- 5. Enable RLS everywhere
-- -------------------------------------------------------
ALTER TABLE public.profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_entries    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_entry_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invites         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_projects ENABLE ROW LEVEL SECURITY;

-- -------------------------------------------------------
-- 6. Table-level GRANTs  (THIS is why queries were hanging)
--    RLS controls which rows; GRANTs let PostgREST try at all.
-- -------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tags            TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.time_entries    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.time_entry_tags TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invites         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_projects TO authenticated;

-- anon only needs to read invites (the /accept-invite page runs before login)
GRANT SELECT ON public.invites TO anon;

-- -------------------------------------------------------
-- 7. Helper functions
-- -------------------------------------------------------

-- Returns the current user's role; SECURITY DEFINER bypasses RLS
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated, anon;

-- Fallback: create a profile for the current user if one is missing
CREATE OR REPLACE FUNCTION public.ensure_profile()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  SELECT
    au.id,
    au.email,
    COALESCE(au.raw_user_meta_data->>'full_name', split_part(au.email, '@', 1)),
    'member'
  FROM auth.users au
  WHERE au.id = auth.uid()
  ON CONFLICT (id) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_profile() TO authenticated;

-- -------------------------------------------------------
-- 8. New-user trigger (auto-creates profile on signup)
-- -------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role      text;
  v_client_id uuid;
BEGIN
  -- Check for a pending invite
  SELECT role, client_id INTO v_role, v_client_id
  FROM public.invites
  WHERE lower(email) = lower(new.email)
    AND accepted_at IS NULL
    AND expires_at  > now()
  ORDER BY created_at DESC
  LIMIT 1;

  -- Create the profile
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    COALESCE(v_role, 'member')
  )
  ON CONFLICT (id) DO NOTHING;

  -- Link client record if this was a client portal invite
  IF v_client_id IS NOT NULL THEN
    UPDATE public.clients SET profile_id = new.id WHERE id = v_client_id;
  END IF;

  -- Mark invite accepted
  IF v_role IS NOT NULL THEN
    UPDATE public.invites
    SET accepted_at = now()
    WHERE lower(email) = lower(new.email)
      AND accepted_at IS NULL;
  END IF;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- -------------------------------------------------------
-- 9. RLS policies — drop then recreate (idempotent)
-- -------------------------------------------------------

-- profiles --
DROP POLICY IF EXISTS "select_own_profile"          ON public.profiles;
DROP POLICY IF EXISTS "managers_select_all_profiles" ON public.profiles;
DROP POLICY IF EXISTS "update_own_profile"           ON public.profiles;
DROP POLICY IF EXISTS "admin_update_any_profile"     ON public.profiles;

CREATE POLICY "select_own_profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "managers_select_all_profiles" ON public.profiles
  FOR SELECT USING (public.get_my_role() IN ('admin', 'manager'));

CREATE POLICY "update_own_profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE POLICY "admin_update_any_profile" ON public.profiles
  FOR UPDATE USING (public.get_my_role() = 'admin');

-- projects --
DROP POLICY IF EXISTS "authenticated_read_projects"    ON public.projects;
DROP POLICY IF EXISTS "authenticated_create_projects"  ON public.projects;
DROP POLICY IF EXISTS "authenticated_update_projects"  ON public.projects;
DROP POLICY IF EXISTS "admin_delete_projects"          ON public.projects;
DROP POLICY IF EXISTS "clients_read_assigned_projects" ON public.projects;

CREATE POLICY "authenticated_read_projects" ON public.projects
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "authenticated_create_projects" ON public.projects
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "authenticated_update_projects" ON public.projects
  FOR UPDATE USING (auth.uid() IS NOT NULL);

CREATE POLICY "admin_delete_projects" ON public.projects
  FOR DELETE USING (public.get_my_role() = 'admin');

CREATE POLICY "clients_read_assigned_projects" ON public.projects
  FOR SELECT USING (
    public.get_my_role() = 'client'
    AND EXISTS (
      SELECT 1 FROM public.client_projects cp
      JOIN  public.clients cl ON cl.id = cp.client_id
      WHERE cp.project_id = projects.id AND cl.profile_id = auth.uid()
    )
  );

-- tags --
DROP POLICY IF EXISTS "authenticated_read_tags"    ON public.tags;
DROP POLICY IF EXISTS "authenticated_create_tags"  ON public.tags;
DROP POLICY IF EXISTS "authenticated_manage_tags"  ON public.tags;

CREATE POLICY "authenticated_read_tags" ON public.tags
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "authenticated_manage_tags" ON public.tags
  FOR ALL USING    (auth.uid() IS NOT NULL)
  WITH CHECK       (auth.uid() IS NOT NULL);

-- time_entries --
DROP POLICY IF EXISTS "select_own_entries"          ON public.time_entries;
DROP POLICY IF EXISTS "managers_select_all_entries" ON public.time_entries;
DROP POLICY IF EXISTS "client_select_entries"       ON public.time_entries;
DROP POLICY IF EXISTS "insert_own_entries"          ON public.time_entries;
DROP POLICY IF EXISTS "update_own_entries"          ON public.time_entries;
DROP POLICY IF EXISTS "delete_own_entries"          ON public.time_entries;
DROP POLICY IF EXISTS "admin_delete_any_entry"      ON public.time_entries;

CREATE POLICY "select_own_entries" ON public.time_entries
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "managers_select_all_entries" ON public.time_entries
  FOR SELECT USING (public.get_my_role() IN ('admin', 'manager'));

CREATE POLICY "client_select_entries" ON public.time_entries
  FOR SELECT USING (
    public.get_my_role() = 'client'
    AND project_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.client_projects cp
      JOIN  public.clients cl ON cl.id = cp.client_id
      WHERE cp.project_id = time_entries.project_id
        AND cl.profile_id = auth.uid()
    )
  );

CREATE POLICY "insert_own_entries" ON public.time_entries
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "update_own_entries" ON public.time_entries
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "delete_own_entries" ON public.time_entries
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "admin_delete_any_entry" ON public.time_entries
  FOR DELETE USING (public.get_my_role() = 'admin');

-- time_entry_tags --
DROP POLICY IF EXISTS "authenticated_read_entry_tags" ON public.time_entry_tags;
DROP POLICY IF EXISTS "manage_own_entry_tags"         ON public.time_entry_tags;

CREATE POLICY "authenticated_read_entry_tags" ON public.time_entry_tags
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "manage_own_entry_tags" ON public.time_entry_tags
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.time_entries te
      WHERE te.id = time_entry_id AND te.user_id = auth.uid()
    )
  );

-- invites --
DROP POLICY IF EXISTS "admin_manage_invites" ON public.invites;
DROP POLICY IF EXISTS "public_read_invites"  ON public.invites;

CREATE POLICY "admin_manage_invites" ON public.invites
  FOR ALL USING (public.get_my_role() = 'admin');

-- Anyone (including anon) can read an invite by token (needed for /accept-invite)
CREATE POLICY "public_read_invites" ON public.invites
  FOR SELECT USING (true);

-- clients --
DROP POLICY IF EXISTS "managers_manage_clients" ON public.clients;
DROP POLICY IF EXISTS "client_see_own_record"   ON public.clients;

CREATE POLICY "managers_manage_clients" ON public.clients
  FOR ALL USING (public.get_my_role() IN ('admin', 'manager'));

CREATE POLICY "client_see_own_record" ON public.clients
  FOR SELECT USING (profile_id = auth.uid());

-- client_projects --
DROP POLICY IF EXISTS "managers_manage_client_projects" ON public.client_projects;
DROP POLICY IF EXISTS "client_see_own_project_list"     ON public.client_projects;

CREATE POLICY "managers_manage_client_projects" ON public.client_projects
  FOR ALL USING (public.get_my_role() IN ('admin', 'manager'));

CREATE POLICY "client_see_own_project_list" ON public.client_projects
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = client_id AND c.profile_id = auth.uid()
    )
  );

-- -------------------------------------------------------
-- 10. Backfill profiles for any existing auth users who
--     somehow never got one (safe no-op if all exist)
-- -------------------------------------------------------
INSERT INTO public.profiles (id, email, full_name, role)
SELECT
  au.id,
  au.email,
  COALESCE(au.raw_user_meta_data->>'full_name', split_part(au.email, '@', 1)),
  'member'
FROM auth.users au
WHERE NOT EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.id = au.id
)
ON CONFLICT (id) DO NOTHING;

-- -------------------------------------------------------
-- Done. After running this, make sure your admin account
-- has the right role:
--   UPDATE public.profiles SET role = 'admin'
--   WHERE email = 'your@email.com';
-- -------------------------------------------------------
