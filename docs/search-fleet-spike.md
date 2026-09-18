# Fleet spike — RLS defeats trigram indexes on the driving table too

**Block 3.6 step 2. Timeboxed, no implementation. Plan and timings only.**

The question was whether `organization_id = ANY(hashed subplan)` on the
**driving** table behaves like the scans blocker, better, or worse. It is a
different shape and the verdict was not assumed either way.

**Answer: worse, and for a different and more general reason than scans.**

---

## Measurements

One folded trigram query against `assets` under production's four OR'd SELECT
policies, verified byte-identical to `supabase/schemas/`.

Selective term (a serial number — what a yard manager actually types):

| assets | without RLS | with RLS | penalty |
|---|---|---|---|
| 50,001 | **1.13 ms** (Bitmap Index Scan) | **286 ms** (Seq Scan) | **253×** |
| 200,001 | **6.50 ms** (Bitmap Index Scan) | **1,065 ms** (Seq Scan) | **164×** |

Broad term (`telescopique`, matching 10,250 of 50,001):

| | time |
|---|---|
| without RLS | 164 ms (seq scan, correctly — 20% of rows match) |
| with RLS | 315 ms |

The broad case is *not* the interesting one: at 20% selectivity a seq scan is
the right plan regardless. The selective case is the one Fleet lives on, and
it is where the index would have won by two orders of magnitude.

## The plan

```
Seq Scan on assets a  (actual rows=1)
  Filter: ((is_super_admin()
            OR (ANY (organization_id = (hashed SubPlan 1).col1))
            OR (ANY (organization_id = (hashed SubPlan 2).col1))
            OR (ANY (organization_id = (hashed SubPlan 3).col1)))
           AND (search_fold(serial_number) ~~ '%sn-b012345%'))
  SubPlan 1 -> Seq Scan on users   (Rows Removed by Filter: 502)
  SubPlan 2 -> Seq Scan on users   (Rows Removed by Filter: 502)
  SubPlan 3 -> Seq Scan on users   (Rows Removed by Filter: 502)
```

Three identical subplans, because three of the four SELECT policies say the
same thing in slightly different SQL. Each scans `users` separately.

## The mechanism — and it is NOT what we assumed

I expected the subquery to be the culprit, as it appeared to be for scans.
Isolating one policy at a time says otherwise:

| policy on `assets` | plan | time @200k |
|---|---|---|
| all four (production) | Seq Scan | 1,065 ms |
| one `IN (SELECT ...)` only | Seq Scan | 572 ms |
| `organization_id = get_my_organization_id()` | Seq Scan | 1,364 ms |
| `organization_id = 'literal-uuid'` | Seq Scan | 293 ms |
| `archived_at IS NULL` | Seq Scan | 278 ms |
| **`USING (true)`** | **Bitmap Index Scan** | **2.6 ms** |

**Any RLS policy that references a column defeats the trigram index on this
query.** A literal-constant comparison does. `archived_at IS NULL` does. Only
a policy with no column reference at all leaves the index usable.

Two consequences that change the plan of record:

1. **The disjunction is not the root cause.** It roughly doubles the cost
   (572 ms → 1,065 ms), so consolidating the three redundant policies is worth
   real time — but it does not restore the index.
2. **`organization_id` denormalisation would not fix Fleet.** That was
   recorded in `docs/search-perf-decisions.md` as the known fix, on the theory
   that a direct column comparison is index-friendly. Measured, the direct
   comparison is the *slowest* variant of all (1,364 ms), because
   `get_my_organization_id()` is `STABLE` and is re-evaluated rather than
   folded to a constant. Even the literal form still seq-scans.

That entry needs correcting. The denormalisation may still be worth doing for
scans, whose blocker is the nested `EXISTS` traversal rather than this, but it
must not be carried forward as "the fix" for Fleet.

## What this means for §5

§5 asks Fleet to search across its own columns plus inspections, schedules,
rentals, clients, scans and audits — six related tables, each contributing
UNION branches, each subject to its own RLS.

On this evidence, as specified, that contract is **not viable at interactive
speed**. Scans alone reaches 3,360 ms at 200k. Fleet's driving table is
already 1,065 ms at 200k assets for a single-column selective lookup, before
any of the six relations are added.

And Fleet is not a background report. It is the screen a yard manager has open
all day, so the 1.2 s that was tentatively accepted for scans is not
acceptable here — a point worth making explicitly, because the accepted figure
for scans should not be read across.

## Options, none of them free

Reported, not chosen.

1. **Consolidate the three redundant `assets` SELECT policies into one.**
   Halves the cost (1,065 → ~572 ms) and is defensible on clarity grounds
   alone — no single policy currently describes what a user can see. Does not
   restore the index. Belongs to the security workstream; logged separately.

2. **Materialised search document per row**, maintained by trigger, with the
   tenant column *in* the indexed table. Rejected earlier in favour of
   generation, and generation was the right call for maintainability — but the
   reason to reconsider now is different: it is the only shape that keeps the
   tenant predicate and the searchable text in one relation, which is what
   would let a single index serve both.

3. **Narrow §5.** Search Fleet's own columns plus one or two high-value
   relations (inspections by certificate number is the spec's own example)
   rather than all six. Cheapest by far, and a product decision rather than a
   technical one.

4. **Accept and cache.** Fleet's first page is the same for every user in an
   org; a short-lived cache would hide the cost for the common case and not
   for search itself.

## Caveats

- Measured on a single-tenant-heavy dataset: one org holds essentially all
  200k assets. A realistic multi-tenant spread would make the org predicate
  more selective, which helps the *filter* but does not restore the index —
  the plan shape is unchanged.
- `users` was 503 rows. Larger user tables make each subplan worse, and there
  are three of them.
- No `assets`-side UNION pipeline was built; this measures the driving-table
  predicate only, which is the question that was asked.
