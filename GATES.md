# Gates: per-user notification preferences layer

OWNS: app/api/cron/vgp-alerts/**, app/api/cron/vgp-weekly-digest/**, app/api/settings/notifications/**, app/(dashboard)/settings/notifications/**, lib/email/**, lib/vgp/**, lib/i18n.ts, supabase/migrations/**, scripts/verify/**, vercel.json

Scope: Per-user VGP alert frequency and thresholds overriding org defaults, with immediate / daily-digest / weekly-digest / off delivery modes, accurate subject lines, a recipients-type normalisation fix, a preferences link in every alert footer, and a settings UI.

- [ ] N1: user_notification_preferences migration — table, CHECK, UNIQUE, FK cascade, RLS (own-row SELECT/UPDATE, INSERT gated on org membership)
  CHECK: node scripts/verify/verify-n1-schema.mjs
  EXPECT: N1_SCHEMA_VERIFIED
  EVIDENCE: pending

- [ ] N2: Preference resolution — user row wins, absent row falls back to org defaults, invalid values fall back rather than throw
  CHECK: node scripts/verify/verify-n2-resolution.mjs
  EXPECT: N2_RESOLUTION_VERIFIED
  EVIDENCE: pending

- [ ] N3: Threshold filtering — a band whose preferenceDay is absent from the user array is skipped; overdue (0) is honoured as a real threshold
  CHECK: node scripts/verify/verify-n3-thresholds.mjs
  EXPECT: N3_THRESHOLDS_VERIFIED
  EVIDENCE: pending

- [ ] N4: Delivery routing end to end — daily_digest recipient gets ONE merged email not per-threshold, off gets zero, no-row gets org defaults, immediate keeps per-band sends
  CHECK: node scripts/verify/verify-n4-routing.mjs
  EXPECT: N4_ROUTING_VERIFIED
  EVIDENCE: pending

- [ ] N5: Subject-line accuracy — reminder_1day says aujourd'hui/demain/dans n jours by actual days; reminder_7day uses the real count; other subjects unchanged
  CHECK: node scripts/verify/verify-n5-subjects.mjs
  EXPECT: N5_SUBJECTS_VERIFIED
  EVIDENCE: pending

- [ ] N6: Recipients normalisation — array or string both resolve to a scalar role; migration rewrites array rows in place
  CHECK: node scripts/verify/verify-n6-recipients.mjs
  EXPECT: N6_RECIPIENTS_VERIFIED
  EVIDENCE: pending

- [ ] N7: Preferences link present in the rendered HTML of every alert email family, pointing at /settings/notifications
  CHECK: node scripts/verify/verify-n7-footer.mjs
  EXPECT: N7_FOOTER_VERIFIED
  EVIDENCE: pending

- [ ] N8: Weekly digest — pending table, Monday self-gating, one email per user, pending rows cleared only after a successful send
  CHECK: node scripts/verify/verify-n8-weekly.mjs
  EXPECT: N8_WEEKLY_VERIFIED
  EVIDENCE: pending

- [ ] N9: PATCH /api/settings/notifications/preferences — authenticated, validates frequency and thresholds, upserts the caller's own row only
  CHECK: node scripts/verify/verify-n9-api.mjs
  EXPECT: N9_API_VERIFIED
  EVIDENCE: pending

- [ ] N10: Settings UI — VGP alerts section, 4 frequency radios, 5 threshold checkboxes, saves via the new endpoint, all labels resolve in fr AND en
  CHECK: node scripts/verify/verify-n10-ui.mjs
  EXPECT: N10_UI_VERIFIED
  EVIDENCE: pending

- [ ] N11: Session 1 work untouched — demo exclusion, dedup claim-then-send, welcome guard and FREQUENCY_RULES all still verified
  CHECK: node scripts/verify/verify-n11-session1.mjs
  EXPECT: N11_SESSION1_INTACT
  EVIDENCE: pending

- [ ] N12: Repository typechecks clean (tsc --noEmit, exit 0)
  CHECK: node scripts/verify/verify-typecheck.mjs
  EXPECT: TYPECHECK_CLEAN
  EVIDENCE: pending

- [ ] N13: No new eslint errors in any touched file, measured against the pinned baseline
  CHECK: node scripts/verify/verify-lint.mjs
  EXPECT: LINT_CLEAN
  EVIDENCE: pending

- [ ] N14: No new npm dependencies
  CHECK: node scripts/verify/verify-n14-deps.mjs
  EXPECT: DEPS_UNCHANGED
  EVIDENCE: pending

- [ ] N15: Working tree clean, every commit atomic and conventionally named
  CHECK: node scripts/verify/verify-n15-commits.mjs
  EXPECT: COMMITS_VERIFIED
  EVIDENCE: pending
