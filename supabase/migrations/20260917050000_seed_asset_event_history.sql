-- 20260917050000_seed_asset_event_history.sql
--
-- Give a handful of EuroRent machines a believable event history, so the
-- unified timeline on /assets/[id] has something to show on more than the one
-- asset that happens to have it today.
--
-- ---------------------------------------------------------------------------
-- WHY
-- ---------------------------------------------------------------------------
-- The asset detail page now merges inspections, rentals and scans into a single
-- chronological card (PR #65). The card works on every asset in every org, but
-- it can only show what exists: across the whole database only 97 assets have a
-- rental AND a scan AND an inspection together, and until yesterday not one of
-- them also had a real certificate.
--
-- For a customer demo the prospect opens a machine and reads its life. On most
-- machines that story is currently one line long. This seeds eight of them with
-- a checkout, its field scans, the return, and an inspection that produces a
-- certificate -- the same PDF already uploaded against the Volvo EC220E.
--
-- ---------------------------------------------------------------------------
-- SCOPE
-- ---------------------------------------------------------------------------
-- EuroRent Equip (06a236a1-4f2f-4706-972c-ac1e05fdaf8d) only.
--
-- Eight assets are chosen deterministically: active schedule, no rental history
-- yet, next_due_date already more than 60 days out, ordered by id so the set is
-- stable across runs. Machines that already have rentals keep the history they
-- have -- this adds, it never rewrites.
--
-- DELIBERATELY UNTOUCHED
--   Every other organization. The 2,732-asset total spans 19 orgs, several with
--   real owner addresses (ZANAX, Ariane, GUY DOMINIQUE, the Kiloutou branch);
--   none of them is a demo surface and none is touched here.
--   Assets whose schedule is inside the 60-day alert window: see THE GUARD.
--
-- ---------------------------------------------------------------------------
-- THE GUARD
-- ---------------------------------------------------------------------------
-- Two independent reasons no mail can result from this migration.
--
-- First, EuroRent's notification_preferences.vgp_alerts.enabled is already
-- false, set by 20260915120000_reseed_vgp_due_dates and documented there as NOT
-- SELF-REVERTING. getOrgNotificationPrefs() (app/api/cron/vgp-alerts/route.ts)
-- reads that JSONB and returns early, so neither the internal digest nor
-- runClientRecallPass() -- which mails the CLIENT holding the equipment -- can
-- fire for this org. Step 0 asserts this rather than assuming it, and aborts
-- the transaction if someone has re-enabled alerts since.
--
-- Second, and independently of that switch: every schedule this migration
-- touches is moved to roughly twelve months out. The widest cron window is
-- "planning" at 30-60 days (route.ts:66), so a 365-day horizon sits six times
-- beyond the outermost rule. Assets already inside a window are excluded from
-- selection entirely -- they alert today for real reasons, and moving their
-- dates would silently change live behaviour rather than add history.
--
-- ---------------------------------------------------------------------------
-- THE TRIGGER
-- ---------------------------------------------------------------------------
-- vgp_schedules carries trg_resolve_vgp_alerts AFTER UPDATE, whose second
-- branch fires when next_due_date moves forward AND last_inspection_date
-- changes -- exactly this migration's shape. Unlike the reseed migration, that
-- behaviour is CORRECT here: this migration inserts a real inspection row for
-- each schedule it advances, so an open alert being marked
-- resolved_reason='inspection_completed' reflects something that now exists in
-- vgp_inspections. The trigger is therefore left enabled.
--
-- ---------------------------------------------------------------------------
-- IDEMPOTENCE
-- ---------------------------------------------------------------------------
-- Every INSERT is guarded by NOT EXISTS against a marker this migration itself
-- writes, so re-applying never gives one machine two sets of history.
--   rentals            checkout_notes LIKE 'Chantier - %'   (seeded marker)
--   scans              notes    = 'seed:asset-history'
--   vgp_inspections    findings = 'seed:asset-history'   (this table has no
--                      `notes` column; `findings` is its free-text field)
--
-- Those per-row guards are not on their own enough. Step 1 excludes assets that
-- already have a rental, so on a re-run ROW_NUMBER() simply re-numbers whatever
-- machines are left and `n <= 8` seeds EIGHT MORE of them -- every guard passes,
-- because they are different assets. Measured: a second run against a 12-asset
-- fixture wrote 4 more rentals, 12 more scans and 4 more inspections.
--
-- Re-entrancy is therefore decided ONCE, before anything is written, by a
-- one-row table (_seed_asset_history_state) recording whether this org already
-- carries the marker. The target view reads that table, so every step in the
-- run sees the same answer and a second application selects nothing at all.
--
-- Testing the seeded rows directly from the view does NOT work, and the failure
-- is silent: the view is re-evaluated on every reference, so "no inspection
-- carries the marker" is true when STEP 2 reads it and false when STEP 5 does,
-- because STEP 4 wrote exactly those rows in between. The view empties mid-run
-- and the schedules are never advanced. Measured twice before this shape was
-- reached: UPDATE 0 where a first run must do 8.
--
-- For the same reason the "has no rental" predicate ignores rentals carrying
-- this migration's own marker, or the view would empty itself right after
-- STEP 2.
--
-- A re-run is a SUCCESS, not an error: it prints a NOTICE and commits having
-- changed nothing. An earlier revision raised an exception, which made the
-- dashboard report an already-completed seed as a failure in red.
--
-- Offsets derive from row_number() over a stable id ordering, not random(), so
-- a given asset gets the same dates on every run. Dates are relative to
-- CURRENT_DATE, so a later re-run on a fresh database re-centres the spread --
-- the only thing that changes between runs.
--
-- ---------------------------------------------------------------------------
-- REVERSAL
-- ---------------------------------------------------------------------------
-- Everything written here is identifiable by the markers above:
--   DELETE FROM public.scans           WHERE notes    = 'seed:asset-history';
--   DELETE FROM public.vgp_inspections WHERE findings = 'seed:asset-history';
--   DELETE FROM public.rentals         WHERE checkout_notes LIKE 'Chantier - %';
-- Schedule dates are not restored by that: last_inspection_date/next_due_date
-- would need re-deriving, which is what 20260915120000 does.
-- ---------------------------------------------------------------------------

BEGIN;

-- ===========================================================================
-- STEP 0: assert VGP alert mail is still disabled for this org
-- ===========================================================================
-- Fails loudly before anything is written if alerts were re-enabled. The
-- selection below already keeps every date outside the alert window, so this is
-- the belt to that suspenders -- but a migration that invents inspection
-- history should not be the thing that discovers alerts came back on.

DO $$
DECLARE
  v_enabled jsonb;
BEGIN
  SELECT notification_preferences #> '{vgp_alerts,enabled}'
    INTO v_enabled
    FROM public.organizations
   WHERE id = '06a236a1-4f2f-4706-972c-ac1e05fdaf8d';

  IF v_enabled IS DISTINCT FROM 'false'::jsonb THEN
    RAISE EXCEPTION
      'ABORT: EuroRent vgp_alerts.enabled is % (expected false). Re-read the guard section before applying.',
      COALESCE(v_enabled::text, 'NULL');
  END IF;
END $$;

-- ===========================================================================
-- STEP 1: choose the target machines, deterministically
-- ===========================================================================

-- Re-entrancy: capture ONCE, before anything is written, whether this org has
-- already been seeded.
--
-- Testing the seeded rows directly from the view cannot work. The view is
-- re-evaluated on every reference, so "no inspection carries the marker" is
-- true when STEP 2 reads it and false when STEP 5 does -- STEP 4 wrote exactly
-- those rows in between. The view empties mid-run and the schedules are never
-- advanced. Measured twice: UPDATE 0 where a first run must do 8.
--
-- This one-row table is the fix: written before the view is ever referenced,
-- never touched again during the run, so every step sees the same answer.

DROP TABLE IF EXISTS public._seed_asset_history_state;

CREATE TABLE public._seed_asset_history_state AS
SELECT EXISTS (
  SELECT 1 FROM public.vgp_inspections
   WHERE organization_id = '06a236a1-4f2f-4706-972c-ac1e05fdaf8d'
     AND findings = 'seed:asset-history'
) AS seeded_before;

DO $$
BEGIN
  IF (SELECT seeded_before FROM public._seed_asset_history_state) THEN
    -- A NOTICE, not an exception: a re-run that correctly writes nothing is a
    -- success. An earlier revision raised here, which made the dashboard report
    -- a completed seed as a failure in red.
    RAISE NOTICE
      'Already seeded for this organization; every step below writes nothing. To seed a further batch, follow REVERSAL first.';
  END IF;
END $$;

-- A VIEW, not a TEMP TABLE. The Supabase dashboard SQL editor runs each
-- statement in its own session, so a temp table created here is gone by STEP 2
-- ("relation _targets does not exist"). A view is schema-level, so it survives
-- between statements however the file is executed. It is dropped in STEP 6.
--
-- Because a view is RE-EVALUATED on every reference, its predicates must stay
-- true after STEP 2 writes rentals -- otherwise the target set would empty
-- itself halfway through. The "has no rental" test is therefore written against
-- this migration's own marker, which is what the per-step NOT EXISTS guards
-- already key on, rather than against rentals in general.

CREATE OR REPLACE VIEW public._seed_asset_history_targets AS
WITH candidate AS (
  SELECT
    s.id            AS schedule_id,
    s.asset_id,
    a.current_location,
    ROW_NUMBER() OVER (ORDER BY a.id) AS n
  FROM public.vgp_schedules s
  JOIN public.assets a ON a.id = s.asset_id
  WHERE s.organization_id = '06a236a1-4f2f-4706-972c-ac1e05fdaf8d'
    AND s.archived_at IS NULL
    AND s.status = 'active'
    AND a.archived_at IS NULL
    -- already outside every alert window, so advancing it changes no mail path
    AND s.next_due_date > CURRENT_DATE + 60
    -- Add history, never rewrite it: skip machines that already have a rental
    -- of their own. Rentals this migration writes are excluded from that test
    -- so the view keeps returning its eight targets after STEP 2 has run.
    AND NOT EXISTS (
      SELECT 1 FROM public.rentals r
       WHERE r.asset_id = a.id
         AND (r.checkout_notes IS NULL OR r.checkout_notes NOT LIKE 'Chantier - %')
    )
)
SELECT
  schedule_id,
  asset_id,
  COALESCE(current_location, 'Dépôt Gennevilliers') AS depot,
  n,
  -- checkout 3-7 months back, spread so the fleet does not share one date
  -- ROW_NUMBER() is bigint, and Postgres has date + int but no date + bigint,
  -- so every day offset derived from n is cast to int explicitly.
  (CURRENT_DATE - (90 + n * 18)::int)                            AS checkout_on,
  (CURRENT_DATE - (90 + n * 18)::int + (14 + (n % 4) * 7)::int)  AS returned_on,
  (CURRENT_DATE - (90 + n * 18)::int + (24 + (n % 4) * 7)::int)  AS inspected_on,
  (ARRAY['Chantier Défense','Chantier Saint-Denis','Chantier Tour Triangle',
         'Chantier Bagnolet','Chantier Issy-les-Moulineaux'])[1 + (n % 5)] AS site,
  (ARRAY['T. BERGER','Marie Martin','L. Fontaine','P. Mercier','S. Rousseau'])[1 + (n % 5)] AS inspector,
  (ARRAY['NORMACONTROLE','APAVE','Bureau Veritas','DEKRA','SOCOTEC'])[1 + (n % 5)] AS company
FROM candidate
WHERE n <= 8
  -- Seeded already? Return nothing, so every step below is a no-op. Reading the
  -- run-marker table is safe inside a re-evaluated view because that table is
  -- written once, before this view is first referenced, and not touched again.
  AND NOT (SELECT seeded_before FROM public._seed_asset_history_state);



-- ===========================================================================
-- STEP 2: one completed rental per machine
-- ===========================================================================
-- client_id is a real row, so the timeline's "Voir le client" link resolves.
-- Clients are dealt round-robin by the same stable ordering.
--
-- checked_out_by is uuid NOT NULL with an FK to public.users, so it cannot be
-- left out and cannot be invented: it has to be a real member of this org. It
-- is resolved by query rather than hardcoded, so the migration does not carry
-- a UUID that is only correct on one database. returned_by is nullable, but
-- these rentals are status='returned' -- a return with nobody who performed it
-- is the kind of half-real row that makes seeded data obvious, so it gets the
-- same user.
--
-- The owner is chosen deliberately over an arbitrary member: every EuroRent
-- account is a test user, and attributing seeded movements to the org owner
-- keeps them out of any individual member's activity history.

INSERT INTO public.rentals (
  organization_id, asset_id, client_id, client_name,
  checked_out_by, returned_by,
  checkout_date, expected_return_date, actual_return_date,
  status, checkout_notes
)
SELECT
  '06a236a1-4f2f-4706-972c-ac1e05fdaf8d',
  t.asset_id,
  c.id,
  c.name,
  u.id,
  u.id,
  t.checkout_on::timestamptz,
  t.returned_on::timestamptz,
  t.returned_on::timestamptz,
  'returned',
  'Chantier - ' || t.site
FROM public._seed_asset_history_targets t
CROSS JOIN LATERAL (
  SELECT id
  FROM public.users
  WHERE organization_id = '06a236a1-4f2f-4706-972c-ac1e05fdaf8d'
  ORDER BY (role = 'owner') DESC, created_at
  LIMIT 1
) u
JOIN LATERAL (
  SELECT id, name
  FROM public.clients
  WHERE organization_id = '06a236a1-4f2f-4706-972c-ac1e05fdaf8d'
  ORDER BY id
  OFFSET ((t.n - 1) % GREATEST(
    (SELECT COUNT(*) FROM public.clients
      WHERE organization_id = '06a236a1-4f2f-4706-972c-ac1e05fdaf8d'), 1))
  LIMIT 1
) c ON TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM public.rentals r
   WHERE r.asset_id = t.asset_id
     AND r.checkout_notes LIKE 'Chantier - %'
);

