-- 20260904100000_claim_vgp_alerts_rpc.sql
--
-- Restore the VGP alert cron. Move the dedup claim into a function so the
-- PARTIAL unique index can be named as the conflict arbiter.
--
-- ---------------------------------------------------------------------------
-- THE OUTAGE THIS FIXES
-- ---------------------------------------------------------------------------
-- Since the merge of #38 the daily cron has failed every claim with:
--
--   42P10  there is no unique or exclusion constraint matching the
--          ON CONFLICT specification
--
-- No alerts have been sent since 2026-09-03. The handler `continue`s past the
-- error, so the run completes "successfully" while sending nothing -- one
-- Sentry event per org per band, and a silent compliance failure.
--
-- ---------------------------------------------------------------------------
-- WHY IT BROKE
-- ---------------------------------------------------------------------------
-- 20260902140000 created the dedup guard as a PARTIAL index:
--
--   CREATE UNIQUE INDEX idx_vgp_alerts_dedup_unique
--     ON vgp_alerts (schedule_id, alert_type, alert_date)
--     WHERE (sent = true);
--
-- Postgres will only use a partial index to arbitrate ON CONFLICT if the
-- statement repeats the index predicate in the conflict target. Verified
-- against Postgres 15 with this exact table and index:
--
--   ON CONFLICT (schedule_id, alert_type, alert_date) DO NOTHING
--     -> ERROR 42P10
--   ON CONFLICT (schedule_id, alert_type, alert_date) WHERE sent = true
--     DO NOTHING
--     -> INSERT 0 1
--
-- The cron claimed through supabase-js `.upsert({ onConflict: '...' })`.
-- PostgREST's on_conflict parameter takes a bare column list and has no syntax
-- for a predicate, so the failing form was the only one the client could emit.
-- This is not fixable in the client call; the statement has to live in SQL.
--
-- ---------------------------------------------------------------------------
-- WHY NOT JUST DROP THE PREDICATE
-- ---------------------------------------------------------------------------
-- Making the index non-partial would satisfy PostgREST and reintroduce a worse
-- bug. A released claim is a deleted row, but the cron also writes sent = false
-- rows, and under a non-partial index one of those permanently blocks
-- re-claiming the same (schedule, type, date). Verified on Postgres 15:
--
--   -- with a NON-partial unique index
--   INSERT ... (sent = false);                        -- INSERT 0 1
--   INSERT ... (sent = true) ON CONFLICT DO NOTHING;  -- INSERT 0 0
--
-- Zero rows means that schedule can never be alerted again that day. Trading a
-- loud crash for silent alert loss is the wrong direction for compliance mail.
-- The partial index is correct and stays.
--
-- ---------------------------------------------------------------------------
-- SHAPE
-- ---------------------------------------------------------------------------
-- Takes the batch as JSONB and returns the rows it actually claimed, so a
-- digest of 400 schedules is still one round trip -- matching what the upsert
-- did. Returning claimed rows (not a count) is what lets the caller send for
-- exactly the subset it owns when a concurrent run holds the remainder.
--
-- ---------------------------------------------------------------------------
-- SECURITY
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER with a pinned search_path. EXECUTE is revoked from anon AND
-- authenticated: this writes the audit trail that proves an alert was sent, and
-- only the cron (service_role) has any business calling it. Note that revoking
-- from PUBLIC is not sufficient in this project -- default privileges grant
-- EXECUTE to anon on every new function in public, so anon must be named
-- explicitly. Same lesson as 20260902120000.

BEGIN;

-- CREATE OR REPLACE cannot change a function's return type, so a re-run after
-- any change to the OUT columns would fail with 42P13. Dropping first keeps
-- this migration re-runnable.
DROP FUNCTION IF EXISTS public.claim_vgp_alerts(JSONB);

-- Output columns are named out_* rather than id/schedule_id on purpose. In
-- PL/pgSQL every RETURNS TABLE column is an in-scope variable, so a bare
-- `schedule_id` or `sent` inside the statement is ambiguous between the
-- variable and the table column -- and the ON CONFLICT predicate below is
-- exactly where that ambiguity bites (42702). Distinct names remove it.
CREATE OR REPLACE FUNCTION public.claim_vgp_alerts(p_rows JSONB)
RETURNS TABLE (out_id UUID, out_schedule_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'p_rows must be a JSON array' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  INSERT INTO public.vgp_alerts (
    schedule_id, asset_id, organization_id, alert_type, urgency_level,
    alert_date, due_date, sent, sent_at, email_sent_to, resolved
  )
  SELECT
    (r->>'schedule_id')::UUID,
    NULLIF(r->>'asset_id', '')::UUID,
    NULLIF(r->>'organization_id', '')::UUID,
    r->>'alert_type',
    r->>'urgency_level',
    (r->>'alert_date')::DATE,
    (r->>'due_date')::DATE,
    TRUE,
    COALESCE((r->>'sent_at')::TIMESTAMPTZ, now()),
    -- email_sent_to is text[]; the caller sends a JSON array of addresses.
    COALESCE(
      ARRAY(SELECT jsonb_array_elements_text(r->'email_sent_to')),
      ARRAY[]::TEXT[]
    ),
    FALSE
  FROM jsonb_array_elements(p_rows) AS r
  -- The predicate is what makes the partial index usable as the arbiter.
  -- Without it this statement raises 42P10, which is the outage being fixed.
  ON CONFLICT (schedule_id, alert_type, alert_date) WHERE vgp_alerts.sent = true
  DO NOTHING
  RETURNING vgp_alerts.id, vgp_alerts.schedule_id;
END;
$$;

COMMENT ON FUNCTION public.claim_vgp_alerts(JSONB) IS
  'Claim a batch of VGP alerts for sending, returning only the rows actually '
  'inserted. Rows already claimed for the same (schedule_id, alert_type, '
  'alert_date) are skipped. Exists because ON CONFLICT against the PARTIAL '
  'index idx_vgp_alerts_dedup_unique must repeat its WHERE predicate, which '
  'PostgREST cannot express.';

REVOKE ALL ON FUNCTION public.claim_vgp_alerts(JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_vgp_alerts(JSONB) FROM anon;
REVOKE EXECUTE ON FUNCTION public.claim_vgp_alerts(JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_vgp_alerts(JSONB) TO service_role;

COMMIT;

-- ---------------------------------------------------------------------------
-- VERIFY AFTER APPLYING
-- ---------------------------------------------------------------------------
-- 1. Grants: service_role only.
--
--   SELECT p.proname, array_to_string(p.proacl, E'\n') AS acl
--     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public' AND p.proname = 'claim_vgp_alerts';
--
--   Expect service_role and postgres. NOT anon, NOT authenticated.
--
-- 2. A claim succeeds, a second identical claim returns nothing:
--
--   BEGIN;
--     SELECT * FROM public.claim_vgp_alerts('[{
--       "schedule_id":"<real-schedule-uuid>","alert_type":"overdue",
--       "urgency_level":"overdue","alert_date":"2026-09-04",
--       "due_date":"2026-08-01","email_sent_to":["probe@example.invalid"]
--     }]'::jsonb);                       -- 1 row
--     SELECT * FROM public.claim_vgp_alerts('[ ...same... ]'::jsonb);
--                                        -- 0 rows
--   ROLLBACK;
--
-- 3. The cron produces rows again. After the next run (or a manual trigger):
--
--   SELECT count(*) FROM public.vgp_alerts
--    WHERE sent = true AND alert_date = CURRENT_DATE;
--
--   Expect a non-zero count comparable to the ~100-175/day before the outage.
