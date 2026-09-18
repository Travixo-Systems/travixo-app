-- ============================================================================
-- A0: users tenant-move invariant  (C-1 hotfix, partial)
-- ============================================================================
--
-- WHAT THIS CLOSES
--
--   A normal signed-in session can currently rewrite its own public.users row's
--   organization_id and role. Confirmed at runtime on a local reconstruction of
--   the live schema (V1, V2, V2b, 2026-09-16), and the policy that permits it is
--   confirmed byte-identical in production.
--
--   The permitting policy is:
--
--     CREATE POLICY "Users can update own profile" ON public.users
--       FOR UPDATE USING (id = auth.uid())
--       WITH CHECK ((id = auth.uid()) AND role IN ('owner','admin','member','viewer'));
--
--   The WITH CHECK validates that role is a MEMBER OF THE ENUM, not that it is
--   UNCHANGED, and it does not constrain organization_id at all. So:
--
--     UPDATE users SET role='owner', organization_id='<victim org>' WHERE id=auth.uid();
--
--   succeeds, and because get_my_organization_id() reads that column and every
--   tenant policy in the database routes through it, the caller then passes every
--   isolation check as an owner of a tenant they do not belong to.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--
--   No policy is altered. No grant is changed. This is additive only, so it can
--   be reverted by dropping two objects and nothing else moves.
--
--   The full remediation (Patch A) revokes the table-wide UPDATE grant and
--   re-grants a column subset, which is the mechanism that actually makes the
--   update surface narrow. This migration is the containment step that can ship
--   ahead of it without touching the permission model.
--
--   Consequently the update-surface gate still FAILS after this migration.
--   That is expected: A0 fixes no grants. The trigger blocks the write at
--   execution time; the grant that permits it is still there.
--
-- WHY A TRIGGER AND NOT A POLICY
--
--   RLS is row-level. A policy can say "you may write this row"; it cannot say
--   "you may write this row but not these two columns". A BEFORE UPDATE trigger
--   can compare OLD to NEW, which is exactly the comparison the broken
--   WITH CHECK fails to make.
--
-- SECURITY INVOKER, ON PURPOSE
--
--   The function must observe the CALLER's current_user to decide whether the
--   invariant applies. SECURITY DEFINER would make current_user the owner on
--   every call and the guard would never fire. search_path is pinned regardless,
--   per the project convention in docs/working-agreements.md.
--
-- WHO IS EXEMPT, AND WHY THAT IS CORRECT
--
--   The guard applies only when current_user IN ('anon','authenticated') -- the
--   two roles a browser or PostgREST request actually runs as. Verified writers:
--
--     app/api/team/invitations/accept/route.ts:132  service_role     exempt
--     create_organization_and_user()                SECURITY DEFINER exempt (and INSERT)
--     app/api/team/route.ts:291  role change        authenticated    allowed: OLD.id <> auth.uid()
--     app/api/team/route.ts:415  member removal     authenticated    allowed: org -> NULL, OLD.id <> auth.uid()
--     app/(dashboard)/team/page.tsx:277             authenticated    allowed: targets another member
--     app/(dashboard)/team/page.tsx:299             authenticated    allowed: org -> NULL
--     app/api/settings/profile/route.ts:125         authenticated    unaffected (writes neither column)
--     app/api/uploadthing/core.ts:159               authenticated    unaffected (writes avatar_url)
--
--   Both /api/team paths reject memberId === user.id before reaching the write
--   (route.ts:251 and route.ts:374), so OLD.id <> auth.uid() is guaranteed there
--   and the self-edit clause never fires on them.
--
-- Rollback SQL is at the foot of this file.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_users_identity_invariant()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY INVOKER
  -- pg_catalog first so built-ins resolve ahead of anything in public.
  SET search_path TO 'pg_catalog', 'public'
  AS $function$
BEGIN
  -- Only constrain sessions that arrive through PostgREST as a browser client.
  -- service_role, postgres and SECURITY DEFINER contexts are trusted here
  -- because they are already gated by application authorization.
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  -- (1) Self-edit: neither authority column may change.
  --     IS DISTINCT FROM so NULL transitions are caught too.
  IF OLD.id = auth.uid() THEN
    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
      RAISE EXCEPTION
        'users_identity_invariant: a session may not change its own organization_id (attempted % -> %). Tenant membership is assigned by invitation acceptance or signup, both of which run with elevated privileges.',
        OLD.organization_id, NEW.organization_id
        USING ERRCODE = '42501';
    END IF;

    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION
        'users_identity_invariant: a session may not change its own role (attempted % -> %). Role changes go through /api/team, which enforces the owner and admin rules.',
        OLD.role, NEW.role
        USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
  END IF;

  -- (2) Any other row: organization_id may only be cleared, never reassigned.
  --     This is the member-removal path (org -> NULL). Moving a row from one
  --     tenant to another is never a legitimate authenticated operation.
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
     AND NEW.organization_id IS NOT NULL THEN
    RAISE EXCEPTION
      'users_identity_invariant: organization_id may only be set to NULL by a session (attempted % -> %). Assigning a user to an organization requires invitation acceptance.',
      OLD.organization_id, NEW.organization_id
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.enforce_users_identity_invariant() IS
  'A0 (C-1 containment). Blocks self-service tenant moves and self role changes '
  'for anon/authenticated sessions. SECURITY INVOKER so current_user reflects the '
  'caller. Does not alter any policy or grant; the update-surface gate still fails '
  'until Patch A narrows the column grants.';

-- No caller should be able to invoke this directly. A trigger function is
-- executed by the trigger machinery as the table owner regardless of EXECUTE
-- grants, so revoking here does NOT disable the trigger -- it only removes the
-- pointless direct-call surface. Supabase default privileges grant EXECUTE on
-- every new function in public to anon, and REVOKE ... FROM PUBLIC does not
-- undo that (PUBLIC and anon are different grantees), so anon and authenticated
-- are named explicitly. See docs/working-agreements.md.
REVOKE ALL ON FUNCTION public.enforce_users_identity_invariant()
  FROM PUBLIC, anon, authenticated;

-- Idempotent: safe to re-run, and makes the rollback/reapply cycle clean.
DROP TRIGGER IF EXISTS zz_enforce_users_identity_invariant ON public.users;

-- Name sorts after update_users_updated_at so the timestamp is already set when
-- this runs; ordering does not affect the comparison either way.
CREATE TRIGGER zz_enforce_users_identity_invariant
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_users_identity_invariant();

COMMIT;

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- Reverts this migration completely. Nothing else is touched, because this
-- migration adds only these two objects.
--
--   BEGIN;
--   DROP TRIGGER IF EXISTS zz_enforce_users_identity_invariant ON public.users;
--   DROP FUNCTION IF EXISTS public.enforce_users_identity_invariant();
--   COMMIT;
--
-- After rolling back, C-1 is fully open again (V1, V2, V2b all succeed).
-- ============================================================================
