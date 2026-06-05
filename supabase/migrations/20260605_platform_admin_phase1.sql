-- ============================================================
-- TraviXO Platform Admin - Phase 1 Migration
-- Date: 2026-06-05
-- Purpose:
--   Security hardening + cross-tenant read for platform admins.
--
--   IDENTITY MODEL (B1): platform-admin-ness is membership in the
--   dedicated public.platform_admins table, NOT a tenant role. A
--   platform admin is an ordinary public.users row with
--   organization_id = NULL and role = 'member' (a normal,
--   non-privileged tenant role). The role column NEVER carries
--   'super_admin'. All privilege flows through platform_admins.
--
--   Components:
--   1. platform_admins table (membership = admin). RLS on; readable
--      only by admins; no client write path (service-role/SQL only).
--   2. is_super_admin() SECURITY DEFINER helper: true iff auth.uid()
--      is in platform_admins. Single chokepoint every admin policy
--      routes through. (Name kept for call-site stability.)
--   3. Re-assert role-escalation guard on the two users UPDATE
--      policies (with_check role allowlist owner/admin/member/viewer).
--      'super_admin' is absent from the allowlist AND no longer a
--      meaningful value anywhere.
--   4. Cross-tenant SELECT for admins on users + assets.
--   5. Rekey organizations super_admin_all_access through
--      is_super_admin() instead of an inline role check.
--   6. admin_audit_log (empty now, built for Phase 2).
--
-- Notes:
--   - Phase 1 is NOT yet deployed; this is a pre-deploy redefinition,
--     not a live data migration. The accompanying CUTOVER SQL (run
--     separately) moves the chosen admin account into the new model.
--   - Idempotent: safe on a fresh environment and safe to re-run.
--   - No tenant-data writes. No Stripe. No feature_flags.
-- ============================================================

-- ------------------------------------------------------------
-- 0. platform_admins
--    Membership in this table IS the platform-admin grant. There is
--    deliberately NO client INSERT/UPDATE/DELETE policy: with RLS
--    enabled and no permissive write policy, the anon/auth client
--    cannot modify it. Membership is granted out-of-band via the
--    service role / SQL editor (mirrors how super_admin used to be
--    promoted by a privileged UPDATE).
--
--    SELECT is gated by is_super_admin() so only admins can read the
--    admin roster. This does NOT recurse: is_super_admin() is
--    SECURITY DEFINER and reads platform_admins as the function owner,
--    bypassing this very policy. (See the recursion note on the
--    function below.)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_admins (
  user_id    UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform_admins_read_self_admins" ON public.platform_admins;
CREATE POLICY "platform_admins_read_self_admins"
  ON public.platform_admins
  FOR SELECT
  USING (public.is_super_admin());

-- No INSERT / UPDATE / DELETE policy on purpose.

-- ------------------------------------------------------------
-- 1. Helper: is_super_admin()
--    True iff the current auth user is a platform admin (a row in
--    platform_admins). Name and signature are unchanged so every
--    existing caller (super_admin_read_all_users, the audit-log
--    policy, the assets policy, and the rekeyed organizations policy)
--    keeps working without edits.
--
--    SECURITY DEFINER is LOAD-BEARING for two reasons:
--      (a) It bypasses RLS on platform_admins, so the function can be
--          called from inside platform_admins' OWN select policy
--          without infinite recursion.
--      (b) It bypasses RLS on the target tables generally, so admin
--          policies can check membership without the caller needing
--          direct read access to platform_admins.
--    Do NOT remove SECURITY DEFINER.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.platform_admins
    WHERE user_id = auth.uid()
  );
$$;

