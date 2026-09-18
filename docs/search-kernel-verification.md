# Search kernel — verification evidence

**Block 2.** Everything below was run against a real PostgreSQL, not reasoned
about. Environment: local Supabase stack, `postgres:17.6.1.165`, **PostgreSQL
17.6**. Production was not touched.

---

## 1. Why not `unaccent`

Confirmed on the target version rather than assumed:

```
SELECT provolatile, proparallel, proname FROM pg_proc WHERE proname = 'normalize';

 provolatile | proparallel |  proname
-------------+-------------+-----------
 i           | s           | normalize
```

`normalize()` is already `i` (IMMUTABLE) and `s` (PARALLEL SAFE), built in
since PostgreSQL 13, with no extension dependency. `lower()`, `btrim()` and
`regexp_replace()` are all IMMUTABLE/PARALLEL SAFE too.

So `search_fold` needs no `unaccent` wrapper, no `regdictionary` pin, and
nothing whose ACLs are owned by a Supabase-internal role. The index-expression
problem that makes `unaccent` awkward never arises.

## 2. `search_fold` is byte-identical to `fold.ts`

Same ten inputs through both implementations:

| input | SQL `search_fold` | TS `foldSearchValue` | equal |
|---|---|---|---|
| `Sécurité` | `securite` | `securite` | ✅ |
| `SECURITE` | `securite` | `securite` | ✅ |
| `Élévateur` | `elevateur` | `elevateur` | ✅ |
| `Télescopique` | `telescopique` | `telescopique` | ✅ |
| `Dépôt` | `depot` | `depot` | ✅ |
| `Contrôle` | `controle` | `controle` | ✅ |
| `Norma Contrôle` | `norma controle` | `norma controle` | ✅ |
| `Bouygues Île-de-France` | `bouygues ile-de-france` | `bouygues ile-de-france` | ✅ |
| `Straße` | `straße` | `straße` | ✅ |
| `ﬁche` | `ﬁche` | `ﬁche` | ✅ |

The last two matter: they are where **NFD and NFKC diverge**. NFKC would fold
`ﬁ` → `fi` and change which records match. Both implementations use NFD, and
both leave these alone.

### One correction to the specified SQL

The SQL given in the block-2 instructions was:

```sql
lower(regexp_replace(normalize($1, NFD), '[̀-ͯ]', '', 'g'))
```

That is **not** byte-identical to `fold.ts`, which ends in `.trim()`. Proven:

```
input '  Sécurité  '
  without btrim -> '  securite  '
  with    btrim -> 'securite'
```

`btrim()` was added for that reason. It is IMMUTABLE and PARALLEL SAFE, so it
costs nothing. Without it, a user typing a trailing space (routine after
pasting a serial number) would fold to a value the indexed column expression
never produces.

## 3. Declared properties

```
      proname       | volatility | strictness |   parallel
--------------------+------------+------------+---------------
 search_escape_like | IMMUTABLE  | STRICT     | PARALLEL SAFE
 search_fold        | IMMUTABLE  | STRICT     | PARALLEL SAFE
```

## 4. The indexes actually build

The real proof of immutability is not the declaration — PostgreSQL rejects a
non-immutable function in an index expression. All five GIN trigram indexes
built on `search_fold(col)`:

```
CREATE EXTENSION
CREATE INDEX   idx_assets_name_fold_trgm
CREATE INDEX   idx_assets_serial_fold_trgm
CREATE INDEX   idx_scans_location_fold_trgm
CREATE INDEX   idx_users_first_name_fold_trgm
CREATE INDEX   idx_users_last_name_fold_trgm
```

## 5. EXPLAIN ANALYZE — before and after

Dataset: 50,005 assets, 5,000 users, French accented names and `SN-nnnnnn`
serials.

### 5a. Before — the pattern Fleet uses today

```sql
SELECT id, name FROM assets WHERE name ILIKE '%telescopique%';
```

```
 Seq Scan on assets  (cost=0.00..1308.06 rows=5) (actual rows=0 loops=1)
   Filter: ((name)::text ~~* '%telescopique%'::text)
   Rows Removed by Filter: 50005
   Buffers: shared hit=683
 Execution Time: 23.780 ms
```

This one plan shows **both** current defects at once: a sequential scan over
every row, **and `actual rows=0`** — because `telescopique` cannot match
`Télescopique`. Today's Fleet search is slow *and* returns nothing.

### 5b. After — folded and indexed

```sql
SELECT id, name FROM assets
WHERE search_fold(name) LIKE '%' || search_escape_like(search_fold('telescopique')) || '%' ESCAPE '\';
```

```
 Bitmap Heap Scan on assets  (cost=1295.61..4630.39 rows=10102) (actual rows=10000 loops=1)
   Recheck Cond: (search_fold((name)::text) ~~ '%telescopique%'::text)
   ->  Bitmap Index Scan on idx_assets_name_fold_trgm  (actual rows=10000 loops=1)
         Index Cond: (search_fold((name)::text) ~~ '%telescopique%'::text)
 Execution Time: 39.435 ms
```

**The index is used** (`Bitmap Index Scan on idx_assets_name_fold_trgm`), and
the query now returns the 10,000 rows it always should have.

Reported honestly: this is *slower* in wall-clock than 5a (39ms vs 24ms). That
is not a regression — 5a returned zero rows because it was broken. Returning
10,000 correct rows costs more than returning nothing. 20% of the table
matching is also the worst case for an index.

### 5c. The realistic case — a selective lookup

