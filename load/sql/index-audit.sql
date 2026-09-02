-- load/sql/index-audit.sql
--
-- Settles the index findings the audit could not verify from the repo.
--
-- WHY THIS FILE EXISTS
-- The seven hottest tables (assets, users, organizations, vgp_schedules,
-- vgp_inspections, scans, asset_categories) have NO "CREATE TABLE" anywhere in
-- supabase/migrations/ or migrations/. Their DDL, indexes and RLS policies live
-- only in the Supabase dashboard. So every index claim in the audit marked
-- (inferred) is exactly that, and this script is how you turn it into fact.
--
-- HOW TO RUN
--   Supabase Dashboard -> SQL Editor -> paste -> Run.
--   Or: psql "$DATABASE_URL" -f load/sql/index-audit.sql
--
-- All statements are READ-ONLY. Nothing here writes, locks, or alters.

-- ---------------------------------------------------------------------------
-- 1. FOREIGN KEYS WITH NO INDEX
-- ---------------------------------------------------------------------------
-- The headline query. Postgres does NOT auto-index foreign key columns, so an
-- unindexed FK means every join and every "where organization_id = ?" is a
-- sequential scan. With 2,722 assets and 733 inspections in production today
-- that is survivable; it is not survivable per-request at 1,000 concurrent
-- users.
--
-- Expect rows for assets.organization_id, assets.category_id,
-- vgp_inspections.asset_id, scans.asset_id and users.organization_id unless
-- someone has added indexes via the dashboard.

SELECT
  c.conrelid::regclass                AS table_name,
  a.attname                           AS fk_column,
  c.conname                           AS constraint_name,
  pg_size_pretty(pg_relation_size(c.conrelid)) AS table_size
FROM pg_constraint c
JOIN LATERAL unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord) ON TRUE
JOIN pg_attribute a
  ON a.attrelid = c.conrelid AND a.attnum = k.attnum
WHERE c.contype = 'f'
  AND c.connamespace = 'public'::regnamespace
  AND NOT EXISTS (
    -- An index "covers" the FK only if the FK column is its LEADING column.
    -- A composite index on (status, organization_id) does NOT help a lookup
    -- filtered only by organization_id.
    SELECT 1
    FROM pg_index i
    WHERE i.indrelid = c.conrelid
      AND i.indkey[0] = k.attnum
  )
ORDER BY pg_relation_size(c.conrelid) DESC, table_name, fk_column;

-- ---------------------------------------------------------------------------
-- 2. EVERY INDEX THAT EXISTS, WITH USAGE
-- ---------------------------------------------------------------------------
-- idx_scan = 0 on a long-lived database means the index is dead weight: it
-- costs write throughput and disk and returns nothing. Check pg_stat_reset
-- timing before concluding - a recently reset counter looks identical to an
-- unused index.

SELECT
  s.relname                                   AS table_name,
  s.indexrelname                              AS index_name,
  s.idx_scan                                  AS times_used,
  pg_size_pretty(pg_relation_size(s.indexrelid)) AS index_size,
  i.indisunique                               AS is_unique,
  pg_get_indexdef(s.indexrelid)               AS definition
FROM pg_stat_user_indexes s
JOIN pg_index i ON i.indexrelid = s.indexrelid
WHERE s.schemaname = 'public'
ORDER BY s.idx_scan ASC, pg_relation_size(s.indexrelid) DESC;

-- ---------------------------------------------------------------------------
-- 3. REDUNDANT / DUPLICATE INDEXES
-- ---------------------------------------------------------------------------
-- Finds indexes whose column list is a prefix of another's. The audit found one
-- statically: billing_events.stripe_event_id is UNIQUE (which creates an
-- implicit index) AND has an explicit CREATE INDEX on the same column.

SELECT
  a.indrelid::regclass AS table_name,
  a.indexrelid::regclass AS index_a,
  b.indexrelid::regclass AS index_b,
  pg_get_indexdef(a.indexrelid) AS def_a,
  pg_get_indexdef(b.indexrelid) AS def_b
