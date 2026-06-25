-- ============================================================
-- Migration 011: Complete request/approval workflow
-- Additive only — no drops, no destructive changes.
-- ============================================================

-- 1. Optional reason the member can attach to any request type.
ALTER TABLE public.shift_change_requests
  ADD COLUMN IF NOT EXISTS member_note text;

-- 2. End date for multi-day day-off requests.
--    NULL = single day (same as day_off_date).
--    On approval, one is_day_off shift row is created per day in the range.
ALTER TABLE public.shift_change_requests
  ADD COLUMN IF NOT EXISTS day_off_date_end date;

-- 3. Expand shift_change_requests SELECT to include manager role.
DROP POLICY IF EXISTS "requests_select_own_or_admin" ON public.shift_change_requests;
CREATE POLICY "requests_select_own_or_admin" ON public.shift_change_requests
  FOR SELECT USING (
    user_id = auth.uid()
    OR public.get_my_role() IN ('admin', 'owner', 'manager')
  );

-- 4. Expand shift_change_requests UPDATE to include manager role.
DROP POLICY IF EXISTS "requests_admin_update" ON public.shift_change_requests;
CREATE POLICY "requests_admin_update" ON public.shift_change_requests
  FOR UPDATE USING  (public.get_my_role() IN ('admin', 'owner', 'manager'))
  WITH CHECK (public.get_my_role() IN ('admin', 'owner', 'manager'));

-- 5. Expand shifts INSERT / UPDATE / DELETE to include manager.
--    Managers need write access to apply approved requests to the schedule.
DROP POLICY IF EXISTS "shifts_admin_insert" ON public.shifts;
CREATE POLICY "shifts_admin_insert" ON public.shifts
  FOR INSERT WITH CHECK (public.get_my_role() IN ('admin', 'owner', 'manager'));

DROP POLICY IF EXISTS "shifts_admin_update" ON public.shifts;
CREATE POLICY "shifts_admin_update" ON public.shifts
  FOR UPDATE USING  (public.get_my_role() IN ('admin', 'owner', 'manager'))
  WITH CHECK (public.get_my_role() IN ('admin', 'owner', 'manager'));

DROP POLICY IF EXISTS "shifts_admin_delete" ON public.shifts;
CREATE POLICY "shifts_admin_delete" ON public.shifts
  FOR DELETE USING (public.get_my_role() IN ('admin', 'owner', 'manager'));

-- 6. Re-apply grants (idempotent).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shifts                TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shift_change_requests TO authenticated;
