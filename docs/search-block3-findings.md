# Block 3 — scans: the UNION pipeline

**Status: correctness complete, performance improved 7.7× but not yet good
enough. One blocker identified that is NOT in the RPC.**

Measured on PostgreSQL 17.6 as an authenticated user, with production's RLS
policy shapes and production's index set.

---

## The pipeline, as specified

```
per term T:
  candidates(T) = UNION ALL of one branch per searchable field,
                  each emitting (root_id, source_type, source_id, matched_field)
result_ids  = INTERSECT of candidates(T) over all terms, on root_id
total_count = count over result_ids        -- ids only, no joins
page        = order + limit/offset on result_ids
display     = join the 50 paged ids back to the source tables
matches[]   = aggregate candidates for those 50 ids
```

Implemented exactly. Two consequences worth naming:

- **§24 is satisfied structurally.** Intersection is on `root_id`, so a term
  cannot be satisfied by an unrelated record. It is not a filter someone has
  to remember to write.
- **§6 provenance now works**, which the first attempt did not deliver:

  ```
   asset_name        | scanned_by_name | matches
  -------------------+-----------------+----------------------------------
   Grue Télescopique | Frédéric Berger | [{"source_type": "user",
                     |                 |   "source_id": "1111...",
                     |                 |   "matched_field": "last_name"}]
  ```

---

## Correctness — all spec tests pass

Verified at 120 scans and re-verified at 200,121.

| test | result |
|---|---|
| **Pagination**, Berger at position 93 | returned from page 1, `total_count` = 1 |
| **Totals** §20/§21 | page 1/2/3 = 50/50/20 rows, total 120 throughout |
| **Accents** §30 | `depot`→`Dépôt`, `securite`→`Sécurité`, `elevateur`, `telescopique`, `frederic`→`Frédéric` |
| **Special chars** §30 | `TP_01` matches serial `TP_01` only, **not** `TPX01`; `100%` literal |
| **Parens/commas** | scan location `Bouygues (Île-de-France), quai 3` found by `bouygues ile-de-france`, `(Île-de-France), quai`, `quai 3` |
| **Multi-term AND** §24 | `Berger`=1, `Nord`=30, `Berger Nord`=1 |
| **scan_type** | `Berger`+`checkout`=0, `Berger`+`inventory`=1 — ANDs, never ORs |
| **Tenant** §27 | org A sees its own Berger only; org B sees 1 scan total |

### A tenant leak the rewrite fixed

The first attempt reported `org A total = 121`; this one reports **120**. The
extra row was a scan whose asset was not visible to the caller. The per-branch
structure made the boundary explicit and closed it.

---

## Performance

Dataset: **200,121 scans / 5,005 assets / 503 users**, one Berger, realistic
surname distribution.

| | first attempt | UNION pipeline |
|---|---|---|
| `search_scans('Berger')` | 10,022 ms | **1,199 ms** |
| buffers | 3,413,663 | 147,130 |
| rows joined before paging | 200,121 | 401 |

**7.7× faster, 23× fewer buffers.** The joins now run against 50 ids instead
of the whole table, exactly as intended.

By query shape:

| query | time |
|---|---|
| no text term (enum filter only) | **57 ms** |
| serial number | 1,230 ms |
| `Berger` | 1,199 ms |
| `Dépôt 7` | 3,418 ms |

---

## The blocker: RLS defeats the trigram indexes

Every candidate branch uses its index **when tested standalone**:

```
Bitmap Index Scan on idx_scans_location_fold_trgm       1.583 ms
Bitmap Index Scan on idx_assets_name_fold_trgm          0.188 ms
```

Under RLS, the same predicate becomes a sequential scan:

```
Seq Scan on scans s  (actual rows=0)
  Filter: ((ANY (asset_id = (hashed SubPlan 2).col1))
           AND (search_fold(location_name) ~~ '%berger%'))
  Rows Removed by Filter: 200,121
```

**1.583 ms without RLS → ~970 ms with it.** Postgres folds the policy's
`EXISTS` subquery and the trigram predicate into one `Seq Scan` filter, and
will not use a bitmap index scan when it must also apply the subplan.

The policy is production's, unmodified:

```sql
CREATE POLICY "scans_select_same_org" ON public.scans
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.assets a
                 WHERE a.id = scans.asset_id
                   AND a.organization_id IN (
                     SELECT u.organization_id FROM public.users u
                     WHERE u.id = auth.uid())));
```

This is not something the RPC can work around. I tried: removing my redundant
`EXISTS` guards (verified identical row counts, so they were pure overhead —
removed, worth ~30 ms), and forcing evaluation order with `CTE AS
MATERIALIZED` (no effect — RLS applies at table level and cannot be reordered
from inside the query).

### A second, independent finding

`search_fold` and `search_escape_like` were created at the SQL-function
default `procost = 100`, which is meant for something expensive. They are a
regexp and a few replaces. At that cost Postgres priced a sequential scan of
200k scans at **31,967,185** and made visibly distorted choices around it.
The migration now sets `COST 1`.

This did not by itself fix the RLS interaction, but the estimates were wrong
and are worth correcting regardless.

---

## What I have not done

I stopped rather than keep guessing. Three routes exist and each has a cost
that is yours to weigh:

1. **Rewrite the policy to compare a column directly.** If `scans` carried
   `organization_id`, the policy becomes `organization_id =
   get_my_organization_id()` — no subquery, and the planner can combine it
   with a bitmap index scan. This is a denormalisation plus a policy change on
   a security-sensitive table, which is explicitly outside what I was told to
   touch.

2. **A `SECURITY DEFINER` search function that enforces the tenant predicate
   itself.** Restores index usage, but it is exactly the pattern the hard
   rules forbid, and there is an open audit finding on `SECURITY DEFINER`
   functions. I did not do this.

3. **Accept ~1.2 s at 200k scans.** It is 7.7× better than the first attempt
   and well under a timeout. For context, the tiers cap at 2,000 assets; 200k
   scans is roughly 8 years of daily scanning for a fleet that size. At 20k
   scans the same query is comfortably sub-second.

My recommendation is 3 for now and 1 when the security workstream next opens
that table — not 2.

---

## Generation, not hand-writing

The per-field branches are repetitive by construction, and you were right that
this is what makes hand-written UNIONs unmaintainable across 8 RPCs. The
migration's header says it is to be generated from `lib/search/manifest.ts`,
and the field list there is already the source of truth for which columns are
`searchable`.

**The generator is not written yet.** Scans has 5 branches and was tractable
by hand; Fleet's §5 contract reaches inspections, schedules, rentals, clients,
scans and audits, and will not be. That generator is the first thing block 4
needs, before another RPC is written by hand.
