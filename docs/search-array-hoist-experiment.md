# Array hoist experiment — rejected

**Block 3.5, step 1. Timeboxed to one hour. Result: slower than baseline.
Reverted, nothing kept.**

## Hypothesis

Hoist the caller's authorized asset ids into a materialised array at the top
of the pipeline, so each candidate branch filters `asset_id = ANY(<array>)`
instead of leaving the planner to fold the correlated RLS subplan into a
sequential scan. RLS stays on, no schema change, no `SECURITY DEFINER`.

The array is derived from `public.assets`, which is itself RLS-protected, so
it can only ever contain ids the caller is already entitled to see. It
narrows; it cannot widen.

## Baseline re-measured after the COST 1 change

Asked for explicitly, and worth having: `procost` was already 1 when the
1,199 ms figure was taken, so repricing had **not** yet been credited.

```
procost: search_fold = 1, search_escape_like = 1   (from the migration)

search_scans('Berger') @ 200,121 scans
  run 1   1,178.045 ms
  run 2   1,122.312 ms
  run 3   1,152.788 ms
  mean    1,151 ms
```

So **the repricing bought nothing measurable on its own.** The COST 1 change
stays — the estimates were genuinely wrong, a 200k sequential scan was priced
at 31,967,185 — but it is a correctness fix to the planner's inputs, not a
performance win. Recording that so nobody credits it later.

## Result

Correctness first: identical output.

| variant | rows | total_count |
|---|---|---|
| baseline | 50 | 401 |
| hoist | 50 | 401 |

Timing:

| variant | run 1 | run 2 | run 3 | mean |
|---|---|---|---|---|
| baseline | 1,178 | 1,122 | 1,153 | **1,151 ms** |
| hoist | 1,361 | 1,281 | 1,338 | **1,327 ms** |

**15% slower.** Rejected.

## Why it lost

The hoist did change the plans, and two branches improved —
`idx_scans_asset` and `idx_scans_scanned_by` became usable, and three of the
five branches were pruned to `never executed`.

But it made the location branch worse:

```
Nested Loop  (actual time=1095.346..1095.349 rows=0)
  Join Filter: (search_fold(s_3.location_name) ~~ like_escape(...))
  Rows Removed by Join Filter: 200,120
  ->  Index Scan using idx_scans_asset on scans s_3  (actual rows=200,120)
        Index Cond: (asset_id = ANY ((InitPlan 9).col1))
        Filter: (ANY (asset_id = (hashed SubPlan 11).col1))
```

**1,095 ms in that one branch.** Making `asset_id = ANY(array)` an *Index
Cond* gave the planner an attractive-looking index that matches essentially
every row — all 200,120 of the caller's scans are on the caller's assets — so
it scans the lot through `idx_scans_asset` and demotes the trigram predicate
to a `Join Filter`. The RLS subplan is still applied on top of that.

The hoist did not remove the RLS subplan. It added a second full-table access
path next to it.

## The underlying constraint, now proven rather than inferred

With both sequential and index scans disabled, Postgres *still* refuses the
trigram index on that predicate:

```
SET enable_indexscan = off; SET enable_seqscan = off;
SELECT s.id FROM scans s WHERE search_fold(s.location_name) LIKE '%berger%';

  Seq Scan on scans s  (cost=10000000000.00..2001220031918206.00)
  Execution Time: 820.108 ms
```

It chooses a seq scan priced at 2×10^15 over using the index. That is not a
costing mistake to be tuned around: Postgres **cannot** combine a bitmap index
scan with the RLS policy's `EXISTS` subplan on the same relation, so the index
is unavailable whenever the policy applies. No query-level rewrite reaches it.

Two rewrites were tried and both failed for the same reason: removing the
redundant `EXISTS` guards (block 3), and `CTE AS MATERIALIZED` to force
evaluation order (block 3).

## Conclusion

Within the timebox, the array hoist is rejected and reverted. The blocker is
not addressable from inside the RPC; it needs the policy itself to become a
direct column comparison, which is the `organization_id` denormalisation
recorded as rejected-for-now in `docs/search-perf-decisions.md`.

`search_scans_hoist` was dropped. Nothing from this experiment is committed to
the branch beyond this document.
