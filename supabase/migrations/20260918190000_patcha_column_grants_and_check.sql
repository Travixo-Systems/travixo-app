-- ============================================================================
-- Patch A: column-level UPDATE grants on users and organizations  (C-1, C-2)
-- ============================================================================
--
-- WHAT THIS CLOSES
--
--   C-2, and the permission half of C-1. Both tables carry a table-wide UPDATE
--   grant and there are NO column-level ACLs anywhere in the schema, so every
--   column of both tables is writable by anon and by authenticated:
--
--     GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE,
--           UPDATE ON TABLE public.users         TO anon, authenticated, ...
--     GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE,
--           UPDATE ON TABLE public.organizations TO anon, authenticated, ...
--
--   users = 11/11 columns writable. organizations = 35/35.
--
--   Confirmed at runtime (V3, V3b): a `viewer` set converted_to_paid = true and
--   raised licensed_capacity. Those are exactly the columns
--   lib/server/require-write-access.ts:58 reads to decide paid status, so the
--   paywall unlocked itself.
--
-- WHY GRANTS AND NOT ONLY A POLICY
--
--   RLS is row-level. A policy can say "you may write this row"; it cannot say
--   "you may write this row but not these columns". Column-level GRANTs can.
--   The policy fix below states the intent readably; the grant is the hard
--   boundary. Both ship together.
--
--   A0 (20260916133224) stays in place as defence in depth. It blocks the same
--   two writes at execution time; this migration removes the permission that
--   let them be attempted at all.
--
-- ALLOWLIST DECISIONS, and why each denial is a denial
--
--   users -- 5 allowed:
--     first_name, last_name, avatar_url, language          profile, user-owned
--     -- DENIED --
--     role              C-1 self-promotion. /api/team owns role changes.
--     organization_id   C-1 tenant escape. Every tenant policy routes through
--                       this column via get_my_organization_id().
--     id                identity; FK to auth.users.
--     email             owned by auth.users; changed via auth.updateUser().
--     created_at        immutable.
--     updated_at        maintained by trigger update_users_updated_at
--                       (BEFORE UPDATE, update_updated_at_column()). A client
--                       write is redundant and the trigger overwrites it.
--     full_name         NOT derived -- checked. It is written once at signup
--                       (confirm/page.tsx:126, signup/page.tsx:99) and read as
--                       a legacy fallback. No authenticated path updates it:
--                       /api/settings/profile allowlists first_name, last_name,
--                       email, avatar_url, language and never touches it. So
--                       nothing legitimate needs the grant.
--
--   organizations -- 16 allowed:
--     name, logo_url, website, phone, address, city, postal_code, country,
--     timezone, currency, industry_sector, company_size,
--     branding_colors, notification_preferences,
--     vgp_alerts_enabled, vgp_alert_days
--     -- DENIED --
--     converted_to_paid, is_pilot, pilot_start_date, pilot_end_date,
--     trial_ends_at, subscription_tier, subscription_status
--                       C-2 billing authority. Stripe webhook (service role)
--                       and the admin SECURITY DEFINER RPCs only.
--     stripe_customer_id  written by the webhook.
--     feature_flags     set_feature_flag() only, super-admin gated.
--     demo_alert_sent, welcome_email_sent, demo_data_seeded
--                       one-shot server claim flags; a client write breaks the
--                       claim guard that makes them one-shot.
--     siret             company registration identity, not a preference.
--     onboarding_completed  moved behind an API route in this same patch;
--                       see app/api/settings/onboarding/route.ts.
--     id, slug, created_at, pilot_notes   identity or staff-only.
--     updated_at        maintained by trigger update_organizations_updated_at.
--
-- REVOKING anon ENTIRELY -- verified safe
--
--   Nothing reads either table as anon. Every read site is inside an
--   authenticated branch, checked individually:
--
--     app/scan/[qr_code]/page.tsx:205   inside `if (user)` in checkAuth().
--                                       Anonymous scanners use get_asset_by_qr,
--                                       a SECURITY DEFINER function that needs
--                                       no anon SELECT on either table.
--     app/(auth)/confirm/page.tsx       after verifyOtp() + getUser().
--     app/(auth)/login/page.tsx         after signInWithPassword().
--     app/api/scan/update/route.ts      inside the isUpdateRequest auth branch.
--
--   subscription_plans is the only table intentionally readable by anon
--   (public pricing) and is not touched here.
--
-- Rollback SQL is at the foot of this file.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. anon loses everything on both tables.
-- ---------------------------------------------------------------------------
REVOKE ALL ON TABLE public.users         FROM anon;
REVOKE ALL ON TABLE public.organizations FROM anon;