-- ===========================================================================
-- STEP 3: the field trace -- checkout at the depot, a check on site, the return
-- ===========================================================================
-- scanned_by stays NULL: these represent scans of a QR label, which the public
-- route also logs anonymously. Claiming a specific user scanned them would be
-- inventing an actor rather than an event.

INSERT INTO public.scans (asset_id, scan_type, location_name, notes, scanned_at)
SELECT t.asset_id, v.scan_type, v.location_name, 'seed:asset-history', v.scanned_at
FROM public._seed_asset_history_targets t
CROSS JOIN LATERAL (
  VALUES
    ('checkout', t.depot, (t.checkout_on + TIME '08:20')::timestamptz),
    ('check',    t.site,  (t.checkout_on + 5 + TIME '14:05')::timestamptz),
    ('return',   t.depot, (t.returned_on + TIME '17:40')::timestamptz)
) AS v(scan_type, location_name, scanned_at)
WHERE NOT EXISTS (
  SELECT 1 FROM public.scans s
   WHERE s.asset_id = t.asset_id
     AND s.notes = 'seed:asset-history'
);

-- ===========================================================================
-- STEP 4: the inspection, and its certificate
-- ===========================================================================
-- Certificate on every other machine, so the timeline shows both states: the
-- inspection that produced a document and the one that did not. A parc where
-- every single inspection has a PDF is as obviously seeded as one where none
-- does.
--
-- The URL is the real file uploaded against the Volvo EC220E, already verified
-- to resolve (200, application/pdf, 7371 bytes).

