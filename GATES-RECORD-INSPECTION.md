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
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=D:\Dev\projects\travixo-app; path=466f2ec7daee/43 entries; output=(node:5176) [DEP0190] DeprecationWarning: Passing args to a child process with shell option true can lead to security vulnerabilities, as the arguments are not escaped, only concatenated. | (Use `node --trace-deprecation ...` to show where 

- [x] I5b: The rewritten route introduces no NEW lint problems, measured against
      the baseline commit rather than demanding a clean file it never was
  CHECK: node scripts/verify/verify-i5-lint.mjs
  EXPECT: I5_LINT_NO_REGRESSION
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=D:\Dev\projects\travixo-app; path=466f2ec7daee/43 entries; output=(node:56836) [DEP0190] DeprecationWarning: Passing args to a child process with shell option true can lead to security vulnerabilities, as the arguments are not escaped, only concatenated. | (Use `node --trace-deprecation ...` to show where

- [x] I6: No new npm dependencies - @sentry/node was already present
  CHECK: node scripts/verify/verify-i6-deps.mjs
  EXPECT: I6_DEPS_UNCHANGED
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=D:\Dev\projects\travixo-app; path=466f2ec7daee/43 entries; output=ok: @sentry/node was already a dependency at baseline (the route rewrite imports it) | I6_DEPS_UNCHANGED

- [ ] I7: Manual - REVOKE EXECUTE ... FROM anon applied to production, and the
      refreshed mirror shows anon absent from the live grant. Verified against
      the mirror rather than the migration text, per working-agreements.md:52.
  EVIDENCE: pending

- [ ] I8: Manual - PR opened against main carrying the migration, the route
      rewrite and the refreshed mirror, and handed to the user to merge. Not
      self-merged.
  EVIDENCE: pending
