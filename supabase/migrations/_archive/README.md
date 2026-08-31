# Archived SQL

One-off scripts that were run against production and are kept only as a
record of what happened. **Do not re-run these** — they describe a state
the database has already moved past.

Live migrations stay in `supabase/migrations/`.

## 2026-08-19 / 2026-08-20 - anonymous access to `assets` and `scans`

A live RLS sweep found two tables readable (and one writable) by anyone
holding the public anon key, which ships in the client JS bundle:

- `assets` - 2,702 rows across 10 orgs, incl. `purchase_price`,
  `current_value`, `current_location`
- `scans` - 327 rows of movement history (310 named locations,
  6 GPS pairs, 311 user ids)

Root cause: three policies created by hand in the Supabase dashboard and
never committed, granting role `{public}` with `USING (true)`. Postgres
OR's permissive policies together, so these overrode every stricter policy
added later. `assets_update_public` also allowed **anonymous writes** -
verified by an anonymous rename attempt on a real row.

Fixed by, in order:

1. `20260819_assets_rls_and_public_scan_view.sql` - enable RLS, add
   org-scoped policies, add the `get_asset_by_qr` function the public
   scan page uses. **Still live - kept in `migrations/`.**
2. `_apply_rls_enable_only.sql` (archived) - re-ran just the
   `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` half, which had not
   taken effect on the first run.
3. `20260820_drop_permissive_public_policies.sql` - drop the three
   `USING (true)` policies plus two unconstrained INSERT policies on
   `scans`. **Still live - kept in `migrations/`.**

Verify current state at any time with:

    node scripts/verify-assets-rls.mjs

### Files here

- `_apply_rls_enable_only.sql` — superseded; its policy definitions are
  duplicated in the 20260819 migration, and the RLS it enabled is now on.
- `_diagnose_rls_state.sql` — read-only diagnostic that listed
  `pg_policies` and found the `USING (true)` policies. Kept because the
  query is a useful template for auditing RLS again later.
