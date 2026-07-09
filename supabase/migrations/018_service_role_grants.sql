-- ============================================================
-- Migration 018: Grant service_role table-level access to profiles
--
-- WHY: service_role has BYPASSRLS but PostgreSQL still enforces
-- table-level privileges. Every prior grant in this project targeted
-- only `authenticated` and `anon`, so admin scripts using the
-- service-role key got "permission denied for table profiles" even
-- though they bypassed RLS.
-- ============================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO service_role;