INSERT INTO public.vgp_inspections (
  organization_id, asset_id, schedule_id,
  inspection_date, inspector_name, inspector_company,
  result, certificate_url, certificate_file_name, findings
)
SELECT
  '06a236a1-4f2f-4706-972c-ac1e05fdaf8d',
  t.asset_id,
  t.schedule_id,
  t.inspected_on,
  t.inspector,
  t.company,
  'passed',
  CASE WHEN t.n % 2 = 0
       THEN 'https://h90xo03yat.ufs.sh/f/Zav1aRf9O6VUhoDe2kqXOghcvIMrn8pAyQ3PUTjbl0uY5dZC'
       ELSE NULL END,
  CASE WHEN t.n % 2 = 0 THEN 'Rapport_VGP_2026.pdf' ELSE NULL END,
  'seed:asset-history'
FROM public._seed_asset_history_targets t
WHERE NOT EXISTS (
  SELECT 1 FROM public.vgp_inspections i
   WHERE i.asset_id = t.asset_id
     AND i.findings = 'seed:asset-history'
);

-- ===========================================================================
-- STEP 5: advance each schedule to match the inspection just recorded
-- ===========================================================================
-- next_due_date is DERIVED from the inspection date through the schedule's own
-- interval_months, so a 6-month and a 24-month schedule do not land on the same
-- day. Writing a flat +12 months would produce dates that correspond to no
-- inspection history -- the failure mode 20260915120000 was written to fix.
--
-- The 60-day floor is asserted, not assumed: a short interval_months could in
-- principle land back inside the alert window, and this migration must not be
-- the thing that discovers that.

