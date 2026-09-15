-- 20260915120000_reseed_vgp_due_dates.sql
--
-- Reseed VGP due dates on four non-customer organizations into a realistic
-- spread, deriving next_due_date from each schedule's own interval.
--
-- ---------------------------------------------------------------------------
-- WHY
-- ---------------------------------------------------------------------------
-- The seeded parcs do not look like real ones. EuroRent Equip carries 462
-- active schedules across TWELVE distinct last_inspection_date values: every
-- machine was inspected in one of twelve batches, which is not how a rental
-- fleet is inspected. 326 of those 462 are overdue, the worst by 247 days. A
-- parc where two thirds of the fleet is months past its VGP is as obviously
-- fake as one where nothing ever comes due.
--
-- Target shape, per organization:
--     ~75%  comfortable   next_due 2-10 months out
--     ~15%  upcoming      next_due within 60 days
--     ~10%  overdue       next_due days-to-weeks past, never months
--
-- last_inspection_date is what this migration writes. next_due_date is DERIVED
-- from it through each schedule's own interval_months, so a 6-month schedule
-- and a 24-month schedule reach the same bucket by different last-inspection
-- dates. Writing next_due_date directly would reproduce the current problem in
-- a new shape: dates that do not correspond to any inspection history.
--
-- ---------------------------------------------------------------------------
-- SCOPE: four organizations, 568 schedules, rewrite only
-- ---------------------------------------------------------------------------
--   06a236a1-4f2f-4706-972c-ac1e05fdaf8d  EuroRent Equip     462
--   e9248833-65db-43ad-b0cb-c76d58fd9abb  ZZ-LOADTEST-1       52
--   b35d5605-6cbb-4977-8d11-fa312a90bc38  ZZ-LOADTEST-2       49
--   ed538394-a20c-432d-8d7d-5d54262d58cc  Demo Rental Idf      5
--
-- No schedule is CREATED and none is deleted. Orgs with zero schedules stay at
-- zero -- notably Demo Rental Nord, whose owner agence0620@kiloutou.fr is a
-- real Kiloutou branch address. Seeding it would make a real rental firm
-- reachable by alert mail for the first time.
--
-- DELIBERATELY UNTOUCHED
--   Ariane (32b2bb11, lombaril93@gmail.com)  30 schedules, kept as an untouched
--     reference point for comparison against the reseeded orgs.
--   ZANAX, Amraoui, jay, GUY DOMINIQUE, keziah kez -- real owner addresses.
--   All thirteen organizations that have no schedules at all.
--
-- ---------------------------------------------------------------------------
-- THE GUARD (step 1, and the reason for the ordering)
-- ---------------------------------------------------------------------------
-- app/api/cron/vgp-alerts/route.ts runs daily at 07:00 and selects schedules
-- with status='active' and next_due_date <= today + 60 days. This migration
-- deliberately creates such rows: the overdue and upcoming buckets ARE that
-- window. Left alone, the next run would email about deadlines a migration
-- invented.
--
-- The exposure is not only internal. runClientRecallPass() mails the CLIENT
-- holding the equipment, and EuroRent has 108 active rentals on assets with
-- live schedules, resolving to ~80 distinct client addresses. Its recall dedup
-- key is rental_id:alert_type:next_due_date -- keyed on the due date itself --
-- so every rewritten date is a fresh key that defeats dedup and sends again.
--
-- So alerts are disabled FIRST, in a separate statement, with a readback
-- assertion that aborts the transaction before a single date moves.
--
-- The switch is notification_preferences.vgp_alerts.enabled, NOT the column
-- organizations.vgp_alerts_enabled. That column exists and is `true` on all 19
-- orgs, but NOTHING READS IT: grep across app/api/cron/, app/api/admin/ and
-- lib/vgp/ returns nothing. getOrgNotificationPrefs() reads the JSONB at
-- route.ts:169-170. Setting the column would produce a migration that reports
-- "alerts disabled" while the cron mails anyway.
--
-- email_enabled is deliberately NOT touched. It would also silence asset and
-- audit alerts, which is broader than this migration's concern.
--
-- NOT SELF-REVERTING. These four orgs stay silent until someone re-enables
-- them. That is the intended trade: re-arming 108 rentals' worth of client
-- mail should be a deliberate act, not a side effect of a later migration.
--
-- ---------------------------------------------------------------------------
-- THE TRIGGER
-- ---------------------------------------------------------------------------
-- vgp_schedules carries trg_resolve_vgp_alerts AFTER UPDATE. Its second branch
-- (resolve_vgp_alerts_on_completion.sql:24) fires when next_due_date moves
-- forward AND last_inspection_date changes -- precisely this migration's shape,
-- since varying last_inspection_date is the entire point. It would stamp every
-- open alert resolved_reason='inspection_completed', recording inspections that
-- never happened across 12,138 unresolved EuroRent alerts.
--
-- The trigger is disabled for the reseed and re-enabled before COMMIT. Alert
-- rows are left exactly as they are: stale, but honest.
--
-- ---------------------------------------------------------------------------
-- IDEMPOTENCE
-- ---------------------------------------------------------------------------
-- Bucket and jitter derive from hashtext(id::text), not random(). A given
-- schedule lands in the same bucket with the same offset on every run, so
-- re-applying produces identical dates rather than reshuffling the parc.
-- Dates are computed relative to CURRENT_DATE, so a later re-run re-centres the
-- spread on that day -- intended, and the only thing that changes between runs.
--
-- ---------------------------------------------------------------------------
-- NOT ADDRESSED HERE (reported separately)
-- ---------------------------------------------------------------------------
-- The /vgp compliance card counts a schedule compliant only above 90 days
-- (app/api/vgp/compliance-summary/route.ts:112-115) while /dashboard uses 30
-- days. The same fleet reads two different rates. Left alone deliberately:
-- changing it would move every existing org's number, which is not this
-- migration's business.
-- ---------------------------------------------------------------------------

