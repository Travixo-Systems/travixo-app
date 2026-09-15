-- Platform-admin cross-tenant READ on the nine operational tables.
--
-- ---------------------------------------------------------------------------
-- THE DEFECT THIS FIXES, STATED AS MEASURED
-- ---------------------------------------------------------------------------
--
-- Under the B1 identity model (lib/auth/requireSuperAdmin.ts:4-8) a platform
-- admin is a row in public.platform_admins and their public.users row carries
-- organization_id = NULL. Both live admins are in exactly that state.
--
-- Every table below had ONE SELECT policy, shaped:
--
--   USING (organization_id IN (SELECT organization_id FROM users
--                              WHERE id = auth.uid()))
--
-- For an org-less admin that subquery yields NULL, and `x IN (NULL)` is never
-- true. The read returns ZERO ROWS AND NO ERROR. Measured 2026-09-15 by
-- minting a real session for travixosystems@gmail.com and reading each table
-- through the anon key (the client lib/supabase/server.ts hands every admin
-- page), beside the same read as service_role:
--
--   table                    service_role   as platform admin
--   vgp_inspections          733            0
--   vgp_schedules            625            0
--   rentals                  146            0
--   vgp_alerts               20697          0
--   vgp_digest_deliveries    2              0
--   clients                  56             0
--   subscriptions            19             0
--   billing_events           4              0
--   scans                    344            0
--
-- is_super_admin() returned true throughout. The guard was never the problem;
-- the absence of a policy was. Only four tables ever received a super_admin
-- policy (assets, organizations, users, admin_audit_log, in
-- 20260605100000_platform_admin_phase1.sql). These nine were missed.
--
-- A read returning zero because it cannot see is worse than no read at all: on
-- /admin/evidence it rendered as a green "nothing wrong here" line over 733
-- live inspections. The detector was reporting on data it was structurally
-- incapable of observing.
--
-- ---------------------------------------------------------------------------
-- SCOPE, DELIBERATELY NARROW
-- ---------------------------------------------------------------------------
--
-- SELECT only. No INSERT, UPDATE or DELETE, and no WITH CHECK anywhere: the
-- admin console is read-only over operational data, and the four existing
-- write paths (extend_trial, end_pilot, set_feature_flag, admin_mark_paid) go
-- through SECURITY DEFINER functions that re-check is_super_admin()
-- themselves. Nothing here grants a write.
--
-- Additive only. No existing policy is altered or dropped. RLS is permissive
-- by default, so each new policy ORs with the tenant policy already there:
-- a tenant user's visibility is byte-for-byte unchanged, and only a
-- platform_admins member gains anything.
--
-- Gated on public.is_super_admin(), the same SECURITY DEFINER chokepoint the
-- four existing super_admin policies use. One predicate, one place to revoke.
--
-- TO PUBLIC mirrors super_admin_read_all_assets exactly. It is not a grant to
-- anonymous callers: is_super_admin() reads auth.uid(), which is NULL without
-- a session, so the predicate is false for anon regardless of role.

-- vgp_inspections: 733 rows. The evidence surface's primary subject.
CREATE POLICY "super_admin_read_all_vgp_inspections" ON public.vgp_inspections
  FOR SELECT
  TO PUBLIC
  USING (public.is_super_admin());

-- vgp_schedules: 625 rows. D1 and D3 both join through it.
CREATE POLICY "super_admin_read_all_vgp_schedules" ON public.vgp_schedules
  FOR SELECT
  TO PUBLIC
  USING (public.is_super_admin());

-- rentals: 146 rows (114 active). D3's population.
CREATE POLICY "super_admin_read_all_rentals" ON public.rentals
  FOR SELECT
  TO PUBLIC
  USING (public.is_super_admin());

-- vgp_alerts: 20697 rows. The deliveries area reads sent/queued/failed here.
CREATE POLICY "super_admin_read_all_vgp_alerts" ON public.vgp_alerts
  FOR SELECT
  TO PUBLIC
  USING (public.is_super_admin());

-- vgp_digest_deliveries: 2 rows. Note its tenant policy is user_id = auth.uid(),
-- not an organization_id comparison, so an admin saw only their own -- which is
-- none, since neither admin has ever received a digest.
CREATE POLICY "super_admin_read_all_vgp_digest_deliveries" ON public.vgp_digest_deliveries
  FOR SELECT
  TO PUBLIC
  USING (public.is_super_admin());

-- clients: 56 rows.
CREATE POLICY "super_admin_read_all_clients" ON public.clients
  FOR SELECT
  TO PUBLIC
  USING (public.is_super_admin());

-- subscriptions: 19 rows. licensed_capacity lives here, and the org detail
-- billing panel computes the published price from it.
CREATE POLICY "super_admin_read_all_subscriptions" ON public.subscriptions
  FOR SELECT
  TO PUBLIC
  USING (public.is_super_admin());

-- billing_events: 4 rows. Read-only history behind the billing summary.
CREATE POLICY "super_admin_read_all_billing_events" ON public.billing_events
  FOR SELECT
  TO PUBLIC
  USING (public.is_super_admin());

-- scans: 344 rows. Identity-leg evidence (an asset that is scanned is an asset
-- whose QR is in use).
CREATE POLICY "super_admin_read_all_scans" ON public.scans
  FOR SELECT
  TO PUBLIC
  USING (public.is_super_admin());

COMMENT ON POLICY "super_admin_read_all_vgp_inspections" ON public.vgp_inspections
  IS 'Platform admins are org-less, so the tenant policy returns zero rows with no error for them. Read-only cross-tenant SELECT for the admin console.';