-- ------------------------------------------------------------
-- 2. Re-assert role-escalation guard (idempotent drop + recreate).
--    Both UPDATE policies constrain the post-update role to the
--    tenant allowlist ('owner','admin','member','viewer'). With the
--    B1 model, 'super_admin' is not a role value at all, so this
--    allowlist also guarantees no client can recreate the old
--    privileged role on a users row. Privilege only ever comes from
--    platform_admins, which the client cannot write.
--
--    Also drop any legacy `users_update_own` policy if present, so
--    there is exactly one own-profile UPDATE path with the guard.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "users_update_own" ON public.users;

-- Own profile: a user may update their own row, but the resulting
-- role must remain inside the tenant allowlist.
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
CREATE POLICY "Users can update own profile"
  ON public.users
  FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND role IN ('owner', 'admin', 'member', 'viewer')
  );

-- Admins managing team members: an org admin/owner may update a
-- team member's role, but only to a value inside the tenant
-- allowlist.
DROP POLICY IF EXISTS "Admins can update team member roles" ON public.users;
CREATE POLICY "Admins can update team member roles"
  ON public.users
  FOR UPDATE
  USING (
    organization_id = public.get_my_organization_id()
    AND EXISTS (
      SELECT 1
      FROM public.users AS me
      WHERE me.id = auth.uid()
        AND me.organization_id = public.users.organization_id
        AND me.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    organization_id = public.get_my_organization_id()
    AND role IN ('owner', 'admin', 'member', 'viewer')
  );

-- ------------------------------------------------------------
-- 3. Cross-tenant SELECT for admins on `users`.
--    ADDITIONAL to the existing own-profile and users_select_same_org
--    policies. Postgres ORs permissive SELECT policies together:
--      - normal users keep own-profile + same-org visibility
--      - admins additionally see every users row
--    Without this, the users-per-org admin view returns empty for
--    orgs the admin does not belong to (and an org-less admin belongs
--    to none).
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "super_admin_read_all_users" ON public.users;
CREATE POLICY "super_admin_read_all_users"
  ON public.users
  FOR SELECT
  USING (public.is_super_admin());

-- ------------------------------------------------------------
-- 4. Cross-tenant SELECT for admins on `assets`.
--    Needed so the admin dashboard's per-org asset counts span all
--    tenants. ADDITIONAL to the existing same-org assets policies
--    (permissive SELECT policies are OR'd). Routes through
--    is_super_admin() like every other admin policy.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "super_admin_read_all_assets" ON public.assets;
CREATE POLICY "super_admin_read_all_assets"
  ON public.assets
  FOR SELECT
  USING (public.is_super_admin());

-- ------------------------------------------------------------
-- 5. Rekey organizations super_admin_all_access through the function.
--    Previously this policy checked role = 'super_admin' inline. In
--    the B1 model that role no longer conveys privilege, so the policy
--    is recreated to route through is_super_admin() for both USING and
--    WITH CHECK. DROP IF EXISTS makes this safe whether or not the
--    production policy already exists.
--
--    This is the admin's ALL-access path to organizations (the admin
--    is org-less, so the normal same-org organizations policy grants
--    them nothing).
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "super_admin_all_access" ON public.organizations;
CREATE POLICY "super_admin_all_access"
  ON public.organizations
  FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- ------------------------------------------------------------
-- 6. admin_audit_log
--    Empty in Phase 1. Built so Phase 2 admin actions can write an
--    append-only trail. RLS enabled; admins may SELECT. No client
--    INSERT policy: writes will be performed by a SECURITY DEFINER
--    routine / service role in Phase 2, never directly by the browser.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id       UUID REFERENCES auth.users (id),
  action         TEXT NOT NULL,
  target_org_id  UUID,
  target_user_id UUID,
  before         JSONB,
  after          JSONB,
  created_at     TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin_read_audit_log" ON public.admin_audit_log;
CREATE POLICY "super_admin_read_audit_log"
  ON public.admin_audit_log
  FOR SELECT
  USING (public.is_super_admin());

-- No INSERT / UPDATE / DELETE policy on purpose. With RLS enabled and
-- no permissive write policy, the anon/auth client cannot write.
-- Phase 2 will add a controlled writer.
