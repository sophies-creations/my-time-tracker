-- ============================================================
-- Migration 012: schedule_cells — spreadsheet-style schedule grid
-- Additive only. Run ONCE in the Supabase SQL Editor.
-- ============================================================

-- 1. Core table: one row per (agent, calendar date).
CREATE TABLE IF NOT EXISTS public.schedule_cells (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  work_date   date        NOT NULL,
  content     text        NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT schedule_cells_user_date_unique UNIQUE (user_id, work_date)
);

CREATE INDEX IF NOT EXISTS schedule_cells_date_idx    ON public.schedule_cells (work_date);
CREATE INDEX IF NOT EXISTS schedule_cells_user_idx    ON public.schedule_cells (user_id);

-- 2. updated_at auto-stamp trigger.
CREATE OR REPLACE FUNCTION public.touch_schedule_cells_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS schedule_cells_updated_at_trg ON public.schedule_cells;
CREATE TRIGGER schedule_cells_updated_at_trg
  BEFORE UPDATE ON public.schedule_cells
  FOR EACH ROW EXECUTE FUNCTION public.touch_schedule_cells_updated_at();

-- 3. RLS.
ALTER TABLE public.schedule_cells ENABLE ROW LEVEL SECURITY;

-- Everyone authenticated can read the full grid.
DROP POLICY IF EXISTS "schedule_cells_select_all" ON public.schedule_cells;
CREATE POLICY "schedule_cells_select_all" ON public.schedule_cells
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Only manager / admin / owner can write.
DROP POLICY IF EXISTS "schedule_cells_manager_insert" ON public.schedule_cells;
CREATE POLICY "schedule_cells_manager_insert" ON public.schedule_cells
  FOR INSERT WITH CHECK (public.get_my_role() IN ('admin', 'owner', 'manager'));

DROP POLICY IF EXISTS "schedule_cells_manager_update" ON public.schedule_cells;
CREATE POLICY "schedule_cells_manager_update" ON public.schedule_cells
  FOR UPDATE USING  (public.get_my_role() IN ('admin', 'owner', 'manager'))
  WITH CHECK (public.get_my_role() IN ('admin', 'owner', 'manager'));

DROP POLICY IF EXISTS "schedule_cells_manager_delete" ON public.schedule_cells;
CREATE POLICY "schedule_cells_manager_delete" ON public.schedule_cells
  FOR DELETE USING (public.get_my_role() IN ('admin', 'owner', 'manager'));

-- 4. Grants.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_cells TO authenticated;
