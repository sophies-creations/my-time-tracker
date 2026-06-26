-- ============================================================
-- Migration 017: avatar_url on profiles
-- Additive only. Run ONCE in Supabase SQL Editor.
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_url text;
