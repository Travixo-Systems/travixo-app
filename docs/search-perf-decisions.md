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

### Revisit trigger — 120,000 rows, unchanged by block 3.7

**120,000 total rows in `scans`**, which is ~2.0 s on the real curve.

> **Does LEAKPROOF move this? No.** Block 3.7 measured `search_scans` at
> 4,789 ms not-leakproof against 4,840 ms leakproof on an identical dataset:
> **neutral**. Its branches build the LIKE pattern from
> `unnest(string_to_array(...))`, and the index cannot be used from that shape
> regardless of leakproofness — with `enable_seqscan=off` pricing a scan at
> 4×10¹⁰ the planner still scans it. So the curve and this threshold stand
> exactly as measured in block 3.6.
>
> **Block 3.8 attempted the `unnest` fix. It does not recover the index, and
> the 0.24 ms reading that motivated it was mismeasured.**
>
> That reading was taken while the functions were still marked `LEAKPROOF`
> from the preceding test. Re-measured cleanly, with the two variables
> separated:
>
> | pattern shape | leakproof | plan | time |
> |---|---|---|---|
> | scalar expression | yes | Bitmap Index Scan | **0.21 ms** |
> | scalar expression | **no** | Seq Scan | 38.7 ms |
> | `unnest`-joined | yes | Seq Scan | 59.0 ms |
> | `unnest`-joined | no | Seq Scan | 59.0 ms |
>
> **Leakproof is a necessary condition; the scalar shape is not sufficient
> without it.** Since leakproof needs superuser and `postgres` is not one, the
> index is unreachable in production by any query rewrite available to us.
>
> The template change was still worth making: hoisting the folded, escaped
> pattern into a `MATERIALIZED` CTE stops both kernel functions running per
> candidate row. Measured on one branch, 59.0 ms → 39.9 ms. End to end:

### Curve after the block 3.8 template fix

| total rows in `scans` | block 3.6 | block 3.8 | gain |
|---|---|---|---|
| 20,122 | 544 ms | **507 ms** | 7% |
| 50,122 | 1,034 ms | **936 ms** | 9% |
| 200,122 | 3,360 ms | **3,127 ms** | 7% |

Real but modest, and it does not move the threshold: 120,000 rows still
projects to ~1.9 s. **Optimisation stops here.** LEAKPROOF is closed (not
deployable), the four options are not being revisited, and the remaining cost
is inherent to searching across RLS-protected joins without index access.

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

> **CORRECTION — block 3.6, then corrected again in block 3.7.** This entry
> first claimed a direct column comparison is index-friendly and is "the only
> known fix that restores the trigram indexes". That was false. Block 3.6 then
> replaced it with *"any policy referencing a column defeats the index"* —
> **also false**, and an inference from four data points rather than a
> mechanism.
>
> **The actual rule: `LEAKPROOF`.** Under RLS the policy is a security qual,
> and Postgres only pushes a user expression below a security barrier when
> every function in it is leakproof. `search_fold` wraps `lower()`; neither is
> leakproof, and neither are `btrim`, `normalize`, `regexp_replace`,
> `textlike` or `like_escape`. So the trigram expression index can never be
> the access path under any real policy. `USING (true)` worked because a
> trivially-true qual creates no barrier to sit behind — not because it
> referenced no column.
>
> Proven: marking `search_fold` **and** `textlike` **and** `like_escape`
> leakproof takes Fleet from 279 ms (Seq Scan) to 3.7 ms (Bitmap Index Scan)
> under production's real four OR'd policies. Marking only one of them changes
> nothing. See `docs/search-leakproof-tests.md`.
>
> **The denormalisation is still not the fix**, but the reason is different
> from what was recorded: the barrier is leakproofness, not the policy's
> shape. Anyone reaching for `organization_id` on `scans` to restore index
> usage would be building it for a reason that was never true.

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

## DECIDED — Fleet §5 is split, not reduced

Measured under production's real policies for all nine tables, at the Business
tier ceiling (2,000 assets, 68,000 related rows) and at 5×:

| shape | 2,000 assets | 10,000 assets (5×) |
|---|---|---|
| full §5, 16 branches across 6 relations | **958 ms** | **5,055 ms** |
| assets + inspections | 203 ms | 1,026 ms |
| **assets only, the 6 real branches** | **98 ms** | **311 ms** |

