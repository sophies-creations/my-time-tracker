-- ============================================================
-- Migration 005: drop the tags feature; admins can stop any
-- user's running timer (via RLS).
-- Run this ONCE in the Supabase SQL Editor.
-- ============================================================

-- 1. Drop the tags tables completely (cascades drop FKs/policies).
DROP TABLE IF EXISTS public.time_entry_tags CASCADE;
DROP TABLE IF EXISTS public.tags            CASCADE;

-- 2. Re-shape the time_entries UPDATE policies so that:
--    - Members may stop ONLY their own running timer.
--    - Managers + Admins may edit any STOPPED entry.
--    - ONLY Admins may update a running entry that belongs to someone
--      else (the "stop another user's timer" permission).
-- ------------------------------------------------------------

DROP POLICY IF EXISTS "managers_update_any_entry"        ON public.time_entries;
DROP POLICY IF EXISTS "managers_update_stopped_entries"  ON public.time_entries;
CREATE POLICY "managers_update_stopped_entries" ON public.time_entries
  FOR UPDATE
  USING  (public.get_my_role() IN ('admin', 'manager') AND is_running = false)
  WITH CHECK (public.get_my_role() IN ('admin', 'manager'));

DROP POLICY IF EXISTS "admin_update_any_running_entry" ON public.time_entries;
CREATE POLICY "admin_update_any_running_entry" ON public.time_entries
  FOR UPDATE
  USING  (public.get_my_role() = 'admin' AND is_running = true)
  WITH CHECK (public.get_my_role() = 'admin');