BEGIN;

-- ===========================================================================
-- STEP 1: disable VGP alert mail on the four target organizations
-- ===========================================================================

UPDATE public.organizations
SET notification_preferences = jsonb_set(
      COALESCE(notification_preferences, '{}'::jsonb),
      '{vgp_alerts,enabled}',
      'false'::jsonb,
      true
    ),
    updated_at = now()
WHERE id IN (
  '06a236a1-4f2f-4706-972c-ac1e05fdaf8d',  -- EuroRent Equip
  'e9248833-65db-43ad-b0cb-c76d58fd9abb',  -- ZZ-LOADTEST-1
  'b35d5605-6cbb-4977-8d11-fa312a90bc38',  -- ZZ-LOADTEST-2
  'ed538394-a20c-432d-8d7d-5d54262d58cc'   -- Demo Rental Idf
);

-- Readback assertion. Aborts before any date is touched if the guard did not
-- take -- a NULL jsonb path, a renamed key, or an org id that no longer exists
-- would each leave mail live, which is the one outcome worth failing over.
DO $$
DECLARE
  v_unguarded int;
  v_missing   int;
BEGIN
  SELECT count(*) INTO v_unguarded
  FROM public.organizations
  WHERE id IN (
    '06a236a1-4f2f-4706-972c-ac1e05fdaf8d',
    'e9248833-65db-43ad-b0cb-c76d58fd9abb',
    'b35d5605-6cbb-4977-8d11-fa312a90bc38',
    'ed538394-a20c-432d-8d7d-5d54262d58cc'
  )
  AND COALESCE(notification_preferences #>> '{vgp_alerts,enabled}', 'true') <> 'false';

  IF v_unguarded > 0 THEN
    RAISE EXCEPTION
      'Guard failed: % target org(s) still have vgp_alerts.enabled <> false. No dates changed.',
      v_unguarded;
  END IF;

  SELECT 4 - count(*) INTO v_missing
  FROM public.organizations
  WHERE id IN (
    '06a236a1-4f2f-4706-972c-ac1e05fdaf8d',
    'e9248833-65db-43ad-b0cb-c76d58fd9abb',
    'b35d5605-6cbb-4977-8d11-fa312a90bc38',
    'ed538394-a20c-432d-8d7d-5d54262d58cc'
  );

  IF v_missing <> 0 THEN
    RAISE EXCEPTION
      'Guard failed: % of the 4 target organizations do not exist. No dates changed.',
      v_missing;
  END IF;

  RAISE NOTICE 'Guard verified: vgp_alerts.enabled = false on all 4 target organizations.';
END $$;

-- ===========================================================================
-- STEP 2: reseed last_inspection_date, derive next_due_date
-- ===========================================================================

ALTER TABLE public.vgp_schedules DISABLE TRIGGER trg_resolve_vgp_alerts;

WITH target AS (
  SELECT
    id,
    interval_months,
    -- abs() of hashtext is stable per row and independent of table order.
    -- hashtext can return INT_MIN, whose abs() overflows, so it is widened to
    -- bigint before abs() rather than after.
    (abs(hashtext(id::text)::bigint) % 100)              AS bucket,
    (abs(hashtext(id::text || ':jitter')::bigint) % 1000) AS jitter
  FROM public.vgp_schedules
  WHERE archived_at IS NULL
    AND organization_id IN (
      '06a236a1-4f2f-4706-972c-ac1e05fdaf8d',
      'e9248833-65db-43ad-b0cb-c76d58fd9abb',
      'b35d5605-6cbb-4977-8d11-fa312a90bc38',
      'ed538394-a20c-432d-8d7d-5d54262d58cc'
    )
),
planned AS (
  SELECT
    id,
    interval_months,
    bucket,
    -- Days from today until this schedule should next fall due.
    --
    --   bucket 0-9    (10%)  overdue by 2..28 days
    --   bucket 10-24  (15%)  due within 3..60 days
    --   bucket 25-99  (75%)  due 61..300 days out (~2 to 10 months)
    --
    -- Ranges are expressed in days rather than months so the three bands abut
    -- exactly, with no gap a rounding artefact could fall into.
    -- Cast to integer: hashtext is widened to bigint above to survive abs()
    -- on INT_MIN, and `date + bigint` has no operator -- only `date + integer`.
    (CASE
      WHEN bucket < 10 THEN -(2  + (jitter % 27))      -- -2 .. -28
      WHEN bucket < 25 THEN   3  + (jitter % 58)       --  3 .. 60
      ELSE                    61 + (jitter % 240)      -- 61 .. 300
    END)::integer AS days_until_due
  FROM target
)
UPDATE public.vgp_schedules s
SET
  -- Work backwards: the inspection happened one full interval before the date
  -- the next one falls due. This is what makes next_due_date derived rather
  -- than asserted, and it is why a 6-month and a 24-month schedule in the same
  -- bucket get different last_inspection_date values.
  last_inspection_date =
    (CURRENT_DATE + p.days_until_due) - (p.interval_months || ' months')::interval,
  next_due_date =
    public.calculate_vgp_due_date(
      ((CURRENT_DATE + p.days_until_due) - (p.interval_months || ' months')::interval)::date,
      p.interval_months
    ),
  -- status is a derived mirror of next_due_date (see
  -- update_vgp_schedule_after_inspection.sql:14-17). Leaving 'active' on a row
  -- that is now weeks overdue is its own tell, and the alert cron filters on
  -- this column. 'completed' rows are left alone: they are a real terminal
  -- state written by record_inspection(), not a date-derived label.
  status = CASE
             WHEN s.status = 'completed' THEN s.status
             WHEN p.days_until_due < 0   THEN 'overdue'
             ELSE 'active'
           END,
  updated_at = now()
FROM planned p
WHERE s.id = p.id;

ALTER TABLE public.vgp_schedules ENABLE TRIGGER trg_resolve_vgp_alerts;

-- ===========================================================================
-- STEP 3: verify the resulting shape, in the same transaction
-- ===========================================================================

DO $$
DECLARE
  v_total     int;
  v_overdue   int;
  v_soon      int;
  v_comf      int;
  v_deep      int;
  v_nulldate  int;
BEGIN
  SELECT
    count(*),
    count(*) FILTER (WHERE next_due_date <  CURRENT_DATE),
    count(*) FILTER (WHERE next_due_date >= CURRENT_DATE
                       AND next_due_date <= CURRENT_DATE + 60),
    count(*) FILTER (WHERE next_due_date >  CURRENT_DATE + 60),
    count(*) FILTER (WHERE next_due_date <  CURRENT_DATE - 90),
    count(*) FILTER (WHERE next_due_date IS NULL)
  INTO v_total, v_overdue, v_soon, v_comf, v_deep, v_nulldate
  FROM public.vgp_schedules
  WHERE archived_at IS NULL
    AND organization_id IN (
      '06a236a1-4f2f-4706-972c-ac1e05fdaf8d',
      'e9248833-65db-43ad-b0cb-c76d58fd9abb',
      'b35d5605-6cbb-4977-8d11-fa312a90bc38',
      'ed538394-a20c-432d-8d7d-5d54262d58cc'
    );

  RAISE NOTICE 'Reseeded % schedules: % overdue, % within 60d, % beyond 60d',
    v_total, v_overdue, v_soon, v_comf;

  IF v_nulldate > 0 THEN
    RAISE EXCEPTION 'Reseed produced % NULL next_due_date rows', v_nulldate;
  END IF;

  -- "Days or weeks, not 246." Nothing may come out of this deeply overdue.
  IF v_deep > 0 THEN
    RAISE EXCEPTION 'Reseed produced % schedule(s) more than 90 days overdue', v_deep;
  END IF;

  -- Bucket proportions are hash-derived, so they vary a few points either way
  -- on a small org. These bounds catch a broken CASE, not ordinary variance.
  IF v_total > 0 AND (v_overdue::numeric / v_total) > 0.20 THEN
    RAISE EXCEPTION 'Overdue share % percent exceeds the 20 percent ceiling',
      round(100.0 * v_overdue / v_total, 1);
  END IF;

  IF v_total > 0 AND (v_comf::numeric / v_total) < 0.60 THEN
    RAISE EXCEPTION 'Comfortable share % percent is below the 60 percent floor',
      round(100.0 * v_comf / v_total, 1);
  END IF;
END $$;

COMMIT;

-- ---------------------------------------------------------------------------
-- RLS VERIFIED
-- ---------------------------------------------------------------------------
-- No policy, grant, index, column or constraint is altered by this migration.
--
-- vgp_schedules:  rows UPDATEd. RLS enabled, organization-scoped policies
--   unchanged. Applied as service_role, which bypasses RLS.
-- organizations:  notification_preferences UPDATEd on 4 rows. No policy change.
-- vgp_alerts:     NOT touched. trg_resolve_vgp_alerts is disabled across the
--   reseed specifically so these 20,620 unresolved rows are not rewritten to
--   claim inspections that did not occur. The trigger is restored before
--   COMMIT; DISABLE TRIGGER takes an ACCESS EXCLUSIVE lock held only inside
--   this transaction.
-- client_recall_alerts: NOT touched. All 138 rows stay.
--
-- ---------------------------------------------------------------------------
-- DOWN
-- ---------------------------------------------------------------------------
-- There is no meaningful down migration: the prior dates were themselves
-- seeded, not observed, and are not worth restoring. To re-enable alert mail
-- on the four orgs -- a deliberate decision, not a rollback:
--
--   UPDATE public.organizations
--   SET notification_preferences =
--         jsonb_set(notification_preferences, '{vgp_alerts,enabled}', 'true'::jsonb, true)
--   WHERE id IN ('06a236a1-4f2f-4706-972c-ac1e05fdaf8d',
--                'e9248833-65db-43ad-b0cb-c76d58fd9abb',
--                'b35d5605-6cbb-4977-8d11-fa312a90bc38',
--                'ed538394-a20c-432d-8d7d-5d54262d58cc');
--
-- Re-enabling EuroRent re-arms client recall mail to ~80 external addresses on
-- 108 active rentals. Its recall dedup is keyed on next_due_date, and every
-- date is now new, so the first run after re-enabling will send.
