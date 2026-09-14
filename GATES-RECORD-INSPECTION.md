# Gates: land the atomic VGP inspection write on production

OWNS: app/api/vgp/inspections/**, supabase/migrations/**, supabase/schemas/**, scripts/verify/**, GATES-RECORD-INSPECTION.md

Scope: The `record_inspection()` function is live in production but nothing
calls it, and its `REVOKE EXECUTE ... FROM anon` never ran. Land the stranded
route rewrite so the deployed app writes atomically, commit the migration as
the record of what was applied by hand, and close the anon grant. Verified
against the refreshed mirror and a real Postgres, not against migration text.

- [x] I1: The deployed route on origin/main performs the non-atomic three-step
      write - the defect is real before the fix, not assumed
  CHECK: node scripts/verify/verify-i1-defect.mjs
  EXPECT: I1_DEFECT_CONFIRMED
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=D:\Dev\projects\travixo-app; path=466f2ec7daee/43 entries; output=ok: deployed POST does NOT call record_inspection (positive control: it does after this fix) | I1_DEFECT_CONFIRMED

- [x] I2: Migration declares the function with SECURITY DEFINER, pinned
      search_path, a 14-digit filename, and all three privilege statements
      including REVOKE EXECUTE FROM anon (working-agreements.md:44-53)
  CHECK: node scripts/verify/verify-i2-migration.mjs
  EXPECT: I2_MIGRATION_VERIFIED
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=D:\Dev\projects\travixo-app; path=466f2ec7daee/43 entries; output=ok: granted to authenticated (the route calls it as the signed-in user) | I2_MIGRATION_VERIFIED

- [x] I3: EXECUTED AGAINST REAL POSTGRES - the function is atomic: a forced
      failure on the third write leaves no inspection row behind. Negative
      control: the old three-step sequence leaves an orphan under the same
      forced failure.
  CHECK: node scripts/verify/verify-i3-atomic.mjs
  EXPECT: I3_ATOMIC_VERIFIED
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=D:\Dev\projects\travixo-app; path=466f2ec7daee/43 entries; output=ok: control: the OLD sequence DOES leave a failed inspection while the asset stays bookable - the defect is detectable | I3_ATOMIC_VERIFIED

- [x] I4: Route calls record_inspection via RPC, no direct write to
      vgp_inspections / vgp_schedules / assets remains in POST, all three
      "Don't fail entire request" swallows are gone, and gating still precedes
      the RPC
  CHECK: node scripts/verify/verify-i4-route.mjs
  EXPECT: I4_ROUTE_VERIFIED
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=D:\Dev\projects\travixo-app; path=466f2ec7daee/43 entries; output=ok: maps invalid_result | I4_ROUTE_VERIFIED

- [x] I5: Repository typechecks clean (tsc --noEmit, exit 0)
  CHECK: node scripts/verify/verify-typecheck.mjs
  EXPECT: TYPECHECK_CLEAN
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=D:\Dev\projects\travixo-app; path=466f2ec7daee/43 entries; output=(node:20100) [DEP0190] DeprecationWarning: Passing args to a child process with shell option true can lead to security vulnerabilities, as the arguments are not escaped, only concatenated. | (Use `node --trace-deprecation ...` to show where

- [x] I5b: The rewritten route introduces no NEW lint problems, measured against
      the baseline commit rather than demanding a clean file it never was
  CHECK: node scripts/verify/verify-i5-lint.mjs
  EXPECT: I5_LINT_NO_REGRESSION
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=D:\Dev\projects\travixo-app; path=466f2ec7daee/43 entries; output=(node:28728) [DEP0190] DeprecationWarning: Passing args to a child process with shell option true can lead to security vulnerabilities, as the arguments are not escaped, only concatenated. | (Use `node --trace-deprecation ...` to show where

- [x] I6: No new npm dependencies - @sentry/node was already present
  CHECK: node scripts/verify/verify-i6-deps.mjs
  EXPECT: I6_DEPS_UNCHANGED
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=D:\Dev\projects\travixo-app; path=466f2ec7daee/43 entries; output=ok: @sentry/node was already a dependency at baseline (the route rewrite imports it) | I6_DEPS_UNCHANGED

- [x] I7: Manual - REVOKE EXECUTE ... FROM anon applied to production, and the
      refreshed mirror shows anon absent from the live grant. Verified against
      the mirror rather than the migration text, per working-agreements.md:52.
  EVIDENCE: User ran the REVOKE in the Supabase SQL editor 2026-09-14. Mirror refreshed via `npx supabase db pull --declarative` (remoteHistoryUpdated:false); live grant reads TO "authenticated","postgres","service_role", no `anon`. CONFIRMED DIRECTLY AGAINST PRODUCTION, not only the mirror: an anon-key PostgREST call with the real signature returns 42501 permission denied. Both controls fired, so the oracle is calibrated: get_asset_by_qr(p_qr_code) -> REACHED BODY (anon can call it, matching its mirror grant TO "anon"), assets_page(...) -> 42501 (anon cannot, matching its mirror). record_inspection -> 42501. anon has NO EXECUTE. The earlier caveat is retracted: the mirror alone could not have shown this, but the behavioural probe can and did. First-round probes returning PGRST202 were signature misses, not verdicts - resolved by reading real parameter names from the mirror.

- [x] I8: Manual - PR opened against main carrying the migration, the route
      rewrite and the refreshed mirror, and handed to the user to merge. Not
      self-merged.
  EVIDENCE: PR #43 OPEN, fix/vgp-atomic-inspection -> main, mergeable=MERGEABLE, https://github.com/Travixo-Systems/travixo-app/pull/43. Carries all 3 commits (0231733, 4507113, c7fcc6b) and 13 files including supabase/migrations/20260903100000_record_inspection_rpc.sql, app/api/vgp/inspections/route.ts and both function mirrors. Local and remote tips match at c7fcc6b. Left OPEN for the user to merge; not self-merged.

I7-note: the mirror alone cannot distinguish an explicit anon grant from the
schema-wide default at supabase/schemas/public/default_privileges.sql ("GRANT
EXECUTE ON FUNCTIONS TO anon"), which applies to every new public function and is
not re-rendered per function. That is why I7 was verified behaviourally instead.

information_schema.routine_privileges is NOT reachable from this repo's tooling:
PostgREST exposes only the public schema's tables and functions, and no
arbitrary-SQL RPC (exec_sql / run_sql / execute_sql) exists in the mirror - a
deliberate and correct absence. The equivalent evidence is the calibrated anon
PostgREST probe recorded in I7, which distinguishes 42501 (no EXECUTE) from a
call that reaches the function body, with a positive and a negative control.

Standing lesson for docs/working-agreements.md:52 - "verify against the refreshed
mirror afterwards rather than trusting the migration text" is necessary but NOT
sufficient for EXECUTE grants, because the mirror renders no per-function line for
a privilege held via schema-wide default. Verifying a revoke needs a behavioural
probe as the anon role, with controls.
