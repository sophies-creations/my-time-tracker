-- ============================================================
-- Migration 020: Restrict manual time-entry INSERT to admin/owner.
-- Members and managers keep full timer (start/stop) access.
-- Additive approach: drop the blanket INSERT policy and replace it
-- with one that allows end_time IS NULL (timer start) for all roles,
-- but requires admin/owner for inserts with end_time set (manual entry).
-- Run ONCE in Supabase SQL Editor after reviewing.
-- ============================================================

-- Drop the existing permissive INSERT policy that allows any user to insert
-- any row as long as user_id matches their own uid.
DROP POLICY IF EXISTS "insert_own_entries" ON public.time_entries;

-- Replacement INSERT policy:
--   admin / owner  → may INSERT any own row (manual entry OR timer start)
--   member / manager → may only INSERT rows where end_time IS NULL
--                      (that is the live-timer start pattern; manual entries
--                       always supply end_time, so they are blocked here)
CREATE POLICY "insert_own_entries" ON public.time_entries
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND (
      public.get_my_role() IN ('admin', 'owner')
      OR end_time IS NULL
    )
  );
