-- ============================================================
-- TimeTrack — Timer diagnostics
-- Paste the WHOLE file into the Supabase SQL Editor and Run.
-- Read the 4 result panels from top to bottom.
-- ============================================================

-- 1. Does every auth user have a profile row?
--    (time_entries.user_id has a FK to profiles — a missing row
--     makes the timer INSERT fail with code 23503)
SELECT
  au.email,
  (p.id IS NOT NULL) AS has_profile,
  p.role,
  p.active
FROM auth.users au
LEFT JOIN public.profiles p ON p.id = au.id
ORDER BY au.created_at;

-- 2. Does the `authenticated` role have table-level GRANTs?
--    (missing INSERT here = error code 42501 "permission denied",
--     no matter how correct the RLS policies are)
SELECT table_name, grantee, string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privileges
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('time_entries', 'time_entry_tags', 'profiles', 'projects', 'tags')
  AND grantee IN ('authenticated', 'anon')
GROUP BY table_name, grantee
ORDER BY table_name, grantee;

-- 3. Which RLS policies actually exist on time_entries?
--    (you need at least: insert_own_entries with cmd = INSERT)
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('time_entries', 'time_entry_tags')
ORDER BY tablename, policyname;

-- 4. Is RLS enabled on the tables?
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('time_entries', 'time_entry_tags', 'profiles');

-- ============================================================
-- HOW TO READ THE RESULTS
--
-- Panel 1: every row must show has_profile = true.
--   If false → run fix-all-grants.sql (its step 10 backfills profiles).
--
-- Panel 2: time_entries must list `authenticated` with
--   DELETE, INSERT, SELECT, UPDATE. If the row is missing entirely
--   → run fix-all-grants.sql (step 6 adds the grants).
--
-- Panel 3: time_entries must include insert_own_entries (INSERT).
--   If missing → run fix-all-grants.sql (step 9 recreates policies).
--
-- Panel 4: rls_enabled should be true for all rows.
-- ============================================================
