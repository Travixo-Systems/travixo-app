-- 20260902140000_vgp_alerts_unique_dedup.sql
--
-- Give vgp_alerts the unique dedup index its sibling table already has, and
-- clear the duplicates that accumulated while it did not.
--
-- ---------------------------------------------------------------------------
-- WHY THIS IS NEEDED
-- ---------------------------------------------------------------------------
-- client_recall_alerts has carried this guard since it was created:
--
--   CREATE UNIQUE INDEX idx_recall_alerts_dedup
--     ON public.client_recall_alerts (rental_id, alert_type, next_due_date);
--
-- vgp_alerts has the same shape of dedup key and only a NON-unique index over
-- it:
--
--   CREATE INDEX idx_vgp_alerts_dedup
--     ON public.vgp_alerts (schedule_id, alert_type, alert_date, sent)
--     WHERE (sent = true);
--
-- So nothing at the database level has ever prevented the same alert being
-- recorded twice for the same schedule on the same day. The only protection was
-- an in-process cooldown computed in the cron, which cannot hold across two
-- concurrent runs: the scheduled 07:00 invocation and a manual admin trigger
-- (app/api/admin/trigger-vgp-alerts) both read the same "last alert" snapshot,
-- both conclude the cooldown has expired, and both send.
--
-- ---------------------------------------------------------------------------
-- ORDER MATTERS
-- ---------------------------------------------------------------------------
-- The cleanup MUST run before the index is created. CREATE UNIQUE INDEX fails
-- outright if duplicates are already present, and this table has been
-- accumulating them for as long as the cron has been running.
--
-- The DELETE keeps the most recent row per (schedule_id, alert_type,
-- alert_date) -- ORDER BY sent_at DESC inside DISTINCT ON -- because sent_at is
-- what the cooldown reads. Keeping the oldest would make the cooldown look
-- older than it is and could release an alert early.
--
-- Scoped to sent = true throughout, matching the partial index. Unsent rows are
-- queue entries from the legacy generate_vgp_alerts() SQL function, are not
-- dedup records, and are left alone.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS DOES NOT DO
-- ---------------------------------------------------------------------------
-- It does not stop the cron re-alerting a schedule on a LATER day. That is the
-- intended design: alert_date is part of the key precisely so tomorrow's alert
-- is a different row. What it stops is the same alert being written twice for
-- the same day, which is what a duplicate email looks like in this table.

BEGIN;

-- 1. Collapse existing duplicates, keeping the most recently sent row.
DELETE FROM public.vgp_alerts
 WHERE sent = true
   AND id NOT IN (
     SELECT DISTINCT ON (schedule_id, alert_type, alert_date) id
       FROM public.vgp_alerts
      WHERE sent = true
      ORDER BY schedule_id, alert_type, alert_date, sent_at DESC NULLS LAST, id
   );

-- 2. Now the guard can be installed.
CREATE UNIQUE INDEX IF NOT EXISTS idx_vgp_alerts_dedup_unique
  ON public.vgp_alerts (schedule_id, alert_type, alert_date)
  WHERE (sent = true);

COMMIT;

-- ---------------------------------------------------------------------------
-- VERIFY AFTER APPLYING
-- ---------------------------------------------------------------------------
-- 1. No duplicates remain (expect zero rows):
--
--   SELECT schedule_id, alert_type, alert_date, count(*)
--     FROM public.vgp_alerts
--    WHERE sent = true
--    GROUP BY 1, 2, 3
--   HAVING count(*) > 1;
--
-- 2. The index exists and is unique:
--
--   SELECT indexname, indexdef
--     FROM pg_indexes
--    WHERE tablename = 'vgp_alerts'
--      AND indexname = 'idx_vgp_alerts_dedup_unique';
--
--   Expect: CREATE UNIQUE INDEX ... (schedule_id, alert_type, alert_date)
--           WHERE (sent = true)
--
-- 3. A second insert for the same key is refused rather than duplicated:
--
--   INSERT INTO public.vgp_alerts
--     (schedule_id, asset_id, organization_id, alert_type, alert_date,
--      due_date, sent, sent_at)
--   SELECT schedule_id, asset_id, organization_id, alert_type, alert_date,
--          due_date, true, now()
--     FROM public.vgp_alerts WHERE sent = true LIMIT 1;
--
--   Expect: duplicate key value violates unique constraint.
--
-- 4. The old non-unique index is intentionally left in place. It still serves
--    the cooldown lookup and dropping it is a separate decision.
