-- ============================================================
-- Migration 019: schedule_cells — members can edit their own row
-- Additive only — existing admin/manager policies are untouched.
-- Run ONCE in the Supabase SQL Editor.
-- ============================================================

-- These three policies sit alongside the existing manager policies.
-- Postgres evaluates permissive policies with OR, so a row passes
-- if ANY policy grants access.  Members gain write access only to
-- rows where user_id matches their own auth.uid(); every other row
-- stays read-only for them.

DROP POLICY IF EXISTS "schedule_cells_member_self_insert" ON public.schedule_cells;
CREATE POLICY "schedule_cells_member_self_insert" ON public.schedule_cells
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "schedule_cells_member_self_update" ON public.schedule_cells;
CREATE POLICY "schedule_cells_member_self_update" ON public.schedule_cells
  FOR UPDATE
  USING     (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "schedule_cells_member_self_delete" ON public.schedule_cells;
CREATE POLICY "schedule_cells_member_self_delete" ON public.schedule_cells
  FOR DELETE USING (auth.uid() = user_id);
