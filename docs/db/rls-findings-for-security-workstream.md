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

## 3. Bare `STABLE` function calls in policies run per row, not per query

**Measured in the harness, not applied anywhere. This is the cheapest win in
this document.**

`users_select_same_org` on `users` is written:

```sql
USING (organization_id = public.get_my_organization_id())
```

`get_my_organization_id()` takes no arguments and is `STABLE`, so it ought to
be evaluated once per query. **It is not.** Postgres treats a bare `STABLE`
call in a qual as an ordinary expression and evaluates it per row. Wrapping it
in a scalar subquery forces an InitPlan, evaluated once and reused:

```sql
USING (organization_id = (SELECT public.get_my_organization_id()))
```

Measured at 50,001 assets, same query, same data, only the policy text
differing:

| policy form | plan fragment | time |
|---|---|---|
| `= get_my_organization_id()` | `Filter: (organization_id = get_my_organization_id())`, cost 866..15,157 | **363 ms** |
| `= (SELECT get_my_organization_id())` | `Filter: (organization_id = (InitPlan 1).col1)`, cost 0.26..1,540 | **137 ms** |

**2.65× faster, cost estimate down roughly tenfold.** This is a well-known
Supabase RLS pattern.

It applies to **every** policy in the schema written as a bare function call,
not only this one — worth a sweep for `get_my_organization_id()` and
`is_super_admin()` across all tables. `is_super_admin()` appears in nine
policies and is `STABLE` `SECURITY DEFINER` with a table lookup inside it.

No change proposed here beyond handing over the number.

## 4. Context, so this is not mistaken for a performance ticket

The search work hit a harder wall that consolidation does not fix. The cause
is **`LEAKPROOF`**, not policy shape: under RLS the policy is a security qual,
and Postgres only pushes a user expression below a security barrier when every
function in it is leakproof. `search_fold` wraps `lower()`, and neither —
along with `btrim`, `normalize`, `regexp_replace`, `textlike` and
`like_escape` — is leakproof. So the trigram expression index cannot be the
access path under **any** real policy.

(An earlier version of this note claimed "any policy referencing a column
defeats the index". That was wrong, and is corrected in
`docs/search-perf-decisions.md`. `USING (true)` was fast because a
trivially-true qual creates no barrier, not because it referenced no column.)

Marking `search_fold`, `textlike` and `like_escape` leakproof takes Fleet from
279 ms to **3.7 ms** under the real four policies — but it requires superuser,
and on Supabase the customer role `postgres` is not superuser. **Not
deployable.** Full detail: `docs/search-leakproof-tests.md`.

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
