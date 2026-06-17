-- ============================================================
-- Migration 004: project favorites + tightened time-entry permissions
-- Run this ONCE in the Supabase SQL Editor.
-- ============================================================

-- 1. Per-user project favorites
CREATE TABLE IF NOT EXISTS public.project_favorites (
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, project_id)
);

ALTER TABLE public.project_favorites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_favorites_select" ON public.project_favorites;
DROP POLICY IF EXISTS "own_favorites_insert" ON public.project_favorites;
DROP POLICY IF EXISTS "own_favorites_delete" ON public.project_favorites;

CREATE POLICY "own_favorites_select" ON public.project_favorites
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "own_favorites_insert" ON public.project_favorites
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "own_favorites_delete" ON public.project_favorites
  FOR DELETE USING (user_id = auth.uid());

GRANT SELECT, INSERT, DELETE ON public.project_favorites TO authenticated;

-- ============================================================
-- 2. Lock down time_entries:
--    - Members can only INSERT and STOP their own running timer.
--    - Members CANNOT edit a stopped entry or delete any entry.
--    - Managers + Admins can edit & delete any entry.
--    - Only Admins can change the project_id on a stopped entry.
-- ============================================================

-- Replace owner-update policy with a running-only version
DROP POLICY IF EXISTS "update_own_entries"        ON public.time_entries;
DROP POLICY IF EXISTS "update_own_running_entries" ON public.time_entries;
CREATE POLICY "update_own_running_entries" ON public.time_entries
  FOR UPDATE
  USING (auth.uid() = user_id AND is_running = true)
  WITH CHECK (auth.uid() = user_id);

-- Managers + Admins can edit any entry
DROP POLICY IF EXISTS "managers_update_any_entry" ON public.time_entries;
CREATE POLICY "managers_update_any_entry" ON public.time_entries
  FOR UPDATE
  USING (public.get_my_role() IN ('admin', 'manager'))
  WITH CHECK (public.get_my_role() IN ('admin', 'manager'));

-- Remove member delete capability
DROP POLICY IF EXISTS "delete_own_entries" ON public.time_entries;

-- Managers + Admins can delete any entry (consolidates old admin-only policy)
DROP POLICY IF EXISTS "admin_delete_any_entry"    ON public.time_entries;
DROP POLICY IF EXISTS "managers_delete_any_entry" ON public.time_entries;
CREATE POLICY "managers_delete_any_entry" ON public.time_entries
  FOR DELETE USING (public.get_my_role() IN ('admin', 'manager'));

-- Trigger: only admins may change project_id on a stopped entry
CREATE OR REPLACE FUNCTION public.guard_stopped_entry_project_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.is_running = false
     AND NEW.project_id IS DISTINCT FROM OLD.project_id
     AND public.get_my_role() <> 'admin'
  THEN
    RAISE EXCEPTION 'Only admins can change the project on a stopped entry'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_stopped_entry_project_change_trg ON public.time_entries;
CREATE TRIGGER guard_stopped_entry_project_change_trg
  BEFORE UPDATE OF project_id ON public.time_entries
  FOR EACH ROW EXECUTE FUNCTION public.guard_stopped_entry_project_change();
