-- GENESIS -- generated file, do not edit by hand.
--
-- Rebuilt by: node scripts/build-genesis-migration.mjs
-- Source:     supabase/schemas/ (the declarative mirror of production)
--
-- The core tables were created in the Supabase dashboard and never had a
-- migration, so `supabase db reset` used to fail at the earliest migration
-- with `relation "organizations" does not exist`. That left no environment
-- where the real schema and new code could meet before production.
--
-- This file recreates the mirrored schema so a reset works from a clean
-- clone. It is timestamped 00000000000000 so it runs before every existing
-- migration; those migrations are written defensively (IF NOT EXISTS, ADD
-- COLUMN IF NOT EXISTS) and re-apply harmlessly on top.
--
-- Tables are ordered by their own FOREIGN KEY references, computed at build
-- time. Functions follow tables because several are referenced by policies.
--
-- Regenerate after every `supabase db pull --declarative` so this file keeps
-- tracking production instead of becoming a third source of truth.
--
-- Contents: 2 extension(s), 26 table(s), 29 function(s).

-- ============ EXTENSIONS ============

CREATE SCHEMA IF NOT EXISTS extensions;

-- pgcrypto
CREATE EXTENSION IF NOT EXISTS "pgcrypto" SCHEMA "extensions";

COMMENT ON EXTENSION "pgcrypto" IS 'cryptographic functions';


-- uuid-ossp
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" SCHEMA "extensions";

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


-- ============ FUNCTIONS ============
--
-- Created before the tables they query: the table files carry RLS policies
-- that call these functions. Body validation is deferred for this file only.

SET LOCAL check_function_bodies = off;

