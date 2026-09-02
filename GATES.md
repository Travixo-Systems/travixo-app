# Gates: VGP alert bleeding — 3 fixes

OWNS: app/api/cron/vgp-alerts/**, app/api/internal/post-registration/**, app/(dashboard)/dashboard/page.tsx, lib/email/**, supabase/migrations/**, scripts/verify/**

Scope: Stop recurring demo-asset VGP alerts, guarantee structural send dedup, and make the welcome email fire exactly once — delivered as three atomic commits.

- [x] G1: Cron never emails a demo asset — query filter AND post-fetch safety net both present, safety net counts and logs skips
  CHECK: node scripts/verify/verify-fix1-cron.mjs
  EXPECT: FIX1_CRON_VERIFIED
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=D:\Dev\projects\travixo-app; path=2d7d3e4e645d/41 entries; output=ok: is_demo_data is inside the select() column list | FIX1_CRON_VERIFIED

- [x] G2: Demo-schedule exclusion is behaviourally correct — safety net drops is_demo_data true, KEEPS null/undefined (legacy real assets), keeps false
  CHECK: node scripts/verify/verify-fix1-behaviour.mjs
  EXPECT: FIX1_BEHAVIOUR_VERIFIED
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=D:\Dev\projects\travixo-app; path=2d7d3e4e645d/41 entries; output=ok: mixed batch keeps a,c,d and drops b (got ["a","c","d"]) | FIX1_BEHAVIOUR_VERIFIED

- [x] G3: .test recipients suppressed in getAlertRecipients, with filtered count logged
  CHECK: node scripts/verify/verify-fix1-testfilter.mjs
  EXPECT: FIX1_TESTFILTER_VERIFIED
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=D:\Dev\projects\travixo-app; path=2d7d3e4e645d/41 entries; output=ok: null address suppressed (null) | FIX1_TESTFILTER_VERIFIED

- [x] G4: Showcase email sends once — exact subject/body/footer strings, atomic demo_alert_sent guard, migration adds the column
  CHECK: node scripts/verify/verify-fix1-showcase.mjs
  EXPECT: FIX1_SHOWCASE_VERIFIED
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=D:\Dev\projects\travixo-app; path=2d7d3e4e645d/41 entries; output=ok: migration has a timestamp prefix (20260902130000_demo_alert_sent_flag.sql) | FIX1_SHOWCASE_VERIFIED

- [x] G5: Unique dedup index migration exists with duplicate cleanup ordered before index creation
  CHECK: node scripts/verify/verify-fix2-migration.mjs
  EXPECT: FIX2_MIGRATION_VERIFIED
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=D:\Dev\projects\travixo-app; path=2d7d3e4e645d/41 entries; output=ok: cleanup is scoped to sent = true rows only | FIX2_MIGRATION_VERIFIED

- [x] G6: Insert precedes send in cron — ON CONFLICT DO NOTHING RETURNING id, zero rows short-circuits the send
  CHECK: node scripts/verify/verify-fix2-order.mjs
  EXPECT: FIX2_ORDER_VERIFIED
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=D:\Dev\projects\travixo-app; path=2d7d3e4e645d/41 entries; output=ok: no post-send "failed to log" duplicate path remains | FIX2_ORDER_VERIFIED

- [x] G7: Welcome email guarded by atomic conditional UPDATE ... RETURNING, migration adds welcome_email_sent
  CHECK: node scripts/verify/verify-fix3-guard.mjs
  EXPECT: FIX3_GUARD_VERIFIED
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=D:\Dev\projects\travixo-app; path=2d7d3e4e645d/41 entries; output=ok: existing orgs are backfilled as already-sent (no mass re-send) | FIX3_GUARD_VERIFIED

- [x] G8: Dashboard no longer triggers post-registration; confirm page remains sole caller; Sentry warning replaces it
  CHECK: node scripts/verify/verify-fix3-caller.mjs
  EXPECT: FIX3_CALLER_VERIFIED
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=D:\Dev\projects\travixo-app; path=2d7d3e4e645d/41 entries; output=ok: confirm page remains the sole caller | FIX3_CALLER_VERIFIED

- [x] G9: Repository typechecks clean (tsc --noEmit, exit 0) after all three fixes
  CHECK: node scripts/verify/verify-typecheck.mjs
  EXPECT: TYPECHECK_CLEAN
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=D:\Dev\projects\travixo-app; path=2d7d3e4e645d/41 entries; output=(node:46392) [DEP0190] DeprecationWarning: Passing args to a child process with shell option true can lead to security vulnerabilities, as the arguments are not escaped, only concatenated. | (Use `node --trace-deprecation ...` to show where

- [x] G10: ESLint reports no new errors in every touched file
  CHECK: node scripts/verify/verify-lint.mjs
  EXPECT: LINT_CLEAN
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=D:\Dev\projects\travixo-app; path=2d7d3e4e645d/41 entries; output=(node:59412) [DEP0190] DeprecationWarning: Passing args to a child process with shell option true can lead to security vulnerabilities, as the arguments are not escaped, only concatenated. | (Use `node --trace-deprecation ...` to show where

- [x] G11: Out-of-scope invariants untouched — subject lines, FREQUENCY_RULES, notification prefs, and the seeded overdue Toyota are byte-identical to HEAD
  CHECK: node scripts/verify/verify-scope.mjs
  EXPECT: SCOPE_RESPECTED
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=D:\Dev\projects\travixo-app; path=2d7d3e4e645d/41 entries; output=ok: no new dev dependencies | SCOPE_RESPECTED

- [x] G12: Exactly three commits, correct messages, each self-contained
  CHECK: node scripts/verify/verify-commits.mjs
  EXPECT: COMMITS_VERIFIED
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=D:\Dev\projects\travixo-app; path=2d7d3e4e645d/41 entries; output=ok: working tree clean (uncommitted: "") | COMMITS_VERIFIED
