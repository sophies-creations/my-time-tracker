-- ============================================================
-- Migration 010: Client portal RLS hardening + owner fixes
-- Run ONCE in the Supabase SQL Editor. All changes are additive
-- (no data is dropped, only policies replaced).
--
-- SECURITY MODEL (after this migration):
--   clients    → SELECT: only their own client record
--                projects: only explicitly assigned ones
--                time_entries: only entries on assigned projects
--                profiles: read (needed for per-agent view in portal)
--                everything else: no access
--   owner      → full access to clients / client_projects management
--   admin/mgr  → same as before (manage clients + project assignments)
--   member     → no change
-- ============================================================


-- ── 1. Fix: 'owner' was missing from client-management policies ─────────────
--    Without this, the Owner role gets 0 rows on the Clients page.

DROP POLICY IF EXISTS "managers_manage_clients" ON public.clients;
CREATE POLICY "managers_manage_clients" ON public.clients
  FOR ALL USING (public.get_my_role() IN ('owner', 'admin', 'manager'));

DROP POLICY IF EXISTS "managers_manage_client_projects" ON public.client_projects;
CREATE POLICY "managers_manage_client_projects" ON public.client_projects
  FOR ALL USING (public.get_my_role() IN ('owner', 'admin', 'manager'));


-- ── 2. Shifts SELECT: exclude clients ──────────────────────────────────────
--    Migration 006 used `auth.uid() IS NOT NULL` — any authenticated user,
--    including clients, could read all shifts. Fix: scope to team roles only.

DROP POLICY IF EXISTS "shifts_select_authenticated" ON public.shifts;
CREATE POLICY "shifts_select_team" ON public.shifts
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND public.get_my_role() IN ('owner', 'admin', 'manager', 'member')
  );


-- ── 3. Harden time_entries SELECT ──────────────────────────────────────────
--    Drop any general SELECT policies that might exist under common names
--    from the initial schema (IF EXISTS makes each a no-op if absent).
--    Recreate with explicit role restrictions so clients are excluded from
--    the non-client policies.

DROP POLICY IF EXISTS "select_own_entries"                 ON public.time_entries;
DROP POLICY IF EXISTS "users_select_own_entries"           ON public.time_entries;
DROP POLICY IF EXISTS "members_select_own_entries"         ON public.time_entries;
DROP POLICY IF EXISTS "team_member_select_own_entries"     ON public.time_entries;
DROP POLICY IF EXISTS "Enable read access for all users"   ON public.time_entries;
DROP POLICY IF EXISTS "admin_select_all_entries"           ON public.time_entries;
DROP POLICY IF EXISTS "manager_select_all_entries"         ON public.time_entries;
DROP POLICY IF EXISTS "managers_select_all_entries"        ON public.time_entries;

-- Team members see ONLY their own entries.
CREATE POLICY "team_member_select_own_entries" ON public.time_entries
  FOR SELECT USING (
    auth.uid() = user_id
    AND public.get_my_role() IN ('owner', 'admin', 'manager', 'member')
  );

-- Managers, admins, and owners see ALL entries.
CREATE POLICY "managers_select_all_entries" ON public.time_entries
  FOR SELECT USING (
    public.get_my_role() IN ('owner', 'admin', 'manager')
  );

-- Clients: ONLY entries for projects explicitly assigned to them.
-- Their user's profile_id must match a client record that has this project.
DROP POLICY IF EXISTS "client_select_entries" ON public.time_entries;
CREATE POLICY "client_select_entries" ON public.time_entries
  FOR SELECT USING (
    public.get_my_role() = 'client'
    AND project_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM   public.client_projects cp
      JOIN   public.clients         cl ON cl.id = cp.client_id
      WHERE  cp.project_id = time_entries.project_id
        AND  cl.profile_id = auth.uid()
    )
  );


-- ── 4. Harden projects SELECT ───────────────────────────────────────────────
--    Drop any open SELECT policies that may exist from the initial schema,
--    then recreate with explicit role separation.

DROP POLICY IF EXISTS "projects_select"                    ON public.projects;
DROP POLICY IF EXISTS "select_projects"                    ON public.projects;
DROP POLICY IF EXISTS "projects_select_active"             ON public.projects;
DROP POLICY IF EXISTS "team_select_projects"               ON public.projects;
DROP POLICY IF EXISTS "authenticated_select_projects"      ON public.projects;
DROP POLICY IF EXISTS "Enable read access for all users"   ON public.projects;

-- Team members see all non-archived projects.
CREATE POLICY "team_select_projects" ON public.projects
  FOR SELECT USING (
    public.get_my_role() IN ('owner', 'admin', 'manager', 'member')
    AND archived = false
  );

-- Admins/owners also see archived projects (for audit/reports).
CREATE POLICY "admins_select_archived_projects" ON public.projects
  FOR SELECT USING (
    public.get_my_role() IN ('owner', 'admin')
  );

-- Clients: ONLY projects explicitly assigned to them via client_projects.
DROP POLICY IF EXISTS "clients_read_assigned_projects" ON public.projects;
CREATE POLICY "clients_read_assigned_projects" ON public.projects
  FOR SELECT USING (
    public.get_my_role() = 'client'
    AND EXISTS (
      SELECT 1
      FROM   public.client_projects cp
      JOIN   public.clients         cl ON cl.id = cp.client_id
      WHERE  cp.project_id = projects.id
        AND  cl.profile_id = auth.uid()
    )
  );


-- ── 5. Allow clients to read profiles (needed for per-agent breakdown) ──────
--    The portal groups time by agent (team member name). This requires
--    SELECT access to profiles. This policy grants it explicitly rather than
--    relying on whatever the initial schema set up.
--    Scope: read-only; clients cannot insert/update/delete profiles.

DROP POLICY IF EXISTS "clients_read_profiles" ON public.profiles;
CREATE POLICY "clients_read_profiles" ON public.profiles
  FOR SELECT USING (public.get_my_role() = 'client');


-- ── 6. Re-apply grants (idempotent) ────────────────────────────────────────
GRANT SELECT ON public.clients         TO authenticated;
GRANT SELECT ON public.client_projects TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_projects TO authenticated;
