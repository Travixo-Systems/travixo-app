# Gates: admin end-pilot + conditional extend + org health signals

OWNS: supabase/migrations/20260827_admin_end_pilot.sql, lib/admin/featureFlags.ts, lib/admin/orgHealth.ts, app/(admin)/admin/**, scripts/verify-admin-end-pilot.mjs, scripts/verify-admin-extend-conditional.mjs, scripts/verify-admin-org-health.mjs

Scope: Give platform admins a guarded `end_pilot` action (read-only or locked),
make the Extend control conditional on it being able to achieve anything, fix the
`extend_trial` trial/pilot date desync, and surface last-connected plus pilot
health signals on the admin screens.

- [x] G1: end_pilot SQL exists with every guard (super-admin, mode allowlist, converted refusal, non-pilot refusal, both dates set together, same-transaction audit, grants)
  CHECK: node --import ./scripts/ts-alias-loader.mjs scripts/verify-admin-end-pilot.mjs
  EXPECT: admin end-pilot verification passed
  EVIDENCE: exit 0, 45/45 checks, "admin end-pilot verification passed". Shell: Git Bash; CWD: d:/Dev/projects/travixo-app. This gate CAUGHT A REAL BUG: the first run failed 8 of 44 because the SQL wrote pilot_end_date = now(), but isPilotActive() tests now <= pilot_end_date INCLUSIVELY, so the org stayed at full access. Fixed to now() - INTERVAL 1 second. Positive control confirmed the buggy simulation yields full and the fixed one yields read_only.

- [x] G2: extend_trial no longer desyncs trial_ends_at from pilot_end_date on the pilot branch
  CHECK: node --import ./scripts/ts-alias-loader.mjs scripts/verify-admin-extend-conditional.mjs
  EXPECT: admin extend conditional verification passed
  EVIDENCE: exit 0, 32/32 checks, "admin extend conditional verification passed". Includes a negative control asserting the old desyncing line (v_new_trial := v_old_trial) is absent from the pilot branch.

- [x] G3: canExtendPilot() gates the Extend control — false for a locked pilot and for a converted org, true for a live pilot — and the UI consumes it
  CHECK: node --import ./scripts/ts-alias-loader.mjs scripts/verify-admin-extend-conditional.mjs
  EXPECT: admin extend conditional verification passed
  EVIDENCE: exit 0, same run as G2. canExtendPilot verified against accessLevel() across all 120 pilot days with 0 disagreements, plus 9 named cases and UI/page wiring checks.

- [x] G4: end_pilot outcomes agree with accessLevel() — read_only mode yields 'read_only', locked mode yields 'locked' — using the real access model, and neither mode alters normal day counting for untouched orgs
  CHECK: node --import ./scripts/ts-alias-loader.mjs scripts/verify-admin-end-pilot.mjs
  EXPECT: admin end-pilot verification passed
  EVIDENCE: exit 0, same run as G1. Outcomes measured by running the REAL accessLevel() over the exact columns the SQL writes: read_only mode -> read_only (6 cases), locked mode -> locked. Also asserts an ended pilot is indistinguishable from a natural expiry, and an untouched org stays full.

- [x] G5: org health module computes last-connected and pilot signals from confirmed columns only, with no invented fields
  CHECK: node --import ./scripts/ts-alias-loader.mjs scripts/verify-admin-org-health.mjs
  EXPECT: admin org health verification passed
  EVIDENCE: exit 0, 55/55 checks, "admin org health verification passed". Every column the pages read was confirmed present in types/database.ts; asserts public.users still has NO last-login column, the premise for using the Auth admin API.

- [x] G6: admin pages render the new signals and the end-pilot control, and summarizeAudit handles the end_pilot action
  CHECK: node --import ./scripts/ts-alias-loader.mjs scripts/verify-admin-org-health.mjs
  EXPECT: admin org health verification passed
  EVIDENCE: exit 0, same run as G5. Confirms both admin pages render last-connected and access, the detail page renders conversion signals, and summarizeAudit handles the end_pilot action.

- [x] G7: repository typechecks clean
  CHECK: node -e "const r=require('child_process').spawnSync('npx tsc --noEmit',{shell:true,encoding:'utf8'}); const out=(r.stdout||'')+(r.stderr||''); if(r.status===0){console.log('TSC_CLEAN')}else{console.log(out.slice(0,2000));process.exit(1)}"
  EXPECT: TSC_CLEAN
  EVIDENCE: exit 0, printed TSC_CLEAN. Positive control: injecting a type error into lib/admin/orgHealth.ts made the gate fail with TS2322 at line 281; control removed and re-verified clean. The gate command needs shell:true because spawnSync on npx.cmd throws EINVAL on Windows.

- [x] G8: production build succeeds
  CHECK: node scripts/verify-build-clean.mjs
  EXPECT: build verification passed
  EVIDENCE: exit 0, printed "build verification passed" via scripts/verify-build-clean.mjs (production next build).

- [ ] G9: pre-existing access-model behaviour is unregressed
  CHECK: node scripts/verify-access-model.mjs
  EXPECT: access model verification passed
  EVIDENCE: FLAKY AT BASELINE, NOT A REGRESSION. Measured: 10 pass / 2 fail
    over 12 runs WITH these changes; 2 pass / 1 fail over 3 runs at clean
    HEAD with every file of this change stashed. The failing case is always
    the same one: "day 45, last grace day -> locked, expected read_only".
    Cause: the fixture builds pilot_start_date as exactly now-45d and
    daysSincePilotStart() uses Math.ceil, so the value lands exactly on the
    `> PILOT_LOCKOUT_DAYS` boundary; sub-millisecond drift between building
    the date and evaluating it flips the verdict. Neither
    lib/billing/access-model.ts nor scripts/verify-access-model.mjs is
    modified by this change (confirmed via git status).
  ABANDON: G9 Pre-existing boundary flake in a script outside this change's
    OWNS scope. Fixing it means editing scripts/verify-access-model.mjs
    (e.g. day(-45.5)) or access-model.ts's rounding, which would silently
    widen an admin-feature change into the billing lifecycle. Handoff: fix
    the fixture separately, then un-abandon this gate.

- [ ] G10: MANUAL — the new migration is deployed to the live Supabase project. This repo gitignores /supabase/migrations/ ("the live schema lives in the Supabase dashboard"), so a migration file on disk is NOT evidence that the function exists in the database.
  EVIDENCE: pending
