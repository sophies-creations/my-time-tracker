-- ============================================================
-- Migration 007: Admin email invites via auth.admin.inviteUserByEmail()
-- Run this ONCE in the Supabase SQL Editor, then deploy the
-- invite-team-member Edge Function (see supabase/functions/).
-- ============================================================

-- handle_new_user now also honours a role passed in raw_user_meta_data,
-- but ONLY when the auth user was created via the admin invite API
-- (new.invited_at is set exclusively by that server-side flow — a
-- self-service supabase.auth.signUp() call can never set it, so a client
-- can't spoof options.data.role to grant itself admin/manager).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meta_role   text;
  v_invite_role text;
  v_final_role  text;
BEGIN
  -- Honour a pending legacy token-link invite for this email
  SELECT role INTO v_invite_role
  FROM public.invites
  WHERE lower(email) = lower(new.email)
    AND accepted_at IS NULL
    AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;

  IF new.invited_at IS NOT NULL THEN
    v_meta_role := new.raw_user_meta_data->>'role';
  END IF;

  v_final_role := COALESCE(v_meta_role, v_invite_role, 'member');

  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    v_final_role
  )
  ON CONFLICT (id) DO NOTHING;

  IF v_invite_role IS NOT NULL THEN
    UPDATE public.invites
    SET accepted_at = now()
    WHERE lower(email) = lower(new.email)
      AND accepted_at IS NULL;
  END IF;

  RETURN new;
END;
$$;
