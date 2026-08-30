-- load/sql/index-audit.sql
--
-- Index and RLS audit for the TraviXO schema. Run in the Supabase SQL editor.
-- Read-only: every statement here is a SELECT.
--
-- The repository carries almost no schema (supabase/migrations/ holds one
-- pricing UPDATE, and migrations/ holds the VGP alerts DDL), so the live
-- database is the only source of truth for what indexes exist. Run this first;
-- the audit's index findings cannot be closed without its output.

-- ---------------------------------------------------------------------------
-- 1. What indexes exist, per table, with size and usage.
-- ---------------------------------------------------------------------------
SELECT
  s.relname                                   AS table_name,
  s.indexrelname                              AS index_name,
  pg_size_pretty(pg_relation_size(s.indexrelid)) AS index_size,
  s.idx_scan                                  AS scans,
  s.idx_tup_read                              AS tuples_read,
  i.indexdef
FROM pg_stat_user_indexes s
JOIN pg_indexes i
  ON i.schemaname = s.schemaname AND i.indexname = s.indexrelname
WHERE s.schemaname = 'public'
ORDER BY s.relname, s.idx_scan ASC;

-- ---------------------------------------------------------------------------
-- 2. Foreign keys with no supporting index.
--    Every one of these makes a join or a cascading delete a sequential scan.
-- ---------------------------------------------------------------------------
SELECT
  c.conrelid::regclass    AS table_name,
  a.attname               AS fk_column,
  c.conname               AS constraint_name,
  c.confrelid::regclass   AS references_table
FROM pg_constraint c
JOIN unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord) ON true
JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
WHERE c.contype = 'f'
  AND c.connamespace = 'public'::regnamespace
  AND NOT EXISTS (
    SELECT 1 FROM pg_index i
    WHERE i.indrelid = c.conrelid
      AND i.indkey[0] = a.attnum
  )
ORDER BY 1, 2;

-- ---------------------------------------------------------------------------
-- 3. Indexes that have never been used. Each one costs write throughput and
--    storage on every INSERT/UPDATE for no read benefit.
--    Ignore rows where scans is low simply because the database is young.
-- ---------------------------------------------------------------------------
SELECT
  s.relname AS table_name,
  s.indexrelname AS index_name,
  pg_size_pretty(pg_relation_size(s.indexrelid)) AS size,
  s.idx_scan
FROM pg_stat_user_indexes s
JOIN pg_index i ON i.indexrelid = s.indexrelid
WHERE s.schemaname = 'public'
  AND s.idx_scan = 0
  AND NOT i.indisunique
  AND NOT i.indisprimary
ORDER BY pg_relation_size(s.indexrelid) DESC;

-- ---------------------------------------------------------------------------
-- 4. Tables the planner is scanning sequentially in production.
--    seq_scan high relative to idx_scan on a large table is the signature of
--    a missing index or an RLS predicate the planner cannot use.
-- ---------------------------------------------------------------------------
SELECT
  relname AS table_name,
  n_live_tup AS live_rows,
  seq_scan,
  seq_tup_read,
  idx_scan,
  CASE WHEN seq_scan + COALESCE(idx_scan, 0) = 0 THEN NULL
       ELSE round(100.0 * seq_scan / (seq_scan + COALESCE(idx_scan, 0)), 1)
  END AS pct_seq
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY seq_tup_read DESC
LIMIT 30;

-- ---------------------------------------------------------------------------
-- 5. Table and index sizes, for the egress and storage cost model.
-- ---------------------------------------------------------------------------
SELECT
  relname AS table_name,
  pg_size_pretty(pg_total_relation_size(relid))                        AS total,
  pg_size_pretty(pg_relation_size(relid))                              AS heap,
  pg_size_pretty(pg_total_relation_size(relid) - pg_relation_size(relid)) AS indexes,
  n_live_tup AS live_rows
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(relid) DESC;

