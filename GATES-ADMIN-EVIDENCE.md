# Gates: admin evidence page

OWNS: app/(admin)/admin/evidence/**, lib/admin/evidence/**, lib/i18n.ts (adminEvidence namespace), app/(admin)/admin/layout.tsx (nav), GATES-ADMIN-EVIDENCE.md

Scope: Add a read-only `/admin/evidence` route carrying three detectors over
live data. Exception-first: offending rows above aggregates, zero rows rendered
as a green line rather than a hidden section. No charts. No writes anywhere.
Existing admin pages are not rebuilt.

The point of the page is that a detector reporting zero must be distinguishable
from a detector that did not run. Both look identical in a naive implementation,
and the second is the one that quietly stops protecting anything.

- [x] E1: Every detector is a pure read. No INSERT, UPDATE, DELETE, upsert or
      RPC that writes appears anywhere under lib/admin/evidence/ or the page.
  CHECK: node scripts/verify-admin-evidence.mjs
  EXPECT: E1_READ_ONLY_VERIFIED
  EVIDENCE: exit=0; output=PASS no detector performs a write (insert/update/upsert/delete/rpc) | PASS the page performs no write | PASS the client island performs no query and no write

- [x] E2: The route is gated. /admin/evidence inherits requireSuperAdmin()
      from app/(admin)/admin/layout.tsx, and the page itself performs no
      weaker check of its own.
  CHECK: node scripts/verify-admin-evidence.mjs
  EXPECT: E2_GATED_VERIFIED
  EVIDENCE: exit=0; output=PASS admin layout calls requireSuperAdmin(), which gates /admin/evidence | PASS the evidence page adds no tenant-role check of its own | PASS /admin/evidence is linked from the admin nav

- [x] E3: A failed detector never renders as clean. Each detector returns
      `failed: true` on a query error, and the page renders the failure state
      rather than the green line when it is set.
  CHECK: node scripts/verify-admin-evidence.mjs
  EXPECT: E3_FAILURE_DISTINGUISHED
  EVIDENCE: exit=0; output=PASS every detector distinguishes a failed run from an empty one | PASS the view tests failed before empty for all three detectors | PASS distinct clean and failed states exist in the view

- [x] E4: Every visible string resolves through lib/i18n.ts in both en and fr.
      No hardcoded English literal in the page or the client island, and no
      adminEvidence key missing an fr value.
  CHECK: node scripts/verify-admin-evidence.mjs
  EXPECT: E4_I18N_COMPLETE
  EVIDENCE: exit=0; output=PASS adminEvidence namespace: 47 keys, 47 en / 47 fr | PASS all 46 adminEvidence keys used by the view exist in lib/i18n.ts | PASS no messages/ directory

- [x] E5: D1 states its rule before its rows, and the excluded rule is named.
      The 549-row last_inspection_date rule is documented as deliberately not
      used, so a future reader does not "fix" its absence.
  CHECK: node scripts/verify-admin-evidence.mjs
  EXPECT: E5_D1_RULE_STATED
  EVIDENCE: exit=0; output=PASS D1 states both rules in the source | PASS D1 names the last_inspection_date rule it deliberately excludes | PASS the excluded rule is surfaced to the reader, not only in a code comment

- [x] E6: Detectors run against live production data and their counts are
      recorded here, so "does this condition occur in real data" is answered by
      measurement rather than by reading the query.
  CHECK: node scripts/verify-admin-evidence-live.mjs
  EXPECT: E6_LIVE_COUNTS_RECORDED
  EVIDENCE: exit=0; all three detectors ran with error=none; counts below

- [x] E7: Repository typechecks clean (tsc --noEmit, exit 0) and the static
      verify chain still passes.
  CHECK: npx tsc --noEmit && npm run verify:static
  EXPECT: exit 0
  EVIDENCE: tsc exit=0; verify:static 6/6 checks passed

## Live counts

Measured by E6 against production on 2026-09-15, by importing the same detector
modules the page imports. Recorded here rather than in a commit message so the
numbers stay next to the rules that produced them.

| Detector | Rows | Occurs in real data |
| --- | --- | --- |
| D1 atomic disagreement | 28 (rule A 13, rule B 15) over 583 inspected assets | Yes |
| D2 documentary gaps | 561 (gap A 561, gap B 0) of 733 inspections | Yes, gap A only |
| D3 rental expiry | 0 over 114 active rentals; 6 unscheduled | No for the rule itself; the secondary condition does occur |

Notes on what those numbers mean:

- D1: 13 assets carry a FAILED latest inspection while not `out_of_service`,
  one of them `in_use`. All predate the 2026-09-03 atomic write. They are
  bookable today.
- D2: 561 of 733 inspections have no certificate, all of them pre-cutover.
  `record_inspection()` now refuses a blank certificate, so the condition
  cannot be created any more, but the existing rows remain unevidenced.
  Gap B is genuinely zero: every certificate that exists resolves to an asset.
- D3: the rule itself matches nothing. Every active rental returns before its
  asset's VGP falls due. The 6 unscheduled rentals are the real finding here,
  all EuroRent Equip, all non-demo assets, invisible to every compliance path.
