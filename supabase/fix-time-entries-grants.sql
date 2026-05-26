-- ============================================================
-- Fix time_entries + time_entry_tags grants and RLS
-- Safe to run multiple times.
-- ============================================================

GRANT USAGE ON SCHEMA public TO authenticated;

-- Table-level grants (this is what actually unblocks PostgREST)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.time_entries    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.time_entry_tags TO authenticated;

-- Make sure RLS is on
ALTER TABLE public.time_entries    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_entry_tags ENABLE ROW LEVEL SECURITY;

-- ---- time_entries policies ----
DROP POLICY IF EXISTS "select_own_entries"          ON public.time_entries;
DROP POLICY IF EXISTS "managers_select_all_entries" ON public.time_entries;
DROP POLICY IF EXISTS "client_select_entries"       ON public.time_entries;
DROP POLICY IF EXISTS "insert_own_entries"          ON public.time_entries;
DROP POLICY IF EXISTS "update_own_entries"          ON public.time_entries;
DROP POLICY IF EXISTS "delete_own_entries"          ON public.time_entries;
DROP POLICY IF EXISTS "admin_delete_any_entry"      ON public.time_entries;

-- Users see their own entries
CREATE POLICY "select_own_entries" ON public.time_entries
  FOR SELECT USING (auth.uid() = user_id);

-- Admins and managers see all entries
CREATE POLICY "managers_select_all_entries" ON public.time_entries
  FOR SELECT USING (public.get_my_role() IN ('admin', 'manager'));

-- Client portal: see entries for their assigned projects
CREATE POLICY "client_select_entries" ON public.time_entries
  FOR SELECT USING (
    public.get_my_role() = 'client'
    AND project_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.client_projects cp
      JOIN  public.clients cl ON cl.id = cp.client_id
      WHERE cp.project_id = time_entries.project_id
        AND cl.profile_id = auth.uid()
    )
  );

-- Insert own entries only
CREATE POLICY "insert_own_entries" ON public.time_entries
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Update own entries only
CREATE POLICY "update_own_entries" ON public.time_entries
  FOR UPDATE USING (auth.uid() = user_id);

-- Delete own entries; admins can delete any
CREATE POLICY "delete_own_entries" ON public.time_entries
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "admin_delete_any_entry" ON public.time_entries
  FOR DELETE USING (public.get_my_role() = 'admin');

-- ---- time_entry_tags policies ----
DROP POLICY IF EXISTS "authenticated_read_entry_tags" ON public.time_entry_tags;
DROP POLICY IF EXISTS "manage_own_entry_tags"         ON public.time_entry_tags;
DROP POLICY IF EXISTS "insert_own_entry_tags"         ON public.time_entry_tags;
DROP POLICY IF EXISTS "delete_own_entry_tags"         ON public.time_entry_tags;

-- Any authenticated user can read tags (needed for joins in Tracker)
CREATE POLICY "authenticated_read_entry_tags" ON public.time_entry_tags
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Insert tags only for your own time entries
CREATE POLICY "insert_own_entry_tags" ON public.time_entry_tags
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.time_entries te
      WHERE te.id = time_entry_id AND te.user_id = auth.uid()
    )
  );

-- Delete tags only for your own time entries
CREATE POLICY "delete_own_entry_tags" ON public.time_entry_tags
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.time_entries te
      WHERE te.id = time_entry_id AND te.user_id = auth.uid()
    )
  );
