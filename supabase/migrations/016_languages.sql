-- ============================================================
-- Migration 016: Add languages column to profiles
-- Additive only — no existing columns or policies changed.
-- Run ONCE in Supabase SQL Editor.
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS languages text[] NOT NULL DEFAULT '{}';