FROM pg_index a
JOIN pg_index b
  ON a.indrelid = b.indrelid
 AND a.indexrelid < b.indexrelid
 AND array_to_string(a.indkey, ' ') LIKE array_to_string(b.indkey, ' ') || '%'
WHERE a.indrelid::regclass::text NOT LIKE 'pg_%'
ORDER BY table_name;

-- ---------------------------------------------------------------------------
-- 4. SEQUENTIAL SCANS ON BIG TABLES
-- ---------------------------------------------------------------------------
-- seq_scan high + seq_tup_read enormous = the table is being read end-to-end
-- routinely. Cross-reference with section 1: an unindexed FK usually shows up
-- here too.

SELECT
  relname                            AS table_name,
  n_live_tup                         AS live_rows,
  seq_scan                           AS sequential_scans,
  seq_tup_read                       AS rows_read_sequentially,
  idx_scan                           AS index_scans,
  CASE WHEN seq_scan + COALESCE(idx_scan, 0) = 0 THEN NULL
       ELSE round(100.0 * seq_scan / (seq_scan + COALESCE(idx_scan, 0)), 1)
  END                                AS pct_seq,
  pg_size_pretty(pg_total_relation_size(relid)) AS total_size
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY seq_tup_read DESC NULLS LAST
LIMIT 25;

-- ---------------------------------------------------------------------------
-- 5. TABLE SIZES AND ROW COUNTS
-- ---------------------------------------------------------------------------
-- Ground truth for the cost model. Egress projections are only as good as the
-- row counts they are built on.

SELECT
  relname                                        AS table_name,
  n_live_tup                                     AS live_rows,
  n_dead_tup                                     AS dead_rows,
  pg_size_pretty(pg_table_size(relid))           AS table_size,
  pg_size_pretty(pg_indexes_size(relid))         AS indexes_size,
  pg_size_pretty(pg_total_relation_size(relid))  AS total_size,
  last_autovacuum,
  last_autoanalyze
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(relid) DESC;

-- ---------------------------------------------------------------------------
-- 6. RLS POLICIES ACTUALLY IN FORCE
-- ---------------------------------------------------------------------------
-- The audit flags dashboard/page.tsx counting `scans` with NO organization_id
-- filter, relying on an RLS policy that uses a correlated EXISTS subquery
-- against assets. Whether that is cheap or catastrophic depends on the policy
-- text below and on whether scans.asset_id is indexed (section 1).
--
-- Read the `qual` column carefully: a policy containing a per-row subquery is
-- evaluated for every candidate row.

SELECT
  schemaname,
  tablename,
  policyname,
  cmd        AS command,
  roles,
  qual       AS using_expression,
  with_check AS with_check_expression
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, cmd, policyname;

-- ---------------------------------------------------------------------------
-- 7. DUPLICATE FUNCTION OVERLOADS
-- ---------------------------------------------------------------------------
-- checkout_asset is defined twice with different arity (10-arg and 11-arg).
-- CREATE OR REPLACE does not replace a different signature, so both remain
-- callable and PostgREST picks by argument match. Same pattern suspected for
-- extend_trial and create_organization_and_user.

SELECT
  n.nspname            AS schema,
  p.proname            AS function_name,
  pg_get_function_identity_arguments(p.oid) AS arguments,
  count(*) OVER (PARTITION BY n.nspname, p.proname) AS overload_count
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
ORDER BY overload_count DESC, function_name;

-- ---------------------------------------------------------------------------
-- 8. CACHE HIT RATIO
-- ---------------------------------------------------------------------------
-- Below ~0.99 on a working set this small means the instance is undersized or
-- something is scanning far more than it should.

SELECT
  sum(heap_blks_hit)                                            AS heap_hit,
  sum(heap_blks_read)                                           AS heap_read,
  round(sum(heap_blks_hit) / NULLIF(sum(heap_blks_hit + heap_blks_read), 0), 4)
                                                                AS heap_hit_ratio
FROM pg_statio_user_tables;