-- ---------------------------------------------------------------------------
-- 2. authenticated loses the table-wide write verbs.
--    SELECT, INSERT and DELETE are left as they are: this migration is about
--    the UPDATE surface, and changing the others would alter behaviour beyond
--    C-1/C-2 in the same change.
-- ---------------------------------------------------------------------------
REVOKE UPDATE, TRUNCATE, TRIGGER, REFERENCES, MAINTAIN
  ON TABLE public.users         FROM authenticated;
REVOKE UPDATE, TRUNCATE, TRIGGER, REFERENCES, MAINTAIN
  ON TABLE public.organizations FROM authenticated;

-- ---------------------------------------------------------------------------
-- 3. Per-column UPDATE, authenticated only.
-- ---------------------------------------------------------------------------
GRANT UPDATE (
  first_name,
  last_name,
  avatar_url,
  language
) ON TABLE public.users TO authenticated;

GRANT UPDATE (
  name,
  logo_url,
  website,
  phone,
  address,
  city,
  postal_code,
  country,
  timezone,
  currency,
  industry_sector,
  company_size,
  branding_colors,
  notification_preferences,
  vgp_alerts_enabled,
  vgp_alert_days
) ON TABLE public.organizations TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. The policy fix.
--
--    The existing WITH CHECK validates that role is a MEMBER OF THE ENUM --
--    and 'owner' is in that list -- rather than that it is UNCHANGED, and does
--    not constrain organization_id at all:
--
--      WITH CHECK ((id = auth.uid()) AND role IN ('owner','admin','member','viewer'))
--
--    Replaced with an equality test against the caller's CURRENT values.
--
--    get_my_role() is added as a SECURITY DEFINER helper for the same reason
--    get_my_organization_id() already exists and is already used inside the
--    "Admins can update team member roles" policy on this very table: a policy
--    on public.users that queries public.users directly re-enters policy
--    evaluation and can raise
--      infinite recursion detected in policy for relation "users"
--    A SECURITY DEFINER function reads the table without re-triggering RLS.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_role()
  RETURNS text
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$ SELECT role::text FROM public.users WHERE id = auth.uid() $function$;

COMMENT ON FUNCTION public.get_my_role() IS
  'Returns the calling user''s role, read without re-triggering RLS. Sibling of '
  'get_my_organization_id(). Exists so a policy on public.users can compare a '
  'NEW value against the caller''s current role without recursive policy '
  'evaluation.';

-- Supabase default privileges grant EXECUTE on every new function in public to
-- anon, and REVOKE ... FROM PUBLIC does not undo that -- PUBLIC and anon are
-- different grantees. anon is named explicitly.
REVOKE ALL     ON FUNCTION public.get_my_role() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_my_role() TO authenticated;

ALTER POLICY "Users can update own profile" ON public.users
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND role::text      IS NOT DISTINCT FROM public.get_my_role()
    AND organization_id IS NOT DISTINCT FROM public.get_my_organization_id()
  );

COMMIT;

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- Restores the pre-Patch-A grants and policy exactly. NOTE: rolling back
-- reopens C-2 -- any member can rewrite billing state again -- and returns
-- users.role and users.organization_id to the writable set. A0's trigger would
-- still block the self-edit path, but the permission would be back.
--
--   BEGIN;
--   GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
--     ON TABLE public.users         TO anon, authenticated;
--   GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
--     ON TABLE public.organizations TO anon, authenticated;
--   ALTER POLICY "Users can update own profile" ON public.users
--     USING (id = auth.uid())
--     WITH CHECK (
--       id = auth.uid()
--       AND role::text = ANY (ARRAY['owner','admin','member','viewer'])
--     );
--   DROP FUNCTION IF EXISTS public.get_my_role();
--   COMMIT;
--
-- Column-level grants do not need explicit revoking: a table-wide GRANT UPDATE
-- supersedes them. Verify after rollback with
--   SELECT relacl FROM pg_class WHERE relname = 'users';
-- ============================================================================
