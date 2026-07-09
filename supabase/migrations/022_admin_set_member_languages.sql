-- ============================================================
-- Migration 022: RPC — admin/owner sets any member's languages
-- Additive only — no RLS policy changes. Mirrors the existing
-- owner_set_team / toggle_schedule_hidden SECURITY DEFINER pattern:
-- privileged column writes go through a role-gated RPC rather than
-- widening the profiles UPDATE policy.
-- Run ONCE in the Supabase SQL Editor.
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_set_member_languages(p_user_id uuid, p_languages text[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.get_my_role() NOT IN ('admin', 'owner') THEN
    RAISE EXCEPTION 'Only admins and owners can set another member''s languages';
  END IF;
  UPDATE public.profiles SET languages = COALESCE(p_languages, '{}') WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_member_languages(uuid, text[]) TO authenticated;
