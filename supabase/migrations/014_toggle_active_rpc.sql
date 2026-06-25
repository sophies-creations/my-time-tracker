-- ============================================================
-- Migration 014: toggle_active SECURITY DEFINER RPC
-- Fixes silent-RLS-block on profile active/inactive toggle.
-- Additive only — no schema changes. Run ONCE in Supabase SQL Editor.
-- ============================================================

CREATE OR REPLACE FUNCTION public.toggle_active(
  p_user_id uuid,
  p_active  boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.get_my_role() NOT IN ('admin', 'owner') THEN
    RAISE EXCEPTION 'Only admins and owners can activate or deactivate accounts';
  END IF;
  UPDATE public.profiles SET active = p_active WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_active(uuid, boolean) TO authenticated;
