# Gates: record weekly digest deliveries

OWNS: supabase/migrations/20260914150000_vgp_digest_deliveries.sql, app/api/cron/vgp-weekly-digest/**, scripts/verify/verify-d1-delivery-log.mjs, GATES-DIGEST-DELIVERY-LOG.md

Scope: Persist one row per delivered digest, with the Resend message id the
send already returns and the route previously discarded, so that an empty
outbox stops being indistinguishable from a feature that has never worked.

- [x] D1: EXECUTED AGAINST REAL POSTGRES - the delivery record survives the
      queue drain that destroys the outbox rows, retains the provider message
      id, outlives deletion of the user it was sent to, and is readable only
      by its own recipient. Includes a CONTROL that reproduces the original
      ambiguity: before the migration, a drained queue leaves no artifact at
      all, so "0 rows" carries no information.
  CHECK: node scripts/verify/verify-d1-delivery-log.mjs
  EXPECT: D1_DELIVERY_LOG_VERIFIED
  EVIDENCE: exit=0, 21 assertions. Control confirmed no artifact exists pre-migration. Post-migration: queue drains 3 -> 0 while the delivery row persists with provider_message_id re_testmessageid01; period and item_count CHECKs reject 'monthly' and 0; a NULL provider id is still recordable; deleting the user keeps the row and nulls only user_id; anon privileges NONE, authenticated SELECT only, zero non-SELECT policies; migration re-runnable.

- [x] D2: The route logs the delivery BEFORE clearing the queue, and reports
      deliveries_logged separately from emails_sent so a send that is not
      recorded is visible rather than inferred.
  EVIDENCE: app/api/cron/vgp-weekly-digest/route.ts - the insert into vgp_digest_deliveries precedes the pending_weekly_digests delete. Ordering is deliberate: clearing first would let a crash between the two writes destroy both the queue rows and any trace of the send, which is the exact ambiguity being removed; logging first risks at worst a duplicate email next Monday, and a duplicate is recoverable where lost evidence is not. A failed log does not abort the run or block the clear, but raises to Sentry and appends to result.errors. tsc --noEmit exit 0; eslint 0 errors / 0 warnings, identical to the origin/main baseline.

- [ ] D3: Manual - migration applied to production, then a real weekly digest
      delivered and its row confirmed in vgp_digest_deliveries with a Resend
      message id that resolves in the provider dashboard.
  EVIDENCE: PARTIAL - the schema half is done, the delivery half is not. Migration applied to production 2026-09-14 (PR #47, merged 13:42Z). Verified against the live database through the service role: vgp_digest_deliveries EXISTS with 0 rows; all eight declared columns present (id, user_id, organization_id, recipient_email, period, item_count, provider_message_id, sent_at); an anon-key read returns 42501 permission denied. Mirror refreshed and confirms RLS enabled, one own-row SELECT policy, REVOKE ALL FROM authenticated followed by GRANT SELECT, writes to postgres/service_role only, and no anon reference anywhere. NOT YET DONE: no digest has been delivered, so the table is still empty and the original question - does the weekly digest actually send - remains unanswered. D3 is only fully met once a real delivery writes a row carrying a Resend id that resolves in the provider dashboard.

A defect this ledger caught rather than shipped: the first D1 run failed
"migration is re-runnable". CREATE POLICY has no IF NOT EXISTS in Postgres, so
a second apply aborted the transaction while CREATE TABLE IF NOT EXISTS and
CREATE INDEX IF NOT EXISTS beside it skipped harmlessly. Fixed with DROP POLICY
IF EXISTS, matching this migration's own DOWN block and 20260914140000's
DROP CONSTRAINT IF EXISTS. This is the second migration in this series to ship
a non-idempotent DDL statement that only a real re-run could expose.
