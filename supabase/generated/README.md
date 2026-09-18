# Generated search RPCs

**Do not edit anything in this directory.** Every `.sql` file here is produced
from `lib/search/manifest.ts` by `lib/search/generate-rpc.ts`.

```bash
npx tsx scripts/build-search-rpcs.ts           # regenerate
npx tsx scripts/build-search-rpcs.ts --check   # golden-file test, exit 1 on drift
```

## Why these files are committed

They are the golden files. `--check` regenerates into memory and compares
against what is committed, so:

- a **template change** shows up as a diff across every surface at once, which
  is reviewable — that is the point of generating rather than hand-writing;
- a **manifest change** that forgets to regenerate fails the check instead of
  silently leaving the SQL and the manifest disagreeing.

Wire `--check` into CI alongside `tsc --noEmit`.

## What the template owns

Not per-surface, and not up to whoever adds the next RPC:

- the tenant predicate — there is none, RLS is the boundary (see below)
- provenance columns: `source_type`, `source_id`, `matched_field`
- the pipeline shape: per-field `UNION ALL` branches → `INTERSECT` on
  `root_id` per term → count over ids → page ids → join back → aggregate
  `matches` for the paged ids only
- `SECURITY INVOKER`
- `COST 1` on the kernel functions

A surface contributes only its root table and its field bindings.

## Build errors, by design

Three things fail the build rather than degrading quietly:

1. **`searchable: true` with no `sql` binding and no `resolvedClientSide`.**
   Silently skipping is exactly how a field becomes visible-but-unsearchable
   again — the drift §22 and §23 exist to prevent.
2. **`resolvedClientSide` set but the field is absent from
   `resolvedClientSideRegister`.** See below.
3. **A surface with no searchable fields at all** — it would return nothing
   for every query.

### `resolvedClientSide` is a closed, audited set

It is the only escape hatch from (1), and therefore the only quiet route by
which a field could stop being searchable: set it, and the field emits no
branch while still claiming `searchable: true`.

So it is deliberately awkward to use:

- `reason` must be a member of `ResolvedClientSideReason` — a closed union,
  not free text, so "we could not make it work" cannot become a reason.
  Adding a member is a visible act in review.
- `justification` and `parameter` are required, not optional.
- The field must also appear in `resolvedClientSideRegister`, with an
  `ifRemoved` line stating what actually breaks without the hatch, and a
  `reviewed` date. That register is short by design: it is the list someone
  reads at manifest review and asks "is this still true?".

One entry today: `scans.scanType`, reason `localised-enum`. The value is
stored as an English enum and rendered as a translated label, so an `ILIKE` on
the stored value fails for a French user, an `ILIKE` on a label fails for an
English one, and a label table in the database would duplicate the i18n
dictionary and make adding a locale a migration.

## RLS is the sole tenant boundary

The generated functions carry no `p_organization_id` and no explicit
organization predicate. Both are deliberate: the boundary is each table's
row-level security policy, which applies to a `SECURITY INVOKER` function
exactly as it does to a direct select.

> **If any search function ever becomes `SECURITY DEFINER`, the explicit
> organization predicate returns to every branch in the same commit.**

Stated here, in the generator template, and in
`docs/search-perf-decisions.md`.

## From here to a migration

These files are not migrations. To ship one, copy the generated SQL into a
timestamped migration under `supabase/migrations/`. The generated file stays
as the golden record of what the manifest currently produces.
