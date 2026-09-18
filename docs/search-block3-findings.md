# Block 3 — scans: correctness passes, performance fails

**Status: `search_scans` is written and every spec test passes, but the
function is NOT fit to ship. It is uncommitted deliberately.**

The fan-out case you asked me to include is the one that breaks it.

---

## What passes

All against a real PostgreSQL 17.6, as an authenticated user with the
production RLS policy shapes (`scans_select_same_org` reaching the caller's
org through `assets`, and `get_my_organization_id()` as the cycle-breaker on
`users`).

### Pagination — the Berger scan at position 93

Dataset: 120 scans, ordered `scanned_at DESC`. Verified the only Berger scan
is at **position 93**, i.e. page 2 at `PAGE_SIZE = 50`.

```
SELECT * FROM search_scans('Berger', NULL, NULL, 50, 0);   -- page 1 only

 asset_name        | scanned_by_name | total_count
-------------------+-----------------+-------------
 Grue Télescopique | Frédéric Berger |           1
```

Returned immediately from page 1 without loading page 2. The old client-side
filter could not do this at all, and hid "Load more" while searching.

### Counts — spec §20, §21

```
 returned_rows | total_count        page 1: 50 rows, total 120
            50 |         120        page 2: 50 rows, total 120
                                    page 3: 20 rows, total 120
```

`total_count` comes from `count(*) OVER ()` in the same query as the page, so
filter and count cannot diverge. Never `rows.length`.

### Accents — spec §30

`depot`, `Dépôt`, `DEPOT` → 30 matches each. `securite`, `elevateur`,
`telescopique`, `eragny`, `frederic` all match their accented data.

### Special characters — spec §30

| typed | matched serial |
|---|---|
| `TP_01` | `TP_01` only |
| `TPX01` | `TPX01` only |

The underscore is **literal**: `TP_01` does not match `TPX01`. `100%` matches
only the `100% Béton` asset.

Parentheses and commas survive on a field the spec actually covers — a scan
location of `Bouygues (Île-de-France), quai 3` is found by all of:
`Bouygues (Île-de-France)`, `Bouygues (Ile-de-France)`,
`bouygues ile-de-france`, `(Île-de-France), quai`, `quai 3`. That is the
spec's own "Bouygues Ile de France" case, accent-folding and literal escaping
working together.

*(`Dupont (SARL)` returns 0, correctly: it is an **asset's**
`current_location`, and §10 scopes scans search to the **scan's**
`location_name`. Not a bug.)*

### Multi-term AND — spec §24

| query | matches |
|---|---|
| `Berger` | 1 |
| `Nord` | 30 |
| `Berger Nord` | 1 |

Terms resolve within one record, never OR.

### scan_type as a structured enum — your ruling

| filter | count |
|---|---|
| `['checkout']` | 30 |
| `['checkout','return']` | 60 |
| `Berger` + `['checkout']` | **0** |
| `Berger` + `['inventory']` | **1** |

Resolved types AND with the text query. Berger's one scan is an inventory
scan, so `checkout` correctly excludes it. The RPC filters `scan_type = ANY
(p_scan_types)` on the enum and never text-matches a label.

### Tenant — spec §27

The same inspector name (`Frédéric Berger`) exists in both organizations.

| caller | Berger scans seen | total scans seen |
|---|---|---|
| org A user | 1 (its own) | 121 |
| org B user | 1 (its own, on `Nacelle Org B`) | 1 |

Proven in both directions. `SECURITY INVOKER`, no `p_organization_id`, and the
`assets` join is INNER precisely because the scans policy reaches the tenant
through it — a LEFT JOIN there would be a hole.

---

## What fails: the fan-out plan

Dataset: **200,122 scans across 5,000 assets and 503 users**, one Berger.

