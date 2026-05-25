-- TimeTrack — Fix projects table RLS policies
-- Run this in Supabase: project → SQL Editor → New query → Run.
-- Safe to run multiple times.
--
-- Fixes two root causes of "Could not create project":
--   1. INSERT/UPDATE/DELETE policies missing (schema.sql errors mid-run or ran twice)
--   2. Table-level GRANT missing (RLS alone isn't enough without the underlying privilege)

-- 1. Drop and recreate all projects policies cleanly
DROP POLICY IF EXISTS "authenticated_read_projects"   ON public.projects;
DROP POLICY IF EXISTS "authenticated_create_projects" ON public.projects;
DROP POLICY IF EXISTS "authenticated_update_projects" ON public.projects;
DROP POLICY IF EXISTS "admin_delete_projects"         ON public.projects;

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_read_projects" ON public.projects
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "authenticated_create_projects" ON public.projects
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "authenticated_update_projects" ON public.projects
  FOR UPDATE USING (auth.uid() IS NOT NULL);

CREATE POLICY "admin_delete_projects" ON public.projects
  FOR DELETE USING (public.get_my_role() = 'admin');

-- 2. Grant table-level privileges to the authenticated role.
--    RLS policies are evaluated after privilege checks, so INSERT fails
--    at the privilege layer if this GRANT is missing, even with a valid policy.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
