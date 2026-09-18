# RLS findings for the security workstream

**Logged from the search refactor, 2026-09-18. Not acted on here.**

These were found while measuring search performance. They are security- and
clarity-relevant, not search-specific, so they belong to whoever next opens
these tables. Nothing in this document has been changed on any branch.

---

## 1. `assets` has three redundant permissive SELECT policies

`supabase/schemas/public/tables/assets.sql` declares **four** SELECT policies.
Three say the same thing in slightly different SQL:

| policy | roles | predicate |
|---|---|---|
| `Users can view assets in own organization` | `{public}` | `organization_id IN (SELECT users.organization_id FROM users WHERE users.id = auth.uid())` |
| `assets_select_org_authenticated` | `{authenticated}` | identical, `users.` prefix |
| `assets_select_same_org` | `{authenticated}` | identical, `u.` alias |
| `super_admin_read_all_assets` | `{public}` | `is_super_admin()` |

All four are PERMISSIVE, so Postgres ORs them.

### Why it matters for correctness and review

**No single policy describes what a user can see.** Answering "who can read
this row?" requires reading four policies and OR-ing them mentally. Two of the
three org policies are granted to `{public}` rather than `{authenticated}`,
which is a further thing a reviewer has to notice and reason about.

A consolidation candidate: one SELECT policy for org membership, one for
super-admin.

### Why it matters for the planner

Measured at 200,001 assets, selective trigram lookup:

| policies on `assets` | time |
|---|---|
| all four (production) | 1,065 ms |
| a single `IN (SELECT ...)` | 572 ms |

**The disjunction roughly doubles the cost.** Each org policy becomes its own
hashed subplan over `users`, and the plan runs three of them:

```
Filter: ((is_super_admin()
          OR (ANY (organization_id = (hashed SubPlan 1).col1))
          OR (ANY (organization_id = (hashed SubPlan 2).col1))
          OR (ANY (organization_id = (hashed SubPlan 3).col1)))
         AND (search_fold(serial_number) ~~ '%...%'))
  SubPlan 1 -> Seq Scan on users   (Rows Removed by Filter: 502)
  SubPlan 2 -> Seq Scan on users   (Rows Removed by Filter: 502)
  SubPlan 3 -> Seq Scan on users   (Rows Removed by Filter: 502)
```

A disjunction also defeats index selectivity in general: the planner cannot
use an index to satisfy an OR whose branches touch different relations, so it
falls back to scanning and filtering.

Consolidating would roughly halve this. It would **not** restore the trigram
index — see below — so this is a clarity fix with a performance side effect,
not a performance fix.

## 2. `users` and `scans` have the same pattern, smaller

- `users`: three SELECT policies — `auth.uid() = id`, `is_super_admin()`,
  `organization_id = get_my_organization_id()`. The third is granted to
  `{public}`.
- `scans`: two — `scans_select_same_org` (an `EXISTS` through `assets`) and
  `super_admin_read_all_scans`.

Nine permissive SELECT policies across the three tables in total.

## 3. Context, so this is not mistaken for a performance ticket

The search work hit a harder wall that consolidation does not fix: **any RLS
policy referencing a column defeats the trigram index** on these queries.
Measured at 200k rows:

| policy | plan | time |
|---|---|---|
| `USING (true)` | Bitmap Index Scan | **2.6 ms** |
| `organization_id = 'literal-uuid'` | Seq Scan | 293 ms |
| `archived_at IS NULL` | Seq Scan | 278 ms |
| `organization_id = get_my_organization_id()` | Seq Scan | 1,364 ms |
| all four production policies | Seq Scan | 1,065 ms |

So consolidation is worth doing for its own reasons — a reviewer being able to
state what a user can see — and it happens to halve a cost. It is not the fix
for search, and search is not the reason to do it.

Full detail: `docs/search-fleet-spike.md`.

## What is NOT claimed here

- No assertion that the current policies are *wrong* in what they permit. They
  appear to permit the same set; the objection is that four overlapping
  statements are harder to verify than one.
- No change proposed to `is_super_admin()` or to the super-admin policies.
- No migration written. This is a log entry.
