-- load/sql/explain-top-queries.sql
--
-- EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) for the ten hottest queries in the
-- app, transcribed from the code that issues them. Run in the Supabase SQL
-- editor (or psql) against a preview / branch database with representative
-- volume, NOT production.
--
-- Set the two variables first. :org is the tenant to profile; pick the largest
-- one you have.
--
--   \set org '00000000-0000-0000-0000-000000000000'
--   \set uid '00000000-0000-0000-0000-000000000000'
--
-- In the Supabase SQL editor there is no \set, so use the inline replacement
-- at the top of each block instead.
--
-- IMPORTANT: these run as the SQL editor's role, which bypasses RLS. To see
-- the plan a real user gets (policies included), wrap each statement in:
--
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub":"<uid>","role":"authenticated"}';
--
-- RLS predicates on organization_id are frequently the reason a query that
-- looks indexed still seq-scans.

\timing on

-- ===========================================================================
-- 1. Assets list, unpaginated, two embedded relations.
--    components/assets/AssetsPageClient.tsx:86
--    This is the single largest read in the product.
-- ===========================================================================
EXPLAIN (ANALYZE, BUFFERS)
SELECT a.*,
       (SELECT json_agg(json_build_object('id', c.id, 'name', c.name))
          FROM asset_categories c WHERE c.id = a.category_id)          AS asset_categories,
       (SELECT json_agg(json_build_object('id', s.id,
                                          'next_due_date', s.next_due_date,
                                          'archived_at', s.archived_at))
          FROM vgp_schedules s WHERE s.asset_id = a.id)                AS vgp_schedules
FROM assets a
WHERE a.organization_id = :'org'
ORDER BY a.created_at DESC;

-- ===========================================================================
-- 2. Dashboard: exact asset count. Runs twice per dashboard load
--    (total, then status = 'in_use').
--    app/(dashboard)/dashboard/page.tsx:85 and :93
-- ===========================================================================
EXPLAIN (ANALYZE, BUFFERS)
SELECT count(*) FROM assets
WHERE organization_id = :'org' AND archived_at IS NULL;

EXPLAIN (ANALYZE, BUFFERS)
SELECT count(*) FROM assets
WHERE organization_id = :'org' AND archived_at IS NULL AND status = 'in_use';

-- ===========================================================================
-- 3. Dashboard: 7-day scan count. Note the MISSING organization filter -
--    app/(dashboard)/dashboard/page.tsx:107 relies entirely on RLS, so the
--    planner sees a whole-table predicate on scanned_at.
--    Run this one under `set local role authenticated` or the plan is a lie.
-- ===========================================================================
EXPLAIN (ANALYZE, BUFFERS)
SELECT count(*) FROM scans
WHERE scanned_at >= now() - interval '7 days';

-- ===========================================================================
-- 4. Dashboard: every non-completed schedule with its asset.
--    app/(dashboard)/dashboard/page.tsx:118
-- ===========================================================================
EXPLAIN (ANALYZE, BUFFERS)
SELECT s.id, s.next_due_date, a.id AS asset_id, a.name
FROM vgp_schedules s
LEFT JOIN assets a ON a.id = s.asset_id
WHERE s.organization_id = :'org'
  AND s.archived_at IS NULL
  AND s.status <> 'completed'
ORDER BY s.next_due_date ASC;

-- ===========================================================================
-- 5. Dashboard: per-category utilisation. Whole asset table again, third read
--    of the same rows in one page load.
--    app/(dashboard)/dashboard/page.tsx:187
-- ===========================================================================
EXPLAIN (ANALYZE, BUFFERS)
SELECT a.status, a.category_id, c.name
FROM assets a
LEFT JOIN asset_categories c ON c.id = a.category_id
WHERE a.organization_id = :'org' AND a.archived_at IS NULL;

-- ===========================================================================
-- 6. VGP schedules list with exact count and a 1000-row page.
--    app/api/vgp/schedules/route.ts:72-120
--    The count(*) here is a separate full scan of the filtered set.
-- ===========================================================================
EXPLAIN (ANALYZE, BUFFERS)
SELECT s.id, s.asset_id, s.organization_id, s.interval_months,
       s.last_inspection_date, s.next_due_date, s.status, s.notes,
       s.archived_at, s.inspection_location, s.created_at, s.updated_at,
       a.id AS a_id, a.name, a.serial_number, a.current_location, a.qr_code,
       c.name AS category_name
FROM vgp_schedules s
LEFT JOIN assets a ON a.id = s.asset_id
LEFT JOIN asset_categories c ON c.id = a.category_id
WHERE s.organization_id = :'org' AND s.archived_at IS NULL
ORDER BY s.next_due_date ASC, s.id ASC
LIMIT 1000 OFFSET 0;

