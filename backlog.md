# Backlog

Decisions and follow-ups that are not bugs and do not block anything. Each one
says what is true today, so nobody has to re-derive it.

---

## Should a fleet count mean owned or active?

**Type:** product / UI decision. Not a bug.
**Status:** open. Current behaviour deliberately preserved.

The assets page counts the same fleet two different ways, and both are
defensible:

| Where | Archived assets | Effect |
| --- | --- | --- |
| Status chips above the table (`all`, `available`, `in_use`, ...) | **excluded** | "12 nacelles" means 12 you can currently work with |
| Category filter dropdown, per-category counts | **included** | "12 nacelles" means 12 you own, retired ones included |

So a depot with 10 active and 2 archived nacelles reads **10** in one place and
**12** in the other, on the same screen.

Neither is wrong in isolation. Owned is the right number for an asset register;
active is the right number for planning today's work. What is wrong is showing
both without saying which is which.

This was preserved rather than "fixed" during the assets-page pagination work
(`supabase/migrations/20260902100000_assets_page_aggregates.sql` reproduces the
asymmetry exactly). Quietly changing what a fleet count means inside a
performance change is how a chef de parc stops trusting the dashboard.

**To decide:** pick one meaning, or label both. If the counts change, the
change should be visible and explained in the UI, not shipped as a side effect.

**Where it lives:** `assets_status_counts()` and `assets_category_counts()` in
that migration; previously the `statusCounts` and `categories` memos in
`components/assets/AssetsPageClient.tsx`.

---

## Genesis migration for the dashboard-created core tables

**Type:** infrastructure. **Priority:** P2.
**Status:** open, deliberately deferred.

Eight core tables (`assets`, `users`, `organizations`, `vgp_schedules`,
`vgp_inspections`, `scans`, `asset_categories`, `audit_items`) were created in
the Supabase dashboard and have no `CREATE TABLE` in any migration.

Consequence: full `supabase db pull` (shadow replay) fails at the earliest
migration with `relation organizations does not exist`, and a fresh environment
cannot be provisioned from the repo. `--declarative` works and is the standing
procedure, so this blocks neither the audit nor production.

**Fix:** generate a genesis migration from `supabase/schemas/`, timestamped
before `20250101000000`.

Tracked in `docs/perf-audit-2026-08.md` under finding I.1.

---

## Denormalise organization_id onto scans

**Type:** performance. **Priority:** P2 (revised down from P0).
**Status:** open, not urgent.

`scans` has no `organization_id`, so tenant isolation runs through a correlated
subquery against `assets`. At 337 rows this is trivially cheap; the concern is
growth, since the cost scales with platform-wide scan volume rather than tenant
size.

**Revisit when** scan volume reaches six figures. The change is a column plus a
backfill plus a trigger to keep it in step, which is considerably more than the
policy cleanup it would enable.

Tracked in `docs/perf-audit-2026-08.md` under finding 02.4.
