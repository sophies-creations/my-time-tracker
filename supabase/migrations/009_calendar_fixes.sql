-- ============================================================
-- Migration 009: Fix calendar RLS + add 'owner' everywhere + day_off support
-- Run ONCE in the Supabase SQL Editor. All changes are additive.
-- ============================================================

-- 1. Fix shifts policies: include 'owner' alongside 'admin'.
DROP POLICY IF EXISTS "shifts_admin_insert" ON public.shifts;
CREATE POLICY "shifts_admin_insert" ON public.shifts
  FOR INSERT WITH CHECK (public.get_my_role() IN ('admin', 'owner'));

DROP POLICY IF EXISTS "shifts_admin_update" ON public.shifts;
CREATE POLICY "shifts_admin_update" ON public.shifts
  FOR UPDATE USING  (public.get_my_role() IN ('admin', 'owner'))
  WITH CHECK (public.get_my_role() IN ('admin', 'owner'));

DROP POLICY IF EXISTS "shifts_admin_delete" ON public.shifts;
CREATE POLICY "shifts_admin_delete" ON public.shifts
  FOR DELETE USING (public.get_my_role() IN ('admin', 'owner'));

-- 2. Fix shift_change_requests SELECT: include 'owner'.
DROP POLICY IF EXISTS "requests_select_own_or_admin" ON public.shift_change_requests;
CREATE POLICY "requests_select_own_or_admin" ON public.shift_change_requests
  FOR SELECT USING (
    user_id = auth.uid()
    OR public.get_my_role() IN ('admin', 'owner')
  );

-- 3. Recreate INSERT policy WITHOUT the `status = 'pending'` guard.
--    The status column already defaults to 'pending' in the DB; the extra
--    AND clause was evaluated before the DEFAULT was visible to RLS, silently
--    blocking every member insert.
DROP POLICY IF EXISTS "requests_insert_self" ON public.shift_change_requests;
CREATE POLICY "requests_insert_self" ON public.shift_change_requests
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- 4. Fix UPDATE policy: include 'owner'.
DROP POLICY IF EXISTS "requests_admin_update" ON public.shift_change_requests;
CREATE POLICY "requests_admin_update" ON public.shift_change_requests
  FOR UPDATE USING  (public.get_my_role() IN ('admin', 'owner'))
  WITH CHECK (public.get_my_role() IN ('admin', 'owner'));

-- 5. Add 'day_off' to the kind check constraint (additive: keeps old rows valid).
ALTER TABLE public.shift_change_requests
  DROP CONSTRAINT IF EXISTS shift_change_requests_kind_check;
ALTER TABLE public.shift_change_requests
  ADD CONSTRAINT shift_change_requests_kind_check
  CHECK (kind IN ('create', 'update', 'delete', 'day_off'));

-- 6. Add a date column for day-off requests (shift requests use timestamptz;
--    day-off only needs a calendar date).
ALTER TABLE public.shift_change_requests
  ADD COLUMN IF NOT EXISTS day_off_date date;

-- 7. Mark day-off shifts on the shifts table so the calendar can render them
--    differently (full-day placeholder, no hours displayed).
ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS is_day_off boolean NOT NULL DEFAULT false;

-- 8. Re-apply grants (idempotent).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shifts                TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shift_change_requests TO authenticated;
