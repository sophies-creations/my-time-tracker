-- Add visibility column to projects (public / private)
-- Run this in the Supabase SQL Editor.

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'public'
  CHECK (visibility IN ('public', 'private'));
