-- ============================================================
-- Migration 013: schedule_hidden flag on profiles
-- Additive only. Run ONCE in the Supabase SQL Editor.
-- ============================================================

-- 1. Add the column. Defaults to false (all rows visible).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS schedule_hidden boolean NOT NULL DEFAULT false;

-- 2. Allow managers/admins/owners to toggle this flag on any profile.
--    (Separate named policy so it coexists with any existing UPDATE policy.)
DROP POLICY IF EXISTS "profiles_managers_set_schedule_hidden" ON public.profiles;
CREATE POLICY "profiles_managers_set_schedule_hidden" ON public.profiles
  FOR UPDATE
  USING  (public.get_my_role() IN ('admin', 'owner', 'manager'))
  WITH CHECK (public.get_my_role() IN ('admin', 'owner', 'manager'));