```
EXPLAIN (ANALYZE) SELECT * FROM search_scans('Berger', NULL, NULL, 50, 0);

Limit  (actual rows=50)
  Buffers: shared hit=3,413,663
  ->  WindowAgg
        ->  Nested Loop Anti Join  (actual rows=401)
              ->  Nested Loop Left Join  (actual rows=200,121)
                    ->  Nested Loop  (actual rows=200,121)
                          ->  Index Scan using idx_scans_scanned_at_id_desc
                              (actual rows=200,121)
                          ->  Index Scan using assets_pkey (loops=200,121)
                    ->  Index Scan using users_pkey (loops=200,121)

Execution Time: 10,022 ms
```

**Ten seconds.** Every scan is read, joined to its asset and its user, and only
then filtered. 3.4M buffer hits to return 50 rows. **The trigram indexes are
never touched.**

### Root cause — structural, not a missing index

Two things, and the second is the real one.

1. My `NOT EXISTS (SELECT 1 FROM terms WHERE ... NOT LIKE ...)` is a negated
   correlated subquery. Postgres cannot convert that into an index scan.

2. More fundamentally, **an OR across joined tables is inherently
   unindexable.** Rewriting the predicate as a plain positive OR chain
   produces the same plan — a `Seq Scan on scans` feeding 200,121 nested-loop
   lookups:

   ```
   ->  Seq Scan on scans s  (actual rows=200,121)
         ->  Index Scan using assets_pkey  (loops=200,121)
         ->  Index Scan using users_pkey   (loops=200,121)
   ```

   An index on `users.last_name` cannot restrict `scans`, because a row may
   qualify through any of the five columns. The planner has no choice.

This is precisely the risk you named: single-table trigram at 50k was
comfortable; the relational query with `count(*) OVER ()` on top is not.

### One honest note on the first measurement

My initial fan-out seed made 502 of 504 users `Berger*`, so `Berger` matched
199,202 of 200,122 scans — 99.5%. At that selectivity no index should be used
and the planner was right. I corrected the seed to one Berger among 503 and
re-measured: **the plan and the 10s are unchanged.** The failure is the query
shape, not the data.

---

## The fix I did not apply

The predicate must become a **UNION of per-column index scans**, each one
independently indexable, before any join:

```sql
WITH candidates AS (
  SELECT s.id FROM scans s JOIN assets a ON a.id = s.asset_id
   WHERE search_fold(a.name) LIKE ... ESCAPE '\'
  UNION
  SELECT s.id FROM scans s JOIN assets a ON a.id = s.asset_id
   WHERE search_fold(a.serial_number) LIKE ... ESCAPE '\'
  UNION
  SELECT s.id FROM scans s
   WHERE search_fold(s.location_name) LIKE ... ESCAPE '\'
  UNION
  SELECT s.id FROM scans s JOIN users u ON u.id = s.scanned_by
   WHERE search_fold(u.last_name) LIKE ... ESCAPE '\'
  ...
)
```

Each branch can use its own trigram index; the UNION deduplicates; multi-term
AND becomes an intersection of per-term candidate sets. The page and
`count(*) OVER ()` are then computed over a small candidate set rather than
the whole table.

Two things I want your call on before writing it, because both change the
shape of every later surface:

1. **It multiplies query complexity per searchable field.** Scans has 5;
   Fleet's §5 relational contract reaches inspections, schedules, rentals,
   clients, scans and audits. A hand-written UNION per field per surface will
   not stay maintainable across 8 RPCs. The alternative is a **materialised
   search document per row** — one `search_vector`/folded text column per
   entity, maintained by trigger, with one trigram index. That is a bigger
   change and a data-model decision, not a query tweak.

2. **`count(*) OVER ()` may need revisiting at this size.** It is correct and
   the spec requires an exact total, but it forces the full candidate set to
   be materialised. That is fine over a few hundred candidates and expensive
   over tens of thousands.

Nothing is committed. `supabase/migrations/20260919010000_search_scans.sql`
exists in the working tree and should not be applied anywhere as written.