-- ---------------------------------------------------------------------------
-- 6. RLS policies. A policy whose USING clause runs a subquery per row
--    (the `organization_id IN (SELECT ... FROM users WHERE id = auth.uid())`
--    shape used by migrations/vgp-email-alerts-migration.sql:66) is evaluated
--    once per candidate row unless it is wrapped so Postgres can treat it as
--    a stable scalar. Look for policies missing that wrapper.
-- ---------------------------------------------------------------------------
SELECT
  schemaname, tablename, policyname, cmd, permissive, roles,
  qual        AS using_clause,
  with_check  AS with_check_clause
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- ---------------------------------------------------------------------------
-- 7. Tables with RLS enabled but no policy (deny-all), or disabled entirely.
-- ---------------------------------------------------------------------------
SELECT
  c.relname AS table_name,
  c.relrowsecurity   AS rls_enabled,
  c.relforcerowsecurity AS rls_forced,
  (SELECT count(*) FROM pg_policies p
    WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS policy_count
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY c.relname;

-- ---------------------------------------------------------------------------
-- 8. Slowest statements by total time. Requires pg_stat_statements, which
--    Supabase enables by default.
-- ---------------------------------------------------------------------------
SELECT
  round(total_exec_time::numeric, 1)              AS total_ms,
  calls,
  round(mean_exec_time::numeric, 2)               AS mean_ms,
  round((100 * total_exec_time /
         NULLIF(sum(total_exec_time) OVER (), 0))::numeric, 1) AS pct_of_total,
  rows,
  left(regexp_replace(query, '\s+', ' ', 'g'), 200) AS query
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 25;

-- ---------------------------------------------------------------------------
-- 9. Connection picture. Compare `max_connections` and the pooler's own limit
--    against the number of concurrent Vercel function instances you expect.
-- ---------------------------------------------------------------------------
SELECT
  (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') AS max_connections,
  count(*)                                          AS current_total,
  count(*) FILTER (WHERE state = 'active')          AS active,
  count(*) FILTER (WHERE state = 'idle')            AS idle,
  count(*) FILTER (WHERE state = 'idle in transaction') AS idle_in_transaction
FROM pg_stat_activity;

SELECT usename, application_name, state, count(*)
FROM pg_stat_activity
GROUP BY 1, 2, 3
ORDER BY 4 DESC;

-- ---------------------------------------------------------------------------
-- 10. Candidate indexes suggested by the audit. Review the output of sections
--     1-4 before creating any of these; several may already exist under a
--     different name. CREATE INDEX CONCURRENTLY so no write is blocked.
--
--     Left commented deliberately: this file is read-only by design.
-- ---------------------------------------------------------------------------
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_assets_org_archived_created
--   ON assets (organization_id, created_at DESC) WHERE archived_at IS NULL;
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_assets_org_status
--   ON assets (organization_id, status) WHERE archived_at IS NULL;
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_assets_qr_code
--   ON assets (qr_code);
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_assets_category
--   ON assets (category_id);
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_scans_org_scanned_at
--   ON scans (scanned_at DESC);
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_scans_asset
--   ON scans (asset_id, scanned_at DESC);
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vgp_schedules_org_due
--   ON vgp_schedules (organization_id, next_due_date) WHERE archived_at IS NULL;
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vgp_schedules_asset
--   ON vgp_schedules (asset_id) WHERE archived_at IS NULL;
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vgp_inspections_org_date
--   ON vgp_inspections (organization_id, inspection_date DESC);
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vgp_inspections_asset
--   ON vgp_inspections (asset_id);
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_rentals_org_status
--   ON rentals (organization_id, status);
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_rentals_asset_status
--   ON rentals (asset_id, status);
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_rentals_client
--   ON rentals (client_id);
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_items_audit
--   ON audit_items (audit_id, status);
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_items_asset
--   ON audit_items (asset_id);
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_org
--   ON users (organization_id);
-- -- Idempotency for the Stripe webhook. Without this the duplicate check at
-- -- app/api/stripe/webhook/route.ts:90 is a check-then-act race.
-- CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_billing_events_stripe_event
--   ON billing_events (stripe_event_id);