§5 works — `VGP-2026-00481` returns its machine via a certificate number that
is not an assets column, `Norma Controle` returns 194 machines. It is correct
but not interactive, and it scales worse than linearly because each branch
re-pays the RLS cost.

**The split:**

- **Instant path** (`search_assets`): asset identity only — name, serial,
  description, location, QR, category name. 6 branches. **138 ms** at the
  ceiling for a live query.
- **History path** (`search_assets_history`): inspections, schedules, rentals,
  scans, audits. 9 branches. **1,342 ms**, charged only when the user asks.

Inspections were deliberately **not** put in the instant path despite being
§5's headline example and 203 ms at the ceiling: they are 1,026 ms at 5×, so
the boundary would move under customers as they grew. Assets-only is the
conservative choice and the boundary can only move outward, which is invisible
to anyone who liked it fast.

**A correction to an earlier number in this document.** The instant path was
first quoted at 60 ms for 3 branches. What ships has 6 — `description` and
`qr_code` are real columns and `category` is a joined table of org-authored
free text, not a localised enum. Re-measured honestly: 98 ms at the ceiling,
311 ms at 5×. The 5× figure is over the 300 ms target before network and
render, which is worth knowing; per-branch cost is ~50 ms regardless of which
field, so trimming fields is a scope decision rather than a fix.

`status` IS a localised enum and is `resolvedClientSide`, like `scan_type`.

## OPEN — real-device latency on the instant path is NOT yet measured

The instant path is **145 ms at the database, on localhost**. That is a query
time, not a user-perceived one, and every decision resting on the
instant/history boundary rests on the perceived number.

**Status: blocked, not skipped.** The measurement needs a deployed build and a
phone on mobile data. Neither exists yet.

### One component, clearly labelled as such

Round trip from a **dev machine on a wired connection** to the production
Supabase edge, calling the existing `assets_page`:

```
samples (ms): 37, 49, 50, 54, 57, 66, 105
p50 54 ms    p95 105 ms    n=7
```

**This is not a device measurement and it is not the answer to the 400 ms
question.** It is one component of it. It says the network leg alone is
~50–105 ms from a wired dev machine; a phone on 4G pays radio wake-up on top,
commonly 100–300 ms, plus render on mid-range hardware.

Taken together the wired total is already near 200–250 ms before render. That
is an inference, not a result, and the decision must not be made on it.

### What the real measurement must be

Debounce-fire → results painted, **p50 and p95, from a phone on mobile data**,
against a deployed build. Not a throttled desktop tab: that models bandwidth
but not radio wake-up, carrier latency, or mobile paint cost, which are the
terms that decide whether 145 ms becomes 400 ms.

**If it lands near 400 ms the instant/history boundary moves**, and any surface
built on the current assumption would need revisiting. That is why the
remaining surfaces are not being built until this is answered.

## FINDING — this work existed in one place only

Separate from the measurement, and more urgent when it was found:

At the time of the block 7 check, `feat/search-server-side` had **22 commits,
no upstream, and had never been pushed**. None of `search_scans`,
`search_clients`, `search_assets` or `search_assets_history` existed in
production (all HTTP 404 via PostgREST; the old `assets_page` answered 200).

**That is a backup problem first and a measurement problem second.** Every
block from the kernel onwards — the parity suite, the generator, four
generated RPCs, the measured decisions in this document — lived on one
machine, in one worktree, with no remote copy.

The measurement being blocked is a consequence: there is nothing deployed to
point a phone at. But the exposure was the real issue, and pushing the branch
is the fix regardless of the measurement.

## REJECTED — materialised search document

Raised again after the Fleet measurements and rejected again. The three
original objections are untouched by the new numbers:

1. It cannot carry per-field provenance, which is exactly what makes history
   search usable — "Trouvé via certificat VGP-2026-00481" is the feature.
2. Write amplification on Fleet is severe: every scan, inspection and rental
   would rewrite its asset's document.
3. A missed trigger path leaves a machine silently unfindable — the failure
   the whole spec exists to prevent.

**And the framing that motivated revisiting it was wrong.** A denormalised
column on `assets` does **not** restore index usage:
`search_fold(doc) LIKE '%x%'` is still non-leakproof, so it still cannot reach
the trigram index under RLS. The win would be fewer RLS re-evaluations, not
index access — a tenfold, not a hundredfold. Recorded explicitly so a future
session does not revisit this expecting the wrong order of magnitude.

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
