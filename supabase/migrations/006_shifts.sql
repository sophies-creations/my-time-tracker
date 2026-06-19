-- ============================================================
-- Migration 006: Team Schedule — shifts + member change requests
-- Run this ONCE in the Supabase SQL Editor.
-- ============================================================

-- 1. Shifts table. Owned by a profile; admin-managed.
CREATE TABLE IF NOT EXISTS public.shifts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  starts_at   timestamptz NOT NULL,
  ends_at     timestamptz NOT NULL,
  notes       text,
  created_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS shifts_user_starts_idx ON public.shifts (user_id, starts_at);
CREATE INDEX IF NOT EXISTS shifts_starts_idx      ON public.shifts (starts_at);

-- 2. Change-request queue. Members submit; admins approve/reject.
CREATE TABLE IF NOT EXISTS public.shift_change_requests (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  shift_id            uuid REFERENCES public.shifts(id) ON DELETE SET NULL,
  kind                text NOT NULL CHECK (kind IN ('create', 'update', 'delete')),
  proposed_starts_at  timestamptz,
  proposed_ends_at    timestamptz,
  proposed_notes      text,
  status              text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_note          text,
  decided_by          uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  decided_at          timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS requests_user_status_idx ON public.shift_change_requests (user_id, status);
CREATE INDEX IF NOT EXISTS requests_status_idx      ON public.shift_change_requests (status);

-- 3. Updated_at trigger on shifts.
CREATE OR REPLACE FUNCTION public.touch_shifts_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS shifts_updated_at_trg ON public.shifts;
CREATE TRIGGER shifts_updated_at_trg
  BEFORE UPDATE ON public.shifts
  FOR EACH ROW EXECUTE FUNCTION public.touch_shifts_updated_at();

-- 4. RLS — shifts: everyone authenticated can read; only admins can mutate.
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shifts_select_authenticated" ON public.shifts;
CREATE POLICY "shifts_select_authenticated" ON public.shifts
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "shifts_admin_insert" ON public.shifts;
CREATE POLICY "shifts_admin_insert" ON public.shifts
  FOR INSERT WITH CHECK (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "shifts_admin_update" ON public.shifts;
CREATE POLICY "shifts_admin_update" ON public.shifts
  FOR UPDATE USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "shifts_admin_delete" ON public.shifts;
CREATE POLICY "shifts_admin_delete" ON public.shifts
  FOR DELETE USING (public.get_my_role() = 'admin');

-- 5. RLS — requests: members see/create own (pending); admins see all + decide.
ALTER TABLE public.shift_change_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "requests_select_own_or_admin" ON public.shift_change_requests;
CREATE POLICY "requests_select_own_or_admin" ON public.shift_change_requests
  FOR SELECT USING (user_id = auth.uid() OR public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "requests_insert_self" ON public.shift_change_requests;
CREATE POLICY "requests_insert_self" ON public.shift_change_requests
  FOR INSERT WITH CHECK (user_id = auth.uid() AND status = 'pending');

DROP POLICY IF EXISTS "requests_admin_update" ON public.shift_change_requests;
CREATE POLICY "requests_admin_update" ON public.shift_change_requests
  FOR UPDATE USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

-- 6. Grants.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shifts                TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shift_change_requests TO authenticated;
