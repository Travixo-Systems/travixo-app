-- 20260918150000_collapse_duplicate_auto_scans.sql
--   PENDING: NOT APPLIED, awaiting approval. This DELETES rows -- read first.
--
-- Remove the redundant scan rows written by the QR page before it was fixed to
-- log one auto-scan per visit.
--
-- ---------------------------------------------------------------------------
-- WHAT WROTE THEM
-- ---------------------------------------------------------------------------
-- app/scan/[qr_code]/page.tsx logged a scan on every change of `asset` or
-- `organizationId`, with no once-per-visit guard, while /api/scan/update
-- inserts unconditionally. One visit could write four rows. Fixed in d7957e6;
-- this migration is only about the rows already in the table.
--
-- ---------------------------------------------------------------------------
-- WHAT IS ACTUALLY THERE (measured 2026-09-18, not inferred)
-- ---------------------------------------------------------------------------
-- 365 scans in total. Grouping by (asset_id, scan_type) and starting a new
-- group whenever the gap exceeds 60 seconds gives 5 bursts holding 13
-- redundant rows -- 3.6% of the table:
--
--   Pelle sur chenilles Volvo EC220E        2 rows  2026-09-16 20:51
--   Pelle sur chenilles Volvo EC220E        5 rows  2026-09-17 12:24
--   Nacelle télescopique JLG 660SJ          4 rows  2026-09-01 20:23
--   Nacelle articulée Haulotte HA16RTJ      2 rows  2026-08-19 21:18
--   Nacelle articulée Haulotte HA16RTJ      5 rows  2026-08-20 12:28
--
-- Every burst is scan_type='check' with location_name NULL. Three machines,
-- all EuroRent demo assets.
--
-- ---------------------------------------------------------------------------
-- WHY 60 SECONDS, AND WHY THAT IS A JUDGEMENT CALL
-- ---------------------------------------------------------------------------
-- The observed gaps inside a burst are 15-45 seconds, not milliseconds. That
-- is wider than one render cycle: these are page reloads and repeat visits
-- during testing, not purely the effect-chain bug firing.
--
-- So the window has to be wide enough to catch a 45-second gap, and a 60s
-- window CAN in principle merge two genuine scans of the same machine a minute
-- apart. That risk is accepted here because every affected row is a
-- location-less 'check' on a demo machine, listed above and printed again at
-- run time. It would NOT be an acceptable default rule to apply blindly to
-- customer data later.
--
-- ---------------------------------------------------------------------------
-- WHAT IS KEPT
-- ---------------------------------------------------------------------------
-- The EARLIEST row of each burst, because it is the one that corresponds to
-- the visit actually happening. Its id is preserved, so anything referencing
-- it -- rentals.checkout_scan_id, rentals.return_scan_id -- keeps resolving.
--
-- Rows referenced by a rental are excluded from deletion outright, belt and
-- braces: scans.id is an FK target and a scan that documents a checkout or a
-- return is evidence, not noise.
--
-- ---------------------------------------------------------------------------
-- SCOPE LIMITS
-- ---------------------------------------------------------------------------
-- Only scan_type='check' with location_name IS NULL and no rental reference.
-- A scan carrying a location was entered deliberately through the form, and
-- checkout/return scans are written by the RPCs, not by the auto-logger.
--
-- The migration ABORTS if it would delete more than 40 rows. Measured need is
-- 13; anything approaching triple that means the data changed shape since this
-- was written and it should be re-measured rather than trusted.
--
-- ---------------------------------------------------------------------------
-- REVERSAL
-- ---------------------------------------------------------------------------
-- There is none. DELETE is final and these rows carry no natural key to
-- reconstruct. The pre-flight NOTICE prints every row it is about to remove,
-- so the transcript is the record. Take a backup first if that is not enough.
-- ===========================================================================

BEGIN;

-- ===========================================================================
-- STEP 1: identify the redundant rows
-- ===========================================================================
-- A burst = consecutive rows for the same (asset_id, scan_type) whose gap from
-- the previous row is <= 60s. The first row of each burst is kept; the rest
-- are the deletion set.

CREATE TEMP TABLE _dupes ON COMMIT DROP AS
WITH candidate AS (
  SELECT
    s.id,
    s.asset_id,
    s.scan_type,
    s.scanned_at,
    LAG(s.scanned_at) OVER (
      PARTITION BY s.asset_id, s.scan_type ORDER BY s.scanned_at
    ) AS prev_at
  FROM public.scans s
  WHERE s.scan_type = 'check'
    AND s.location_name IS NULL
    -- never touch a scan a rental points at
    AND NOT EXISTS (
      SELECT 1 FROM public.rentals r
       WHERE r.checkout_scan_id = s.id OR r.return_scan_id = s.id
    )
),
marked AS (
  SELECT
    id, asset_id, scan_type, scanned_at,
    -- a new burst starts when there is no previous row, or the gap is wide
    SUM(CASE WHEN prev_at IS NULL
              OR scanned_at - prev_at > INTERVAL '60 seconds'
             THEN 1 ELSE 0 END)
      OVER (PARTITION BY asset_id, scan_type ORDER BY scanned_at
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS burst_no
  FROM candidate
)
SELECT id, asset_id, scanned_at
FROM (
  SELECT
    id, asset_id, scanned_at,
    ROW_NUMBER() OVER (PARTITION BY asset_id, scan_type, burst_no
                       ORDER BY scanned_at) AS pos
  FROM marked
) ranked
WHERE pos > 1;   -- keep the earliest of each burst

-- ===========================================================================
-- STEP 2: print what is about to go, and refuse if the blast radius is wrong
-- ===========================================================================

DO $$
DECLARE
  v_count int;
  r       record;
BEGIN
  SELECT COUNT(*) INTO v_count FROM _dupes;

  RAISE NOTICE '--- % redundant scan row(s) to delete ---', v_count;
  FOR r IN
    SELECT d.scanned_at, a.name
      FROM _dupes d JOIN public.assets a ON a.id = d.asset_id
     ORDER BY d.scanned_at
  LOOP
    RAISE NOTICE '  %  %', r.scanned_at, r.name;
  END LOOP;

  IF v_count = 0 THEN
    RAISE NOTICE 'Nothing to do -- already clean.';
  ELSIF v_count > 40 THEN
    RAISE EXCEPTION
      'ABORT: % rows matched, expected ~13. Re-measure before applying.', v_count;
  END IF;
END $$;

-- ===========================================================================
-- STEP 3: delete
-- ===========================================================================

DELETE FROM public.scans s
 USING _dupes d
 WHERE s.id = d.id;

COMMIT;
