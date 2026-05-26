-- ============================================================
-- Migration 002: Clients, active flag, client portal
-- Run this in the Supabase SQL Editor ONCE.
-- ============================================================

-- 1. Add active column to profiles (default true)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

-- 2. Expand role to include 'client'
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'manager', 'member', 'client'));

ALTER TABLE public.invites DROP CONSTRAINT IF EXISTS invites_role_check;
ALTER TABLE public.invites ADD CONSTRAINT invites_role_check
  CHECK (role IN ('admin', 'manager', 'member', 'client'));

-- 3. Clients table (must exist before invites.client_id FK)
CREATE TABLE IF NOT EXISTS public.clients (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  email       text,
  notes       text,
  profile_id  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 4a. Add client_id to projects (direct assignment)
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL;

-- 4b. Add client_id to invites (for client portal invites)
ALTER TABLE public.invites ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL;

-- 5. Client–Project assignments
CREATE TABLE IF NOT EXISTS public.client_projects (
  client_id   uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  project_id  uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  PRIMARY KEY (client_id, project_id)
);

-- 6. RLS
ALTER TABLE public.clients         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_projects  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "managers_manage_clients"         ON public.clients;
DROP POLICY IF EXISTS "client_see_own_record"           ON public.clients;
DROP POLICY IF EXISTS "managers_manage_client_projects"  ON public.client_projects;
DROP POLICY IF EXISTS "client_see_own_project_list"     ON public.client_projects;
DROP POLICY IF EXISTS "client_select_entries"           ON public.time_entries;
DROP POLICY IF EXISTS "clients_read_assigned_projects"  ON public.projects;

CREATE POLICY "managers_manage_clients" ON public.clients
  FOR ALL USING (public.get_my_role() IN ('admin', 'manager'));

CREATE POLICY "client_see_own_record" ON public.clients
  FOR SELECT USING (profile_id = auth.uid());

CREATE POLICY "managers_manage_client_projects" ON public.client_projects
  FOR ALL USING (public.get_my_role() IN ('admin', 'manager'));

CREATE POLICY "client_see_own_project_list" ON public.client_projects
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = client_id AND c.profile_id = auth.uid()
    )
  );

-- Clients can see time entries for their assigned projects
CREATE POLICY "client_select_entries" ON public.time_entries
  FOR SELECT USING (
    public.get_my_role() = 'client'
    AND project_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.client_projects cp
      JOIN public.clients cl ON cl.id = cp.client_id
      WHERE cp.project_id = time_entries.project_id
        AND cl.profile_id = auth.uid()
    )
  );

-- Clients can read projects assigned to them
CREATE POLICY "clients_read_assigned_projects" ON public.projects
  FOR SELECT USING (
    public.get_my_role() = 'client' AND
    EXISTS (
      SELECT 1 FROM public.client_projects cp
      JOIN public.clients cl ON cl.id = cp.client_id
      WHERE cp.project_id = projects.id AND cl.profile_id = auth.uid()
    )
  );

-- 7. Rebuild trigger to auto-link client profile
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role      text;
  v_client_id uuid;
BEGIN
  SELECT role, client_id INTO v_role, v_client_id
  FROM public.invites
  WHERE lower(email) = lower(new.email)
    AND accepted_at IS NULL
    AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;

  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    COALESCE(v_role, 'member')
  )
  ON CONFLICT (id) DO NOTHING;

  IF v_client_id IS NOT NULL THEN
    UPDATE public.clients SET profile_id = new.id WHERE id = v_client_id;
  END IF;

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

-- 8. ensure_profile RPC (fallback)
CREATE OR REPLACE FUNCTION public.ensure_profile()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
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

-- 9. Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_projects TO authenticated;
