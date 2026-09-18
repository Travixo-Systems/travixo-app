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

-- ---------------------------------------------------------------------------
-- WHY THIS IS ONE STATEMENT
-- ---------------------------------------------------------------------------
-- An earlier draft built a TEMP TABLE and then read it back in later
-- statements. The Supabase SQL editor runs each statement in its own implicit
-- transaction, so an ON COMMIT DROP temp table is gone by the time the next
-- statement looks for it:
--
--   ERROR: 42P01: relation "_dupes" does not exist
--
-- Everything therefore lives in a single DELETE with the selection inlined as
-- a CTE. That is also strictly safer: selection and deletion cannot drift
-- apart or half-apply, because they are the same statement.
--
-- The blast-radius guard moves inside that statement too, as a join against a
-- count of the same CTE: if more than 40 rows match, the condition is false
-- for every row and NOTHING is deleted. It fails closed rather than loudly,
-- so run the SELECT below first if you want to see the rows.
-- ===========================================================================

-- ===========================================================================
-- PRE-FLIGHT: run this on its own first to see exactly what will go
-- ===========================================================================
-- Read-only. Returns one row per scan that the DELETE below would remove.
--
--   WITH candidate AS (
--     SELECT s.id, s.asset_id, s.scanned_at,
--            LAG(s.scanned_at) OVER (PARTITION BY s.asset_id, s.scan_type
--                                    ORDER BY s.scanned_at) AS prev_at
--       FROM public.scans s
--      WHERE s.scan_type = 'check'
--        AND s.location_name IS NULL
--        AND NOT EXISTS (SELECT 1 FROM public.rentals r
--                         WHERE r.checkout_scan_id = s.id
--                            OR r.return_scan_id  = s.id)
--   ), marked AS (
--     SELECT id, asset_id, scanned_at,
--            SUM(CASE WHEN prev_at IS NULL
--                      OR scanned_at - prev_at > INTERVAL '60 seconds'
--                     THEN 1 ELSE 0 END)
--              OVER (PARTITION BY asset_id ORDER BY scanned_at
--                    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS burst_no
--       FROM candidate
--   ), ranked AS (
--     SELECT id, asset_id, scanned_at,
--            ROW_NUMBER() OVER (PARTITION BY asset_id, burst_no
--                               ORDER BY scanned_at) AS pos
--       FROM marked
--   )
--   SELECT r.scanned_at, a.name
--     FROM ranked r JOIN public.assets a ON a.id = r.asset_id
--    WHERE r.pos > 1
--    ORDER BY r.scanned_at;
--
-- Expected: 13 rows -- Haulotte HA16RTJ x5, JLG 660SJ x3, Volvo EC220E x5.

-- ===========================================================================
-- THE DELETE
-- ===========================================================================

WITH candidate AS (
  SELECT
    s.id,
    s.asset_id,
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
    id, asset_id, scanned_at,
    -- a new burst starts when there is no previous row, or the gap is wide
    SUM(CASE WHEN prev_at IS NULL
              OR scanned_at - prev_at > INTERVAL '60 seconds'
             THEN 1 ELSE 0 END)
      OVER (PARTITION BY asset_id ORDER BY scanned_at
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS burst_no
  FROM candidate
),
ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (PARTITION BY asset_id, burst_no
                       ORDER BY scanned_at) AS pos
  FROM marked
),
doomed AS (
  SELECT id FROM ranked WHERE pos > 1   -- keep the earliest of each burst
),
guard AS (
  SELECT COUNT(*) AS n FROM doomed
)
DELETE FROM public.scans s
 USING doomed d, guard g
 WHERE s.id = d.id
   AND g.n <= 40   -- fails closed: over the limit deletes nothing at all
RETURNING s.id, s.asset_id, s.scanned_at;
