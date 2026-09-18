-- ============================================================================
-- H-5: create_organization_and_user() binds the new profile to auth.uid()
-- ============================================================================
--
-- WHAT THIS CLOSES
--
--   The function is SECURITY DEFINER and inserts:
--
--     INSERT INTO public.users (id, email, full_name, organization_id, role)
--     VALUES (p_user_id, p_user_email, p_user_full_name, v_org_id, 'owner');
--
--   p_user_id is a caller-supplied argument and was never compared to
--   auth.uid(). Reproduced locally (V7, 2026-09-18): an authenticated caller in
--   org A created an organisation and installed a DIFFERENT auth account as its
--   owner, with role='owner' written every time.
--
--   Impact, stated precisely. The caller gains NO access to the organisation
--   they create -- they are not a member of it, and they cannot read it. The
--   damage is to the VICTIM:
--
--     * A registration denial-of-service. An attacker who knows a pending
--       signup's auth.users id binds that account to an attacker-named
--       organisation first. When the victim later confirms their email, their
--       real signup fails with 23505 and they are left owning an organisation
--       whose name and slug the attacker chose.
--     * An unauthorised users row with role='owner' in that organisation.
--
--   Target ids ARE obtainable in-app: public.users.id is a foreign key to
--   auth.users(id) (the same value), and /api/team plus the team page return
--   select('*') over same-org users, so every member can read every
--   colleague's id.
--
-- WHAT THE DEFECT IS NOT
--
--   Recorded because the reverse would be far worse, and it was tested:
--
--     * The victim's row does NOT move. public.users has a plain INSERT with no
--       ON CONFLICT and users_pkey on id, so a target that already has a row
--       collides. Verified: member-b, active in org B, stayed in org B with
--       role=member after a spoofed call (23505).
--     * No orphaned organisation survives a failed call. The body is one
--       implicit transaction; verified over real HTTP -- POST returned 409 and
--       the organisations count was unchanged.
--     * anon cannot reach it in production. The live grant is
--       authenticated/postgres/service_role. (The local CLI stack DOES grant
--       anon, which is why an unauthenticated exploit reproduces there and not
--       in production -- do not read a local anon result as a production one.)
--
-- THE FIX
--
--   Derive the profile id from auth.uid(). p_user_id is kept so the signature
--   is unchanged and no overload is created, but it is ignored.
--
--   Safe for signup because a session already exists at the call site:
--   app/(auth)/confirm/page.tsx:138 runs verifyOtp() -> getUser() ->
--   createOrgForUser(supabase, verifiedUser), and passes verifiedUser.id --
--   which IS auth.uid(). The fix is behaviour-preserving there, not a rewrite.
--
--   Two further corrections in the same patch:
--
--     * A NULL auth.uid() (no session) previously reached the INSERT and would
--       fail on the users.id NOT NULL / FK constraint with an opaque error. It
--       is now refused up front with a named raise.
--     * A caller who already has a profile previously surfaced a raw 23505
--       duplicate-key error through PostgREST. It is now a named raise, so the
--       API returns something meaningful instead of leaking a constraint name.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--
--   No policy is altered. The organisation INSERT and the subscription INSERT
--   are untouched, so the 30-day pilot window and the trialing subscription
--   behave exactly as before.
--
-- GRANTS
--
--   authenticated only. Verified before revoking service_role that no service
--   client and no seed script calls this function:
--
--     app/(auth)/confirm/page.tsx:138        browser, anon key + session -> authenticated
--     scripts/verify-live-trial-length.mjs:92 anon apikey + user Bearer   -> authenticated
--
--   That script does hold the service key, but uses it only for GoTrue admin
--   calls (/auth/v1/admin/users) to create and delete its probe account; the
--   RPC itself goes through as authenticated. REVOKE names service_role and
--   postgres explicitly, because REVOKE strips only the roles it names and
--   CREATE OR REPLACE preserves the existing ACL -- the lesson from B0, whose
--   first migration left service_role in place.
--
-- Rollback SQL is at the foot of this file.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.create_organization_and_user (
  p_org_name       text,
  p_org_slug       text,
  p_user_id        uuid,
  p_user_email     text,
  p_user_full_name text
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
DECLARE
  v_org_id   UUID;
  v_plan_id  UUID;
  -- H-5: the profile is bound to the CALLER. p_user_id is ignored.
  v_actor    UUID := auth.uid();
BEGIN
  -- H-5: no session, no signup. Previously a NULL id reached the INSERT and
  -- failed on a constraint with an opaque message.
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'signup_requires_session: create_organization_and_user must be called with an authenticated session; the profile is bound to auth.uid().'
      USING ERRCODE = '42501';
  END IF;

  -- H-5: a caller who already has a profile cannot create a second one. This
  -- previously surfaced as a raw 23505 duplicate-key error through PostgREST,
  -- leaking the constraint name; it is now named and intentional.
  IF EXISTS (SELECT 1 FROM public.users WHERE id = v_actor) THEN
    RAISE EXCEPTION 'signup_already_completed: this account already has a profile and cannot create another organisation.'
      USING ERRCODE = '23505';
  END IF;

  -- Create organization with pilot fields
  INSERT INTO public.organizations (
    name, slug, subscription_tier, subscription_status,
    is_pilot, pilot_start_date, pilot_end_date, trial_ends_at
  ) VALUES (
    p_org_name,
    p_org_slug,
    'travixo',
    'trialing',
    true,
    NOW(),
    NOW() + INTERVAL '30 days',
    NOW() + INTERVAL '30 days'
  )
  RETURNING id INTO v_org_id;

  -- Create user profile linked to org.
  -- H-5: id and email come from the session, never from the arguments.
  INSERT INTO public.users (id, email, full_name, organization_id, role)
  VALUES (
    v_actor,
    COALESCE((SELECT u.email FROM auth.users u WHERE u.id = v_actor), p_user_email),
    p_user_full_name,
    v_org_id,
    'owner'
  );

  -- The single plan row
  SELECT id INTO v_plan_id
  FROM public.subscription_plans
  WHERE slug = 'travixo'
  LIMIT 1;

  -- Create subscription (trialing; the pilot window grants access)
  IF v_plan_id IS NOT NULL THEN
    INSERT INTO public.subscriptions (
      organization_id, plan_id, status,
      current_period_start, current_period_end,
      trial_start, trial_end
    ) VALUES (
      v_org_id, v_plan_id, 'trialing',
      NOW(), NOW() + INTERVAL '30 days',
      NOW(), NOW() + INTERVAL '30 days'
    )
    ON CONFLICT (organization_id) DO NOTHING;
  END IF;

  RETURN v_org_id;
END;
$function$;

COMMENT ON FUNCTION public.create_organization_and_user(text, text, uuid, text, text) IS
  'Signup: creates the org, owner profile and trialing subscription. H-5: the '
  'profile is bound to auth.uid(); p_user_id is accepted for signature '
  'compatibility but IGNORED. Refuses without a session, and refuses a caller '
  'that already has a profile. Pilot window is 30 days -- must match '
  'PILOT_FULL_DAYS in lib/billing/pilot-window.ts and the "30-day trial" claim '
  'on the website. No feature grants: one plan carries every feature.';

-- authenticated only. service_role and postgres are named explicitly because
-- REVOKE strips only the roles it names and CREATE OR REPLACE preserves the
-- existing ACL.
REVOKE ALL ON FUNCTION public.create_organization_and_user(text, text, uuid, text, text)
  FROM PUBLIC, anon, service_role, postgres;
GRANT EXECUTE ON FUNCTION public.create_organization_and_user(text, text, uuid, text, text)
  TO authenticated;

COMMIT;

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- Restores the pre-H-5 body and grants. NOTE: rolling back reopens the spoofed
-- p_user_id path -- an authenticated caller can again install another account
-- as owner of a new organisation.
--
--   BEGIN;
--   CREATE OR REPLACE FUNCTION public.create_organization_and_user (
--     p_org_name text, p_org_slug text, p_user_id uuid,
--     p_user_email text, p_user_full_name text
--   ) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
--     SET search_path TO 'public','pg_temp' AS $rb$
--   DECLARE v_org_id UUID; v_plan_id UUID;
--   BEGIN
--     INSERT INTO public.organizations (
--       name, slug, subscription_tier, subscription_status,
--       is_pilot, pilot_start_date, pilot_end_date, trial_ends_at
--     ) VALUES (p_org_name, p_org_slug, 'travixo', 'trialing', true,
--       NOW(), NOW() + INTERVAL '30 days', NOW() + INTERVAL '30 days')
--     RETURNING id INTO v_org_id;
--     INSERT INTO public.users (id, email, full_name, organization_id, role)
--     VALUES (p_user_id, p_user_email, p_user_full_name, v_org_id, 'owner');
--     SELECT id INTO v_plan_id FROM public.subscription_plans
--      WHERE slug = 'travixo' LIMIT 1;
--     IF v_plan_id IS NOT NULL THEN
--       INSERT INTO public.subscriptions (
--         organization_id, plan_id, status, current_period_start,
--         current_period_end, trial_start, trial_end
--       ) VALUES (v_org_id, v_plan_id, 'trialing', NOW(),
--         NOW() + INTERVAL '30 days', NOW(), NOW() + INTERVAL '30 days')
--       ON CONFLICT (organization_id) DO NOTHING;
--     END IF;
--     RETURN v_org_id;
--   END; $rb$;
--   GRANT EXECUTE ON FUNCTION public.create_organization_and_user(text, text, uuid, text, text)
--     TO authenticated, postgres, service_role;
--   COMMIT;
-- ============================================================================