EXPLAIN (ANALYZE, BUFFERS)
SELECT count(*) FROM vgp_schedules
WHERE organization_id = :'org' AND archived_at IS NULL;

-- ===========================================================================
-- 7. Compliance summary: every non-archived schedule, SELECT *, aggregated
--    in JavaScript afterwards.
--    app/api/vgp/compliance-summary/route.ts:48
-- ===========================================================================
EXPLAIN (ANALYZE, BUFFERS)
SELECT s.*, a.id AS a_id, a.name, a.serial_number, a.current_location, c.name AS cat
FROM vgp_schedules s
LEFT JOIN assets a ON a.id = s.asset_id
LEFT JOIN asset_categories c ON c.id = a.category_id
WHERE s.organization_id = :'org' AND s.archived_at IS NULL
ORDER BY s.next_due_date ASC;

-- ===========================================================================
-- 8. Inspection history, unpaginated.
--    app/api/vgp/inspections/history/route.ts:40
-- ===========================================================================
EXPLAIN (ANALYZE, BUFFERS)
SELECT i.id, i.inspection_date, i.inspector_name, i.inspector_company,
       i.verification_type, i.observations, i.result, i.certificate_url,
       i.next_inspection_date, i.organization_id,
       a.id AS a_id, a.name, a.serial_number, c.name AS category
FROM vgp_inspections i
LEFT JOIN assets a ON a.id = i.asset_id
LEFT JOIN asset_categories c ON c.id = a.category_id
WHERE i.organization_id = :'org'
ORDER BY i.inspection_date DESC;

-- ===========================================================================
-- 9. DREETS report: every inspection in a range, plus the metadata pass that
--    reads every inspection_date row in the org just to find min/max.
--    app/api/vgp/report/route.ts:90 and :242
-- ===========================================================================
EXPLAIN (ANALYZE, BUFFERS)
SELECT i.*, a.name, a.serial_number, c.name AS cat, o.name AS org_name
FROM vgp_inspections i
LEFT JOIN assets a ON a.id = i.asset_id
LEFT JOIN asset_categories c ON c.id = a.category_id
LEFT JOIN organizations o ON o.id = i.organization_id
WHERE i.organization_id = :'org'
  AND i.inspection_date >= current_date - interval '12 months'
  AND i.inspection_date <= current_date
ORDER BY i.inspection_date DESC;

EXPLAIN (ANALYZE, BUFFERS)
SELECT inspection_date FROM vgp_inspections
WHERE organization_id = :'org'
ORDER BY inspection_date ASC;

-- ===========================================================================
-- 10. The nightly cron's two whole-table reads. No organization predicate at
--     all - these scan every tenant's rows in one statement.
--     app/api/cron/vgp-alerts/route.ts:240 and :604
-- ===========================================================================
EXPLAIN (ANALYZE, BUFFERS)
SELECT s.id, s.asset_id, s.organization_id, s.next_due_date, s.interval_months,
       s.inspector_name, s.inspector_company,
       a.name, a.serial_number, a.category_id, a.current_location, c.name AS cat
FROM vgp_schedules s
LEFT JOIN assets a ON a.id = s.asset_id
LEFT JOIN asset_categories c ON c.id = a.category_id
WHERE s.status = 'active'
  AND s.next_due_date <= current_date + 60
  AND s.archived_at IS NULL;

EXPLAIN (ANALYZE, BUFFERS)
SELECT r.id, r.asset_id, r.organization_id, r.client_name, r.client_id,
       r.client_contact, r.checkout_date, r.expected_return_date,
       cl.name, cl.email, a.name AS asset_name, a.serial_number
FROM rentals r
LEFT JOIN clients cl ON cl.id = r.client_id
LEFT JOIN assets a ON a.id = r.asset_id
WHERE r.status = 'active';

-- ===========================================================================
-- 11. The auth hot path. Every guarded route resolves the caller's org with
--     this exact statement, several times per page.
--     lib/server/require-write-access.ts:42, require-feature.ts:40,
--     billing/entitlements.ts:48, plus every client component.
-- ===========================================================================
EXPLAIN (ANALYZE, BUFFERS)
SELECT organization_id FROM users WHERE id = :'uid';

-- ===========================================================================
-- 12. The public scan RPC. This is the only query an anonymous scanner runs,
--     and it must stay sub-50ms: it is on the critical path of a phone in a
--     depot with a weak signal.
-- ===========================================================================
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM get_asset_by_qr('replace-with-a-real-qr-code');
