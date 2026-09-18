# Search performance — decisions

Standing record for the search refactor. Each entry says what was decided,
what it was measured against, and what would reopen it.

---

## ACCEPTED — ~3.4 s text search at 200k rows in `scans`

> **SUPERSEDED FIGURE.** This entry first recorded ~1.2 s, measured against a
> test harness carrying **one simplified SELECT policy per table**
> (`organization_id = get_my_organization_id()`). Production carries **nine**:
> four on `assets`, two on `scans`, three on `users`, all PERMISSIVE and
> therefore OR'd. Re-measured under the real policies (verified byte-identical
> to `supabase/schemas/`, dump in `docs/db/harness-pg-policies-dump.txt`), the
> cost is **2.0–2.9× higher**. The earlier curve described a database we do
> not have.

`search_scans` with any text term costs **~3,360 ms** at 200,002 rows under
production's real policies. Correctness is unaffected — 401 matches, tenant
isolation intact in both directions.

Still accepted for now: it is 3× better than the pre-UNION implementation and
the alternatives remain worse for the reasons below. But the margin is much
thinner than recorded, and the revisit threshold moves a long way as a result.

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

### Measured curve — under production's real policies

| total rows in `scans` | real policies | old (wrong harness) | factor |
|---|---|---|---|
| 20,002 | **544 ms** | 270 ms | 2.0× |
| 50,002 | **1,034 ms** | 440 ms | 2.4× |
| 200,002 | **3,360 ms** | 1,151 ms | 2.9× |

Still roughly linear, now **~16.8 µs per row** rather than 5.7 µs. The factor
grows with size, so the disjunction costs more the more rows it is applied to.

Why the harness mattered: `scans`'s policy reaches the tenant *through*
`assets` (`EXISTS (SELECT 1 FROM assets a WHERE a.id = scans.asset_id AND
...)`), so **`assets`'s own RLS applies inside that path**. Four OR'd
permissive policies on `assets` are therefore evaluated for every candidate
scan, not one simple comparison.

### Revisit trigger — moved from 400,000 to 120,000

**120,000 total rows in `scans`**, which is ~2.0 s on the real curve.

The old 400,000 figure was chosen as "~2.3 s on this curve". On the real curve
400,000 projects to **~6.7 s**, which is not a threshold, it is an outage. The
same ~2 s intent now lands at 120,000 rows — **a 3.3× reduction in headroom**,
and the single most consequential correction in this document.

Add to the weekly check:

```sql
SELECT count(*) FROM public.scans;   -- revisit search perf above 120,000
```

When it trips, the fix is the denormalisation below, not more query tuning —
that avenue is exhausted (see *Rejected*, and
`docs/search-array-hoist-experiment.md`).

### The harness is now committed, so this cannot silently recur

- `scripts/verify/search-test-harness-schema.sql` — production's nine SELECT
  policies verbatim.
- `scripts/verify/verify-harness-policies.mjs` — compares the live harness
  against `supabase/schemas/` and exits 1 on any divergence in predicate,
  role, or permissiveness.
- `docs/db/harness-pg-policies-dump.txt` — the `pg_policies` dump proving what
  was measured against.

Run the verifier before trusting any performance number from this harness.

---

## REJECTED (for now) — `organization_id` denormalisation on `scans`

> **CORRECTION — block 3.6.** This entry claimed a direct column comparison is
> index-friendly and is "the only known fix that restores the trigram
> indexes". **Measured, that is false.** The Fleet spike tried every policy
> shape against an indexed trigram column at 200k rows:
> `organization_id = get_my_organization_id()` → Seq Scan, 1,364 ms (the
> *slowest* variant, because the function is `STABLE` and re-evaluated rather
> than folded); `organization_id = 'literal-uuid'` → Seq Scan, 293 ms;
> `archived_at IS NULL` → Seq Scan, 278 ms; `USING (true)` → **Bitmap Index
> Scan, 2.6 ms**.
>
> **Any policy referencing a column defeats the index on this query.** The
> denormalisation is therefore not a fix for the index problem. See
> `docs/search-fleet-spike.md`.

Adding `scans.organization_id` would let the policy become
`organization_id = get_my_organization_id()`, replacing the nested `EXISTS`
traversal through `assets` with a comparison on the row itself. That is likely
still worth real time for `scans` specifically — the traversal is what makes
`assets`'s own four-policy disjunction run per candidate scan — but it will
**not** restore index usage, and must not be carried forward as though it
will.

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

| table | SELECT policies | shape | index-friendly? |
|---|---|---|---|
| `scans` | **2** | `EXISTS (... assets ... users ...)` OR `is_super_admin()` | no — measured |
| `assets` | **4** | three × `organization_id IN (SELECT ...)` OR `is_super_admin()` | see block 3.6 spike |
| `users` | **3** | `auth.uid() = id` OR `is_super_admin()` OR `organization_id = get_my_organization_id()` | mixed |

Every one of those nine is PERMISSIVE, so Postgres ORs them. `assets` has
three SELECT policies with *identical* semantics plus a super-admin one; the
disjunction is evaluated in full on every query.

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