UPDATE public.vgp_schedules s
SET last_inspection_date = t.inspected_on,
    next_due_date        = t.inspected_on + (s.interval_months || ' months')::interval,
    updated_at           = NOW()
FROM public._seed_asset_history_targets t
WHERE s.id = t.schedule_id
  AND (t.inspected_on + (s.interval_months || ' months')::interval)::date
        > CURRENT_DATE + 60;

DO $$
DECLARE
  v_exposed int;
BEGIN
  SELECT COUNT(*) INTO v_exposed
    FROM public.vgp_schedules s
    JOIN public.vgp_inspections i
      ON i.schedule_id = s.id AND i.findings = 'seed:asset-history'
   WHERE s.next_due_date <= CURRENT_DATE + 60;

  IF v_exposed > 0 THEN
    RAISE EXCEPTION
      'ABORT: % seeded schedule(s) landed inside the 60-day alert window.', v_exposed;
  END IF;
END $$;

-- ===========================================================================
-- STEP 6: drop the scaffolding
-- ===========================================================================
-- The view exists only to carry the target set between statements. Leaving it
-- behind would put a migration's working table in the public schema, where
-- PostgREST would expose it on the API.

DROP VIEW  IF EXISTS public._seed_asset_history_targets;
DROP TABLE IF EXISTS public._seed_asset_history_state;

COMMIT;