-- ---- admin_mark_paid ----
CREATE OR REPLACE FUNCTION public.admin_mark_paid (
  p_org_id    uuid,
  p_plan_slug text,
  p_reason    text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_actor   UUID := auth.uid();
  v_before  JSONB;
  v_after   JSONB;
  v_reason  TEXT := btrim(COALESCE(p_reason, ''));
BEGIN
  -- Defense in depth: never trust the caller.
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  -- A reason is the whole point. Ten characters is not a high bar, but it does
  -- stop "ok" and an empty string, which is what makes an audit trail useless.
  IF length(v_reason) < 10 THEN
    RAISE EXCEPTION 'reason_required' USING ERRCODE = '22023';
  END IF;

  -- Allowlist the plan against real rows rather than accepting free text, so a
  -- typo cannot create an organization on a tier that does not exist.
  IF NOT EXISTS (
    SELECT 1 FROM public.subscription_plans
    WHERE slug = p_plan_slug AND is_active
  ) THEN
    RAISE EXCEPTION 'invalid_plan: %', p_plan_slug USING ERRCODE = '22023';
  END IF;

  SELECT jsonb_build_object(
           'is_pilot',            is_pilot,
           'converted_to_paid',   converted_to_paid,
           'subscription_tier',   subscription_tier,
           'subscription_status', subscription_status,
           'stripe_customer_id',  stripe_customer_id
         )
    INTO v_before
  FROM public.organizations
  WHERE id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'org_not_found: %', p_org_id USING ERRCODE = 'P0002';
  END IF;

  -- Already converted: succeed without rewriting, so a double click cannot
  -- overwrite a real Stripe conversion with a manual one.
  IF (v_before ->> 'converted_to_paid')::BOOLEAN IS TRUE THEN
    RETURN jsonb_build_object(
      'changed', false,
      'reason',  'already_converted',
      'before',  v_before
    );
  END IF;

  UPDATE public.organizations
  SET converted_to_paid   = true,
      is_pilot            = false,
      subscription_tier   = p_plan_slug,
      subscription_status = 'active',
      updated_at          = now()
  WHERE id = p_org_id;

  SELECT jsonb_build_object(
           'is_pilot',            is_pilot,
           'converted_to_paid',   converted_to_paid,
           'subscription_tier',   subscription_tier,
           'subscription_status', subscription_status,
           'stripe_customer_id',  stripe_customer_id
         )
    INTO v_after
  FROM public.organizations
  WHERE id = p_org_id;

  INSERT INTO public.admin_audit_log
    (actor_id, action, target_org_id, target_user_id, before, after)
  VALUES
    (v_actor,
     'admin_mark_paid',
     p_org_id,
     NULL,
     v_before,
     v_after || jsonb_build_object(
       'reason', v_reason,
       'source', 'admin_manual',
       'plan',   p_plan_slug
     ));

  RETURN jsonb_build_object('changed', true, 'before', v_before, 'after', v_after);
END;
$function$;

GRANT EXECUTE ON FUNCTION "public"."admin_mark_paid"(uuid, text, text) TO "authenticated", "postgres", "service_role";

COMMENT ON FUNCTION "public"."admin_mark_paid"(uuid, text, text) IS 'Record an off-Stripe payment for an organization. Requires super admin and a reason of at least 10 characters. Logs to admin_audit_log with source=admin_manual so manual grants stay distinguishable from Stripe conversions. For "needs more time", use extend_trial() instead.';

REVOKE ALL ON FUNCTION "public"."admin_mark_paid"(uuid, text, text) FROM PUBLIC;


-- ---- assets_category_counts ----
CREATE OR REPLACE FUNCTION public.assets_category_counts()
  RETURNS TABLE (
    id    uuid,
    name  text,
    count bigint
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
  SELECT a.category_id,
         COALESCE(c.name, 'Unknown')::TEXT,
         COUNT(*)::BIGINT
  FROM public.assets a
  LEFT JOIN public.asset_categories c ON c.id = a.category_id
  WHERE a.organization_id = public.get_my_organization_id()
    AND a.category_id IS NOT NULL
  GROUP BY a.category_id, c.name
  ORDER BY 2;
$function$;

GRANT EXECUTE ON FUNCTION "public"."assets_category_counts"() TO "authenticated", "postgres", "service_role";

COMMENT ON FUNCTION "public"."assets_category_counts"() IS 'Category filter list with per-category asset counts for the calling user''s organization. Includes archived assets, matching the current UI.';

REVOKE ALL ON FUNCTION "public"."assets_category_counts"() FROM PUBLIC;


-- ---- assets_page ----
CREATE OR REPLACE FUNCTION public.assets_page (
  p_search        text    DEFAULT NULL::text,
  p_status        text    DEFAULT NULL::text,
  p_category_id   uuid    DEFAULT NULL::uuid,
  p_show_archived boolean DEFAULT false,
  p_limit         integer DEFAULT 50,
  p_offset        integer DEFAULT 0
)
  RETURNS TABLE (
    id               uuid,
    name             text,
    serial_number    text,
    description      text,
    status           text,
    current_location text,
    category_id      uuid,
    category_name    text,
    qr_code          text,
    purchase_date    date,
    purchase_price   numeric,
    current_value    numeric,
    archived_at      timestamp with time zone,
    archive_reason   text,
    vgp_status       text,
    total_count      bigint
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
  WITH scoped AS (
    SELECT a.*,
           c.name AS category_name,
           -- Most urgent non-archived schedule decides the badge. NULL when the
           -- asset has none, which the client renders as 'unknown'.
           (
             SELECT MIN(s.next_due_date)
             FROM public.vgp_schedules s
             WHERE s.asset_id = a.id
               AND s.archived_at IS NULL
           ) AS soonest_due
    FROM public.assets a
    LEFT JOIN public.asset_categories c ON c.id = a.category_id
    WHERE a.organization_id = public.get_my_organization_id()
      AND (p_show_archived OR a.archived_at IS NULL)
      AND (p_status IS NULL OR p_status = 'all' OR a.status = p_status)
      AND (p_category_id IS NULL OR a.category_id = p_category_id)
      AND (
        p_search IS NULL OR p_search = '' OR
        a.name             ILIKE '%' || p_search || '%' OR
        a.serial_number    ILIKE '%' || p_search || '%' OR
        a.description      ILIKE '%' || p_search || '%' OR
        a.current_location ILIKE '%' || p_search || '%'
      )
  )
  SELECT s.id,
         s.name::TEXT,
         s.serial_number::TEXT,
         s.description::TEXT,
         s.status::TEXT,
         s.current_location::TEXT,
         s.category_id,
         s.category_name::TEXT,
         s.qr_code::TEXT,
         s.purchase_date,
         s.purchase_price,
         s.current_value,
         s.archived_at,
         s.archive_reason::TEXT,
         CASE
           WHEN s.soonest_due IS NULL                          THEN 'unknown'
           WHEN s.soonest_due <  CURRENT_DATE                  THEN 'overdue'
           WHEN s.soonest_due <= CURRENT_DATE + INTERVAL '30 days' THEN 'upcoming'
           ELSE 'compliant'
         END::TEXT AS vgp_status,
         COUNT(*) OVER ()::BIGINT AS total_count
  FROM scoped s
  ORDER BY s.created_at DESC
  LIMIT  GREATEST(1, LEAST(COALESCE(p_limit, 50), 200))
  OFFSET GREATEST(0, COALESCE(p_offset, 0));
$function$;

GRANT EXECUTE ON FUNCTION "public"."assets_page"(text, text, uuid, boolean, integer, integer) TO "authenticated", "postgres", "service_role";

COMMENT ON FUNCTION "public"."assets_page"(text, text, uuid, boolean, integer, integer) IS 'One filtered, searched, paginated page of assets for the calling user''s organization, with vgp_status computed server-side and total_count for the pager. Limit is clamped to 200.';

REVOKE ALL ON FUNCTION "public"."assets_page"(text, text, uuid, boolean, integer, integer) FROM PUBLIC;


-- ---- assets_status_counts ----
CREATE OR REPLACE FUNCTION public.assets_status_counts()
  RETURNS TABLE (
    status text,
    count  bigint
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
  SELECT a.status::TEXT, COUNT(*)::BIGINT
  FROM public.assets a
  WHERE a.organization_id = public.get_my_organization_id()
    AND a.archived_at IS NULL
  GROUP BY a.status;
$function$;

GRANT EXECUTE ON FUNCTION "public"."assets_status_counts"() TO "authenticated", "postgres", "service_role";

COMMENT ON FUNCTION "public"."assets_status_counts"() IS 'Per-status asset counts for the calling user''s organization, excluding archived. Backs the filter chips on the assets page.';

REVOKE ALL ON FUNCTION "public"."assets_status_counts"() FROM PUBLIC;


-- ---- calculate_vgp_due_date ----
CREATE OR REPLACE FUNCTION public.calculate_vgp_due_date (
  last_inspection date,
  interval_months integer
)
  RETURNS date
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
  AS $function$
BEGIN
  RETURN (last_inspection + (interval_months || ' months')::INTERVAL)::DATE;
END;
$function$;

GRANT EXECUTE ON FUNCTION "public"."calculate_vgp_due_date"(date, integer) TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."calculate_vgp_due_date"(date, integer) FROM PUBLIC;


-- ---- check_asset_limit ----
CREATE OR REPLACE FUNCTION public.check_asset_limit (
  org_id uuid
)
  RETURNS TABLE (
    current_count integer,
    max_allowed   integer,
    limit_reached boolean
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    (SELECT COUNT(*)::INTEGER FROM assets WHERE organization_id = org_id),
    COALESCE(
      (SELECT sp.max_assets 
       FROM subscriptions s 
       JOIN subscription_plans sp ON s.plan_id = sp.id 
       WHERE s.organization_id = org_id 
       AND s.status IN ('active', 'trialing')
       LIMIT 1),
      100
    )::INTEGER,
    (SELECT COUNT(*) FROM assets WHERE organization_id = org_id) >= 
    COALESCE(
      (SELECT sp.max_assets 
       FROM subscriptions s 
       JOIN subscription_plans sp ON s.plan_id = sp.id 
       WHERE s.organization_id = org_id 
       AND s.status IN ('active', 'trialing')
       LIMIT 1),
      100
    );
END;
$function$;

GRANT EXECUTE ON FUNCTION "public"."check_asset_limit"(uuid) TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."check_asset_limit"(uuid) FROM PUBLIC;


-- ---- check_pilot_asset_limit ----
CREATE OR REPLACE FUNCTION public.check_pilot_asset_limit (
  org_id uuid
)
  RETURNS TABLE (
    current_count integer,
    max_allowed   integer,
    limit_reached boolean
  )
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_count INTEGER;
  v_max   INTEGER;
BEGIN
  SELECT COUNT(*)::INTEGER
  INTO v_count
  FROM public.assets
  WHERE organization_id = org_id
    AND archived_at IS NULL;

  v_max := public.org_max_assets(org_id);

  RETURN QUERY SELECT v_count, v_max, (v_count >= v_max);
END;
$function$;

GRANT EXECUTE ON FUNCTION "public"."check_pilot_asset_limit"(uuid) TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."check_pilot_asset_limit"(uuid) FROM PUBLIC;


-- ---- checkout_asset ----
CREATE OR REPLACE FUNCTION public.checkout_asset (
  p_asset_id             uuid,
  p_organization_id      uuid,
  p_user_id              uuid,
  p_client_name          text,
  p_client_contact       text                     DEFAULT NULL::text,
  p_expected_return_date timestamp with time zone DEFAULT NULL::timestamp WITH time zone,
  p_checkout_notes       text                     DEFAULT NULL::text,
  p_location_name        text                     DEFAULT NULL::text,
  p_latitude             double precision         DEFAULT NULL::double precision,
  p_longitude            double precision         DEFAULT NULL::double precision,
  p_client_id            uuid                     DEFAULT NULL::uuid
)
  RETURNS json
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
DECLARE
  v_asset RECORD;
  v_active_rental RECORD;
  v_vgp_blocked BOOLEAN := FALSE;
  v_scan_id UUID;
  v_rental_id UUID;
BEGIN
  -- 1. Lock the asset row to prevent race conditions
  SELECT * INTO v_asset
  FROM assets
  WHERE id = p_asset_id AND organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'asset_not_found');
  END IF;

  -- 2. Check for active rental (already checked out)
  SELECT id INTO v_active_rental
  FROM rentals
  WHERE asset_id = p_asset_id AND status = 'active'
  LIMIT 1;

  IF FOUND THEN
    RETURN json_build_object('success', false, 'error', 'already_rented');
  END IF;

  -- 3. Check VGP compliance (hard block if non-compliant)
  SELECT EXISTS (
    SELECT 1 FROM vgp_schedules
    WHERE asset_id = p_asset_id
      AND organization_id = p_organization_id
      AND archived_at IS NULL
      AND (
        (next_due_date < NOW() AND status != 'completed')
        OR
        EXISTS (
          SELECT 1 FROM vgp_inspections vi
          WHERE vi.asset_id = p_asset_id
            AND vi.result = 'NON_CONFORME'
            AND vi.inspection_date = (
              SELECT MAX(inspection_date) FROM vgp_inspections
              WHERE asset_id = p_asset_id
            )
        )
      )
  ) INTO v_vgp_blocked;

  IF v_vgp_blocked THEN
    RETURN json_build_object('success', false, 'error', 'vgp_blocked');
  END IF;

  -- 4. Create scan record (type: 'checkout')
  INSERT INTO scans (asset_id, scanned_at, scanned_by, location_name, latitude, longitude, scan_type, notes)
  VALUES (p_asset_id, NOW(), p_user_id, p_location_name, p_latitude, p_longitude, 'checkout', p_checkout_notes)
  RETURNING id INTO v_scan_id;

  -- 5. Create rental record (now with optional client_id)
  INSERT INTO rentals (
    organization_id, asset_id, client_name, client_contact,
    checked_out_by, checkout_date, expected_return_date,
    checkout_notes, status, checkout_scan_id, client_id
  )
  VALUES (
    p_organization_id, p_asset_id, p_client_name, p_client_contact,
    p_user_id, NOW(), p_expected_return_date,
    p_checkout_notes, 'active', v_scan_id, p_client_id
  )
  RETURNING id INTO v_rental_id;

  -- 6. Update asset status
  UPDATE assets
  SET status = 'in_use',
      last_seen_at = NOW(),
      last_seen_by = p_user_id,
      updated_at = NOW()
  WHERE id = p_asset_id;

  RETURN json_build_object(
    'success', true,
    'rental_id', v_rental_id,
    'scan_id', v_scan_id
  );
END;
$function$;

GRANT EXECUTE
  ON FUNCTION "public"."checkout_asset"(uuid, uuid, uuid, text, text, timestamp WITH time zone, text, text, double precision, double precision, uuid)
  TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."checkout_asset"(uuid, uuid, uuid, text, text, timestamp WITH time zone, text, text, double precision, double precision, uuid) FROM PUBLIC;


-- ---- claim_vgp_alerts ----
CREATE OR REPLACE FUNCTION public.claim_vgp_alerts (
  p_rows jsonb
)
  RETURNS TABLE (
    out_id          uuid,
    out_schedule_id uuid
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'p_rows must be a JSON array' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  INSERT INTO public.vgp_alerts (
    schedule_id, asset_id, organization_id, alert_type, urgency_level,
    alert_date, due_date, sent, sent_at, email_sent_to, resolved
  )
  SELECT
    (r->>'schedule_id')::UUID,
    NULLIF(r->>'asset_id', '')::UUID,
    NULLIF(r->>'organization_id', '')::UUID,
    r->>'alert_type',
    r->>'urgency_level',
    (r->>'alert_date')::DATE,
    (r->>'due_date')::DATE,
    TRUE,
    COALESCE((r->>'sent_at')::TIMESTAMPTZ, now()),
    -- email_sent_to is text[]; the caller sends a JSON array of addresses.
    COALESCE(
      ARRAY(SELECT jsonb_array_elements_text(r->'email_sent_to')),
      ARRAY[]::TEXT[]
    ),
    FALSE
  FROM jsonb_array_elements(p_rows) AS r
  -- The predicate is what makes the partial index usable as the arbiter.
  -- Without it this statement raises 42P10, which is the outage being fixed.
  ON CONFLICT (schedule_id, alert_type, alert_date) WHERE vgp_alerts.sent = true
  DO NOTHING
  RETURNING vgp_alerts.id, vgp_alerts.schedule_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION "public"."claim_vgp_alerts"(jsonb) TO "postgres", "service_role";

COMMENT ON FUNCTION "public"."claim_vgp_alerts"(jsonb) IS 'Claim a batch of VGP alerts for sending, returning only the rows actually inserted. Rows already claimed for the same (schedule_id, alert_type, alert_date) are skipped. Exists because ON CONFLICT against the PARTIAL index idx_vgp_alerts_dedup_unique must repeat its WHERE predicate, which PostgREST cannot express.';

REVOKE ALL ON FUNCTION "public"."claim_vgp_alerts"(jsonb) FROM PUBLIC;


-- ---- create_organization_and_user ----
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
BEGIN
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

  -- Create user profile linked to org
  INSERT INTO public.users (id, email, full_name, organization_id, role)
  VALUES (p_user_id, p_user_email, p_user_full_name, v_org_id, 'owner');

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

  -- No entitlement_overrides seeding. A pilot is not granted features one by
  -- one any more: every feature ships on the one plan, and the pilot window
  -- governs duration while org_max_assets() governs capacity.

  RETURN v_org_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION "public"."create_organization_and_user"(text, text, uuid, text, text) TO "authenticated", "postgres", "service_role";

COMMENT ON FUNCTION "public"."create_organization_and_user"(text, text, uuid, text, text) IS 'Signup: creates the org, owner profile and trialing subscription. Pilot window is 30 days -- must match PILOT_FULL_DAYS in lib/billing/pilot-window.ts and the "30-day trial" claim on the website. No feature grants: one plan carries every feature.';

REVOKE ALL ON FUNCTION "public"."create_organization_and_user"(text, text, uuid, text, text) FROM PUBLIC;


-- ---- create_trial_subscription ----
CREATE OR REPLACE FUNCTION public.create_trial_subscription()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
BEGIN
  INSERT INTO subscriptions (
    organization_id,
    plan_id,
    status,
    billing_cycle,
    current_period_start,
    current_period_end,
    trial_start,
    trial_end
  )
  VALUES (
    NEW.id,
    (SELECT id FROM subscription_plans WHERE slug = 'travixo' LIMIT 1),
    'trialing',
    'monthly',
    NOW(),
    NOW() + INTERVAL '30 days',
    NOW(),
    NOW() + INTERVAL '30 days'
  );

  RETURN NEW;
END;
$function$;

GRANT EXECUTE ON FUNCTION "public"."create_trial_subscription"() TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."create_trial_subscription"() FROM PUBLIC;


-- ---- end_pilot ----
CREATE OR REPLACE FUNCTION public.end_pilot (
  p_org_id uuid,
  p_mode   text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_actor      UUID := auth.uid();
  v_is_pilot   BOOLEAN;
  v_converted  BOOLEAN;
  v_old_trial  TIMESTAMPTZ;
  v_old_pilot  TIMESTAMPTZ;
  v_old_start  TIMESTAMPTZ;
  v_new_start  TIMESTAMPTZ;
  v_now        TIMESTAMPTZ := now();
  -- The END of the pilot window, written to pilot_end_date.
  --
  -- It is now() MINUS a second, not now(), because isPilotActive() in
  -- lib/billing/access-model.ts tests `now <= pilot_end_date` -- an
  -- INCLUSIVE comparison. Writing exactly now() therefore leaves the
  -- pilot ACTIVE and the org at 'full' access: the function would report
  -- success and change nothing. Backing off one second puts the end
  -- strictly in the past, which is what "ended" has to mean.
  --
  -- Verified by scripts/verify-admin-end-pilot.mjs, which runs the real
  -- accessLevel() over the exact columns this function writes.
  v_end        TIMESTAMPTZ := now() - INTERVAL '1 second';
  v_before     JSONB;
  v_after      JSONB;
  -- Mirrors PILOT_LOCKOUT_DAYS (30 full + 15 grace) in
  -- lib/billing/access-model.ts. Backdating by one day MORE than the
  -- lockout satisfies the strict `> PILOT_LOCKOUT_DAYS` comparison.
  v_lockout_days CONSTANT INTEGER := 45;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF p_mode NOT IN ('read_only', 'locked') THEN
    RAISE EXCEPTION 'invalid_mode: %', p_mode USING ERRCODE = '22023';
  END IF;

  SELECT is_pilot, converted_to_paid, trial_ends_at, pilot_end_date, pilot_start_date
    INTO v_is_pilot, v_converted, v_old_trial, v_old_pilot, v_old_start
  FROM public.organizations
  WHERE id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'org_not_found: %', p_org_id USING ERRCODE = 'P0002';
  END IF;

  -- A paying customer is never degraded by this action.
  IF v_converted THEN
    RAISE EXCEPTION 'already_converted' USING ERRCODE = '22023';
  END IF;

  IF NOT v_is_pilot THEN
    RAISE EXCEPTION 'not_a_pilot' USING ERRCODE = '22023';
  END IF;

  IF p_mode = 'locked' THEN
    -- Push the start date far enough back that daysSincePilotStart
    -- exceeds PILOT_LOCKOUT_DAYS, which is what accessLevel() tests.
    v_new_start := v_now - make_interval(days => v_lockout_days + 1);
  ELSE
    v_new_start := v_old_start;  -- untouched: grace is measured from it
  END IF;

  UPDATE public.organizations
     SET pilot_end_date   = v_end,
         trial_ends_at    = v_end,
         pilot_start_date = v_new_start,
         updated_at       = v_now
   WHERE id = p_org_id;

  v_before := jsonb_build_object(
    'trial_ends_at',    v_old_trial,
    'pilot_end_date',   v_old_pilot,
    'pilot_start_date', v_old_start
  );
  v_after := jsonb_build_object(
    'trial_ends_at',    v_end,
    'pilot_end_date',   v_end,
    'pilot_start_date', v_new_start
  );

  -- Audit insert in the SAME transaction. If this fails, the UPDATE
  -- above rolls back too.
  INSERT INTO public.admin_audit_log
    (actor_id, action, target_org_id, target_user_id, before, after)
  VALUES
    (v_actor,
     'end_pilot',
     p_org_id,
     NULL,
     v_before,
     v_after || jsonb_build_object('mode', p_mode));

  RETURN jsonb_build_object('mode', p_mode, 'before', v_before, 'after', v_after);
END;
$function$;

GRANT EXECUTE ON FUNCTION "public"."end_pilot"(uuid, text) TO "anon", "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."end_pilot"(uuid, text) FROM PUBLIC;


-- ---- enforce_asset_limit ----
CREATE OR REPLACE FUNCTION public.enforce_asset_limit()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_count    INTEGER;
  v_max      INTEGER;
  v_licensed INTEGER;
BEGIN
  -- What the organization licensed, if it has a Stripe subscription at all.
  SELECT s.licensed_capacity
  INTO v_licensed
  FROM public.subscriptions s
  WHERE s.organization_id = NEW.organization_id
    AND s.status IN ('active', 'trialing', 'past_due')
  ORDER BY s.licensed_capacity DESC NULLS LAST
  LIMIT 1;

  IF v_licensed IS NOT NULL THEN
    -- Billable assets only: what the licence is actually sold against.
    -- is_demo_data IS NOT TRUE rather than = false, because the column is
    -- nullable and legacy rows hold NULL.
    SELECT COUNT(*)
    INTO v_count
    FROM public.assets
    WHERE organization_id = NEW.organization_id
      AND archived_at IS NULL
      AND is_demo_data IS NOT TRUE;

    IF v_count >= v_licensed THEN
      RAISE EXCEPTION
        'Licensed capacity reached (% of % assets). Increase capacity to add more.',
        v_count, v_licensed
        USING ERRCODE = 'check_violation',
              HINT = 'POST /api/stripe/subscription/capacity to license more.';
    END IF;

    RETURN NEW;
  END IF;

  -- No licensed capacity: pilot or trial. Previous behaviour, unchanged.
  v_max := public.org_max_assets(NEW.organization_id);

  -- Archived assets are excluded, matching how the dashboard counts them
  -- (app/(dashboard)/dashboard/page.tsx). Retiring a machine should free room
  -- for its replacement.
  SELECT COUNT(*)
  INTO v_count
  FROM public.assets
  WHERE organization_id = NEW.organization_id
    AND archived_at IS NULL;

  IF v_count >= v_max THEN
    RAISE EXCEPTION
      'Asset limit reached for this organization (% of % used). Archive an asset or upgrade the plan.',
      v_count, v_max
      USING ERRCODE = 'check_violation',
            HINT = 'See subscription_plans.max_assets, or pilot status.';
  END IF;

  RETURN NEW;
END;
$function$;

GRANT EXECUTE ON FUNCTION "public"."enforce_asset_limit"() TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

COMMENT ON FUNCTION "public"."enforce_asset_limit"() IS 'BEFORE INSERT on assets. Enforces subscriptions.licensed_capacity when set (billable assets only: archived and demo excluded), else org_max_assets(). This is the only enforcement point that covers the client-side RLS writers in AddAssetModal and ImportAssetsModal, which never reach requireWriteAccess.';


-- ---- enforce_users_identity_invariant ----
CREATE OR REPLACE FUNCTION public.enforce_users_identity_invariant()
  RETURNS TRIGGER
  LANGUAGE plpgsql
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

GRANT EXECUTE ON FUNCTION "public"."enforce_users_identity_invariant"() TO "postgres", "service_role";

COMMENT ON FUNCTION "public"."enforce_users_identity_invariant"() IS 'A0 (C-1 containment). Blocks self-service tenant moves and self role changes for anon/authenticated sessions. SECURITY INVOKER so current_user reflects the caller. Does not alter any policy or grant; the update-surface gate still fails until Patch A narrows the column grants.';

REVOKE ALL ON FUNCTION "public"."enforce_users_identity_invariant"() FROM PUBLIC;


-- ---- extend_trial ----
CREATE OR REPLACE FUNCTION public.extend_trial (
  p_org_id uuid,
  p_days   integer
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_actor        UUID := auth.uid();
  v_is_pilot     BOOLEAN;
  v_old_trial    TIMESTAMPTZ;
  v_old_pilot    TIMESTAMPTZ;
  v_new_trial    TIMESTAMPTZ;
  v_new_pilot    TIMESTAMPTZ;
  v_branch       TEXT;
  v_before       JSONB;
  v_after        JSONB;
BEGIN
  -- Defense in depth: never trust the caller.
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  -- Allowlist: reject any free-form day count.
  IF p_days NOT IN (7, 14, 30) THEN
    RAISE EXCEPTION 'invalid_days: %', p_days USING ERRCODE = '22023';
  END IF;

  SELECT is_pilot, trial_ends_at, pilot_end_date
    INTO v_is_pilot, v_old_trial, v_old_pilot
  FROM public.organizations
  WHERE id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'org_not_found: %', p_org_id USING ERRCODE = 'P0002';
  END IF;

  IF v_is_pilot THEN
    v_branch := 'pilot';
    -- Never shorten: anchor at the later of now() and the current value.
    v_new_pilot := GREATEST(now(), COALESCE(v_old_pilot, now()))
                   + make_interval(days => p_days);
    -- Keep trial_ends_at in lockstep with pilot_end_date. The admin
    -- screens display trial_ends_at; letting it lag showed a stale date.
    v_new_trial := v_new_pilot;

    UPDATE public.organizations
       SET pilot_end_date = v_new_pilot,
           trial_ends_at  = v_new_trial,
           updated_at     = now()
     WHERE id = p_org_id;
  ELSE
    v_branch := 'trial';
    v_new_trial := GREATEST(now(), COALESCE(v_old_trial, now()))
                   + make_interval(days => p_days);
    v_new_pilot := v_old_pilot;  -- untouched: a non-pilot org has no pilot window

    UPDATE public.organizations
       SET trial_ends_at = v_new_trial,
           updated_at    = now()
     WHERE id = p_org_id;
  END IF;

  v_before := jsonb_build_object(
    'is_pilot',       v_is_pilot,
    'trial_ends_at',  v_old_trial,
    'pilot_end_date', v_old_pilot
  );
  v_after := jsonb_build_object(
    'is_pilot',       v_is_pilot,
    'trial_ends_at',  v_new_trial,
    'pilot_end_date', v_new_pilot
  );

  INSERT INTO public.admin_audit_log
    (actor_id, action, target_org_id, target_user_id, before, after)
  VALUES
    (v_actor,
     'extend_trial',
     p_org_id,
     NULL,
     v_before,
     v_after || jsonb_build_object('days', p_days, 'branch', v_branch));

  RETURN jsonb_build_object('branch', v_branch, 'before', v_before, 'after', v_after);
END;
$function$;

GRANT EXECUTE ON FUNCTION "public"."extend_trial"(uuid, integer) TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."extend_trial"(uuid, integer) FROM PUBLIC;


-- ---- generate_vgp_alerts ----
CREATE OR REPLACE FUNCTION public.generate_vgp_alerts()
  RETURNS void
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
  AS $function$
DECLARE
  schedule_record RECORD;
  alert_dates INTEGER[] := ARRAY[30, 15, 7, 1];
  alert_date DATE;
  alert_type TEXT;
BEGIN
  -- Loop through all active schedules
  FOR schedule_record IN 
    SELECT * FROM vgp_schedules 
    WHERE status = 'active' AND next_due_date IS NOT NULL
  LOOP
    -- Generate alerts for each threshold
    FOREACH alert_date IN ARRAY alert_dates
    LOOP
      alert_date := schedule_record.next_due_date - (alert_date || ' days')::INTERVAL;
      
      CASE alert_date
        WHEN 30 THEN alert_type := '30_days';
        WHEN 15 THEN alert_type := '15_days';
        WHEN 7 THEN alert_type := '7_days';
        WHEN 1 THEN alert_type := '1_day';
      END CASE;
      
      -- Insert alert if it doesn't exist and date hasn't passed
      INSERT INTO vgp_alerts (asset_id, schedule_id, organization_id, alert_type, alert_date, due_date)
      SELECT 
        schedule_record.asset_id,
        schedule_record.id,
        schedule_record.organization_id,
        alert_type,
        alert_date,
        schedule_record.next_due_date
      WHERE alert_date >= CURRENT_DATE
      ON CONFLICT DO NOTHING;
    END LOOP;
    
    -- Check if overdue
    IF schedule_record.next_due_date < CURRENT_DATE THEN
      UPDATE vgp_schedules 
      SET status = 'overdue' 
      WHERE id = schedule_record.id;
      
      -- Create overdue alert
      INSERT INTO vgp_alerts (asset_id, schedule_id, organization_id, alert_type, alert_date, due_date)
      VALUES (
        schedule_record.asset_id,
        schedule_record.id,
        schedule_record.organization_id,
        'overdue',
        CURRENT_DATE,
        schedule_record.next_due_date
      )
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
END;
$function$;

GRANT EXECUTE ON FUNCTION "public"."generate_vgp_alerts"() TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."generate_vgp_alerts"() FROM PUBLIC;


-- ---- get_asset_by_qr ----
CREATE OR REPLACE FUNCTION public.get_asset_by_qr (
  p_qr_code text
)
  RETURNS TABLE (
    id               uuid,
    name             text,
    serial_number    text,
    status           text,
    current_location text,
    description      text,
    purchase_date    date,
    last_seen_at     timestamp with time zone,
    category_name    text,
    viewer_is_member boolean
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
  SELECT
    a.id,
    a.name::text,
    a.serial_number::text,
    -- operational state only for same-org members; see header
    CASE
      WHEN a.organization_id IN (
        SELECT u.organization_id FROM public.users u WHERE u.id = auth.uid()
      ) THEN a.status::text
      ELSE NULL
    END AS status,
    a.current_location::text,
    a.description::text,
    -- financial/date detail only for same-org authenticated members
    CASE
      WHEN a.organization_id IN (
        SELECT u.organization_id FROM public.users u WHERE u.id = auth.uid()
      ) THEN a.purchase_date
      ELSE NULL
    END AS purchase_date,
    a.last_seen_at,
    c.name::text AS category_name,
    (
      a.organization_id IN (
        SELECT u.organization_id FROM public.users u WHERE u.id = auth.uid()
      )
    ) IS TRUE AS viewer_is_member
  FROM public.assets a
  LEFT JOIN public.asset_categories c ON c.id = a.category_id
  WHERE a.qr_code = p_qr_code
    AND a.archived_at IS NULL
  LIMIT 1;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_asset_by_qr"(text) TO "anon", "authenticated", "postgres", "service_role";

COMMENT ON FUNCTION "public"."get_asset_by_qr"(text) IS 'Public QR scan lookup. Returns display-safe columns for one asset. Never returns purchase_price, current_value, or organization_id. purchase_date and status are NULL unless the caller is an authenticated same-org member.';

REVOKE ALL ON FUNCTION "public"."get_asset_by_qr"(text) FROM PUBLIC;


-- ---- get_my_organization_id ----
CREATE OR REPLACE FUNCTION public.get_my_organization_id()
  RETURNS uuid
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
  SELECT organization_id FROM public.users WHERE id = auth.uid()
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_my_organization_id"() TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."get_my_organization_id"() FROM PUBLIC;


-- ---- has_feature_access ----
CREATE OR REPLACE FUNCTION public.has_feature_access (
  org_id       uuid,
  feature_name text
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
DECLARE
  org_is_pilot BOOLEAN;
  org_pilot_active BOOLEAN;
  org_subscription_active BOOLEAN;
  feature_enabled BOOLEAN;
BEGIN
  -- Check if organization is a pilot
  SELECT 
    is_pilot,
    (is_pilot AND NOW() BETWEEN COALESCE(pilot_start_date, NOW()) AND COALESCE(pilot_end_date, NOW()))
  INTO org_is_pilot, org_pilot_active
  FROM organizations
  WHERE id = org_id;
  
  -- Pilots get all features during pilot period
  IF org_pilot_active THEN
    RETURN TRUE;
  END IF;
  
  -- Check if subscription is active and has the feature
  SELECT 
    (s.status = 'active' OR s.status = 'trialing'),
    (sp.features->feature_name)::boolean
  INTO org_subscription_active, feature_enabled
  FROM subscriptions s
  JOIN subscription_plans sp ON s.plan_id = sp.id
  WHERE s.organization_id = org_id;
  
  RETURN COALESCE(org_subscription_active AND feature_enabled, FALSE);
END;
$function$;

GRANT EXECUTE ON FUNCTION "public"."has_feature_access"(uuid, text) TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."has_feature_access"(uuid, text) FROM PUBLIC;


-- ---- is_pilot_active ----
CREATE OR REPLACE FUNCTION public.is_pilot_active (
  org_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
  SELECT COALESCE(
    (SELECT is_pilot
            AND (pilot_start_date IS NULL OR NOW() >= pilot_start_date)
            AND (pilot_end_date   IS NULL OR NOW() <= pilot_end_date)
     FROM public.organizations
     WHERE id = org_id),
    false
  );
$function$;

GRANT EXECUTE ON FUNCTION "public"."is_pilot_active"(uuid) TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."is_pilot_active"(uuid) FROM PUBLIC;


-- ---- is_super_admin ----
CREATE OR REPLACE FUNCTION public.is_super_admin()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.platform_admins
    WHERE user_id = auth.uid()
  );
$function$;

GRANT EXECUTE ON FUNCTION "public"."is_super_admin"() TO PUBLIC, "anon", "authenticated", "postgres", "service_role";


-- ---- org_max_assets ----
CREATE OR REPLACE FUNCTION public.org_max_assets (
  org_id uuid
)
  RETURNS integer
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_licensed INTEGER;
BEGIN
  -- Pilots get the documented pilot allowance regardless of plan.
  IF public.is_pilot_active(org_id) THEN
    RETURN 400;  -- keep in step with PILOT_MAX_ASSETS in lib/billing/access-model.ts
  END IF;

  -- What the organization actually licensed. NULL means no Stripe
  -- subscription, which is not evidence of any entitlement.
  SELECT s.licensed_capacity
  INTO v_licensed
  FROM public.subscriptions s
  WHERE s.organization_id = org_id
    AND s.status IN ('active', 'trialing', 'past_due')
    AND s.licensed_capacity IS NOT NULL
  ORDER BY s.licensed_capacity DESC   -- if somehow multiple, the most generous wins
  LIMIT 1;

  IF v_licensed IS NOT NULL THEN
    RETURN v_licensed;
  END IF;

  -- No pilot, no licence. Fail closed on a finite floor rather than inheriting
  -- the plan row's sentinel, which is what left three orgs uncapped.
  RETURN 100;
END;
$function$;

GRANT EXECUTE ON FUNCTION "public"."org_max_assets"(uuid) TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

COMMENT ON FUNCTION "public"."org_max_assets"(uuid) IS 'Asset ceiling for an organization: 400 while a pilot is active, else subscriptions.licensed_capacity when set, else a finite floor of 100. Deliberately does NOT read subscription_plans.max_assets: that column is a sentinel on the travixo row, and reading it left every org uncapped.';


-- ---- record_inspection ----
CREATE OR REPLACE FUNCTION public.record_inspection (
  p_asset_id              uuid,
  p_inspection_date       date,
  p_inspector_name        text,
  p_result                text,
  p_certificate_url       text,
  p_schedule_id           uuid    DEFAULT NULL::uuid,
  p_inspector_company     text    DEFAULT NULL::text,
  p_certification_number  text    DEFAULT NULL::text,
  p_findings              text    DEFAULT NULL::text,
  p_verification_type     text    DEFAULT 'PERIODIQUE'::text,
  p_interval_months       integer DEFAULT 12,
  p_certificate_file_name text    DEFAULT NULL::text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
DECLARE
  v_org        UUID := public.get_my_organization_id();
  v_actor      UUID := auth.uid();
  v_next_due   DATE;
  v_sched_stat TEXT;
  v_inspection JSONB;
  v_asset_ok   BOOLEAN;
BEGIN
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'no_organization' USING ERRCODE = '42501';
  END IF;

  IF p_result NOT IN ('passed', 'conditional', 'failed') THEN
    RAISE EXCEPTION 'invalid_result: %', p_result USING ERRCODE = '22023';
  END IF;

  -- The certificate is mandatory for DREETS compliance. Without it the
  -- inspection is not conformant, so refusing here rather than recording a
  -- half-valid inspection is the point.
  IF p_certificate_url IS NULL OR btrim(p_certificate_url) = '' THEN
    RAISE EXCEPTION 'certificate_required' USING ERRCODE = '22023';
  END IF;

  -- The asset must belong to the caller's organization. FOR UPDATE because we
  -- may be about to change its status, and two concurrent inspections of the
  -- same machine must not interleave.
  SELECT TRUE INTO v_asset_ok
  FROM public.assets
  WHERE id = p_asset_id AND organization_id = v_org
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'asset_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Same for the schedule, when one was given.
  IF p_schedule_id IS NOT NULL THEN
    PERFORM 1
    FROM public.vgp_schedules
    WHERE id = p_schedule_id AND organization_id = v_org
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'schedule_not_found' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  -- Next due date. Mirrors route.ts:218-232 exactly.
  v_next_due := CASE p_result
    WHEN 'failed'      THEN p_inspection_date + INTERVAL '30 days'
    WHEN 'conditional' THEN p_inspection_date + INTERVAL '6 months'
    ELSE p_inspection_date + make_interval(months => COALESCE(NULLIF(p_interval_months, 0), 12))
  END::DATE;

  v_sched_stat := CASE WHEN p_result = 'failed' THEN 'failed' ELSE 'completed' END;

  -- 1. The inspection itself.
  INSERT INTO public.vgp_inspections (
    asset_id, schedule_id, organization_id, inspection_date,
    inspector_name, inspector_company, certification_number,
    result, observations, verification_type, next_inspection_date,
    certificate_url, certificate_file_name, performed_by
  )
  VALUES (
    p_asset_id, p_schedule_id, v_org, p_inspection_date,
    p_inspector_name, p_inspector_company, p_certification_number,
    p_result, COALESCE(p_findings, ''), COALESCE(p_verification_type, 'PERIODIQUE'),
    v_next_due, p_certificate_url, p_certificate_file_name, v_actor
  )
  RETURNING to_jsonb(vgp_inspections.*) INTO v_inspection;

  -- 2. The schedule. No longer optional, no longer swallowed: if this fails
  --    the whole thing rolls back and the caller is told.
  IF p_schedule_id IS NOT NULL THEN
    UPDATE public.vgp_schedules
    SET next_due_date        = v_next_due,
        last_inspection_date = p_inspection_date,
        status               = v_sched_stat,
        updated_at           = now()
    WHERE id = p_schedule_id AND organization_id = v_org;
  END IF;

  -- 3. A failed inspection takes the machine out of service. This is the write
  --    whose silent failure could put uninspected equipment on a site.
  IF p_result = 'failed' THEN
    UPDATE public.assets
    SET status = 'out_of_service',
        updated_at = now()
    WHERE id = p_asset_id AND organization_id = v_org;
  END IF;

  RETURN jsonb_build_object(
    'inspection',    v_inspection,
    'next_due_date', v_next_due,
    'asset_blocked', (p_result = 'failed')
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION "public"."record_inspection"(uuid, date, text, text, text, uuid, text, text, text, text, integer, text) TO "authenticated", "postgres", "service_role";

COMMENT ON FUNCTION "public"."record_inspection"(uuid, date, text, text, text, uuid, text, text, text, text, integer, text) IS 'Record a VGP inspection and its consequences in ONE transaction: the inspection row, the schedule advance, and out_of_service on a failed result. Replaces three sequential writes where two failures were swallowed.';

REVOKE ALL ON FUNCTION "public"."record_inspection"(uuid, date, text, text, text, uuid, text, text, text, text, integer, text) FROM PUBLIC;


-- ---- resolve_vgp_alerts_on_completion ----
CREATE OR REPLACE FUNCTION public.resolve_vgp_alerts_on_completion()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
BEGIN
  -- When schedule is completed or archived, resolve all open alerts
  IF (NEW.status IN ('completed', 'archived') AND OLD.status NOT IN ('completed', 'archived')) THEN
    UPDATE vgp_alerts
    SET
      resolved = true,
      resolved_at = now(),
      resolved_reason = CASE
        WHEN NEW.status = 'completed' THEN 'inspection_completed'
        WHEN NEW.status = 'archived' THEN 'schedule_archived'
      END
    WHERE schedule_id = NEW.id
      AND resolved = false;
  END IF;

  -- When next_due_date is pushed forward (inspection done, new cycle),
  -- resolve alerts for the old due date
  IF (NEW.next_due_date > OLD.next_due_date AND NEW.last_inspection_date IS DISTINCT FROM OLD.last_inspection_date) THEN
    UPDATE vgp_alerts
    SET
      resolved = true,
      resolved_at = now(),
      resolved_reason = 'inspection_completed'
    WHERE schedule_id = NEW.id
      AND resolved = false;
  END IF;

  RETURN NEW;
END;
$function$;

GRANT EXECUTE ON FUNCTION "public"."resolve_vgp_alerts_on_completion"() TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."resolve_vgp_alerts_on_completion"() FROM PUBLIC;


-- ---- return_asset ----
CREATE OR REPLACE FUNCTION public.return_asset (
  p_rental_id        uuid,
  p_user_id          uuid,
  p_return_condition text             DEFAULT NULL::text,
  p_return_notes     text             DEFAULT NULL::text,
  p_location_name    text             DEFAULT NULL::text,
  p_latitude         double precision DEFAULT NULL::double precision,
  p_longitude        double precision DEFAULT NULL::double precision
)
  RETURNS json
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
DECLARE
  v_rental RECORD;
  v_scan_id UUID;
BEGIN
  -- 1. Lock the rental row
  SELECT r.*, a.id AS a_id, a.organization_id AS a_org_id
  INTO v_rental
  FROM rentals r
  JOIN assets a ON a.id = r.asset_id
  WHERE r.id = p_rental_id AND r.status = 'active'
  FOR UPDATE OF r;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'rental_not_found');
  END IF;

  -- 2. Create scan record (type: 'return')
  INSERT INTO scans (asset_id, scanned_at, scanned_by, location_name, latitude, longitude, scan_type, notes)
  VALUES (v_rental.asset_id, NOW(), p_user_id, p_location_name, p_latitude, p_longitude, 'return', p_return_notes)
  RETURNING id INTO v_scan_id;

  -- 3. Update rental record
  UPDATE rentals
  SET status = 'returned',
      actual_return_date = NOW(),
      returned_by = p_user_id,
      return_condition = p_return_condition,
      return_notes = p_return_notes,
      return_scan_id = v_scan_id,
      updated_at = NOW()
  WHERE id = p_rental_id;

  -- 4. Update asset status back to available
  UPDATE assets
  SET status = 'available',
      last_seen_at = NOW(),
      last_seen_by = p_user_id,
      current_location = COALESCE(p_location_name, current_location),
      updated_at = NOW()
  WHERE id = v_rental.asset_id;

  RETURN json_build_object(
    'success', true,
    'scan_id', v_scan_id
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION "public"."return_asset"(uuid, uuid, text, text, text, double precision, double precision) TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."return_asset"(uuid, uuid, text, text, text, double precision, double precision) FROM PUBLIC;


-- ---- set_feature_flag ----
CREATE OR REPLACE FUNCTION public.set_feature_flag (
  p_org_id  uuid,
  p_flag    text,
  p_enabled boolean
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_actor   UUID := auth.uid();
  v_old     JSONB;
  v_new     JSONB;
  -- Hardcoded allowlist. Keep in sync with ALLOWED_FLAGS in the
  -- server action (lib/admin/featureFlags.ts).
  v_allowed TEXT[] := ARRAY[
    'beta_dashboard',
    'advanced_reports',
    'bulk_export'
  ];
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF NOT (p_flag = ANY (v_allowed)) THEN
    RAISE EXCEPTION 'invalid_flag: %', p_flag USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(feature_flags, '{}'::jsonb)
    INTO v_old
  FROM public.organizations
  WHERE id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'org_not_found: %', p_org_id USING ERRCODE = 'P0002';
  END IF;

  -- Set exactly one key; leave all other keys intact.
  v_new := v_old || jsonb_build_object(p_flag, p_enabled);

  UPDATE public.organizations
     SET feature_flags = v_new,
         updated_at    = now()
   WHERE id = p_org_id;

  INSERT INTO public.admin_audit_log
    (actor_id, action, target_org_id, target_user_id, before, after)
  VALUES
    (v_actor,
     'set_feature_flag',
     p_org_id,
     NULL,
     jsonb_build_object('feature_flags', v_old),
     jsonb_build_object('feature_flags', v_new, 'flag', p_flag, 'enabled', p_enabled));

  RETURN jsonb_build_object('flag', p_flag, 'before', v_old, 'after', v_new);
END;
$function$;

GRANT EXECUTE ON FUNCTION "public"."set_feature_flag"(uuid, text, boolean) TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."set_feature_flag"(uuid, text, boolean) FROM PUBLIC;


-- ---- track_asset_creation ----
CREATE OR REPLACE FUNCTION public.track_asset_creation()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
BEGIN
  INSERT INTO usage_tracking (
    organization_id,
    period_start,
    period_end,
    asset_count
  )
  SELECT
    COALESCE(NEW.organization_id, OLD.organization_id),
    date_trunc('month', NOW()),
    date_trunc('month', NOW()) + INTERVAL '1 month',
    COUNT(*)
  FROM assets
  WHERE organization_id = COALESCE(NEW.organization_id, OLD.organization_id)
  GROUP BY organization_id
  ON CONFLICT (organization_id, period_start)
  DO UPDATE SET
    asset_count = EXCLUDED.asset_count,
    created_at = NOW();

  RETURN COALESCE(NEW, OLD);
END;
$function$;

GRANT EXECUTE ON FUNCTION "public"."track_asset_creation"() TO PUBLIC, "anon", "authenticated", "postgres", "service_role";


-- ---- update_updated_at_column ----
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
  AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;

GRANT EXECUTE ON FUNCTION "public"."update_updated_at_column"() TO PUBLIC, "anon", "authenticated", "postgres", "service_role";


-- ---- update_vgp_schedule_after_inspection ----
CREATE OR REPLACE FUNCTION public.update_vgp_schedule_after_inspection()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
  AS $function$
BEGIN
  UPDATE vgp_schedules
  SET 
    last_inspection_date = NEW.inspection_date,
    next_due_date = NEW.next_inspection_date,
    inspector_name = NEW.inspector_name,
    inspector_company = NEW.inspector_company,
    certification_number = NEW.certification_number,
    status = CASE 
      WHEN NEW.next_inspection_date < CURRENT_DATE THEN 'overdue'
      ELSE 'active'
    END,
    updated_at = NOW()
  WHERE id = NEW.schedule_id;
  
  RETURN NEW;
END;
$function$;

GRANT EXECUTE ON FUNCTION "public"."update_vgp_schedule_after_inspection"() TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."update_vgp_schedule_after_inspection"() FROM PUBLIC;


-- ============ TABLES ============
--
-- RLS policies are stripped here and re-applied at the end: they are
-- mutually circular (organizations policies read users, users policies read
-- organizations) and policy expressions are always validated on creation.

-- ---- admin_audit_log ----
CREATE TABLE "public"."admin_audit_log" (
  "id"             uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "actor_id"       uuid,
  "action"         text                     NOT NULL,
  "target_org_id"  uuid,
  "target_user_id" uuid,
  "before"         jsonb,
  "after"          jsonb,
  "created_at"     timestamp with time zone DEFAULT now(),
  CONSTRAINT "admin_audit_log_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES auth.users(id),
  CONSTRAINT "admin_audit_log_pkey" PRIMARY KEY (id)
);


GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."admin_audit_log" TO "anon", "authenticated", "postgres", "service_role";

-- ---- organizations ----
CREATE TABLE "public"."organizations" (
  "id"                       uuid                     NOT NULL DEFAULT extensions.uuid_generate_v4(),
  "name"                     character varying(255)   NOT NULL,
  "slug"                     character varying(255)   NOT NULL,
  "created_at"               timestamp with time zone DEFAULT timezone('utc'::text, now()),
  "updated_at"               timestamp with time zone DEFAULT timezone('utc'::text, now()),
  "subscription_tier"        character varying(50)    DEFAULT 'trial'::character varying,
  "trial_ends_at"            timestamp with time zone,
  "is_pilot"                 boolean                  DEFAULT false,
  "pilot_start_date"         timestamp with time zone,
  "pilot_end_date"           timestamp with time zone,
  "subscription_status"      text                     DEFAULT 'trial'::text,
  "siret"                    character varying(14),
  "address"                  text,
  "city"                     character varying(100),
  "postal_code"              character varying(10),
  "logo_url"                 text,
  "website"                  text,
  "phone"                    text,
  "country"                  text                     DEFAULT 'FR'::text,
  "timezone"                 text                     DEFAULT 'Europe/Paris'::text,
  "currency"                 text                     DEFAULT 'EUR'::text,
  "industry_sector"          text,
  "company_size"             text,
  "branding_colors"          jsonb                    DEFAULT
    '{"accent": "#d97706", "danger": "#b91c1c", "primary": "#1e3a5f", "success": "#047857", "warning": "#eab308", "secondary": "#2d5a7b"}'::jsonb,
  "notification_preferences" jsonb                    DEFAULT
    '{"vgp_alerts": {"timing": [30, 15, 7, 1], "enabled": true, "recipients": ["owner"]}, "digest_mode": "daily", "asset_alerts": true, "audit_alerts": true, "email_enabled": true}'::jsonb,
  "vgp_alerts_enabled"       boolean                  DEFAULT true,
  "vgp_alert_days"           integer[]                DEFAULT '{30,7,1,0}'::integer[],
  "stripe_customer_id"       text,
  "pilot_notes"              text,
  "converted_to_paid"        boolean                  DEFAULT false,
  "onboarding_completed"     boolean                  DEFAULT false,
  "demo_data_seeded"         boolean                  DEFAULT false,
  "feature_flags"            jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "demo_alert_sent"          boolean                  NOT NULL DEFAULT false,
  "welcome_email_sent"       boolean                  NOT NULL DEFAULT false,
  CONSTRAINT "organizations_pkey" PRIMARY KEY (id),
  CONSTRAINT "organizations_slug_key" UNIQUE (slug),
  CONSTRAINT "organizations_stripe_customer_id_key" UNIQUE (stripe_customer_id)
);


CREATE INDEX idx_organizations_stripe_customer ON public.organizations USING btree (stripe_customer_id);

CREATE TRIGGER auto_create_trial_subscription
  AFTER INSERT ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.create_trial_subscription();

CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();


GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."organizations" TO "anon", "authenticated", "postgres", "service_role";

COMMENT ON COLUMN "public"."organizations"."demo_alert_sent" IS 'True once the one-time demo showcase alert email has been claimed for this org. Claimed via a conditional UPDATE before the send, so it is a one-shot guard rather than a delivery receipt.';

COMMENT ON COLUMN "public"."organizations"."vgp_alert_days" IS 'Array of day values for enabled alert types. 30=30-day reminder, 7=7-day, 1=1-day, 0=overdue';

COMMENT ON COLUMN "public"."organizations"."vgp_alerts_enabled" IS 'Whether VGP email alerts are enabled for this organization';

COMMENT ON COLUMN "public"."organizations"."welcome_email_sent" IS 'True once the welcome onboarding email has been claimed for this org. Claimed via a conditional UPDATE before the send, so it is a one-shot guard rather than a delivery receipt.';

-- ---- asset_categories ----
CREATE TABLE "public"."asset_categories" (
  "id"              uuid                     NOT NULL DEFAULT extensions.uuid_generate_v4(),
  "organization_id" uuid,
  "name"            character varying(255)   NOT NULL,
  "created_at"      timestamp with time zone DEFAULT timezone('utc'::text, now()),
  CONSTRAINT "asset_categories_pkey" PRIMARY KEY (id),
  CONSTRAINT "asset_categories_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE
);


GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."asset_categories" TO "authenticated", "postgres", "service_role";

COMMENT ON TABLE "public"."asset_categories" IS 'Per-organization asset category labels. RLS: same-org authenticated members only. Read by the public scan page indirectly through get_asset_by_qr, which is SECURITY DEFINER and unaffected by these policies.';

-- ---- users ----
CREATE TABLE "public"."users" (
  "id"              uuid                     NOT NULL,
  "email"           character varying(255)   NOT NULL,
  "full_name"       character varying(255),
  "organization_id" uuid,
  "role"            character varying(50)    DEFAULT 'member'::character varying,
  "created_at"      timestamp with time zone DEFAULT timezone('utc'::text, now()),
  "updated_at"      timestamp with time zone DEFAULT timezone('utc'::text, now()),
  "first_name"      text,
  "last_name"       text,
  "avatar_url"      text,
  "language"        text                     DEFAULT 'fr'::text,
  CONSTRAINT "users_email_key" UNIQUE (email),
  CONSTRAINT "users_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id),
  CONSTRAINT "users_language_check" CHECK ((language = ANY (ARRAY['fr'::text, 'en'::text]))),
  CONSTRAINT "users_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  CONSTRAINT "users_pkey" PRIMARY KEY (id)
);


CREATE INDEX idx_users_language ON public.users USING btree (LANGUAGE);

CREATE INDEX idx_users_organization ON public.users USING btree (organization_id);

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER zz_enforce_users_identity_invariant
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_users_identity_invariant();


GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."users" TO "anon", "authenticated", "postgres", "service_role";

COMMENT ON COLUMN "public"."users"."avatar_url" IS 'URL to user profile photo (UploadThing)';

COMMENT ON COLUMN "public"."users"."first_name" IS 'User first name';

COMMENT ON COLUMN "public"."users"."language" IS 'User preferred language (fr or en)';

COMMENT ON COLUMN "public"."users"."last_name" IS 'User last name';

COMMENT ON COLUMN "public"."users"."updated_at" IS 'Timestamp of last profile update';

-- ---- assets ----
CREATE TABLE "public"."assets" (
  "id"               uuid                     NOT NULL DEFAULT extensions.uuid_generate_v4(),
  "organization_id"  uuid,
  "category_id"      uuid,
  "name"             character varying(255)   NOT NULL,
  "description"      text,
  "serial_number"    character varying(255),
  "purchase_date"    date,
  "purchase_price"   numeric(10,2),
  "qr_code"          character varying(255)   NOT NULL,
  "qr_url"           character varying(255)   NOT NULL,
  "status"           character varying(50)    DEFAULT 'available'::character varying,
  "current_location" character varying(255),
  "created_at"       timestamp with time zone DEFAULT timezone('utc'::text, now()),
  "updated_at"       timestamp with time zone DEFAULT timezone('utc'::text, now()),
  "current_value"    numeric(10,2),
  "last_seen_at"     timestamp with time zone,
  "last_seen_by"     uuid,
  "is_demo_data"     boolean                  DEFAULT false,
  "archived_at"      timestamp with time zone,
  "archived_by"      uuid,
  "archive_reason"   text,
  CONSTRAINT "assets_category_id_fkey" FOREIGN KEY (category_id) REFERENCES public.asset_categories(id) ON DELETE SET NULL,
  CONSTRAINT "assets_pkey" PRIMARY KEY (id),
  CONSTRAINT "assets_qr_code_key" UNIQUE (qr_code),
  CONSTRAINT "assets_qr_url_key" UNIQUE (qr_url),
  CONSTRAINT "assets_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  CONSTRAINT "assets_last_seen_by_fkey" FOREIGN KEY (last_seen_by) REFERENCES public.users(id)
);


CREATE INDEX idx_assets_organization ON public.assets USING btree (organization_id);

CREATE INDEX idx_assets_qr_code ON public.assets USING btree (qr_code);

CREATE INDEX idx_assets_status ON public.assets USING btree (status);

CREATE TRIGGER track_asset_creation_trigger
  AFTER INSERT OR DELETE OR UPDATE OF status, organization_id ON public.assets
  FOR EACH ROW
  EXECUTE FUNCTION public.track_asset_creation();

CREATE TRIGGER trg_enforce_asset_limit
  BEFORE INSERT ON public.assets
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_asset_limit();

CREATE TRIGGER update_assets_updated_at
  BEFORE UPDATE ON public.assets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();


GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."assets" TO "anon", "authenticated", "postgres", "service_role";

COMMENT ON COLUMN "public"."assets"."last_seen_at" IS 'Timestamp of last QR scan';

COMMENT ON COLUMN "public"."assets"."last_seen_by" IS 'User who last scanned (nullable for public scans)';

-- ---- audits ----
CREATE TABLE "public"."audits" (
  "id"              uuid                     NOT NULL DEFAULT extensions.uuid_generate_v4(),
  "organization_id" uuid,
  "name"            character varying(255)   NOT NULL,
  "status"          character varying(50)    DEFAULT 'planned'::character varying,
  "scheduled_date"  date,
  "started_at"      timestamp with time zone,
  "completed_at"    timestamp with time zone,
  "total_assets"    integer                  DEFAULT 0,
  "verified_assets" integer                  DEFAULT 0,
  "missing_assets"  integer                  DEFAULT 0,
  "created_by"      uuid,
  "created_at"      timestamp with time zone DEFAULT timezone('utc'::text, now()),
  CONSTRAINT "audits_pkey" PRIMARY KEY (id),
  CONSTRAINT "audits_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  CONSTRAINT "audits_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL
);


GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."audits" TO "anon", "authenticated", "postgres", "service_role";

-- ---- audit_items ----
CREATE TABLE "public"."audit_items" (
  "id"          uuid                     NOT NULL DEFAULT extensions.uuid_generate_v4(),
  "audit_id"    uuid,
  "asset_id"    uuid,
  "status"      character varying(50)    DEFAULT 'pending'::character varying,
  "verified_at" timestamp with time zone,
  "verified_by" uuid,
  "notes"       text,
  CONSTRAINT "audit_items_asset_id_fkey" FOREIGN KEY (asset_id) REFERENCES public.assets(id) ON DELETE CASCADE,
  CONSTRAINT "audit_items_audit_id_asset_id_key" UNIQUE (audit_id, asset_id),
  CONSTRAINT "audit_items_pkey" PRIMARY KEY (id),
  CONSTRAINT "audit_items_audit_id_fkey" FOREIGN KEY (audit_id) REFERENCES public.audits(id) ON DELETE CASCADE,
  CONSTRAINT "audit_items_verified_by_fkey" FOREIGN KEY (verified_by) REFERENCES public.users(id) ON DELETE SET NULL
);


GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."audit_items" TO "anon", "authenticated", "postgres", "service_role";

-- ---- billing_events ----
CREATE TABLE "public"."billing_events" (
  "id"                     uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "organization_id"        uuid                     NOT NULL,
  "event_type"             text                     NOT NULL,
  "stripe_event_id"        text,
  "stripe_subscription_id" text,
  "stripe_invoice_id"      text,
  "amount"                 numeric(10,2),
  "currency"               text                     DEFAULT 'eur'::text,
  "status"                 text,
  "metadata"               jsonb                    DEFAULT '{}'::jsonb,
  "created_at"             timestamp with time zone DEFAULT now(),
  CONSTRAINT "billing_events_pkey" PRIMARY KEY (id),
  CONSTRAINT "billing_events_stripe_event_id_key" UNIQUE (stripe_event_id),
  CONSTRAINT "billing_events_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE
);


CREATE INDEX idx_billing_events_org ON public.billing_events USING btree (organization_id);

CREATE INDEX idx_billing_events_stripe_event ON public.billing_events USING btree (stripe_event_id);


GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."billing_events" TO "anon", "authenticated", "postgres", "service_role";

-- ---- clients ----
CREATE TABLE "public"."clients" (
  "id"              uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" uuid                     NOT NULL,
  "name"            text                     NOT NULL,
  "email"           text,
  "phone"           text,
  "company"         text,
  "address"         text,
  "notes"           text,
  "created_at"      timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"      timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "clients_pkey" PRIMARY KEY (id),
  CONSTRAINT "clients_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
);


CREATE INDEX idx_clients_email ON public.clients USING btree (organization_id, email)
  WHERE (email IS NOT NULL);

CREATE UNIQUE INDEX idx_clients_org_name ON public.clients USING btree (organization_id, lower(name));

CREATE INDEX idx_clients_org ON public.clients USING btree (organization_id);


GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."clients" TO "anon", "authenticated", "postgres", "service_role";

-- ---- scans ----
CREATE TABLE "public"."scans" (
  "id"            uuid                     NOT NULL DEFAULT extensions.uuid_generate_v4(),
  "asset_id"      uuid,
  "scanned_by"    uuid,
  "scan_type"     character varying(50)    DEFAULT 'check'::character varying,
  "notes"         text,
  "location_name" character varying(255),
  "latitude"      numeric(10,8),
  "longitude"     numeric(11,8),
  "scanned_at"    timestamp with time zone DEFAULT timezone('utc'::text, now()),
  CONSTRAINT "scans_asset_id_fkey" FOREIGN KEY (asset_id) REFERENCES public.assets(id) ON DELETE CASCADE,
  CONSTRAINT "scans_pkey" PRIMARY KEY (id),
  CONSTRAINT "scans_scanned_by_fkey" FOREIGN KEY (scanned_by) REFERENCES public.users(id) ON DELETE SET NULL
);


CREATE INDEX idx_scans_asset ON public.scans USING btree (asset_id);

CREATE INDEX idx_scans_date ON public.scans USING btree (scanned_at);


GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."scans" TO "anon", "authenticated", "postgres", "service_role";

-- ---- rentals ----
CREATE TABLE "public"."rentals" (
  "id"                   uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "organization_id"      uuid                     NOT NULL,
  "asset_id"             uuid                     NOT NULL,
  "client_name"          text                     NOT NULL,
  "client_contact"       text,
  "checked_out_by"       uuid                     NOT NULL,
  "returned_by"          uuid,
  "checkout_date"        timestamp with time zone NOT NULL DEFAULT now(),
  "expected_return_date" timestamp with time zone,
  "actual_return_date"   timestamp with time zone,
  "checkout_notes"       text,
  "return_notes"         text,
  "return_condition"     text,
  "status"               text                     NOT NULL DEFAULT 'active'::text,
  "checkout_scan_id"     uuid,
  "return_scan_id"       uuid,
  "created_at"           timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"           timestamp with time zone NOT NULL DEFAULT now(),
  "client_id"            uuid,
  CONSTRAINT "rentals_asset_id_fkey" FOREIGN KEY (asset_id) REFERENCES public.assets(id),
  CONSTRAINT "rentals_client_id_fkey" FOREIGN KEY (client_id) REFERENCES public.clients(id),
  CONSTRAINT "rentals_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id),
  CONSTRAINT "rentals_pkey" PRIMARY KEY (id),
  CONSTRAINT "rentals_return_condition_check" CHECK (((return_condition IS NULL) OR (return_condition = ANY (ARRAY['good'::text, 'fair'::text, 'damaged'::text])))),
  CONSTRAINT "rentals_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'returned'::text, 'cancelled'::text]))),
  CONSTRAINT "rentals_checkout_scan_id_fkey" FOREIGN KEY (checkout_scan_id) REFERENCES public.scans(id),
  CONSTRAINT "rentals_return_scan_id_fkey" FOREIGN KEY (return_scan_id) REFERENCES public.scans(id),
  CONSTRAINT "rentals_checked_out_by_fkey" FOREIGN KEY (checked_out_by) REFERENCES public.users(id),
  CONSTRAINT "rentals_returned_by_fkey" FOREIGN KEY (returned_by) REFERENCES public.users(id)
);


CREATE INDEX idx_rentals_active ON public.rentals USING btree (organization_id, status)
  WHERE (status = 'active'::text);

CREATE INDEX idx_rentals_asset ON public.rentals USING btree (asset_id);

CREATE INDEX idx_rentals_checkout_date ON public.rentals USING btree (checkout_date DESC);

CREATE INDEX idx_rentals_client_id ON public.rentals USING btree (client_id)
  WHERE (client_id IS NOT NULL);

CREATE INDEX idx_rentals_client ON public.rentals USING btree (organization_id, client_name);

CREATE INDEX idx_rentals_org ON public.rentals USING btree (organization_id);


GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."rentals" TO "anon", "authenticated", "postgres", "service_role";

-- ---- vgp_regulatory_profiles ----
CREATE TABLE "public"."vgp_regulatory_profiles" (
  "id"                      uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "name"                    text                     NOT NULL,
  "category"                text,
  "default_interval_months" integer,
  "regulatory_reference"    text,
  "description"             text,
  "created_at"              timestamp with time zone DEFAULT now(),
  "code"                    text                     NOT NULL,
  "usage_condition"         text,
  "classification_status"   text                     NOT NULL DEFAULT 'requires_confirmation'::text,
  "source_url"              text,
  "source_checked_at"       timestamp with time zone,
  "effective_from"          date,
  "effective_to"            date,
  "active"                  boolean                  NOT NULL DEFAULT true,
  CONSTRAINT "vgp_regulatory_profiles_classification_status_check"
    CHECK ((classification_status = ANY (ARRAY['automatic'::text, 'requires_confirmation'::text, 'manual_only'::text]))),
  CONSTRAINT "vgp_regulatory_profiles_code_key" UNIQUE (code),
  CONSTRAINT "vgp_regulatory_profiles_effective_range_check" CHECK (((effective_to IS NULL) OR (effective_from IS NULL) OR (effective_to >= effective_from))),
  CONSTRAINT "vgp_regulatory_profiles_interval_presence_check"
    CHECK ((((classification_status = 'manual_only'::text) AND (default_interval_months IS NULL)) OR ((classification_status <> 'manual_only'::text) AND (default_interval_months IS
    NOT NULL)))),
  CONSTRAINT "vgp_regulatory_profiles_pkey" PRIMARY KEY (id)
);


CREATE INDEX idx_vgp_regulatory_profiles_active ON public.vgp_regulatory_profiles USING btree (active, name)
  WHERE (active = true);


GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."vgp_regulatory_profiles" TO "postgres", "service_role";

COMMENT ON COLUMN "public"."vgp_regulatory_profiles"."category" IS 'LEGACY from vgp_equipment_types. Nullable, never written again. There is deliberately no relationship to asset_categories.';

COMMENT ON COLUMN "public"."vgp_regulatory_profiles"."classification_status" IS 'automatic = prefill the interval; requires_confirmation = prefill but force an explicit confirmation; manual_only = no prefill, the configuration picks the regime.';

COMMENT ON COLUMN "public"."vgp_regulatory_profiles"."default_interval_months" IS 'Default/maximum statutory interval for the identified case. Conditions may require more frequent verification, and the Labour Inspectorate may impose a shorter one -- so this is a proposal, never a guarantee.';

COMMENT ON TABLE "public"."vgp_regulatory_profiles" IS 'Global catalogue of French VGP regulatory profiles. Selected by the user at schedule create/edit -- never derived from an asset category, because the fitted configuration determines the applicable regime. Writes are service_role only.';

REVOKE ALL ON TABLE "public"."vgp_regulatory_profiles" FROM "authenticated";

GRANT SELECT ON TABLE "public"."vgp_regulatory_profiles" TO "authenticated";

-- ---- vgp_schedules ----
CREATE TABLE "public"."vgp_schedules" (
  "id"                               uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "asset_id"                         uuid,
  "organization_id"                  uuid,
  "interval_months"                  integer                  NOT NULL,
  "last_inspection_date"             date,
  "next_due_date"                    date                     NOT NULL,
  "inspector_name"                   text,
  "inspector_company"                text,
  "certification_number"             text,
  "status"                           text                     DEFAULT 'active'::text,
  "notes"                            text,
  "created_at"                       timestamp with time zone DEFAULT now(),
  "updated_at"                       timestamp with time zone DEFAULT now(),
  "archived_at"                      timestamp with time zone,
  "archived_by"                      uuid,
  "archive_reason"                   text,
  "edit_history"                     jsonb                    DEFAULT '[]'::jsonb,
  "created_by"                       text,
  "rapport_url"                      text,
  "inspection_location"              text                     DEFAULT 'depot'::text,
  "regulatory_profile_id"            uuid,
  "regulatory_interval_months"       integer,
  "regulatory_reference_snapshot"    text,
  "regulatory_profile_name_snapshot" text,
  CONSTRAINT "vgp_schedules_archived_by_fkey" FOREIGN KEY (archived_by) REFERENCES public.users(id),
  CONSTRAINT "vgp_schedules_asset_id_fkey" FOREIGN KEY (asset_id) REFERENCES public.assets(id) ON DELETE CASCADE,
  CONSTRAINT "vgp_schedules_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  CONSTRAINT "vgp_schedules_pkey" PRIMARY KEY (id),
  CONSTRAINT "vgp_schedules_regulatory_profile_id_fkey" FOREIGN KEY (regulatory_profile_id) REFERENCES public.vgp_regulatory_profiles(id)
);


CREATE INDEX idx_vgp_schedules_active ON public.vgp_schedules USING btree (organization_id, next_due_date)
  WHERE (archived_at IS NULL);

CREATE INDEX idx_vgp_schedules_archived_by ON public.vgp_schedules USING btree (archived_by);

CREATE INDEX idx_vgp_schedules_archived ON public.vgp_schedules USING btree (archived_at)
  WHERE (archived_at IS NOT NULL);

CREATE INDEX idx_vgp_schedules_asset ON public.vgp_schedules USING btree (asset_id);

CREATE INDEX idx_vgp_schedules_due_date ON public.vgp_schedules USING btree (next_due_date);

CREATE INDEX idx_vgp_schedules_org ON public.vgp_schedules USING btree (organization_id);

CREATE TRIGGER trg_resolve_vgp_alerts
  AFTER UPDATE ON public.vgp_schedules
  FOR EACH ROW
  EXECUTE FUNCTION public.resolve_vgp_alerts_on_completion();


GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."vgp_schedules" TO "anon", "authenticated", "postgres", "service_role";

COMMENT ON COLUMN "public"."vgp_schedules"."archive_reason" IS 'Reason for archiving (required for compliance)';

COMMENT ON COLUMN "public"."vgp_schedules"."archived_at" IS 'Soft delete timestamp - schedule hidden but preserved for audit trail';

COMMENT ON COLUMN "public"."vgp_schedules"."archived_by" IS 'User who archived the schedule';

COMMENT ON COLUMN "public"."vgp_schedules"."created_by" IS 'Name of the person who configured this VGP monitoring schedule';

COMMENT ON COLUMN "public"."vgp_schedules"."edit_history" IS 'Audit trail: [{edited_at, edited_by, field_changed, old_value, new_value, reason}]';

COMMENT ON COLUMN "public"."vgp_schedules"."inspector_name" IS 'Name of the inspector who performs the physical VGP inspection';

COMMENT ON COLUMN "public"."vgp_schedules"."regulatory_interval_months" IS 'The catalogue interval AS IT STOOD when this schedule was saved. Kept separate from interval_months, which is what the user actually chose: the gap between them is the audit-relevant fact.';

COMMENT ON COLUMN "public"."vgp_schedules"."regulatory_reference_snapshot" IS 'Regulatory citation captured at save time. Catalogue updates never backfill this -- a compliance record must not retroactively claim a basis nobody asserted when it was created.';

-- ---- client_recall_alerts ----
CREATE TABLE "public"."client_recall_alerts" (
  "id"              uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" uuid                     NOT NULL,
  "rental_id"       uuid                     NOT NULL,
  "client_id"       uuid,
  "asset_id"        uuid                     NOT NULL,
  "alert_type"      text                     NOT NULL,
  "vgp_schedule_id" uuid,
  "next_due_date"   date                     NOT NULL,
  "sent"            boolean                  NOT NULL DEFAULT false,
  "sent_at"         timestamp with time zone,
  "email_sent_to"   text[],
  "created_at"      timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "client_recall_alerts_alert_type_check" CHECK ((alert_type = ANY (ARRAY['recall_30day'::text, 'recall_14day'::text, 'manual_recall'::text]))),
  CONSTRAINT "client_recall_alerts_asset_id_fkey" FOREIGN KEY (asset_id) REFERENCES public.assets(id),
  CONSTRAINT "client_recall_alerts_pkey" PRIMARY KEY (id),
  CONSTRAINT "client_recall_alerts_client_id_fkey" FOREIGN KEY (client_id) REFERENCES public.clients(id),
  CONSTRAINT "client_recall_alerts_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id),
  CONSTRAINT "client_recall_alerts_rental_id_fkey" FOREIGN KEY (rental_id) REFERENCES public.rentals(id),
  CONSTRAINT "client_recall_alerts_vgp_schedule_id_fkey" FOREIGN KEY (vgp_schedule_id) REFERENCES public.vgp_schedules(id)
);


CREATE INDEX idx_recall_alerts_asset ON public.client_recall_alerts USING btree (asset_id);

CREATE INDEX idx_recall_alerts_client ON public.client_recall_alerts USING btree (client_id);

CREATE UNIQUE INDEX idx_recall_alerts_dedup ON public.client_recall_alerts USING btree (rental_id, alert_type, next_due_date);

CREATE INDEX idx_recall_alerts_org ON public.client_recall_alerts USING btree (organization_id);

CREATE INDEX idx_recall_alerts_rental ON public.client_recall_alerts USING btree (rental_id);

CREATE INDEX idx_recall_alerts_vgp_schedule ON public.client_recall_alerts USING btree (vgp_schedule_id);


GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."client_recall_alerts" TO "anon", "authenticated", "postgres", "service_role";

-- ---- entitlement_overrides ----
CREATE TABLE "public"."entitlement_overrides" (
  "id"              uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" uuid                     NOT NULL,
  "feature"         text                     NOT NULL,
  "granted"         boolean                  NOT NULL DEFAULT true,
  "reason"          text,
  "granted_by"      uuid,
  "expires_at"      timestamp with time zone,
  "created_at"      timestamp with time zone DEFAULT now(),
  CONSTRAINT "entitlement_overrides_organization_id_feature_key" UNIQUE (organization_id, feature),
  CONSTRAINT "entitlement_overrides_pkey" PRIMARY KEY (id),
  CONSTRAINT "entitlement_overrides_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  CONSTRAINT "entitlement_overrides_granted_by_fkey" FOREIGN KEY (granted_by) REFERENCES public.users(id)
);


CREATE INDEX idx_entitlement_overrides_org ON public.entitlement_overrides USING btree (organization_id);


GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."entitlement_overrides" TO "anon", "authenticated", "postgres", "service_role";

-- ---- pending_weekly_digests ----
CREATE TABLE "public"."pending_weekly_digests" (
  "id"              uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"         uuid                     NOT NULL,
  "organization_id" uuid                     NOT NULL,
  "schedule_id"     uuid                     NOT NULL,
  "asset_id"        uuid,
  "alert_type"      text                     NOT NULL,
  "urgency_level"   text,
  "due_date"        date                     NOT NULL,
  "days_until_due"  integer                  NOT NULL,
  "queued_at"       timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "pending_weekly_digests_asset_id_fkey" FOREIGN KEY (asset_id) REFERENCES public.assets(id) ON DELETE CASCADE,
  CONSTRAINT "pending_weekly_digests_dedup_key" UNIQUE (user_id, schedule_id, alert_type),
  CONSTRAINT "pending_weekly_digests_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  CONSTRAINT "pending_weekly_digests_pkey" PRIMARY KEY (id),
  CONSTRAINT "pending_weekly_digests_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
  CONSTRAINT "pending_weekly_digests_schedule_id_fkey" FOREIGN KEY (schedule_id) REFERENCES public.vgp_schedules(id) ON DELETE CASCADE
);


CREATE INDEX idx_pending_weekly_org ON public.pending_weekly_digests USING btree (organization_id);

CREATE INDEX idx_pending_weekly_user ON public.pending_weekly_digests USING btree (user_id);


GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."pending_weekly_digests" TO "authenticated", "postgres", "service_role";

COMMENT ON TABLE "public"."pending_weekly_digests" IS 'Alerts deferred for users on weekly_digest. Written by the daily VGP cron, drained by /api/cron/vgp-weekly-digest on Mondays. Rows are removed only after their email is accepted.';

-- ---- platform_admins ----
CREATE TABLE "public"."platform_admins" (
  "user_id"    uuid                     NOT NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "platform_admins_pkey" PRIMARY KEY (user_id),
  CONSTRAINT "platform_admins_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);


GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."platform_admins" TO "anon", "authenticated", "postgres", "service_role";

-- ---- settings_audit_log ----
CREATE TABLE "public"."settings_audit_log" (
  "id"               uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "organization_id"  uuid                     NOT NULL,
  "user_id"          uuid                     NOT NULL,
  "setting_category" text                     NOT NULL,
  "action"           text                     NOT NULL,
  "old_value"        jsonb,
  "new_value"        jsonb,
  "created_at"       timestamp with time zone DEFAULT now(),
  CONSTRAINT "settings_audit_log_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  CONSTRAINT "settings_audit_log_pkey" PRIMARY KEY (id),
  CONSTRAINT "settings_audit_log_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL
);


CREATE INDEX idx_settings_audit_log_org ON public.settings_audit_log USING btree (organization_id, created_at DESC);


GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."settings_audit_log" TO "anon", "authenticated", "postgres", "service_role";

-- ---- subscription_plans ----
CREATE TABLE "public"."subscription_plans" (
  "id"                   uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "name"                 text                     NOT NULL,
  "slug"                 text                     NOT NULL,
  "description"          text,
  "price_monthly"        numeric(10,2)            NOT NULL,
  "price_yearly"         numeric(10,2),
  "max_assets"           integer                  NOT NULL,
  "max_users"            integer                  NOT NULL,
  "features"             jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "is_active"            boolean                  DEFAULT true,
  "display_order"        integer                  DEFAULT 0,
  "created_at"           timestamp with time zone DEFAULT now(),
  "updated_at"           timestamp with time zone DEFAULT now(),
  "stripe_price_monthly" text,
  "stripe_price_annual"  text,
  CONSTRAINT "subscription_plans_name_key" UNIQUE (name),
  CONSTRAINT "subscription_plans_pkey" PRIMARY KEY (id),
  CONSTRAINT "subscription_plans_slug_key" UNIQUE (slug)
);


GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."subscription_plans" TO "anon", "authenticated", "postgres", "service_role";

COMMENT ON COLUMN "public"."subscription_plans"."max_assets" IS 'SENTINEL on the travixo row (int4 max), not a limit. Licensed capacity is per-subscription (subscriptions.licensed_capacity), because two customers on the same plan license different amounts. Retired tier rows keep their original values.';

-- ---- subscriptions ----
CREATE TABLE "public"."subscriptions" (
  "id"                     uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "organization_id"        uuid                     NOT NULL,
  "plan_id"                uuid                     NOT NULL,
  "status"                 text                     NOT NULL DEFAULT 'active'::text,
  "billing_cycle"          text                     NOT NULL DEFAULT 'monthly'::text,
  "current_period_start"   timestamp with time zone NOT NULL DEFAULT now(),
  "current_period_end"     timestamp with time zone NOT NULL,
  "cancel_at_period_end"   boolean                  DEFAULT false,
  "cancelled_at"           timestamp with time zone,
  "trial_start"            timestamp with time zone,
  "trial_end"              timestamp with time zone,
  "metadata"               jsonb                    DEFAULT '{}'::jsonb,
  "created_at"             timestamp with time zone DEFAULT now(),
  "updated_at"             timestamp with time zone DEFAULT now(),
  "stripe_subscription_id" text,
  "stripe_price_id"        text,
  "licensed_capacity"      integer,
  CONSTRAINT "subscriptions_licensed_capacity_check" CHECK (((licensed_capacity IS NULL) OR (licensed_capacity > 0))),
  CONSTRAINT "subscriptions_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  CONSTRAINT "subscriptions_organization_id_key" UNIQUE (organization_id),
  CONSTRAINT "subscriptions_pkey" PRIMARY KEY (id),
  CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY (plan_id) REFERENCES public.subscription_plans(id),
  CONSTRAINT "subscriptions_stripe_subscription_id_key" UNIQUE (stripe_subscription_id)
);


CREATE INDEX idx_subscriptions_org ON public.subscriptions USING btree (organization_id);

CREATE INDEX idx_subscriptions_period_end ON public.subscriptions USING btree (current_period_end);

CREATE INDEX idx_subscriptions_status ON public.subscriptions USING btree (status);

CREATE INDEX idx_subscriptions_stripe_sub ON public.subscriptions USING btree (stripe_subscription_id);


GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."subscriptions" TO "anon", "authenticated", "postgres", "service_role";

COMMENT ON COLUMN "public"."subscriptions"."licensed_capacity" IS 'Licensed asset capacity = the Stripe subscription item quantity. NULL when there is no Stripe subscription (pilot/trial). Never derived from the live asset count: capacity is what was purchased, not what is in use.';

-- ---- team_invitations ----
CREATE TABLE "public"."team_invitations" (
  "id"              uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" uuid                     NOT NULL,
  "email"           character varying(255)   NOT NULL,
  "role"            character varying(50)    NOT NULL DEFAULT 'member'::character varying,
  "token"           character varying(255)   NOT NULL,
  "invited_by"      uuid                     NOT NULL,
  "status"          character varying(50)    NOT NULL DEFAULT 'pending'::character varying,
  "expires_at"      timestamp with time zone NOT NULL DEFAULT (now() + '7 days'::interval),
  "created_at"      timestamp with time zone NOT NULL DEFAULT now(),
  "accepted_at"     timestamp with time zone,
  CONSTRAINT "team_invitations_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  CONSTRAINT "team_invitations_pkey" PRIMARY KEY (id),
  CONSTRAINT "team_invitations_token_key" UNIQUE (token),
  CONSTRAINT "team_invitations_invited_by_fkey" FOREIGN KEY (invited_by) REFERENCES public.users(id)
);


CREATE INDEX idx_team_invitations_email ON public.team_invitations USING btree (email);

CREATE INDEX idx_team_invitations_org ON public.team_invitations USING btree (organization_id);

CREATE INDEX idx_team_invitations_status ON public.team_invitations USING btree (status);

CREATE INDEX idx_team_invitations_token ON public.team_invitations USING btree (token);


GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."team_invitations" TO "anon", "authenticated", "postgres", "service_role";

-- ---- usage_tracking ----
CREATE TABLE "public"."usage_tracking" (
  "id"               uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "organization_id"  uuid                     NOT NULL,
  "period_start"     timestamp with time zone NOT NULL,
  "period_end"       timestamp with time zone NOT NULL,
  "asset_count"      integer                  DEFAULT 0,
  "user_count"       integer                  DEFAULT 0,
  "scan_count"       integer                  DEFAULT 0,
  "inspection_count" integer                  DEFAULT 0,
  "created_at"       timestamp with time zone DEFAULT now(),
  CONSTRAINT "usage_tracking_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  CONSTRAINT "usage_tracking_organization_id_period_start_key" UNIQUE (organization_id, period_start),
  CONSTRAINT "usage_tracking_pkey" PRIMARY KEY (id)
);


CREATE INDEX idx_usage_tracking_org ON public.usage_tracking USING btree (organization_id);


GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."usage_tracking" TO "anon", "authenticated", "postgres", "service_role";

-- ---- user_notification_preferences ----
CREATE TABLE "public"."user_notification_preferences" (
  "id"              uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"         uuid                     NOT NULL,
  "organization_id" uuid                     NOT NULL,
  "vgp_frequency"   text                     NOT NULL DEFAULT 'daily_digest'::text,
  "vgp_thresholds"  integer[]                NOT NULL DEFAULT '{30,15,7,1,0}'::integer[],
  "created_at"      timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"      timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "user_notification_preferences_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  CONSTRAINT "user_notification_preferences_pkey" PRIMARY KEY (id),
  CONSTRAINT "user_notification_preferences_user_org_key" UNIQUE (user_id, organization_id),
  CONSTRAINT "user_notification_preferences_vgp_frequency_check" CHECK ((vgp_frequency = ANY (ARRAY['immediate'::text, 'daily_digest'::text, 'weekly_digest'::text, 'off'::text]))),
  CONSTRAINT "user_notification_preferences_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE
);


CREATE INDEX idx_user_notif_prefs_active ON public.user_notification_preferences USING btree (organization_id, vgp_frequency)
  WHERE (vgp_frequency <> 'off'::text);

CREATE INDEX idx_user_notif_prefs_org ON public.user_notification_preferences USING btree (organization_id);

CREATE TRIGGER update_user_notif_prefs_updated_at
  BEFORE UPDATE ON public.user_notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();


GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."user_notification_preferences" TO "authenticated", "postgres", "service_role";

COMMENT ON COLUMN "public"."user_notification_preferences"."vgp_thresholds" IS 'FREQUENCY_RULES.preferenceDay values, not day counts: 30/15/7/1/0 identify the planning/attention/urgent/critical/overdue bands respectively.';

COMMENT ON TABLE "public"."user_notification_preferences" IS 'Per-user VGP alert delivery preferences. Overrides organizations.notification_preferences, which remains the default when no row exists.';

-- ---- vgp_alerts ----
CREATE TABLE "public"."vgp_alerts" (
  "id"              uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "asset_id"        uuid,
  "schedule_id"     uuid,
  "organization_id" uuid,
  "alert_type"      text                     NOT NULL,
  "alert_date"      date                     NOT NULL,
  "due_date"        date                     NOT NULL,
  "sent"            boolean                  DEFAULT false,
  "sent_at"         timestamp with time zone,
  "email_sent_to"   text[],
  "created_at"      timestamp with time zone DEFAULT now(),
  "resolved"        boolean                  DEFAULT false,
  "resolved_at"     timestamp with time zone,
  "resolved_reason" text,
  "urgency_level"   text,
  CONSTRAINT "vgp_alerts_asset_id_fkey" FOREIGN KEY (asset_id) REFERENCES public.assets(id) ON DELETE CASCADE,
  CONSTRAINT "vgp_alerts_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  CONSTRAINT "vgp_alerts_pkey" PRIMARY KEY (id),
  CONSTRAINT "vgp_alerts_schedule_id_fkey" FOREIGN KEY (schedule_id) REFERENCES public.vgp_schedules(id) ON DELETE CASCADE
);


CREATE INDEX idx_vgp_alerts_asset ON public.vgp_alerts USING btree (asset_id);

CREATE INDEX idx_vgp_alerts_daily_count ON public.vgp_alerts USING btree (alert_date, sent)
  WHERE (sent = true);

CREATE UNIQUE INDEX idx_vgp_alerts_dedup_unique ON public.vgp_alerts USING btree (schedule_id, alert_type, alert_date)
  WHERE (sent = true);

CREATE INDEX idx_vgp_alerts_dedup ON public.vgp_alerts USING btree (schedule_id, alert_type, alert_date, sent)
  WHERE (sent = true);

CREATE INDEX idx_vgp_alerts_org ON public.vgp_alerts USING btree (organization_id);

CREATE INDEX idx_vgp_alerts_resolved ON public.vgp_alerts USING btree (resolved, resolved_at);

CREATE INDEX idx_vgp_alerts_schedule_unresolved ON public.vgp_alerts USING btree (schedule_id, sent_at DESC)
  WHERE (resolved = false);

CREATE INDEX idx_vgp_alerts_sent_date ON public.vgp_alerts USING btree (organization_id, alert_date, sent)
  WHERE (sent = true);


GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."vgp_alerts" TO "anon", "authenticated", "postgres", "service_role";

-- ---- vgp_digest_deliveries ----
CREATE TABLE "public"."vgp_digest_deliveries" (
  "id"                  uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"             uuid,
  "organization_id"     uuid,
  "recipient_email"     text                     NOT NULL,
  "period"              text                     NOT NULL DEFAULT 'weekly'::text,
  "item_count"          integer                  NOT NULL,
  "provider_message_id" text,
  "sent_at"             timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "vgp_digest_deliveries_item_count_check" CHECK ((item_count > 0)),
  CONSTRAINT "vgp_digest_deliveries_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE SET NULL,
  CONSTRAINT "vgp_digest_deliveries_period_check" CHECK ((period = ANY (ARRAY['weekly'::text, 'daily'::text]))),
  CONSTRAINT "vgp_digest_deliveries_pkey" PRIMARY KEY (id),
  CONSTRAINT "vgp_digest_deliveries_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL
);


CREATE INDEX idx_vgp_digest_deliveries_sent_at ON public.vgp_digest_deliveries USING btree (sent_at DESC);

CREATE INDEX idx_vgp_digest_deliveries_user ON public.vgp_digest_deliveries USING btree (user_id, sent_at DESC);


GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."vgp_digest_deliveries" TO "postgres", "service_role";

COMMENT ON COLUMN "public"."vgp_digest_deliveries"."provider_message_id" IS 'Resend message id, as returned by the send. The traceable artifact: it can be looked up in the provider dashboard to confirm actual delivery.';

COMMENT ON TABLE "public"."vgp_digest_deliveries" IS 'One row per digest email Resend acknowledged. Exists because the outbox deletes its rows on success, which made an empty queue indistinguishable from a feature that had never worked.';

REVOKE ALL ON TABLE "public"."vgp_digest_deliveries" FROM "authenticated";

GRANT SELECT ON TABLE "public"."vgp_digest_deliveries" TO "authenticated";

-- ---- vgp_inspections ----
CREATE TABLE "public"."vgp_inspections" (
  "id"                    uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "asset_id"              uuid,
  "schedule_id"           uuid,
  "organization_id"       uuid,
  "inspection_date"       date                     NOT NULL,
  "inspector_name"        text                     NOT NULL,
  "inspector_company"     text,
  "certification_number"  text,
  "result"                text                     NOT NULL,
  "findings"              text,
  "next_inspection_date"  date,
  "certificate_url"       text,
  "certificate_file_name" text,
  "performed_by"          uuid,
  "created_at"            timestamp with time zone DEFAULT now(),
  "verification_type"     text                     NOT NULL DEFAULT 'PERIODIQUE'::text,
  "observations"          text                     NOT NULL DEFAULT 'RAS'::text,
  CONSTRAINT "vgp_inspections_asset_id_fkey" FOREIGN KEY (asset_id) REFERENCES public.assets(id) ON DELETE CASCADE,
  CONSTRAINT "vgp_inspections_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  CONSTRAINT "vgp_inspections_performed_by_fkey" FOREIGN KEY (performed_by) REFERENCES public.users(id),
  CONSTRAINT "vgp_inspections_pkey" PRIMARY KEY (id),
  CONSTRAINT "vgp_inspections_result_check" CHECK ((result = ANY (ARRAY['passed'::text, 'conditional'::text, 'failed'::text]))),
  CONSTRAINT "vgp_inspections_verification_type_check" CHECK ((verification_type = ANY (ARRAY['PERIODIQUE'::text, 'INITIALE'::text, 'REMISE_SERVICE'::text]))),
  CONSTRAINT "vgp_inspections_schedule_id_fkey" FOREIGN KEY (schedule_id) REFERENCES public.vgp_schedules(id) ON DELETE SET NULL
);


CREATE INDEX idx_vgp_inspections_asset ON public.vgp_inspections USING btree (asset_id);

CREATE INDEX idx_vgp_inspections_org ON public.vgp_inspections USING btree (organization_id);

CREATE INDEX idx_vgp_inspections_verification_type ON public.vgp_inspections USING btree (verification_type);


GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."vgp_inspections" TO "anon", "authenticated", "postgres", "service_role";

COMMENT ON COLUMN "public"."vgp_inspections"."observations" IS 'Observations de l''inspecteur (utiliser "RAS" si aucune remarque)';

COMMENT ON COLUMN "public"."vgp_inspections"."verification_type" IS 'Type de vérification VGP (PERIODIQUE/INITIALE/REMISE_SERVICE)';

-- ============ ROW LEVEL SECURITY ============
--
-- Each policy is dropped before creation so this file is re-runnable and so
-- historical migrations that recreate the same policy do not collide.

-- ---- admin_audit_log ----
ALTER TABLE "public"."admin_audit_log"
  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin_read_audit_log" ON "public"."admin_audit_log";
CREATE POLICY "super_admin_read_audit_log" ON "public"."admin_audit_log"
  FOR SELECT
  TO PUBLIC
  USING (public.is_super_admin());


-- ---- organizations ----
ALTER TABLE "public"."organizations"
  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can create organizations" ON "public"."organizations";
CREATE POLICY "Authenticated users can create organizations" ON "public"."organizations"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((auth.role() = 'authenticated'::text));

DROP POLICY IF EXISTS "Owners and admins can update organization" ON "public"."organizations";
CREATE POLICY "Owners and admins can update organization" ON "public"."organizations"
  FOR UPDATE
  TO PUBLIC
  USING ((id IN ( SELECT users.organization_id
   FROM public.users
  WHERE ((users.id = auth.uid()) AND ((users.role)::text = ANY ((ARRAY['owner'::character varying, 'admin'::character varying])::text[]))))))
  WITH CHECK ((id IN ( SELECT users.organization_id
   FROM public.users
  WHERE ((users.id = auth.uid()) AND ((users.role)::text = ANY ((ARRAY['owner'::character varying, 'admin'::character varying])::text[]))))));

DROP POLICY IF EXISTS "Users can update own organization" ON "public"."organizations";
CREATE POLICY "Users can update own organization" ON "public"."organizations"
  FOR UPDATE
  TO PUBLIC
  USING ((id IN ( SELECT users.organization_id
   FROM public.users
  WHERE (users.id = auth.uid()))));

DROP POLICY IF EXISTS "Users can view own organization" ON "public"."organizations";
CREATE POLICY "Users can view own organization" ON "public"."organizations"
  FOR SELECT
  TO PUBLIC
  USING ((id IN ( SELECT users.organization_id
   FROM public.users
  WHERE (users.id = auth.uid()))));

DROP POLICY IF EXISTS "org_insert_during_signup" ON "public"."organizations";
CREATE POLICY "org_insert_during_signup" ON "public"."organizations"
  FOR INSERT
  TO PUBLIC
  WITH CHECK (true);

DROP POLICY IF EXISTS "org_select_own" ON "public"."organizations";
CREATE POLICY "org_select_own" ON "public"."organizations"
  FOR SELECT
  TO PUBLIC
  USING ((id IN ( SELECT users.organization_id
   FROM public.users
  WHERE (users.id = auth.uid()))));

DROP POLICY IF EXISTS "org_update_own" ON "public"."organizations";
CREATE POLICY "org_update_own" ON "public"."organizations"
  FOR UPDATE
  TO PUBLIC
  USING ((id IN ( SELECT users.organization_id
   FROM public.users
  WHERE (users.id = auth.uid()))))
  WITH CHECK ((id IN ( SELECT users.organization_id
   FROM public.users
  WHERE (users.id = auth.uid()))));

DROP POLICY IF EXISTS "super_admin_all_access" ON "public"."organizations";
CREATE POLICY "super_admin_all_access" ON "public"."organizations"
  FOR ALL
  TO PUBLIC
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());


-- ---- asset_categories ----
ALTER TABLE "public"."asset_categories"
  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "asset_categories_delete_same_org" ON "public"."asset_categories";
CREATE POLICY "asset_categories_delete_same_org" ON "public"."asset_categories"
  FOR DELETE
  TO "authenticated"
  USING ((organization_id IN ( SELECT u.organization_id
   FROM public.users u
  WHERE (u.id = auth.uid()))));

DROP POLICY IF EXISTS "asset_categories_insert_same_org" ON "public"."asset_categories";
CREATE POLICY "asset_categories_insert_same_org" ON "public"."asset_categories"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((organization_id IN ( SELECT u.organization_id
   FROM public.users u
  WHERE (u.id = auth.uid()))));

DROP POLICY IF EXISTS "asset_categories_select_same_org" ON "public"."asset_categories";
CREATE POLICY "asset_categories_select_same_org" ON "public"."asset_categories"
  FOR SELECT
  TO "authenticated"
  USING ((organization_id IN ( SELECT u.organization_id
   FROM public.users u
  WHERE (u.id = auth.uid()))));

DROP POLICY IF EXISTS "asset_categories_update_same_org" ON "public"."asset_categories";
CREATE POLICY "asset_categories_update_same_org" ON "public"."asset_categories"
  FOR UPDATE
  TO "authenticated"
  USING ((organization_id IN ( SELECT u.organization_id
   FROM public.users u
  WHERE (u.id = auth.uid()))))
  WITH CHECK ((organization_id IN ( SELECT u.organization_id
   FROM public.users u
  WHERE (u.id = auth.uid()))));


-- ---- users ----
ALTER TABLE "public"."users"
  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can update team member roles" ON "public"."users";
CREATE POLICY "Admins can update team member roles" ON "public"."users"
  FOR UPDATE
  TO PUBLIC
  USING (((organization_id = public.get_my_organization_id()) AND (EXISTS ( SELECT 1
   FROM public.users me
  WHERE
    ((me.id = auth.uid()) AND (me.organization_id = users.organization_id) AND ((me.role)::text = ANY ((ARRAY['owner'::character varying, 'admin'::character
    varying])::text[])))))))
  WITH
    CHECK
    (((organization_id = public.get_my_organization_id()) AND ((role)::text = ANY ((ARRAY['owner'::character varying, 'admin'::character varying, 'member'::character varying,
    'viewer'::character varying])::text[]))));

DROP POLICY IF EXISTS "Users can insert own profile" ON "public"."users";
CREATE POLICY "Users can insert own profile" ON "public"."users"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((auth.uid() = id));

DROP POLICY IF EXISTS "Users can update own profile" ON "public"."users";
CREATE POLICY "Users can update own profile" ON "public"."users"
  FOR UPDATE
  TO PUBLIC
  USING ((id = auth.uid()))
  WITH
    CHECK
    (((id = auth.uid()) AND ((role)::text = ANY ((ARRAY['owner'::character varying, 'admin'::character varying, 'member'::character varying, 'viewer'::character
    varying])::text[]))));

DROP POLICY IF EXISTS "Users can view own profile" ON "public"."users";
CREATE POLICY "Users can view own profile" ON "public"."users"
  FOR SELECT
  TO "authenticated"
  USING ((auth.uid() = id));

DROP POLICY IF EXISTS "super_admin_read_all_users" ON "public"."users";
CREATE POLICY "super_admin_read_all_users" ON "public"."users"
  FOR SELECT
  TO PUBLIC
  USING (public.is_super_admin());

DROP POLICY IF EXISTS "users_insert_during_signup" ON "public"."users";
CREATE POLICY "users_insert_during_signup" ON "public"."users"
  FOR INSERT
  TO PUBLIC
  WITH CHECK (true);

DROP POLICY IF EXISTS "users_select_same_org" ON "public"."users";
CREATE POLICY "users_select_same_org" ON "public"."users"
  FOR SELECT
  TO PUBLIC
  USING ((organization_id = public.get_my_organization_id()));

COMMENT ON POLICY "Users can insert own profile" ON "public"."users" IS 'Allow user creation during signup process';

COMMENT ON POLICY "Users can view own profile" ON "public"."users" IS 'Users can only read their own profile data';


-- ---- assets ----
ALTER TABLE "public"."assets"
  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view assets in own organization" ON "public"."assets";
CREATE POLICY "Users can view assets in own organization" ON "public"."assets"
  FOR SELECT
  TO PUBLIC
  USING ((organization_id IN ( SELECT users.organization_id
   FROM public.users
  WHERE (users.id = auth.uid()))));

DROP POLICY IF EXISTS "assets_delete_org" ON "public"."assets";
CREATE POLICY "assets_delete_org" ON "public"."assets"
  FOR DELETE
  TO PUBLIC
  USING ((organization_id IN ( SELECT users.organization_id
   FROM public.users
  WHERE (users.id = auth.uid()))));

DROP POLICY IF EXISTS "assets_delete_same_org" ON "public"."assets";
CREATE POLICY "assets_delete_same_org" ON "public"."assets"
  FOR DELETE
  TO "authenticated"
  USING ((organization_id IN ( SELECT u.organization_id
   FROM public.users u
  WHERE (u.id = auth.uid()))));

DROP POLICY IF EXISTS "assets_insert_org" ON "public"."assets";
CREATE POLICY "assets_insert_org" ON "public"."assets"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((organization_id IN ( SELECT users.organization_id
   FROM public.users
  WHERE (users.id = auth.uid()))));

DROP POLICY IF EXISTS "assets_insert_same_org" ON "public"."assets";
CREATE POLICY "assets_insert_same_org" ON "public"."assets"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((organization_id IN ( SELECT u.organization_id
   FROM public.users u
  WHERE (u.id = auth.uid()))));

DROP POLICY IF EXISTS "assets_select_org_authenticated" ON "public"."assets";
CREATE POLICY "assets_select_org_authenticated" ON "public"."assets"
  FOR SELECT
  TO "authenticated"
  USING ((organization_id IN ( SELECT users.organization_id
   FROM public.users
  WHERE (users.id = auth.uid()))));

DROP POLICY IF EXISTS "assets_select_same_org" ON "public"."assets";
CREATE POLICY "assets_select_same_org" ON "public"."assets"
  FOR SELECT
  TO "authenticated"
  USING ((organization_id IN ( SELECT u.organization_id
   FROM public.users u
  WHERE (u.id = auth.uid()))));

DROP POLICY IF EXISTS "assets_update_org_authenticated" ON "public"."assets";
CREATE POLICY "assets_update_org_authenticated" ON "public"."assets"
  FOR UPDATE
  TO "authenticated"
  USING ((organization_id IN ( SELECT users.organization_id
   FROM public.users
  WHERE (users.id = auth.uid()))))
  WITH CHECK ((organization_id IN ( SELECT users.organization_id
   FROM public.users
  WHERE (users.id = auth.uid()))));

DROP POLICY IF EXISTS "assets_update_same_org" ON "public"."assets";
CREATE POLICY "assets_update_same_org" ON "public"."assets"
  FOR UPDATE
  TO "authenticated"
  USING ((organization_id IN ( SELECT u.organization_id
   FROM public.users u
  WHERE (u.id = auth.uid()))))
  WITH CHECK ((organization_id IN ( SELECT u.organization_id
   FROM public.users u
  WHERE (u.id = auth.uid()))));

DROP POLICY IF EXISTS "super_admin_read_all_assets" ON "public"."assets";
CREATE POLICY "super_admin_read_all_assets" ON "public"."assets"
  FOR SELECT
  TO PUBLIC
  USING (public.is_super_admin());


-- ---- audits ----
ALTER TABLE "public"."audits"
  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can delete audits in their organization" ON "public"."audits";
CREATE POLICY "Admins can delete audits in their organization" ON "public"."audits"
  FOR DELETE
  TO PUBLIC
  USING ((organization_id IN ( SELECT users.organization_id
   FROM public.users
  WHERE ((users.id = auth.uid()) AND ((users.role)::text = ANY ((ARRAY['owner'::character varying, 'admin'::character varying])::text[]))))));

DROP POLICY IF EXISTS "Users can create audits in their organization" ON "public"."audits";
CREATE POLICY "Users can create audits in their organization" ON "public"."audits"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((organization_id IN ( SELECT users.organization_id
   FROM public.users
  WHERE (users.id = auth.uid()))));

DROP POLICY IF EXISTS "Users can update audits in their organization" ON "public"."audits";
CREATE POLICY "Users can update audits in their organization" ON "public"."audits"
  FOR UPDATE
  TO PUBLIC
  USING ((organization_id IN ( SELECT users.organization_id
   FROM public.users
  WHERE (users.id = auth.uid()))));

DROP POLICY IF EXISTS "Users can view audits in their organization" ON "public"."audits";
CREATE POLICY "Users can view audits in their organization" ON "public"."audits"
  FOR SELECT
  TO PUBLIC
  USING ((organization_id IN ( SELECT users.organization_id
   FROM public.users
  WHERE (users.id = auth.uid()))));


-- ---- audit_items ----
ALTER TABLE "public"."audit_items"
  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage audit items for their audits" ON "public"."audit_items";
CREATE POLICY "Users can manage audit items for their audits" ON "public"."audit_items"
  FOR ALL
  TO PUBLIC
  USING ((audit_id IN ( SELECT audits.id
   FROM public.audits
  WHERE (audits.organization_id IN ( SELECT users.organization_id
           FROM public.users
          WHERE (users.id = auth.uid()))))));

DROP POLICY IF EXISTS "Users can view audit items for their audits" ON "public"."audit_items";
CREATE POLICY "Users can view audit items for their audits" ON "public"."audit_items"
  FOR SELECT
  TO PUBLIC
  USING ((audit_id IN ( SELECT audits.id
   FROM public.audits
  WHERE (audits.organization_id IN ( SELECT users.organization_id
           FROM public.users
          WHERE (users.id = auth.uid()))))));


-- ---- billing_events ----
ALTER TABLE "public"."billing_events"
  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own org billing events" ON "public"."billing_events";
CREATE POLICY "Users can view own org billing events" ON "public"."billing_events"
  FOR SELECT
  TO "authenticated"
  USING ((organization_id IN ( SELECT users.organization_id
   FROM public.users
  WHERE (users.id = auth.uid()))));

DROP POLICY IF EXISTS "super_admin_read_all_billing_events" ON "public"."billing_events";
CREATE POLICY "super_admin_read_all_billing_events" ON "public"."billing_events"
  FOR SELECT
  TO PUBLIC
  USING (public.is_super_admin());


-- ---- clients ----
ALTER TABLE "public"."clients"
  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can insert own org clients" ON "public"."clients";
CREATE POLICY "Users can insert own org clients" ON "public"."clients"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((organization_id IN ( SELECT users.organization_id
   FROM public.users
  WHERE (users.id = auth.uid()))));

DROP POLICY IF EXISTS "Users can update own org clients" ON "public"."clients";
CREATE POLICY "Users can update own org clients" ON "public"."clients"
  FOR UPDATE
  TO PUBLIC
  USING ((organization_id IN ( SELECT users.organization_id
   FROM public.users
  WHERE (users.id = auth.uid()))));

DROP POLICY IF EXISTS "Users can view own org clients" ON "public"."clients";
CREATE POLICY "Users can view own org clients" ON "public"."clients"
  FOR SELECT
  TO PUBLIC
  USING ((organization_id IN ( SELECT users.organization_id
   FROM public.users
  WHERE (users.id = auth.uid()))));

DROP POLICY IF EXISTS "super_admin_read_all_clients" ON "public"."clients";
CREATE POLICY "super_admin_read_all_clients" ON "public"."clients"
  FOR SELECT
  TO PUBLIC
  USING (public.is_super_admin());


-- ---- scans ----
ALTER TABLE "public"."scans"
  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "scans_insert_public_qr_log" ON "public"."scans";
CREATE POLICY "scans_insert_public_qr_log" ON "public"."scans"
  FOR INSERT
  TO "anon", "authenticated"
  WITH CHECK (((EXISTS ( SELECT 1
   FROM public.assets a
  WHERE ((a.id = scans.asset_id) AND (a.archived_at IS NULL)))) AND ((scanned_by IS NULL) OR (scanned_by = auth.uid()))));

DROP POLICY IF EXISTS "scans_select_same_org" ON "public"."scans";
CREATE POLICY "scans_select_same_org" ON "public"."scans"
  FOR SELECT
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.assets a
  WHERE ((a.id = scans.asset_id) AND (a.organization_id IN ( SELECT u.organization_id
           FROM public.users u
          WHERE (u.id = auth.uid())))))));

DROP POLICY IF EXISTS "super_admin_read_all_scans" ON "public"."scans";
CREATE POLICY "super_admin_read_all_scans" ON "public"."scans"
  FOR SELECT
  TO PUBLIC
  USING (public.is_super_admin());


-- ---- rentals ----
ALTER TABLE "public"."rentals"
  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can insert own org rentals" ON "public"."rentals";
CREATE POLICY "Users can insert own org rentals" ON "public"."rentals"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((organization_id IN ( SELECT users.organization_id
   FROM public.users
  WHERE (users.id = auth.uid()))));

DROP POLICY IF EXISTS "Users can update own org rentals" ON "public"."rentals";
CREATE POLICY "Users can update own org rentals" ON "public"."rentals"
  FOR UPDATE
  TO PUBLIC
  USING ((organization_id IN ( SELECT users.organization_id
   FROM public.users
  WHERE (users.id = auth.uid()))));

DROP POLICY IF EXISTS "Users can view own org rentals" ON "public"."rentals";
CREATE POLICY "Users can view own org rentals" ON "public"."rentals"
  FOR SELECT
  TO PUBLIC
  USING ((organization_id IN ( SELECT users.organization_id
   FROM public.users
  WHERE (users.id = auth.uid()))));

DROP POLICY IF EXISTS "super_admin_read_all_rentals" ON "public"."rentals";
CREATE POLICY "super_admin_read_all_rentals" ON "public"."rentals"
  FOR SELECT
  TO PUBLIC
  USING (public.is_super_admin());


-- ---- vgp_regulatory_profiles ----
ALTER TABLE "public"."vgp_regulatory_profiles"
  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Signed-in users can read the regulatory catalogue" ON "public"."vgp_regulatory_profiles";
CREATE POLICY "Signed-in users can read the regulatory catalogue" ON "public"."vgp_regulatory_profiles"
  FOR SELECT
  TO "authenticated"
  USING (true);


-- ---- vgp_schedules ----
ALTER TABLE "public"."vgp_schedules"
  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can delete org schedules" ON "public"."vgp_schedules";
CREATE POLICY "Users can delete org schedules" ON "public"."vgp_schedules"
  FOR DELETE
  TO PUBLIC
  USING ((organization_id IN ( SELECT users.organization_id
   FROM public.users
  WHERE (users.id = auth.uid()))));

DROP POLICY IF EXISTS "Users can delete own org vgp_schedules" ON "public"."vgp_schedules";
CREATE POLICY "Users can delete own org vgp_schedules" ON "public"."vgp_schedules"
  FOR DELETE
  TO "authenticated"
  USING ((organization_id IN ( SELECT users.organization_id
   FROM public.users
  WHERE (users.id = auth.uid()))));

DROP POLICY IF EXISTS "Users can insert org schedules" ON "public"."vgp_schedules";
CREATE POLICY "Users can insert org schedules" ON "public"."vgp_schedules"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((organization_id IN ( SELECT users.organization_id
   FROM public.users
  WHERE (users.id = auth.uid()))));

DROP POLICY IF EXISTS "Users can insert own org vgp_schedules" ON "public"."vgp_schedules";
CREATE POLICY "Users can insert own org vgp_schedules" ON "public"."vgp_schedules"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((organization_id IN ( SELECT users.organization_id
   FROM public.users
  WHERE (users.id = auth.uid()))));

DROP POLICY IF EXISTS "Users can update org schedules" ON "public"."vgp_schedules";
CREATE POLICY "Users can update org schedules" ON "public"."vgp_schedules"
  FOR UPDATE
  TO PUBLIC
  USING ((organization_id IN ( SELECT users.organization_id
   FROM public.users
  WHERE (users.id = auth.uid()))));

DROP POLICY IF EXISTS "Users can update own org vgp_schedules" ON "public"."vgp_schedules";
CREATE POLICY "Users can update own org vgp_schedules" ON "public"."vgp_schedules"
  FOR UPDATE
  TO "authenticated"
  USING ((organization_id IN ( SELECT users.organization_id
   FROM public.users
  WHERE (users.id = auth.uid()))));

DROP POLICY IF EXISTS "Users can view org schedules" ON "public"."vgp_schedules";
CREATE POLICY "Users can view org schedules" ON "public"."vgp_schedules"
  FOR SELECT
  TO PUBLIC
  USING ((organization_id IN ( SELECT users.organization_id
   FROM public.users
  WHERE (users.id = auth.uid()))));

DROP POLICY IF EXISTS "Users can view own org vgp_schedules" ON "public"."vgp_schedules";
CREATE POLICY "Users can view own org vgp_schedules" ON "public"."vgp_schedules"
  FOR SELECT
  TO "authenticated"
  USING ((organization_id IN ( SELECT users.organization_id
   FROM public.users
  WHERE (users.id = auth.uid()))));

DROP POLICY IF EXISTS "super_admin_read_all_vgp_schedules" ON "public"."vgp_schedules";
CREATE POLICY "super_admin_read_all_vgp_schedules" ON "public"."vgp_schedules"
  FOR SELECT
  TO PUBLIC
  USING (public.is_super_admin());


-- ---- client_recall_alerts ----
ALTER TABLE "public"."client_recall_alerts"
  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own org recall alerts" ON "public"."client_recall_alerts";
CREATE POLICY "Users can view own org recall alerts" ON "public"."client_recall_alerts"
  FOR SELECT
  TO PUBLIC
  USING ((organization_id IN ( SELECT users.organization_id
   FROM public.users
  WHERE (users.id = auth.uid()))));


-- ---- entitlement_overrides ----
ALTER TABLE "public"."entitlement_overrides"
  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own org entitlements" ON "public"."entitlement_overrides";
CREATE POLICY "Users can view own org entitlements" ON "public"."entitlement_overrides"
  FOR SELECT
  TO "authenticated"
  USING ((organization_id IN ( SELECT users.organization_id
   FROM public.users
  WHERE (users.id = auth.uid()))));


-- ---- pending_weekly_digests ----
ALTER TABLE "public"."pending_weekly_digests"
  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pending_weekly_select_own" ON "public"."pending_weekly_digests";
CREATE POLICY "pending_weekly_select_own" ON "public"."pending_weekly_digests"
  FOR SELECT
  TO PUBLIC
  USING ((user_id = auth.uid()));


-- ---- platform_admins ----
ALTER TABLE "public"."platform_admins"
  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform_admins_read_self_admins" ON "public"."platform_admins";
CREATE POLICY "platform_admins_read_self_admins" ON "public"."platform_admins"
  FOR SELECT
  TO PUBLIC
  USING (public.is_super_admin());


-- ---- settings_audit_log ----
ALTER TABLE "public"."settings_audit_log"
  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "System can insert audit logs" ON "public"."settings_audit_log";
CREATE POLICY "System can insert audit logs" ON "public"."settings_audit_log"
  FOR INSERT
  TO PUBLIC
  WITH CHECK (true);

DROP POLICY IF EXISTS "Users can view organization audit logs" ON "public"."settings_audit_log";
CREATE POLICY "Users can view organization audit logs" ON "public"."settings_audit_log"
  FOR SELECT
  TO PUBLIC
  USING ((organization_id IN ( SELECT users.organization_id
   FROM public.users
  WHERE (users.id = auth.uid()))));


-- ---- subscription_plans ----
ALTER TABLE "public"."subscription_plans"
  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view subscription plans" ON "public"."subscription_plans";
CREATE POLICY "Anyone can view subscription plans" ON "public"."subscription_plans"
  FOR SELECT
  TO PUBLIC
  USING ((is_active = true));


-- ---- subscriptions ----
ALTER TABLE "public"."subscriptions"
  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can insert own organization subscription" ON "public"."subscriptions";
CREATE POLICY "Users can insert own organization subscription" ON "public"."subscriptions"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((organization_id IN ( SELECT users.organization_id
   FROM public.users
  WHERE (users.id = auth.uid()))));

DROP POLICY IF EXISTS "Users can update own organization subscription" ON "public"."subscriptions";
CREATE POLICY "Users can update own organization subscription" ON "public"."subscriptions"
  FOR UPDATE
  TO PUBLIC
  USING ((organization_id IN ( SELECT users.organization_id
   FROM public.users
  WHERE (users.id = auth.uid()))));

DROP POLICY IF EXISTS "Users can view own organization subscription" ON "public"."subscriptions";
CREATE POLICY "Users can view own organization subscription" ON "public"."subscriptions"
  FOR SELECT
  TO PUBLIC
  USING ((organization_id IN ( SELECT users.organization_id
   FROM public.users
  WHERE (users.id = auth.uid()))));

DROP POLICY IF EXISTS "super_admin_read_all_subscriptions" ON "public"."subscriptions";
CREATE POLICY "super_admin_read_all_subscriptions" ON "public"."subscriptions"
  FOR SELECT
  TO PUBLIC
  USING (public.is_super_admin());


-- ---- team_invitations ----
ALTER TABLE "public"."team_invitations"
  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can create invitations" ON "public"."team_invitations";
CREATE POLICY "Admins can create invitations" ON "public"."team_invitations"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((organization_id IN ( SELECT users.organization_id
   FROM public.users
  WHERE ((users.id = auth.uid()) AND ((users.role)::text = ANY ((ARRAY['owner'::character varying, 'admin'::character varying])::text[]))))));

DROP POLICY IF EXISTS "Admins can update invitations" ON "public"."team_invitations";
CREATE POLICY "Admins can update invitations" ON "public"."team_invitations"
  FOR UPDATE
  TO PUBLIC
  USING ((organization_id IN ( SELECT users.organization_id
   FROM public.users
  WHERE ((users.id = auth.uid()) AND ((users.role)::text = ANY ((ARRAY['owner'::character varying, 'admin'::character varying])::text[]))))));

DROP POLICY IF EXISTS "Users can view their org invitations" ON "public"."team_invitations";
CREATE POLICY "Users can view their org invitations" ON "public"."team_invitations"
  FOR SELECT
  TO PUBLIC
  USING ((organization_id IN ( SELECT users.organization_id
   FROM public.users
  WHERE (users.id = auth.uid()))));


-- ---- usage_tracking ----
ALTER TABLE "public"."usage_tracking"
  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "usage_tracking_select_own_org" ON "public"."usage_tracking";
CREATE POLICY "usage_tracking_select_own_org" ON "public"."usage_tracking"
  FOR SELECT
  TO "authenticated"
  USING ((organization_id = ( SELECT users.organization_id
   FROM public.users
  WHERE (users.id = auth.uid()))));


-- ---- user_notification_preferences ----
ALTER TABLE "public"."user_notification_preferences"
  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_notif_prefs_insert_own" ON "public"."user_notification_preferences";
CREATE POLICY "user_notif_prefs_insert_own" ON "public"."user_notification_preferences"
  FOR INSERT
  TO PUBLIC
  WITH CHECK (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.users u
  WHERE ((u.id = auth.uid()) AND (u.organization_id = user_notification_preferences.organization_id))))));

DROP POLICY IF EXISTS "user_notif_prefs_select_own" ON "public"."user_notification_preferences";
CREATE POLICY "user_notif_prefs_select_own" ON "public"."user_notification_preferences"
  FOR SELECT
  TO PUBLIC
  USING ((user_id = auth.uid()));

DROP POLICY IF EXISTS "user_notif_prefs_update_own" ON "public"."user_notification_preferences";
CREATE POLICY "user_notif_prefs_update_own" ON "public"."user_notification_preferences"
  FOR UPDATE
  TO PUBLIC
  USING ((user_id = auth.uid()))
  WITH CHECK ((user_id = auth.uid()));


-- ---- vgp_alerts ----
ALTER TABLE "public"."vgp_alerts"
  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view org alerts" ON "public"."vgp_alerts";
CREATE POLICY "Users can view org alerts" ON "public"."vgp_alerts"
  FOR SELECT
  TO PUBLIC
  USING ((organization_id IN ( SELECT users.organization_id
   FROM public.users
  WHERE (users.id = auth.uid()))));

DROP POLICY IF EXISTS "super_admin_read_all_vgp_alerts" ON "public"."vgp_alerts";
CREATE POLICY "super_admin_read_all_vgp_alerts" ON "public"."vgp_alerts"
  FOR SELECT
  TO PUBLIC
  USING (public.is_super_admin());

DROP POLICY IF EXISTS "vgp_alerts_org_select" ON "public"."vgp_alerts";
CREATE POLICY "vgp_alerts_org_select" ON "public"."vgp_alerts"
  FOR SELECT
  TO PUBLIC
  USING ((organization_id IN ( SELECT users.organization_id
   FROM public.users
  WHERE (users.id = auth.uid()))));


-- ---- vgp_digest_deliveries ----
ALTER TABLE "public"."vgp_digest_deliveries"
  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin_read_all_vgp_digest_deliveries" ON "public"."vgp_digest_deliveries";
CREATE POLICY "super_admin_read_all_vgp_digest_deliveries" ON "public"."vgp_digest_deliveries"
  FOR SELECT
  TO PUBLIC
  USING (public.is_super_admin());

DROP POLICY IF EXISTS "vgp_digest_deliveries_select_own" ON "public"."vgp_digest_deliveries";
CREATE POLICY "vgp_digest_deliveries_select_own" ON "public"."vgp_digest_deliveries"
  FOR SELECT
  TO "authenticated"
  USING ((user_id = auth.uid()));


-- ---- vgp_inspections ----
ALTER TABLE "public"."vgp_inspections"
  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can insert org inspections" ON "public"."vgp_inspections";
CREATE POLICY "Users can insert org inspections" ON "public"."vgp_inspections"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((organization_id IN ( SELECT users.organization_id
   FROM public.users
  WHERE (users.id = auth.uid()))));

DROP POLICY IF EXISTS "Users can view org inspections" ON "public"."vgp_inspections";
CREATE POLICY "Users can view org inspections" ON "public"."vgp_inspections"
  FOR SELECT
  TO PUBLIC
  USING ((organization_id IN ( SELECT users.organization_id
   FROM public.users
  WHERE (users.id = auth.uid()))));

DROP POLICY IF EXISTS "super_admin_read_all_vgp_inspections" ON "public"."vgp_inspections";
CREATE POLICY "super_admin_read_all_vgp_inspections" ON "public"."vgp_inspections"
  FOR SELECT
  TO PUBLIC
  USING (public.is_super_admin());

COMMENT ON POLICY "super_admin_read_all_vgp_inspections" ON "public"."vgp_inspections" IS 'Platform admins are org-less, so the tenant policy returns zero rows with no error for them. Read-only cross-tenant SELECT for the admin console.';


