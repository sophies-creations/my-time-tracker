-- Sophiefy — add billable flag to projects
-- Run once in the Supabase SQL Editor. Safe to re-run (IF NOT EXISTS).
-- Default: true (projects are billable unless explicitly marked otherwise,
-- matching Clockify's convention).

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS billable boolean NOT NULL DEFAULT true;
