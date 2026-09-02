# Working agreements

Conventions this project expects, kept in a **committed** file on purpose.

`AGENTS.md` and `CLAUDE.md` are gitignored (`.gitignore:91-92`) because
`next dev` regenerates them. That is fine for the Next.js block they own, but
anything written there by hand is one `git clone` away from gone. Durable rules
live here and are mirrored into `AGENTS.md` for tools that read it.

---

## Database schema

**`supabase/schemas/` is the authoritative source**, not
`supabase/migrations/`.

The migrations are demonstrably incomplete: the live database has carried 52
indexes against the 18 those migrations declared, and the seven hottest tables
(`assets`, `users`, `organizations`, `vgp_schedules`, `vgp_inspections`,
`scans`, `asset_categories`) were created in the dashboard and have no genesis
migration at all.

Practical consequences:

- **Never propose an index, policy or function change from the migrations
  alone.** Check `supabase/schemas/` first. Doing this once already prevented a
  duplicate index on `vgp_schedules.asset_id`, the hottest join in the app.
- **After any migration is applied to production, refresh the mirror:**

  ```bash
  npx supabase db pull --declarative
  git add supabase/schemas/
  git commit -m "chore(db): refresh schema baseline after <migration>"
  ```

  A stale mirror is worse than no mirror: it reads as authoritative while being
  wrong.

- Use `--declarative`, not plain `db pull`. The plain form replays every
  migration into a shadow database and currently fails at the earliest one with
  `relation organizations does not exist`. `--declarative` reads the live schema
  directly and does not touch remote migration history.

- **Granting a new function to `authenticated` is not enough.** Supabase
  default privileges (`supabase/schemas/public/default_privileges.sql`) grant
  `EXECUTE` on every new function in `public` to `anon` automatically, and
  `REVOKE ... FROM PUBLIC` does not undo it: PUBLIC and `anon` are different
  grantees. Every new function must also do
  `REVOKE EXECUTE ON FUNCTION ... FROM anon`.

  Verify against the refreshed mirror afterwards rather than trusting the
  migration text. This was missed once, on the assets-page functions: they were
  granted only to `authenticated`, and the live schema still showed
  `TO "anon", "authenticated", ...`. No data leaked, because they scope through
  `get_my_organization_id()` which is NULL without a session, but that is
  defence by predicate rather than by permission.

- Migration filenames must match `<14-digit timestamp>_name.sql`. Eight-digit
  date prefixes collide and make the remote ledger unmatchable.

See `supabase/schemas/README.md` for the same rule beside the files.

---

## Verifying work

- **Measure, do not estimate.** Payload sizes, row counts and bundle figures in
  the audit are measured against the live project or the real build. Anything
  that could not be measured is marked UNVERIFIED with the reason.
- **A non-zero error rate in a load run is the harness's fault until the
  failing requests are named.** Two consecutive runs produced plausible
  "the app is buckling" numbers that were both bugs in `load/`:

  1. 49% failures: k6 clears its cookie jar between iterations by default, so
     a VU that signed in once at `__ITER === 0` lost its session immediately
     after (`noCookiesReset`).
  2. 1.61% failures: login was gated on `__ITER === 0`, but a ramping executor
     starts and recycles VUs, so some began life at a non-zero `__ITER` and
     never authenticated at all.

  Both showed sign-in succeeding and `travixo_auth_failures` at zero while
  authenticated routes 401'd -- a signature that reads exactly like a broken
  app. `DEBUG=true` prints which request failed; use it before drawing any
  conclusion about the application.

- **A typecheck is not a test of a dynamic import.** Lazily loaded components
  fail at click time. The rental overlays on the public scan page gate real
  mutations (VGP compliance, rental state), so changes there are exercised in a
  browser against a real asset: checkout, then return, then confirm the rows.
- **Gates before implementation.** Substantial work carries a `GATES-*.md`
  ledger whose checks are runnable commands with a success-only token. Oracles
  live in a script (`load/gates/check.mjs`), not inline shell, because inline
  commands lose their regex escaping through `cmd.exe` and then fail for
  quoting reasons rather than real ones.

---

## Changes that need explicit approval

Show the diff or SQL and wait, rather than applying:

- Anything touching RLS policies
- The auth flow or `proxy.ts`
- The Stripe webhook
- Any client-side path that writes `organization_id`
- Every migration
- Every new dependency

Optimistic UI is for the mutations classified optimistic-safe in the audit
(rename, status label, category, notes, alert toggles), and always with
rollback plus a toast. Never for checkout/return, certificate upload, Stripe,
delete, or role change.

---

## Billing honesty

`converted_to_paid` means a customer paid. Only the Stripe webhook and
`admin_mark_paid` set it, and the latter requires a written reason and logs to
`admin_audit_log` with `source='admin_manual'` so a manual grant stays
distinguishable from a real conversion.

If an organization only needs more evaluation time, extend the pilot. Do not
mark it paid.

---

## Deleting test data from a demo org

A VGP inspection is not one row. Recording one writes to three places, so
removing one has to undo all three or the compliance dashboard starts lying:

1. the vgp_inspections row itself
2. vgp_schedules.next_due_date, .last_inspection_date and .status, which the
   inspection advanced
3. assets.status, but only when the result was failed

Delete the inspection FIRST, then revert the schedule. That order means a
failure part-way leaves a schedule pointing at an inspection that still
exists, rather than one that does not.

To find what to revert to, read the seeded pattern rather than inventing
values: vgp_alerts rows carry the due_date the schedule had when the alert
fired, and the other schedules in the org show the shape (status active,
last_inspection_date roughly next_due minus interval_months).

Afterwards, confirm the org is uniform again -- one schedule left at status
completed among hundreds of active ones is exactly the kind of residue a
prospect notices.
