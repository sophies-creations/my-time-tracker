-- ============================================================
-- Migration 008: Owner role + username-change tracking/requests
-- Run ONCE in the Supabase SQL Editor. All changes are additive.
-- ============================================================

-- 1. Widen the role CHECK constraint to include 'owner'.
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('owner', 'admin', 'manager', 'member', 'client'));

-- 2. Assign Sophie as Owner (must come before the guard trigger is installed).
UPDATE public.profiles
  SET role = 'owner'
  WHERE lower(email) = 'sophiestavrou11@yahoo.com';

-- 3. Guard trigger: only an Owner can assign or remove the 'owner' role.
--    auth.uid() IS NULL means the change comes from a direct SQL session
--    (SQL Editor / migrations) where no JWT is present — skip the guard so
--    the migration itself can run.
CREATE OR REPLACE FUNCTION public.guard_owner_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF (OLD.role = 'owner' OR NEW.role = 'owner')
     AND public.get_my_role() <> 'owner'
  THEN
    RAISE EXCEPTION 'Only an Owner can assign or remove the Owner role'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_owner_role_change_trg ON public.profiles;
CREATE TRIGGER guard_owner_role_change_trg
  BEFORE UPDATE OF role ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_owner_role_change();

-- 4. Extend time_entry policies so 'owner' has the same rights as 'admin'.

DROP POLICY IF EXISTS "admin_update_any_running_entry" ON public.time_entries;
CREATE POLICY "admin_update_any_running_entry" ON public.time_entries
  FOR UPDATE
  USING  (public.get_my_role() IN ('admin', 'owner') AND is_running = true)
  WITH CHECK (public.get_my_role() IN ('admin', 'owner'));

DROP POLICY IF EXISTS "managers_update_stopped_entries" ON public.time_entries;
CREATE POLICY "managers_update_stopped_entries" ON public.time_entries
  FOR UPDATE
  USING  (public.get_my_role() IN ('admin', 'manager', 'owner') AND is_running = false)
  WITH CHECK (public.get_my_role() IN ('admin', 'manager', 'owner'));

DROP POLICY IF EXISTS "managers_delete_any_entry" ON public.time_entries;
CREATE POLICY "managers_delete_any_entry" ON public.time_entries
  FOR DELETE USING (public.get_my_role() IN ('admin', 'manager', 'owner'));

-- Update the project-change guard to allow 'owner'.
CREATE OR REPLACE FUNCTION public.guard_stopped_entry_project_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.is_running = false
     AND NEW.project_id IS DISTINCT FROM OLD.project_id
     AND public.get_my_role() NOT IN ('admin', 'owner')
  THEN
    RAISE EXCEPTION 'Only admins can change the project on a stopped entry'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

-- 5. Set DEFAULT true on time_entries.billable so new inserts that omit
--    the field are recorded as billable (UI concept removed; all time is billable).
ALTER TABLE public.time_entries
  ALTER COLUMN billable SET DEFAULT true;

-- 6. Track how many free username changes a user has consumed.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username_changes_used integer NOT NULL DEFAULT 0;

-- 7. Pending display-name change request table.
CREATE TABLE IF NOT EXISTS public.username_change_requests (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  new_name     text        NOT NULL CHECK (char_length(trim(new_name)) >= 2),
  status       text        NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by  uuid        REFERENCES public.profiles(id),
  reviewed_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.username_change_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ucr_select"       ON public.username_change_requests;
DROP POLICY IF EXISTS "ucr_insert"       ON public.username_change_requests;
DROP POLICY IF EXISTS "ucr_update_admin" ON public.username_change_requests;

-- Users see their own requests; admins/owners see all.
CREATE POLICY "ucr_select" ON public.username_change_requests
  FOR SELECT USING (
    user_id = auth.uid()
    OR public.get_my_role() IN ('admin', 'owner')
  );

-- Anyone authenticated can submit a request for themselves.
CREATE POLICY "ucr_insert" ON public.username_change_requests
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Only admins/owners can approve or reject.
CREATE POLICY "ucr_update_admin" ON public.username_change_requests
  FOR UPDATE USING (public.get_my_role() IN ('admin', 'owner'));

GRANT SELECT, INSERT ON public.username_change_requests TO authenticated;
GRANT UPDATE (status, reviewed_by, reviewed_at) ON public.username_change_requests TO authenticated;

-- 8. RPC: any user calls this to change their own display name.
--    • Admin/Owner   → direct update, unlimited.
--    • Member/Manager, first change  → direct update, sets username_changes_used = 1.
--    • Member/Manager, subsequent    → queues a pending request.
CREATE OR REPLACE FUNCTION public.update_own_username(p_new_name text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_used int;
  v_name text := trim(p_new_name);
BEGIN
  IF char_length(v_name) < 2 THEN
    RAISE EXCEPTION 'Name must be at least 2 characters';
  END IF;

  SELECT role, username_changes_used
    INTO v_role, v_used
    FROM public.profiles
   WHERE id = auth.uid();

  -- Admin/Owner: unlimited, direct.
  IF v_role IN ('admin', 'owner') THEN
    UPDATE public.profiles SET full_name = v_name WHERE id = auth.uid();
    RETURN json_build_object('success', true, 'direct', true);
  END IF;

  -- First change is free for anyone else.
  IF v_used = 0 THEN
    UPDATE public.profiles
       SET full_name = v_name, username_changes_used = 1
     WHERE id = auth.uid();
    RETURN json_build_object('success', true, 'direct', true);
  END IF;

  -- Block if there is already a pending request.
  IF EXISTS (
    SELECT 1 FROM public.username_change_requests
     WHERE user_id = auth.uid() AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'You already have a pending name change request';
  END IF;

  -- Queue a request for admin/owner approval.
  INSERT INTO public.username_change_requests (user_id, new_name)
  VALUES (auth.uid(), v_name);
  RETURN json_build_object('success', true, 'direct', false, 'requested', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_own_username(text) TO authenticated;

-- 9. RPC: admin/owner directly sets any user's display name (no request needed).
CREATE OR REPLACE FUNCTION public.admin_set_display_name(p_user_id uuid, p_new_name text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_name text := trim(p_new_name);
BEGIN
  IF public.get_my_role() NOT IN ('admin', 'owner') THEN
    RAISE EXCEPTION 'Only admins and owners can set other users'' display names';
  END IF;
  IF char_length(v_name) < 2 THEN
    RAISE EXCEPTION 'Name must be at least 2 characters';
  END IF;
  UPDATE public.profiles SET full_name = v_name WHERE id = p_user_id;
  RETURN json_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_display_name(uuid, text) TO authenticated;

-- 10. RPC: admin/owner approves or rejects a pending name-change request.
CREATE OR REPLACE FUNCTION public.review_username_request(p_request_id uuid, p_approve boolean)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req record;
BEGIN
  IF public.get_my_role() NOT IN ('admin', 'owner') THEN
    RAISE EXCEPTION 'Only admins and owners can review username change requests';
  END IF;

  SELECT * INTO v_req
    FROM public.username_change_requests
   WHERE id = p_request_id AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found or already reviewed';
  END IF;

  IF p_approve THEN
    UPDATE public.profiles SET full_name = v_req.new_name WHERE id = v_req.user_id;
    UPDATE public.username_change_requests
       SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
     WHERE id = p_request_id;
  ELSE
    UPDATE public.username_change_requests
       SET status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now()
     WHERE id = p_request_id;
  END IF;

  RETURN json_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.review_username_request(uuid, boolean) TO authenticated;
