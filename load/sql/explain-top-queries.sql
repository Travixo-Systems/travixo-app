-- load/sql/explain-top-queries.sql
--
-- EXPLAIN ANALYZE for the ten hottest read paths, transcribed from the actual
-- client calls (file:line cited above each). Area 02 of the audit asked for
-- these; they could not be run from the audit machine because the Supabase
-- REST API exposes no arbitrary-SQL RPC (correctly), and psql was unavailable.
--
-- HOW TO RUN
--   Supabase Dashboard -> SQL Editor. Set the two \set values below first.
--   Or: psql "$DATABASE_URL" -v org_id="'...'" -v qr="'...'" -f this_file
--
-- READ-ONLY. Every statement is EXPLAIN; nothing executes a write. (EXPLAIN
-- ANALYZE does execute the SELECT it wraps, which is why only SELECTs appear
-- here - an EXPLAIN ANALYZE of an INSERT would really insert.)
--
-- WHAT TO LOOK FOR
--   "Seq Scan on assets"          -> the organization_id index is missing
--   "Rows Removed by Filter: N"   -> large N means the index is not selective
--   Actual rows >> Estimated rows -> stale statistics; run ANALYZE
--   "SubPlan" inside an RLS qual  -> per-row policy evaluation (query 4)

\set org_id '00000000-0000-0000-0000-000000000000'   -- REPLACE with a real org
\set qr     'qr-00000000'                            -- REPLACE with a real QR code

-- ===========================================================================
-- 1. ASSETS LIST  (the heaviest query in the app)
-- components/assets/AssetsPageClient.tsx:86-101
-- ===========================================================================
-- Unpaginated, select *, plus two embedded resources. PostgREST resolves the
-- embeds as separate joins/subqueries. Measured live: 363 KB raw / 32 KB gzip
-- for a 520-asset tenant, versus 108 KB for the 6 columns the table renders.
--
-- Expect: Seq Scan on assets unless assets(organization_id) is indexed.

EXPLAIN (ANALYZE, BUFFERS, VERBOSE, FORMAT TEXT)
SELECT a.*,
       c.id   AS category_id_j,
       c.name AS category_name,
       s.id, s.next_due_date, s.archived_at
FROM assets a
LEFT JOIN asset_categories c ON c.id = a.category_id
LEFT JOIN vgp_schedules   s ON s.asset_id = a.id
WHERE a.organization_id = :'org_id'::uuid
ORDER BY a.created_at DESC;

-- Compare against the projection the UI actually consumes. The row-count is
-- identical; only the bytes differ. If this is much faster, the cost is I/O
-- and egress, not the scan.
EXPLAIN (ANALYZE, BUFFERS)
SELECT a.id, a.name, a.serial_number, a.status, a.current_location, a.archived_at
FROM assets a
WHERE a.organization_id = :'org_id'::uuid
ORDER BY a.created_at DESC
LIMIT 50;

-- ===========================================================================
-- 2. DASHBOARD COUNTS
-- app/(dashboard)/dashboard/page.tsx:85, :93
-- ===========================================================================
-- Two head:true count queries. Cheap only with an index on organization_id.

EXPLAIN (ANALYZE, BUFFERS)
SELECT count(*) FROM assets WHERE organization_id = :'org_id'::uuid;

EXPLAIN (ANALYZE, BUFFERS)
SELECT count(*) FROM assets
WHERE organization_id = :'org_id'::uuid AND status = 'in_use';

-- ===========================================================================
-- 3. DASHBOARD: ASSETS GROUPED BY CATEGORY
-- app/(dashboard)/dashboard/page.tsx:187
-- ===========================================================================
-- The app fetches every row and aggregates in JavaScript. This is what the
-- database would do instead, and the planner cost difference is the argument
-- for moving it server-side.

EXPLAIN (ANALYZE, BUFFERS)
SELECT a.status, a.category_id, c.name
FROM assets a
LEFT JOIN asset_categories c ON c.id = a.category_id
WHERE a.organization_id = :'org_id'::uuid;

-- The aggregate that should replace it:
EXPLAIN (ANALYZE, BUFFERS)
SELECT c.name, a.status, count(*)
FROM assets a
LEFT JOIN asset_categories c ON c.id = a.category_id
WHERE a.organization_id = :'org_id'::uuid
GROUP BY c.name, a.status;

-- ===========================================================================
-- 4. RECENT SCANS COUNT  -- THE RLS-SENSITIVE ONE
-- app/(dashboard)/dashboard/page.tsx:107-110
-- ===========================================================================
-- The client sends NO organization filter. Tenant isolation comes entirely
-- from the RLS policy on `scans`, which (per the migration) is a correlated
-- EXISTS against assets. Run this as an authenticated role, not as the
-- service role, or RLS is bypassed and the plan will look deceptively cheap.
--
-- Look for a SubPlan re-executed per candidate row.

EXPLAIN (ANALYZE, BUFFERS)
SELECT count(*) FROM scans
WHERE scanned_at >= now() - interval '7 days';

