-- ============================================================
-- Migration 015: Admin time-entry management RPCs
-- Additive only — no schema changes, no RLS changes.
-- Run ONCE in Supabase SQL Editor.
-- ============================================================

-- 1. admin_create_time_entry
--    Inserts a finished (is_running=false) entry for any user.
--    Caller may supply EITHER p_end_time (duration is computed from
--    p_start_time → p_end_time) OR p_duration in seconds with
--    p_end_time=NULL. Returns the inserted row.
CREATE OR REPLACE FUNCTION public.admin_create_time_entry(
  p_user_id     uuid,
  p_project_id  uuid,
  p_description text,
  p_start_time  timestamptz,
  p_end_time    timestamptz,
  p_duration    integer,
  p_billable    boolean
)
RETURNS SETOF public.time_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_duration integer;
BEGIN
  IF public.get_my_role() NOT IN ('admin', 'owner') THEN
    RAISE EXCEPTION 'Only admins and owners can manage time entries for other users';
  END IF;

  IF p_end_time IS NOT NULL THEN
    v_duration := EXTRACT(EPOCH FROM (p_end_time - p_start_time))::integer;
  ELSE
    v_duration := p_duration;
  END IF;

  RETURN QUERY
  INSERT INTO public.time_entries (
    user_id, project_id, description,
    start_time, end_time, duration,
    billable, is_running
  ) VALUES (
    p_user_id,
    p_project_id,
    COALESCE(p_description, ''),
    p_start_time,
    p_end_time,
    v_duration,
    COALESCE(p_billable, true),
    false
  )
  RETURNING *;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_create_time_entry(uuid, uuid, text, timestamptz, timestamptz, integer, boolean) TO authenticated;


-- 2. admin_update_time_entry
--    Updates any existing entry by id (same duration-mode logic as above).
--    Returns the updated row; empty result = entry id not found.
CREATE OR REPLACE FUNCTION public.admin_update_time_entry(
  p_entry_id    uuid,
  p_user_id     uuid,
  p_project_id  uuid,
  p_description text,
  p_start_time  timestamptz,
  p_end_time    timestamptz,
  p_duration    integer,
  p_billable    boolean
)
RETURNS SETOF public.time_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_duration integer;
BEGIN
  IF public.get_my_role() NOT IN ('admin', 'owner') THEN
    RAISE EXCEPTION 'Only admins and owners can manage time entries for other users';
  END IF;

  IF p_end_time IS NOT NULL THEN
    v_duration := EXTRACT(EPOCH FROM (p_end_time - p_start_time))::integer;
  ELSE
    v_duration := p_duration;
  END IF;

  RETURN QUERY
  UPDATE public.time_entries SET
    user_id     = p_user_id,
    project_id  = p_project_id,
    description = COALESCE(p_description, ''),
    start_time  = p_start_time,
    end_time    = p_end_time,
    duration    = v_duration,
    billable    = COALESCE(p_billable, true)
  WHERE id = p_entry_id
  RETURNING *;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_time_entry(uuid, uuid, uuid, text, timestamptz, timestamptz, integer, boolean) TO authenticated;


-- 3. admin_delete_time_entry
--    Deletes any entry by id. Returns the deleted row so the caller
--    can confirm it existed; empty result = id not found.
CREATE OR REPLACE FUNCTION public.admin_delete_time_entry(
  p_entry_id uuid
)
RETURNS SETOF public.time_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.get_my_role() NOT IN ('admin', 'owner') THEN
    RAISE EXCEPTION 'Only admins and owners can manage time entries for other users';
  END IF;

  RETURN QUERY
  DELETE FROM public.time_entries
  WHERE id = p_entry_id
  RETURNING *;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_time_entry(uuid) TO authenticated;
