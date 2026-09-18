# Block 3.7 — LEAKPROOF and the InitPlan outlier

**Two measurement-only tests. No policy changed on any branch, no migration
written, no option chosen. All LEAKPROOF marks were reverted after measuring.**

---

## Your mechanism was right; mine was wrong

I had recorded: *"any RLS policy referencing a column defeats the index"*. That
was an inference from four data points and it does not survive testing.

The real mechanism: **under RLS the policy is a security qual, and Postgres
only pushes a user expression below a security barrier if every function in it
is `LEAKPROOF`.** `search_fold` wraps `lower()`; neither is leakproof, so the
trigram expression index can never be the access path under any real policy.
`USING (true)` worked because a trivially-true qual creates no barrier to sit
behind.

That theory predicts all four rows of the old table, including why the
literal-UUID policy was as blocked as the subquery one. Mine did not — it had
no account of why a constant comparison would block an index.

### The chain is worse than "search_fold is not leakproof"

```
proname          proleakproof
---------------  ------------
btrim            f
like             f
like_escape      f
lower            f
normalize        f
regexp_replace   f
textlike         f
texticlike       f
```

**Nothing in the path is leakproof** — not `lower`, not `btrim`, and critically
not the `~~` implementation (`textlike`) or `like_escape`. So marking
`search_fold` alone cannot work: the operator is itself a barrier.

---

## TEST 1 — `LEAKPROOF`

### Did the ALTER succeed?

**Locally, only as `supabase_admin`.** As `postgres` it fails:

```
ALTER FUNCTION public.search_fold(text) LEAKPROOF;
ERROR:  only superuser can define a leakproof function
```

```
rolname          rolsuper  rolbypassrls
---------------  --------  ------------
supabase_admin   t         t
postgres         f         t
service_role     f         t
authenticated    f         f
```

`postgres` — the role a Supabase customer is given — is **not** superuser.

### Is `proleakproof` true afterwards?

Yes, via `supabase_admin`: `search_fold → t`.

### Does the plan use the trigram index?

**Only when the whole chain is marked.** Isolated:

| marked LEAKPROOF | plan | time @50k assets |
|---|---|---|
| nothing (baseline) | Seq Scan | **279 ms** |
| `search_fold` only | Seq Scan | 279 ms |
| `textlike` + `like_escape` only | Seq Scan | 298 ms |
| **`search_fold` + `textlike` + `like_escape`** | **Bitmap Index Scan** | **4.3 ms** |

Under production's real four OR'd `assets` policies, verified byte-identical to
`supabase/schemas/`:

| | plan | time |
|---|---|---|
| before | Seq Scan | 279 ms |
| after | **Bitmap Index Scan on `idx_assets_serial_fold_trgm`** | **3.7 ms** |

**75× faster, with full RLS in force.** This is the fix for Fleet.

### Is `~~` leakproof on this PG17?

**No.** `textlike`, `texticlike`, `like` and `like_escape` are all
`proleakproof = f` by default. They must be marked too, which means altering
**`pg_catalog` functions** — a considerably larger claim than altering our own.

### `search_scans` did NOT improve

| | time @200k scans |
|---|---|
| not leakproof | 4,789 ms |
| leakproof | 4,840 ms |

Neutral, and I nearly misreported this. My first "after" reading was 4,840 ms
against a recorded 3,360 ms and looked like a regression caused by LEAKPROOF.
It was not: the earlier figure was taken with 5,000 assets and this run had
50,000. Re-measuring **not-leakproof on the identical dataset** gives 4,789 ms,
so the 10× larger `assets` table explains all of it.

Why scans does not benefit: its candidate branches build the pattern from
`unnest(string_to_array(...))`, and the index cannot be used from that shape
at all — with `enable_seqscan=off` pricing a scan at 4×10¹⁰ the planner
**still** chooses it. A CTE supplying a plain scalar *does* use the index
(0.24 ms), so this is about the set-returning function, not leakproofness.

That is a separate, fixable problem in the generator's branch template, and it
is not what this block was asked to change.

### Against production

**Cannot be attempted.** There is no direct Postgres connection in
`.env.local` — only REST credentials — and `ALTER FUNCTION ... LEAKPROOF` is
DDL that PostgREST does not carry.

Saying it plainly, as asked: **this fix works locally and will not work in
production.** Hosted Supabase gives `postgres`, which is not superuser, and
the `pg_catalog` alterations it additionally requires are platform-owned. A
local-only fix widens the gap between the two environments and is **not a
fix**.

If it were ever to land — via a Supabase support request, say — the honesty of
the mark is defensible for our own function: `normalize`, `regexp_replace`,
`lower` and `btrim` have no input-dependent error paths and no side channels.
What it *does* allow is the function running on rows the caller cannot see,
and that justification belongs in the migration as a comment. It does not
extend to marking `pg_catalog.textlike`, which is a platform decision.

---

## TEST 2 — the 1,364 ms outlier

Measured in the **harness only**. No policy changed anywhere else.

| policy form | plan | time @50k assets |
|---|---|---|
| `organization_id = get_my_organization_id()` | `Filter: (organization_id = get_my_organization_id())`, cost 866..15,157 | **363 ms** |
| `organization_id = (SELECT get_my_organization_id())` | `Filter: (organization_id = (InitPlan 1).col1)`, cost 0.26..1,540 | **137 ms** |

**2.65× faster, and the cost estimate falls ~10×.**

You were right that `STABLE` with no arguments *should* mean once per query.
It does not: Postgres treats a bare `STABLE` call in a qual as an ordinary
expression evaluated per row. Wrapping it in `(SELECT ...)` forces an InitPlan,
which is evaluated once and reused — visible in the plan as
`(InitPlan 1).col1`.

This is a well-known Supabase RLS pattern and it applies to **every** policy in
the schema written as a bare function call, not only `assets`.

**Handed over, not applied.** It is a policy change and belongs to the security
workstream; logged in `docs/db/rls-findings-for-security-workstream.md`.

---

## What this leaves

- **Fleet has a real fix (75×) that we cannot deploy.** The blocker is
  platform privilege, not our code.
- **The InitPlan rewrite is deployable and worth 2.65×**, but it is a security
  workstream change.
- **`search_scans` is unaffected by both** and is limited by the `unnest`
  shape in the generated branches — a template problem, fixable by us, not yet
  attempted.
- The four options from the Fleet spike are **not** revisited here, per
  instruction. They now need re-reading against these numbers: in particular
  "materialised search document" was attractive partly because it seemed the
  only way to get index usage, and that premise has changed.