Searching a serial number, which is what users actually do:

| | plan | rows | time |
|---|---|---|---|
| without index (`enable_bitmapscan=off`) | Seq Scan, 50,004 rows filtered | 1 | **136.431 ms** |
| with index | `Bitmap Index Scan on idx_assets_serial_fold_trgm` | 1 | **2.928 ms** |

**47× faster.** This is the shape that matters: the more selective the search,
the more the index wins.

### 5d. Multi-term AND (spec §24)

Both terms push into a single index scan:

```
 Bitmap Heap Scan on assets
   Recheck Cond: ((search_fold(name) ~~ '%nacelle%') AND (search_fold(name) ~~ '%haulotte%'))
   ->  Bitmap Index Scan on idx_assets_name_fold_trgm
         Index Cond: ((search_fold(name) ~~ '%nacelle%') AND (search_fold(name) ~~ '%haulotte%'))
```

### 5e. Planner still chooses correctly

On `users`, searching `frederic` where **every** row matches, the planner
picks a Seq Scan — correctly, since an index is pointless when returning
everything. Made selective (`berger4237`), it switches to
`idx_users_last_name_fold_trgm`. The indexes are used when they help and
ignored when they do not.

## 6. Spec §30 acceptance — accents

| typed | found |
|---|---|
| `securite` | Nacelle **Sécurité** |
| `controle` | Grue **Contrôle** |
| `elevateur` | Chariot **Élévateur** |
| `depot` | **Dépôt** Central |
| `Sécurité` | Nacelle Sécurité |
| `SECURITE` | Nacelle Sécurité |

All four required cases pass, in both directions.

## 7. Spec §30 acceptance — special characters

`search_escape_like` output:

| input | escaped |
|---|---|
| `100%` | `100\%` |
| `TP_01` | `TP\_01` |
| `Dupont (SARL)` | `Dupont (SARL)` |
| `Martin, Jean` | `Martin, Jean` |
| `a\b` | `a\\b` |
| `%_\` | `\%\_\\` |

Parentheses and commas pass through untouched — the destructive stripping in
`app/api/clients/route.ts:38` is gone.

End-to-end literal matching against real rows:

| query | matched |
|---|---|
| `100%` | `100% Béton` only — **not** `100 Beton` |
| `TP_01` | `TP_01` only — **not** `TPX01` |
| `Dupont (SARL)` | `Dupont (SARL)` |
| `dupont (sarl)` | `Dupont (SARL)` (case-insensitive) |
| `beton` | `100% Béton` **and** `100 Beton` (accent-folded) |

`%` and `_` are matched literally; accents still fold. Both behaviours at once,
which is the point.

## 8. Duplicate primitives removed

| site | action |
|---|---|
| `components/assets/ImportAssetsModal.tsx:257` | was a character-for-character copy → now `foldSearchValue`. Also removed a dead `norm` import that the local copy had been shadowing. |
| `lib/import/categoryInference.ts:26` | rebuilt **on** the kernel: `foldSearchValue(v).replace(/\s+/g,' ')`. Not a pure duplicate — it additionally collapses internal whitespace, which import matching depends on. Kept as a documented superset rather than flattened. |
| `scripts/backfill-rental-client-ids.mjs:50` | **left alone, deliberately.** Standalone `.mjs` run by plain node: no bundler, no `@/` alias, so the kernel is unreachable. Reason recorded in the file. |

Behaviour preservation was proven, not assumed — old and new implementations
were run against 13 inputs including padded, multi-space, tab, newline,
`Straße` and `ﬁche`: **all 13 identical for both call sites.**

## 9. Build and typecheck

- `npx tsc --noEmit` → **exit 0**
- `npx eslint lib/search/ lib/import/categoryInference.ts` → **exit 0**
- `npx next build` → fails at `/api/cron/capacity-drift` with
  `supabaseUrl is required`.

That build failure is **pre-existing and environmental**, not caused by this
work: it was reproduced with all changes stashed, on untouched baseline code,
with an identical error. The cause is a missing `.env.local` in a fresh
worktree (it exists in the main checkout). TypeScript compiled successfully in
both runs.

No test script exists in this project (`package.json` defines only `lint`), so
the equivalence proof in §8 stands as the behavioural verification.

---

## Caveats

1. **The local stack cannot replay the repo's migrations on this branch.**
   `supabase start` fails at `20250101000000_subscription_schema.sql` with
   `relation "organizations" does not exist` — the known
   missing-genesis-migration problem recorded in `AGENTS.md`. The EXPLAIN
   ANALYZE figures in §5 were produced against minimal tables built to match
   `supabase/schemas/` exactly (`assets`, `users`, `scans`, same columns,
   types and nullability).

   The kernel *was* additionally verified against the full real schema — 26
   tables, 85 policies, 62 functions, 108 indexes — with the parity suite
   passing unchanged and all five trigram indexes building on the real tables.
   That required a genesis migration, which is **out of scope for
   `docs/search-spec.md`** and now lives on `chore/db-genesis`, parked and
   unfinished. See `docs/db/README-genesis.md` on that branch.

   So on this branch alone, the kernel migration cannot be exercised against a
   full replica of production's schema. Anyone re-running §5 from a clean
   clone will need that branch, or the minimal tables above.
2. **Index sizing was not measured.** Five GIN trigram indexes add write cost
   and disk. At 50k rows this was not material; it should be checked against
   production row counts before applying.
3. `supabase/.branches/` was added to `.gitignore` — local stack runtime state
   that should never have been committable.
