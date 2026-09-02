# Gates: VGP alert bleeding — 3 fixes

OWNS: app/api/cron/vgp-alerts/**, app/api/internal/post-registration/**, app/(dashboard)/dashboard/page.tsx, lib/email/**, supabase/migrations/**, scripts/verify/**

Scope: Stop recurring demo-asset VGP alerts, guarantee structural send dedup, and make the welcome email fire exactly once — delivered as three atomic commits.

- [ ] G1: Cron never emails a demo asset — query filter AND post-fetch safety net both present, safety net counts and logs skips
  CHECK: node scripts/verify/verify-fix1-cron.mjs
  EXPECT: FIX1_CRON_VERIFIED
  EVIDENCE: pending

- [ ] G2: Demo-schedule exclusion is behaviourally correct — safety net drops is_demo_data true, KEEPS null/undefined (legacy real assets), keeps false
  CHECK: node scripts/verify/verify-fix1-behaviour.mjs
  EXPECT: FIX1_BEHAVIOUR_VERIFIED
  EVIDENCE: pending

- [ ] G3: .test recipients suppressed in getAlertRecipients, with filtered count logged
  CHECK: node scripts/verify/verify-fix1-testfilter.mjs
  EXPECT: FIX1_TESTFILTER_VERIFIED
  EVIDENCE: pending

- [ ] G4: Showcase email sends once — exact subject/body/footer strings, atomic demo_alert_sent guard, migration adds the column
  CHECK: node scripts/verify/verify-fix1-showcase.mjs
  EXPECT: FIX1_SHOWCASE_VERIFIED
  EVIDENCE: pending

- [ ] G5: Unique dedup index migration exists with duplicate cleanup ordered before index creation
  CHECK: node scripts/verify/verify-fix2-migration.mjs
  EXPECT: FIX2_MIGRATION_VERIFIED
  EVIDENCE: pending

- [ ] G6: Insert precedes send in cron — ON CONFLICT DO NOTHING RETURNING id, zero rows short-circuits the send
  CHECK: node scripts/verify/verify-fix2-order.mjs
  EXPECT: FIX2_ORDER_VERIFIED
  EVIDENCE: pending

- [ ] G7: Welcome email guarded by atomic conditional UPDATE ... RETURNING, migration adds welcome_email_sent
  CHECK: node scripts/verify/verify-fix3-guard.mjs
  EXPECT: FIX3_GUARD_VERIFIED
  EVIDENCE: pending

- [ ] G8: Dashboard no longer triggers post-registration; confirm page remains sole caller; Sentry warning replaces it
  CHECK: node scripts/verify/verify-fix3-caller.mjs
  EXPECT: FIX3_CALLER_VERIFIED
  EVIDENCE: pending

- [x] G9: Repository typechecks clean (tsc --noEmit, exit 0) after all three fixes
  CHECK: node scripts/verify/verify-typecheck.mjs
  EXPECT: TYPECHECK_CLEAN
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=D:\Dev\projects\travixo-app; path=2d7d3e4e645d/41 entries; output=(node:59192) [DEP0190] DeprecationWarning: Passing args to a child process with shell option true can lead to security vulnerabilities, as the arguments are not escaped, only concatenated. | (Use `node --trace-deprecation ...` to show where

- [x] G10: ESLint reports no new errors in every touched file
  CHECK: node scripts/verify/verify-lint.mjs
  EXPECT: LINT_CLEAN
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=D:\Dev\projects\travixo-app; path=2d7d3e4e645d/41 entries; output=(node:60848) [DEP0190] DeprecationWarning: Passing args to a child process with shell option true can lead to security vulnerabilities, as the arguments are not escaped, only concatenated. | (Use `node --trace-deprecation ...` to show where

- [x] G11: Out-of-scope invariants untouched — subject lines, FREQUENCY_RULES, notification prefs, and the seeded overdue Toyota are byte-identical to HEAD
  CHECK: node scripts/verify/verify-scope.mjs
  EXPECT: SCOPE_RESPECTED
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=D:\Dev\projects\travixo-app; path=2d7d3e4e645d/41 entries; output=ok: no new dev dependencies | SCOPE_RESPECTED

- [ ] G12: Exactly three commits, correct messages, each self-contained
  CHECK: node scripts/verify/verify-commits.mjs
  EXPECT: COMMITS_VERIFIED
  EVIDENCE: pending
