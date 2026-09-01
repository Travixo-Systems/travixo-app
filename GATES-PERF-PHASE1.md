# GATES - Perf audit Phase 1

Ledger for Phase 1 of `docs/perf-audit-2026-08.md`.
Branch: `feat/multi-account-sessions-and-admin-pilot-controls`.

Oracles live in `load/gates/check.mjs` rather than inline, because inline
one-liners lost their regex escaping when run through cmd.exe and failed for
quoting reasons instead of real ones. Each prints a single success-only token.

G10 and G11 cover PROPOSED SQL: the migrations are written and shown, not
applied. Applying them is gated on approval.

- [x] G1: Dashboard queries run in parallel (item 1, finding 02.3)
  CHECK: node load/gates/check.mjs G1
  EXPECT: G1_PASS
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=D:\Dev\projects\travixo-app; path=2d7d3e4e645d/41 entries; output=G1_PASS serial_awaits=2

- [x] G2: Proxy skips auth for public routes (item 2, finding 06.1)
  CHECK: node load/gates/check.mjs G2
  EXPECT: G2_PASS
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=D:\Dev\projects\travixo-app; path=2d7d3e4e645d/41 entries; output=G2_PASS guard_before_getUser

- [x] G3: Scan page N+1 collapsed (item 3, findings 02.1/02.2)
  CHECK: node load/gates/check.mjs G3
  EXPECT: G3_PASS
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=D:\Dev\projects\travixo-app; path=2d7d3e4e645d/41 entries; output=G3_PASS no_query_in_loop

- [x] G4: Reference data cacheable, gated data private only (item 4)
  CHECK: node load/gates/check.mjs G4
  EXPECT: G4_PASS
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=D:\Dev\projects\travixo-app; path=2d7d3e4e645d/41 entries; output=G4_PASS public_plans+private_gated

- [x] G5: Theme save is optimistic with rollback, no reload (item 5, finding 05.5)
  CHECK: node load/gates/check.mjs G5
  EXPECT: G5_PASS
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=D:\Dev\projects\travixo-app; path=2d7d3e4e645d/41 entries; output=G5_PASS no_reload+rollback

- [x] G6: Stripe idempotency guard claimed before mutations (item 6, finding 03.1)
  CHECK: node load/gates/check.mjs G6
  EXPECT: G6_PASS
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=D:\Dev\projects\travixo-app; path=2d7d3e4e645d/41 entries; output=G6_PASS guard_first

- [x] G7: Every Resend call bounded; cron declares maxDuration (item 7, findings 04.1/04.2)
  CHECK: node load/gates/check.mjs G7
  EXPECT: G7_PASS
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=D:\Dev\projects\travixo-app; path=2d7d3e4e645d/41 entries; output=G7_PASS all_3_wrapped

- [x] G8: Client recall notice hoisted out of staff-email branch (item 8, finding 04.6)
  CHECK: node load/gates/check.mjs G8
  EXPECT: G8_PASS
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=D:\Dev\projects\travixo-app; path=2d7d3e4e645d/41 entries; output=G8_PASS hoisted

- [x] G9: preview-import authenticated and size-capped (item 9)
  CHECK: node load/gates/check.mjs G9
  EXPECT: G9_PASS
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=D:\Dev\projects\travixo-app; path=2d7d3e4e645d/41 entries; output=G9_PASS auth+cap

- [x] G10: Pilot cap migration wired to plan limits, exempts nobody (item 10)
  CHECK: node load/gates/check.mjs G10
  EXPECT: G10_PASS
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=D:\Dev\projects\travixo-app; path=2d7d3e4e645d/41 entries; output=G10_PASS 20260831_enforce_pilot_asset_limit.sql

- [x] G11: Load-test tenant hardening artifacts exist (item 11)
  CHECK: node load/gates/check.mjs G11
  EXPECT: G11_PASS
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=D:\Dev\projects\travixo-app; path=2d7d3e4e645d/41 entries; output=G11_PASS

- [x] G12: Demo debug logging removed (item 12)
  CHECK: node load/gates/check.mjs G12
  EXPECT: G12_PASS
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=D:\Dev\projects\travixo-app; path=2d7d3e4e645d/41 entries; output=G12_PASS clean

- [x] G13: papaparse removed (finding 08.9)
  CHECK: node load/gates/check.mjs G13
  EXPECT: G13_PASS
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=D:\Dev\projects\travixo-app; path=2d7d3e4e645d/41 entries; output=G13_PASS removed

- [x] G14: Root redirect moved to config (finding 06.6)
  CHECK: node load/gates/check.mjs G14
  EXPECT: G14_PASS
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=D:\Dev\projects\travixo-app; path=2d7d3e4e645d/41 entries; output=G14_PASS config_redirect

- [x] G15: Cron dedupe rows written as bulk inserts (findings 04.5/03.5/03.6)
  CHECK: node load/gates/check.mjs G15
  EXPECT: G15_PASS
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=D:\Dev\projects\travixo-app; path=2d7d3e4e645d/41 entries; output=G15_PASS both_passes_bulk

- [x] G16: No per-row insert loops in cron (findings 03.5/03.6)
  CHECK: node load/gates/check.mjs G16
  EXPECT: G16_PASS
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=D:\Dev\projects\travixo-app; path=2d7d3e4e645d/41 entries; output=G16_PASS no_row_loops

- [x] G17: Swallowed errors reach Sentry in all three paths (finding 04.10)
  CHECK: node load/gates/check.mjs G17
  EXPECT: G17_PASS
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=D:\Dev\projects\travixo-app; path=2d7d3e4e645d/41 entries; output=G17_PASS all_three

- [x] G18: Webhook env-diagnostic endpoint gated (addendum)
  CHECK: node load/gates/check.mjs G18
  EXPECT: G18_PASS
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=D:\Dev\projects\travixo-app; path=2d7d3e4e645d/41 entries; output=G18_PASS gated

- [x] G19: Whole app typechecks
  CHECK: node load/gates/check.mjs G19
  EXPECT: G19_TSC_CLEAN
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=D:\Dev\projects\travixo-app; path=2d7d3e4e645d/41 entries; output=G19_TSC_CLEAN

- [x] G20: Production build succeeds
  CHECK: npm run build
  EXPECT: Compiled successfully
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=D:\Dev\projects\travixo-app; path=2d7d3e4e645d/41 entries; output=○  (Static)   prerendered as static content | ƒ  (Dynamic)  server-rendered on demand

- [x] G21: Only permitted files modified
  CHECK: node load/gates/check.mjs G21
  EXPECT: G21_PASS
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=D:\Dev\projects\travixo-app; path=2d7d3e4e645d/41 entries; output=G21_PASS files=4
- [x] G22: Proxy change verified in a real browser (manual)
  EVIDENCE: Playwright against `npm run start` (production build), 2026-09-01.
    Anonymous GET /scan/qr-24035006 -> 200, no redirect, page rendered the real
    asset: "Engin Kubota KX080-4 #003", serial ENG-2022-0003, status Disponible,
    location Depot Rungis, plus the "Connexion requise pour modifier" prompt.
    Logged-out GET /dashboard -> redirected to
    /login?redirectTo=%2Fdashboard with the sign-in form rendered.
    Three console errors on the scan page are pre-existing and correct for an
    anonymous visitor: /api/subscriptions 401 (no session), a geolocation
    permissions-policy warning from the security headers, and a vgp_schedules
    401 from RLS refusing an anonymous read. None are caused by this change.
