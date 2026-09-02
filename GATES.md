# Gates: per-user notification preferences layer

OWNS: app/api/cron/vgp-alerts/**, app/api/cron/vgp-weekly-digest/**, app/api/settings/notifications/**, app/(dashboard)/settings/notifications/**, lib/email/**, lib/vgp/**, lib/i18n.ts, supabase/migrations/**, scripts/verify/**, vercel.json

Scope: Per-user VGP alert frequency and thresholds overriding org defaults, with immediate / daily-digest / weekly-digest / off delivery modes, accurate subject lines, a recipients-type normalisation fix, a preferences link in every alert footer, and a settings UI.

- [x] N1: user_notification_preferences migration — table, CHECK, UNIQUE, FK cascade, RLS (own-row SELECT/UPDATE, INSERT gated on org membership)
  CHECK: node scripts/verify/verify-n1-schema.mjs
  EXPECT: N1_SCHEMA_VERIFIED
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=D:\Dev\projects\travixo-app; path=2d7d3e4e645d/41 entries; output=ok: authenticated is granted | N1_SCHEMA_VERIFIED

- [x] N2: Preference resolution — user row wins, absent row falls back to org defaults, invalid values fall back rather than throw
  CHECK: node scripts/verify/verify-n2-resolution.mjs
  EXPECT: N2_RESOLUTION_VERIFIED
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=D:\Dev\projects\travixo-app; path=2d7d3e4e645d/41 entries; output=ok: unusable org timing falls back to the full default set | N2_RESOLUTION_VERIFIED

- [x] N3: Threshold filtering — a band whose preferenceDay is absent from the user array is skipped; overdue (0) is honoured as a real threshold
  CHECK: node scripts/verify/verify-n3-thresholds.mjs
  EXPECT: N3_THRESHOLDS_VERIFIED
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=D:\Dev\projects\travixo-app; path=2d7d3e4e645d/41 entries; output=ok: a band with zero items does not generate an email | N3_THRESHOLDS_VERIFIED

- [x] N4: Delivery routing end to end — daily_digest recipient gets ONE merged email not per-threshold, off gets zero, no-row gets org defaults, immediate keeps per-band sends
  CHECK: node scripts/verify/verify-n4-routing.mjs
  EXPECT: N4_ROUTING_VERIFIED
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=D:\Dev\projects\travixo-app; path=2d7d3e4e645d/41 entries; output=ok: a mixed org sends 6 emails across 5 recipients, not 20 (got 6) | N4_ROUTING_VERIFIED

- [x] N5: Subject-line accuracy — reminder_1day says aujourd'hui/demain/dans n jours by actual days; reminder_7day uses the real count; other subjects unchanged
  CHECK: node scripts/verify/verify-n5-subjects.mjs
  EXPECT: N5_SUBJECTS_VERIFIED
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=D:\Dev\projects\travixo-app; path=2d7d3e4e645d/41 entries; output=ok: weekly digest subject builder exists | N5_SUBJECTS_VERIFIED

- [x] N6: Recipients normalisation — array or string both resolve to a scalar role; migration rewrites array rows in place
  CHECK: node scripts/verify/verify-n6-recipients.mjs
  EXPECT: N6_RECIPIENTS_VERIFIED
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=D:\Dev\projects\travixo-app; path=2d7d3e4e645d/41 entries; output=ok: unknown values are normalised to a valid role | N6_RECIPIENTS_VERIFIED

- [x] N7: Preferences link present in the rendered HTML of every alert email family, pointing at /settings/notifications
  CHECK: node scripts/verify/verify-n7-footer.mjs
  EXPECT: N7_FOOTER_VERIFIED
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=D:\Dev\projects\travixo-app; path=2d7d3e4e645d/41 entries; output=ok: negative control: an absent phrase is correctly reported as absent | N7_FOOTER_VERIFIED

- [x] N8: Weekly digest — pending table, Monday self-gating, one email per user, pending rows cleared only after a successful send
  CHECK: node scripts/verify/verify-n8-weekly.mjs
  EXPECT: N8_WEEKLY_VERIFIED
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=D:\Dev\projects\travixo-app; path=2d7d3e4e645d/41 entries; output=ok: daily cron queues weekly rows with ignoreDuplicates (once per week, not once per day) | N8_WEEKLY_VERIFIED

- [x] N9: PATCH /api/settings/notifications/preferences — authenticated, validates frequency and thresholds, upserts the caller's own row only
  CHECK: node scripts/verify/verify-n9-api.mjs
  EXPECT: N9_API_VERIFIED
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=D:\Dev\projects\travixo-app; path=2d7d3e4e645d/41 entries; output=ok: org-level route keeps its write gate | N9_API_VERIFIED

- [x] N10: Settings UI — VGP alerts section, 4 frequency radios, 5 threshold checkboxes, saves via the new endpoint, all labels resolve in fr AND en
  CHECK: node scripts/verify/verify-n10-ui.mjs
  EXPECT: N10_UI_VERIFIED
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=D:\Dev\projects\travixo-app; path=2d7d3e4e645d/41 entries; output=N10_UI_VERIFIED | Translation key not found: notifications.thisKeyDoesNotExist

- [x] N11: Session 1 work untouched — demo exclusion, dedup claim-then-send, welcome guard and FREQUENCY_RULES all still verified
  CHECK: node scripts/verify/verify-n11-session1.mjs
  EXPECT: N11_SESSION1_INTACT
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=D:\Dev\projects\travixo-app; path=2d7d3e4e645d/41 entries; output=ok: atomic conditional UPDATE retained | N11_SESSION1_INTACT

- [x] N12: Repository typechecks clean (tsc --noEmit, exit 0)
  CHECK: node scripts/verify/verify-typecheck.mjs
  EXPECT: TYPECHECK_CLEAN
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=D:\Dev\projects\travixo-app; path=2d7d3e4e645d/41 entries; output=(node:57392) [DEP0190] DeprecationWarning: Passing args to a child process with shell option true can lead to security vulnerabilities, as the arguments are not escaped, only concatenated. | (Use `node --trace-deprecation ...` to show where

- [x] N13: No new eslint errors in any touched file, measured against the pinned baseline
  CHECK: node scripts/verify/verify-lint.mjs
  EXPECT: LINT_CLEAN
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=D:\Dev\projects\travixo-app; path=2d7d3e4e645d/41 entries; output=(node:12952) [DEP0190] DeprecationWarning: Passing args to a child process with shell option true can lead to security vulnerabilities, as the arguments are not escaped, only concatenated. | (Use `node --trace-deprecation ...` to show where

- [x] N14: No new npm dependencies
  CHECK: node scripts/verify/verify-n14-deps.mjs
  EXPECT: DEPS_UNCHANGED
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=D:\Dev\projects\travixo-app; path=2d7d3e4e645d/41 entries; output=ok: no new dev dependencies | DEPS_UNCHANGED

- [x] N15: Working tree clean, every commit atomic and conventionally named
  CHECK: node scripts/verify/verify-n15-commits.mjs
  EXPECT: COMMITS_VERIFIED
  EVIDENCE: exit=0; shell=C:\WINDOWS\system32\cmd.exe; cwd=D:\Dev\projects\travixo-app; path=2d7d3e4e645d/41 entries; output=ok: working tree clean (uncommitted: "") | COMMITS_VERIFIED
