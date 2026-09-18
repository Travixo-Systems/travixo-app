# Search performance — decisions

Standing record for the search refactor. Each entry says what was decided,
what it was measured against, and what would reopen it.

---

## ACCEPTED — ~1.2 s text search at 200k rows in `scans`

`search_scans` with any text term costs ~1,151 ms at 200,121 rows in the
`scans` table. Without a text term (enum or date filter only) it is ~57 ms.

This is accepted for now. It is 7.7× better than the first implementation
(10,022 ms), well inside any timeout, and the alternatives are all worse for
reasons recorded below.

### The threshold is TOTAL rows in `scans`, across all tenants

This matters and is easy to get wrong.

RLS filters **after** scanning. The plan shows `Rows Removed by Filter:
200,121` to return 401 rows: every scan in the table is examined regardless of
which organization owns it. So the cost is driven by the **global** row count
in `scans`, not by how many scans any one customer has.

A customer with 500 scans in a table holding 200,000 pays the 200,000-row
cost. Growth is therefore the sum across every tenant on the instance, and
adding customers moves this number even if no existing customer changes
behaviour.

Do not translate this into "N years for a customer of size X". That framing
is wrong here and will produce a threshold nobody hits until it is far too
late.

### Measured curve

| total rows in `scans` | `search_scans('Berger')` |
|---|---|
| 20,120 | 270 ms |
| 50,121 | 440 ms |
| 200,121 | 1,151 ms |

Roughly linear, ~5.7 µs per row.

### Revisit trigger

**400,000 total rows in `scans`**, which projects to ~2.3 s on this curve.

Chosen because it is roughly double the measured point, still inside a
tolerable interactive wait, and leaves room to act before the experience
degrades rather than after. Add to the weekly check:

```sql
SELECT count(*) FROM public.scans;   -- revisit search perf above 400,000
```

When it trips, the fix is the denormalisation below, not more query tuning —
that avenue is exhausted (see *Rejected*, and
`docs/search-array-hoist-experiment.md`).

---

## REJECTED (for now) — `organization_id` denormalisation on `scans`

Adding `scans.organization_id` would let the policy become
`organization_id = get_my_organization_id()` — a direct column comparison with
no subquery, which the planner **can** combine with a bitmap index scan. That
is the only known fix that restores the trigram indexes.

Rejected for now because it is a schema change plus a policy rewrite on a
security-sensitive table, and the tenant boundary for `scans` currently lives
entirely in that policy. Changing it is not a performance task.

**Revisit only when the security workstream next opens `scans`.** Doing it
then costs one review of a table already being reviewed; doing it now means
opening that table for a performance reason, which is the wrong trigger.

---

## REJECTED — `SECURITY DEFINER` search functions

Would restore index usage by letting the function apply the tenant predicate
itself instead of relying on the policy.

Forbidden. There is an open audit finding on `SECURITY DEFINER` functions
trusting caller-supplied ids, and adding eight more search functions in that
style would extend exactly the pattern under review. Not done, and not to be
reconsidered as a performance measure.

---

## REJECTED — array hoist of authorized asset ids

Measured, 15% slower than baseline. Full write-up in
`docs/search-array-hoist-experiment.md`.

---

## RULE — RLS is the sole tenant boundary in search RPCs

The explicit `EXISTS (SELECT 1 FROM assets a WHERE a.id = s.asset_id)` guards
were removed from every branch of `search_scans` in block 3. They were
verified redundant (identical row counts with and without) and they cost
~30 ms by forcing a sequential scan before the trigram predicate.

**The tenant boundary in these functions is now the RLS policy and nothing
else.** That is sound only while the functions are `SECURITY INVOKER`.

> **If any search function ever becomes `SECURITY DEFINER`, the explicit
> organization predicate returns to every branch in the same commit.**

A `SECURITY DEFINER` function bypasses RLS, so the guards stop being redundant
and start being the only thing standing between one tenant and another's data.
There is no intermediate state in which the function is `SECURITY DEFINER` and
the branches have no org predicate.

This rule is repeated in two other places on purpose, because a rule that
lives only in a document is not enforced:

- the header of `supabase/migrations/20260919010000_search_scans.sql`
- the branch template in `lib/search/generate-rpc.ts`

---

## Note for the other surfaces

The same RLS-versus-index interaction will appear on every surface whose
policy uses a subquery rather than a column comparison. Worth checking the
policy shape **before** writing each RPC, rather than discovering it in an
EXPLAIN afterwards:

Read from `supabase/schemas/`, not from the simplified policies used in the
block 3 test harness — those used `= get_my_organization_id()` and are NOT
what production runs:

| table | production policy shape | index-friendly? |
|---|---|---|
| `scans` | `EXISTS (SELECT 1 FROM assets a WHERE a.id = scans.asset_id AND a.organization_id IN (SELECT ...))` | no — measured |
| `assets` | `organization_id IN (SELECT users.organization_id FROM users WHERE users.id = auth.uid())` | **unknown, likely not** |
| `users` | `organization_id = get_my_organization_id()` | likely yes |

**Correction to an earlier assumption.** I had recorded that `assets` uses a
direct column comparison. It does not: all three of its SELECT policies use
`organization_id IN (SELECT ...)`. That is a subquery, so Fleet (block 6) may
well hit the same wall as scans rather than escaping it. The test harness in
block 3 used the direct-comparison form for `assets` and `users`, which means
the measured 1,151 ms is if anything **optimistic** for surfaces that search
`assets` directly.

Note also that `assets` carries three overlapping SELECT policies. Postgres
ORs permissive policies together, so all three are evaluated. That is worth a
look on its own, but it belongs to the security workstream, not here.

Check each surface's real policy shape in `supabase/schemas/` **before**
writing its RPC, rather than discovering it in an EXPLAIN afterwards.
