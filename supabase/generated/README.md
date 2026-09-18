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

A field marked `searchable: true` with no `sql` binding and no
`resolvedClientSide` explanation **fails the build**. It is not skipped.

Silently skipping is exactly how a field becomes visible-but-unsearchable
again — the drift §22 and §23 exist to prevent. `resolvedClientSide` is the
escape hatch, and it is mandatory to state it: `scan_type` uses it because the
value is stored as an English enum and rendered as a translated label, so
text-matching either would be wrong in one language.

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