-- What it should be, once scans carries organization_id:
EXPLAIN (ANALYZE, BUFFERS)
SELECT count(*)
FROM scans s
JOIN assets a ON a.id = s.asset_id
WHERE a.organization_id = :'org_id'::uuid
  AND s.scanned_at >= now() - interval '7 days';

-- ===========================================================================
-- 5. VGP SCHEDULES  (dashboard + schedules page)
-- app/(dashboard)/dashboard/page.tsx:118; app/api/vgp/schedules/route.ts:77
-- ===========================================================================
-- Two partial indexes on vgp_schedules are declared in the repo. This shows
-- which one the planner picks, and whether the leading-column choice on
-- idx_vgp_schedules_active (organization_id, next_due_date) actually serves it.

EXPLAIN (ANALYZE, BUFFERS)
SELECT s.id, s.next_due_date, a.id, a.name
FROM vgp_schedules s
LEFT JOIN assets a ON a.id = s.asset_id
WHERE s.organization_id = :'org_id'::uuid
  AND s.archived_at IS NULL
ORDER BY s.next_due_date ASC;

-- ===========================================================================
-- 6. VGP COMPLIANCE SUMMARY
-- app/api/vgp/compliance-summary/route.ts:53-69
-- ===========================================================================
-- Fetches every schedule with a nested asset+category join to produce five
-- integers. Measured live: 617 KB for one tenant.

EXPLAIN (ANALYZE, BUFFERS)
SELECT s.*, a.id, a.name, a.serial_number, c.name AS category
FROM vgp_schedules s
LEFT JOIN assets a          ON a.id = s.asset_id
LEFT JOIN asset_categories c ON c.id = a.category_id
WHERE s.organization_id = :'org_id'::uuid;

-- The five integers, computed in SQL:
EXPLAIN (ANALYZE, BUFFERS)
SELECT
  count(*) FILTER (WHERE next_due_date < current_date)                       AS overdue,
  count(*) FILTER (WHERE next_due_date BETWEEN current_date
                                           AND current_date + 30)            AS due_soon,
  count(*)                                                                   AS total
FROM vgp_schedules
WHERE organization_id = :'org_id'::uuid AND archived_at IS NULL;

-- ===========================================================================
-- 7. VGP INSPECTIONS HISTORY  (unpaginated)
-- app/api/vgp/inspections/history/route.ts:46-65
-- ===========================================================================

EXPLAIN (ANALYZE, BUFFERS)
SELECT i.*
FROM vgp_inspections i
WHERE i.organization_id = :'org_id'::uuid
ORDER BY i.inspection_date DESC;

-- ===========================================================================
-- 8. DREETS REPORT DATE RANGE
-- app/api/vgp/report/route.ts:247-251
-- ===========================================================================
-- Selects every inspection_date to read the first and last. Compare to the
-- min/max aggregate that should replace it.

EXPLAIN (ANALYZE, BUFFERS)
SELECT inspection_date FROM vgp_inspections
WHERE organization_id = :'org_id'::uuid
ORDER BY inspection_date ASC;

EXPLAIN (ANALYZE, BUFFERS)
SELECT min(inspection_date), max(inspection_date), count(*)
FROM vgp_inspections
WHERE organization_id = :'org_id'::uuid;

-- ===========================================================================
-- 9. PUBLIC SCAN LOOKUP
-- app/scan/[qr_code]/page.tsx:250  -> rpc('get_asset_by_qr')
-- ===========================================================================
-- The hottest public path. qr_code must be indexed and unique; a Seq Scan here
-- is paid by every QR scan in the field.

EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM assets WHERE qr_code = :'qr';

-- Inspect the function body to confirm what the RPC really does:
--   SELECT prosrc FROM pg_proc WHERE proname = 'get_asset_by_qr';

-- ===========================================================================
-- 10. AUDIT ITEMS -> AUDITS  (the N+1)
-- app/scan/[qr_code]/page.tsx:164-180
-- ===========================================================================
-- The app runs the second query once PER audit item, inside a for loop.
-- Compare N executions of the single-row form against one .in() batch.

EXPLAIN (ANALYZE, BUFFERS)
SELECT id, status, audit_id FROM audit_items
WHERE asset_id = (SELECT id FROM assets WHERE qr_code = :'qr' LIMIT 1)
  AND status IN ('pending', 'verified', 'missing');

-- Executed N times by the loop:
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, name, status, verified_assets, total_assets
FROM audits
WHERE id = (SELECT audit_id FROM audit_items LIMIT 1)
  AND organization_id = :'org_id'::uuid
  AND status = 'in_progress';

-- What it should be - one round trip regardless of N:
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, name, status, verified_assets, total_assets
FROM audits
WHERE id IN (SELECT audit_id FROM audit_items
             WHERE asset_id = (SELECT id FROM assets WHERE qr_code = :'qr' LIMIT 1))
  AND organization_id = :'org_id'::uuid
  AND status = 'in_progress';

-- ===========================================================================
-- AFTERWARDS
-- ===========================================================================
-- If estimates diverge badly from actual rows, refresh statistics first and
-- re-run before drawing conclusions:
--   ANALYZE assets; ANALYZE vgp_schedules; ANALYZE vgp_inspections; ANALYZE scans;
