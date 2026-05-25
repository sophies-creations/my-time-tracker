-- TimeTrack — Fix table-level GRANT permissions + ensure your profile exists
-- Run this in Supabase: project → SQL Editor → New query → Run.
-- Safe to run multiple times.
--
-- WHY: RLS policies are evaluated AFTER PostgreSQL's privilege check.
-- If the 'authenticated' role has no GRANT on a table, every operation
-- returns "permission denied" (code 42501) regardless of your RLS policies.
-- The original schema.sql had no GRANT statements.

-- 1. Grant full table-level access to the authenticated role on all app tables
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tags            TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.time_entries    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.time_entry_tags TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invites         TO authenticated;

-- 2. Ensure your own profile row exists (safe no-op if it already does)
SELECT public.ensure_profile();

-- 3. Verify — you should see your own profile row after running this
SELECT id, email, full_name, role FROM public.profiles WHERE id = auth.uid();
