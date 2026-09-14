# Gates: seed the VGP regulatory profile catalogue

OWNS: supabase/migrations/20260914140000_seed_vgp_regulatory_profiles.sql, scripts/verify/verify-s1-seed.mjs, GATES-REGULATORY-SEED.md

Scope: Insert the 24 regulatory profiles with their statutory intervals,
citations and classification statuses, without touching any of the 625
existing vgp_schedules rows.

- [x] S1: EXECUTED AGAINST REAL POSTGRES - the seed inserts exactly 24 profiles
      with the agreed interval and classification distribution, every row cites
      a source, only manual_only omits an interval, and NO pre-existing
      schedule is associated or backfilled. Negative control included: the
      association query is shown to report a non-zero count when an
      association is deliberately made, so the "none associated" assertions
      are not vacuous.
  CHECK: node scripts/verify/verify-s1-seed.mjs
  EXPECT: S1_SEED_VERIFIED
  EVIDENCE: exit=0. 23 assertions. intervals 3:2 6:14 12:7 NULL:1; statuses automatic:18 requires_confirmation:5 manual_only:1; pre-existing intervals unchanged (6,6,12,12,12,24); 0 schedules associated; 0 snapshots backfilled; control reported 1 when an association was made; re-run corrects a drifted interval 99 -> 6 without duplicating rows.

- [x] S2: The migration contains no UPDATE against vgp_schedules, verified by
      static parse independently of the database - a second oracle, so a fault
      in the Postgres fixture cannot hide the invariant being broken.
  EVIDENCE: Static parse of the migration text: 24 rows, 24 unique codes, by-interval {3:2, 6:14, 12:7, NULL:1}, by-status {automatic:18, requires_confirmation:5, manual_only:1}, only manual_only is NULL, all manual_only are NULL, and /UPDATE\s+public\.vgp_schedules/i does not match anywhere in the up-migration. Agrees with S1 on every count.

- [ ] S3: Manual - seed applied to production through the service role, and the
      live catalogue confirmed at 24 rows with the 625 existing schedules still
      carrying regulatory_profile_id IS NULL.
  EVIDENCE: pending

A defect this ledger caught rather than shipped: the first S1 run failed
"seed is re-runnable" and "re-running corrects a drifted interval". The cause
was real and in the migration, not the test -- ADD CONSTRAINT has no IF NOT
EXISTS in Postgres, so a re-run aborted the transaction before ON CONFLICT DO
UPDATE could correct anything. Fixed with DROP CONSTRAINT IF EXISTS, matching
20260904100000's DROP FUNCTION IF EXISTS precedent.
