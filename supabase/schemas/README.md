# supabase/schemas - the live schema, mirrored

This directory is a **mirror of the production database**, produced by:

```bash
npx supabase db pull --declarative
```

It is the authoritative source for every claim about indexes, RLS policies,
functions and table shapes. The repo's own migrations are not: the live
database has had 47 indexes against the 18 the migrations declared, and the
seven hottest tables were created in the dashboard and have no genesis
migration at all.

## Standing procedure

**After applying any migration to production, refresh this directory.**

```bash
npx supabase db pull --declarative
git add supabase/schemas/
git commit -m "chore(db): refresh schema baseline after <migration>"
```

A stale mirror is worse than no mirror: it looks authoritative while being
wrong, which is exactly the failure mode that made the FK index work
guesswork until this existed.

## Why --declarative rather than plain db pull

Plain `db pull` replays every migration into a shadow database to compute a
diff. That fails here at the earliest migration with `relation organizations
does not exist`, because the core tables have no genesis migration.

`--declarative` reads the current schema directly. It does not write to the
remote migration history (`remoteHistoryUpdated: false`), so it is safe to run
at any time and cannot disturb production.

## Known gap, tracked as P2

The eight dashboard-created core tables still have no genesis migration, so
shadow replay and fresh-environment provisioning do not work. Generating one
from this directory, timestamped before `20250101000000`, is the fix. Tracked
in `docs/perf-audit-2026-08.md` under finding I.1.

## Do not hand-edit

Nothing here is written by a human. Edits are overwritten by the next pull and
will not reach the database. To change the schema, write a migration.
