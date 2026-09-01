-- 20260901120000_fk_indexes.sql
--
-- Index the foreign keys that are genuinely uncovered, checked against the
-- live schema rather than against what this repo declares.
--
-- ---------------------------------------------------------------------------
-- WHY THIS IS SHORTER THAN THE CANDIDATE LIST
-- ---------------------------------------------------------------------------
-- The schema inventory listed 14 FK columns as index candidates. Cross-checked
-- against `supabase db pull --declarative` output on 2026-09-01, the live
-- database already has 47 indexes -- far more than the 18 this repo declared,
-- which is exactly why creating from the repo alone would have been wrong.
--
-- The first-priority candidate, vgp_schedules.asset_id, is ALREADY INDEXED
-- (idx_vgp_schedules_asset). Creating it would have produced a duplicate on
-- the hottest join in the app. That single check justified the whole exercise.
--
-- Of the remaining 13, this migration creates 5. The other 8 are deliberately
-- skipped and the reasoning is recorded at the bottom, because "we considered
-- it and declined" is more useful to the next reader than silence.
--
-- ---------------------------------------------------------------------------
-- MEASURED TABLE SIZES (live, 2026-09-01)
-- ---------------------------------------------------------------------------
--   vgp_alerts             20,358 rows   <- 30x everything else
--   vgp_schedules             625
--   entitlement_overrides     228
--   rentals                   145
--   client_recall_alerts      136
--   subscriptions              19
--   team_invitations            2
--   admin_audit_log             0
--
-- Index choice follows those numbers. An index on a 2-row table costs write
-- throughput and buys nothing measurable.
--
-- ---------------------------------------------------------------------------
-- PLAIN CREATE INDEX, NOT CONCURRENTLY
-- ---------------------------------------------------------------------------
-- An earlier draft of this file used CREATE INDEX CONCURRENTLY. That was
-- wrong twice over:
--
--   1. CONCURRENTLY cannot run inside a transaction block, and the Supabase
--      CLI wraps every migration in one. `supabase db push` would have failed
--      outright with "CREATE INDEX CONCURRENTLY cannot run inside a
--      transaction block", no matter that this file omitted BEGIN/COMMIT.
--
--   2. It bought nothing here. CONCURRENTLY exists to avoid holding a write
--      lock on a large table for a long build. The biggest table touched is
--      vgp_alerts at 20,358 rows; that index builds in well under a second.
--      The lock is shorter than a typical request.
--
-- So these are plain CREATE INDEX statements in one transaction: either all
-- five exist afterwards or none do, which is the behaviour worth having.
-- IF NOT EXISTS keeps the file safe to re-run.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. vgp_alerts.asset_id  -- the one that actually matters
-- ---------------------------------------------------------------------------
-- 20,358 rows and growing daily: the cron writes one row per alert per
-- schedule. asset_id is a FK with no index, so every cascade from an asset
-- delete, and every lookup of "alerts for this asset", scans the whole table.
CREATE INDEX IF NOT EXISTS idx_vgp_alerts_asset
  ON public.vgp_alerts (asset_id);

-- ---------------------------------------------------------------------------
-- 2-4. client_recall_alerts: asset_id, vgp_schedule_id, client_id
-- ---------------------------------------------------------------------------
-- Only 136 rows today, but this table is written by the recall pass on every
-- cron run and read when deciding whether a client has already been told.
-- It grows with rentals x alert types, which is the fastest-growing product of
-- any table here. Indexing now is cheaper than indexing at 50,000 rows.
CREATE INDEX IF NOT EXISTS idx_recall_alerts_asset
  ON public.client_recall_alerts (asset_id);

CREATE INDEX IF NOT EXISTS idx_recall_alerts_vgp_schedule
  ON public.client_recall_alerts (vgp_schedule_id);

CREATE INDEX IF NOT EXISTS idx_recall_alerts_client
  ON public.client_recall_alerts (client_id);

-- ---------------------------------------------------------------------------
-- 5. vgp_schedules.archived_by
-- ---------------------------------------------------------------------------
-- 625 rows. Modest, but vgp_schedules is the most-joined table in the app and
-- archived_by is a FK to users with no index, so deleting a user scans it.
CREATE INDEX IF NOT EXISTS idx_vgp_schedules_archived_by
  ON public.vgp_schedules (archived_by);

COMMIT;

-- ---------------------------------------------------------------------------
-- DELIBERATELY NOT CREATED
-- ---------------------------------------------------------------------------
-- These were on the candidate list and are genuinely uncovered. They are
-- skipped because the cost of the index outweighs the scan it would avoid:
--
--   admin_audit_log.actor_id        0 rows. The table is append-only and read
--     admin_audit_log.target_org_id by a human opening one org's history, not
--     admin_audit_log.created_at    by a hot path. Revisit if it grows past a
--                                   few thousand rows; at that point index
--                                   (target_org_id, created_at DESC) rather
--                                   than actor_id alone, since that is the
--                                   query the admin page actually makes.
--
--   rentals.checkout_scan_id        145 rows, and both are nullable one-to-one
--   rentals.return_scan_id          links used to fetch a single scan by id.
--                                   A seq scan of 145 rows is faster than an
--                                   index lookup.
--
--   rentals.checked_out_by          145 rows, FK to users. Same reasoning.
--   rentals.returned_by
--
--   subscriptions.plan_id           19 rows. One row per organization. An
--                                   index here would never be chosen.
--
--   entitlement_overrides.granted_by 228 rows, and granted_by is written for
--                                   the record, not queried.
--
--   team_invitations.invited_by     2 rows.
--
-- The rule applied: index a FK when the table is large, when it is on a
-- cascade path from something that gets deleted, or when it is growing fast.
-- Not merely because Postgres does not auto-index foreign keys.
--
-- ---------------------------------------------------------------------------
-- ALSO CONSIDERED: vgp_schedules.organization_id
-- ---------------------------------------------------------------------------
-- The inventory noted this is only partially covered. Live schema confirms
-- BOTH a full index and a composite exist:
--
--   idx_vgp_schedules_org    (organization_id)
--   idx_vgp_schedules_active (organization_id, next_due_date)
--
-- so the CASCADE path over archived rows is served by idx_vgp_schedules_org.
-- No action needed; the concern was based on the repo's partial-index
-- declaration, which the live database does not match.
--
-- ---------------------------------------------------------------------------
-- VERIFY AFTER APPLYING
-- ---------------------------------------------------------------------------
-- 1. All five exist. Expect exactly five rows; because they were created in
--    one transaction, a partial result is not possible -- either the migration
--    committed or nothing was created:
--
--   SELECT c.relname AS index_name
--   FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
--   WHERE c.relname IN ('idx_vgp_alerts_asset','idx_recall_alerts_asset',
--                       'idx_recall_alerts_vgp_schedule','idx_recall_alerts_client',
--                       'idx_vgp_schedules_archived_by')
--   ORDER BY 1;
--
-- 2. Whether they get used, after a few days of real traffic:
--
--   SELECT indexrelname, idx_scan FROM pg_stat_user_indexes
--   WHERE indexrelname LIKE 'idx_recall_alerts%'
--      OR indexrelname = 'idx_vgp_alerts_asset';
