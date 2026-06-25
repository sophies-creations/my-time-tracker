-- ============================================================
-- Migration 013: schedule_hidden flag on profiles
-- Additive only. Run ONCE in the Supabase SQL Editor.
-- ============================================================

-- 1. Add the column. Defaults to false (all rows visible).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS schedule_hidden boolean NOT NULL DEFAULT false;

-- 2. SECURITY DEFINER RPC — the ONLY write path for this flag.
--    Pins the operation to exactly schedule_hidden; no UPDATE policy
--    on profiles is needed or added, avoiding column-level over-permissiveness.
CREATE OR REPLACE FUNCTION public.toggle_schedule_hidden(
  p_user_id uuid,
  p_hidden  boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.get_my_role() NOT IN ('admin', 'owner', 'manager') THEN
    RAISE EXCEPTION 'Only managers and above can toggle row visibility';
  END IF;
  UPDATE public.profiles
     SET schedule_hidden = p_hidden
   WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_schedule_hidden(uuid, boolean) TO authenticated;
