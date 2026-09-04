# Gates: restore the VGP alert cron (ON CONFLICT 42P10)

OWNS: app/api/cron/vgp-alerts/**, supabase/migrations/**, scripts/verify/**

Scope: Move the vgp_alerts dedup claim into a Postgres function so the partial
unique index can be named as the conflict arbiter, restoring the daily cron.
Verified by executing SQL against a real Postgres, not by simulating logic.

- [x] R1: The defect is reproduced against a REAL database before the fix — a
      supabase-js upsert naming the partial index raises 42P10, and the same
      INSERT with the predicate in the conflict target succeeds
  CHECK: node scripts/verify/verify-r1-repro.mjs
  EXPECT: R1_REPRO_CONFIRMED
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=D:\Dev\projects\travixo-app; path=2d7d3e4e645d/41 entries; output=ok: counterfactual: under a NON-partial index a released claim blocks re-claiming forever | R1_REPRO_CONFIRMED

- [x] R2: Migration creates claim_vgp_alert with the predicate in the conflict
      target, SECURITY DEFINER, pinned search_path, and EXECUTE revoked from
      anon AND authenticated (service-role only)
  CHECK: node scripts/verify/verify-r2-migration.mjs
  EXPECT: R2_MIGRATION_VERIFIED
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=D:\Dev\projects\travixo-app; path=2d7d3e4e645d/41 entries; output=ok: authenticated is never granted | R2_MIGRATION_VERIFIED

- [x] R3: EXECUTED AGAINST REAL POSTGRES — the function claims once, returns
      NULL on a second identical claim, and a released claim can be re-claimed.
      All writes rolled back.
  CHECK: node scripts/verify/verify-r3-live.mjs
  EXPECT: R3_LIVE_VERIFIED
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=D:\Dev\projects\travixo-app; path=2d7d3e4e645d/41 entries; output=ok: control: a predicate-less function still fails, so this gate can detect the defect | R3_LIVE_VERIFIED

- [x] R4: Route calls the RPC, no upsert against vgp_alerts remains, and the
      claim still precedes the send
  CHECK: node scripts/verify/verify-r4-route.mjs
  EXPECT: R4_ROUTE_VERIFIED
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=D:\Dev\projects\travixo-app; path=2d7d3e4e645d/41 entries; output=ok: no stale r.schedule_id read | R4_ROUTE_VERIFIED

- [x] R5: Claim-release-on-failure is preserved exactly — a failed send still
      deletes the claimed rows so the next run retries
  CHECK: node scripts/verify/verify-r5-release.mjs
  EXPECT: R5_RELEASE_VERIFIED
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=D:\Dev\projects\travixo-app; path=2d7d3e4e645d/41 entries; output=ok: a failed release is reported | R5_RELEASE_VERIFIED

- [x] R6: No other upsert in the codebase targets a PARTIAL index — the same
      defect class does not exist elsewhere
  CHECK: node scripts/verify/verify-r6-audit.mjs
  EXPECT: R6_AUDIT_VERIFIED
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=D:\Dev\projects\travixo-app; path=2d7d3e4e645d/41 entries; output=ok: control: the known partial index on vgp_alerts is detected by the parser | R6_AUDIT_VERIFIED

- [x] R7: Repository typechecks clean (tsc --noEmit, exit 0)
  CHECK: node scripts/verify/verify-typecheck.mjs
  EXPECT: TYPECHECK_CLEAN
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=D:\Dev\projects\travixo-app; path=2d7d3e4e645d/41 entries; output=(node:52356) [DEP0190] DeprecationWarning: Passing args to a child process with shell option true can lead to security vulnerabilities, as the arguments are not escaped, only concatenated. | (Use `node --trace-deprecation ...` to show where

- [x] R8: No new npm dependencies
  CHECK: node scripts/verify/verify-r8-deps.mjs
  EXPECT: DEPS_UNCHANGED
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=D:\Dev\projects\travixo-app; path=2d7d3e4e645d/41 entries; output=ok: no new dev dependencies | DEPS_UNCHANGED

- [ ] R9: Manual — migration applied to production and the cron confirmed
      producing vgp_alerts rows again for the current date.
  EVIDENCE: pending
