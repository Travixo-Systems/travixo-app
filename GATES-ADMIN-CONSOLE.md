# Gates: admin console rehaul

OWNS: app/(admin)/admin/**, lib/admin/**, lib/i18n.ts (adminConsole namespace),
supabase/migrations/20260915150000_super_admin_read_operational_tables.sql,
scripts/verify-admin-console.mjs, scripts/verify-admin-console-live.mjs,
GATES-ADMIN-CONSOLE.md

Scope: Full rebuild of /admin into seven areas - overview, organisations, org
detail, evidence, regulatory catalogue, deliveries, audit journal. Every number
comes from a live query. A metric with no source today is OMITTED, not rendered
as zero or a dash. Bilingual through lib/i18n.ts. requireSuperAdmin on every
page, requireSuperAdminApi on every route.

The property worth protecting across all seven areas is the one the evidence
page already names: a surface reporting ZERO must be distinguishable from a
surface that CANNOT SEE. A0 is that distinction made structural.

---

- [x] A0: Platform admins can actually read the data the console renders.
      Nine operational tables had only organization_id-scoped SELECT policies,
      so an org-less admin read zero rows with no error. Measured under a real
      minted session, not service-role, because a service-role probe proves
      nothing about what the page sees.
  CHECK: node scripts/verify-admin-console-live.mjs
  EXPECT: A0_ADMIN_SEES_ALL_TABLES
  EVIDENCE: 14/14 tables MATCH under a minted session for travixosystems@gmail.com
    (organization_id NULL, is_super_admin() true). Nine fixed by this branch:
    vgp_inspections 0->733, vgp_schedules 0->625, rentals 0->146,
    vgp_alerts 0->20697, vgp_digest_deliveries 0->2, clients 0->56,
    subscriptions 0->19, billing_events 0->4, scans 0->344. Five already
    working: assets 2732, organizations 19, users 32, admin_audit_log 2,
    vgp_regulatory_profiles 24. Detectors agree across both clients:
    D1 28 (A 13 / B 15) over 583, D2 561 (A 561 / B 0) of 733, D3 0 over 114
    active with 6 unscheduled.

- [ ] A1: Vue d'ensemble renders only sourced numbers. Every headline count and
      panel figure traces to a live query. MRR, ARR and trial-to-paid
      conversion are ABSENT - no heading, no zero, no dash - because no live
      source exists for them.
  CHECK: node scripts/verify-admin-console.mjs
  EXPECT: A1_OVERVIEW_SOURCED

- [ ] A2: Organisations table filters on columns that exist, and every filter
      narrows a live query rather than a client-side array of a partial page.
  CHECK: node scripts/verify-admin-console.mjs
  EXPECT: A2_ORGS_FILTERED

- [ ] A3: Org detail computes billing from licensed_capacity against
      lib/billing/capacity-price.ts, the single source of the formula, and
      never from subscription_tier (documented unreliable in access-model.ts).
  CHECK: node scripts/verify-admin-console.mjs
  EXPECT: A3_ORG_DETAIL_SOURCED

- [ ] A4: Preuves keeps the exception-first contract: offending rows above
      aggregates, a clean detector renders an explicit green line naming what
      was checked, and a detector that could not run renders as a failure.
  CHECK: node scripts/verify-admin-console.mjs
  EXPECT: A4_EVIDENCE_EXCEPTION_FIRST

- [ ] A5: Catalogue reglementaire is read-only and shows classification_status
      honestly (automatic / requires_confirmation / manual_only), never
      flattening "to confirm" into "sourced".
  CHECK: node scripts/verify-admin-console.mjs
  EXPECT: A5_CATALOGUE_READONLY

- [ ] A6: Livraisons distinguishes sent, queued and failed from live columns,
      and surfaces provider_message_id where present rather than implying
      delivery from the absence of an error.
  CHECK: node scripts/verify-admin-console.mjs
  EXPECT: A6_DELIVERIES_SOURCED

- [ ] A7: Journal d'audit has a summarizeAudit branch for admin_mark_paid, the
      only action that has ever run in production. Both live rows currently
      render "-".
  CHECK: node scripts/verify-admin-console.mjs
  EXPECT: A7_AUDIT_SUMMARISED

- [ ] A8: Every visible string resolves through lib/i18n.ts in en AND fr. No
      hardcoded English literal in any admin page or island, no key missing an
      fr value.
  CHECK: node scripts/verify-admin-console.mjs
  EXPECT: A8_I18N_COMPLETE

- [ ] A9: requireSuperAdmin on every admin page, requireSuperAdminApi on every
      admin route. No tenant-role check anywhere in the admin surface.
  CHECK: node scripts/verify-admin-console.mjs
  EXPECT: A9_GATED

- [ ] A10: Repository typechecks clean and the static verify chain still
      passes.
  CHECK: npx tsc --noEmit && npm run verify:static
  EXPECT: exit 0

---

## A0 note on method

The measurement that matters is taken through the anon key carrying a real
admin session, because that is the client lib/supabase/server.ts hands every
admin page. scripts/verify-admin-evidence-live.mjs uses the service-role key
and therefore recorded 561 documentary gaps while the page rendered none. A
gate may only claim what the page can see.

Mint the session with auth.admin.generateLink({type:'magiclink'}) then
verifyOtp({type:'magiclink', token_hash}). Passing `email` alongside
`token_hash` is rejected by the Auth API.

## Omitted deliberately

| Metric | Why omitted |
| --- | --- |
| MRR | One org carries licensed_capacity (490). Zero rows carry stripe_subscription_id. No live recurring revenue to sum. |
| ARR | Same source, same absence. |
| Trial-to-paid conversion | 3 orgs show converted_to_paid; 2 were set by admin_mark_paid against ZZ-LOADTEST-* orgs with the UI's own warning text pasted in as the reason. A rate over that denominator is fiction. |

Period deltas render as absolute counts with the prior period labelled, never
as a percentage: the prior 30-day window is zero for every entity measured
(orgs 3/0, assets 70/0, inspections 30/0, users 3/0, clients 1/0).
