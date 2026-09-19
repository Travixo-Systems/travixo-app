# Displayed-field diff — the remaining six surfaces

**Block 7 step 3. Read-only inventory. No surface has been built.**

## Why this check exists

The manifest governs which fields are **searchable**. It says nothing about
which are **displayed**. Swapping a broad `select('*')` for a generated RPC
silently drops any rendered field the RPC does not return — and the RPC only
returns what someone remembered to list.

This nearly happened on Fleet: `vgp_status` is not a column, it is computed
server-side from the soonest live schedule, and it drives the compliance badge
on every row. It was not in the first generated output. Caught before
shipping, but only because the badge was noticed.

**Rule for every surface below: a field rendered today that the new RPC does
not return is a regression, searchable or not.**

---

## TEAM

### (A) Fetched today

`app/(dashboard)/team/page.tsx:225-229`:

```ts
.from('users')
.select('*')
.eq('organization_id', userData.organization_id)
.order('role', { ascending: true })
.order('created_at', { ascending: true });
```

**`select('*')`** — the pattern that hides regressions, because nobody has ever
had to enumerate what the page needs.

The `TeamMember` interface (`:51-61`) names: `id`, `email`, `first_name`,
`last_name`, `full_name`, `role`, `organization_id`, `created_at`,
`updated_at`.

### (B) Rendered

| field | where | note |
|---|---|---|
| `first_name`, `last_name` | `:97-101`, `:114-118` | initials avatar AND display name |
| `full_name` | `:103-108`, `:120-121` | fallback for both — the field the audit found unsearchable |
| `email` | `:659`, `:742`, and `:110`/`:123` as final fallback | |
| `role` | `:669`, `:736` | translated label via `t(\`team.role${...}\`)` |
| **`created_at`** | **`:673`** | `formatDateFR(member.created_at)` — "joined" column |
| **`updated_at`** | **`:676`** | `getRelativeTime(member.updated_at \|\| member.created_at)` — "last active" |
| `id` | `:717` | React key, and `:382` permission check |

### (C) Non-display logic

`id` (`:382` self-check), `role` (`:383-384` can-modify rules, `:254-256`
stat card counts), `organization_id` (scoping).

### DIFF — what a naive RPC would drop

Two at real risk, because neither is searchable and neither is obvious:

- **`created_at`** → the "joined" column blanks.
- **`updated_at`** → the "last active" relative time blanks, and it has a
  `|| created_at` fallback, so losing *both* degrades silently to nothing
  rather than erroring.

`full_name` is a third trap: it is a *fallback*, so a display-name RPC that
returns only `first_name`/`last_name` looks correct in testing (most users have
both) and fails only for the legacy rows that have neither.

**Not rendered, safe to omit:** `avatar_url`, `language` — present on the table
via `select('*')`, read nowhere on this page.

**Separate note:** the invitations list (`:845`, `:924`) comes from
`/api/team/invitations`, a different source. Not part of this surface's RPC.

---

## QR CODES

### (A) Fetched today

`components/assets/QRCodesPageClient.tsx:39-42`:

```ts
.from('assets')
.select('*, asset_categories(name)')
.eq('organization_id', userData.organization_id)
.order('created_at', { ascending: false })
```

Then reshaped (`:45-49`):

```ts
const mapped = (data || []).map((a: any) => ({
    ...a,
    category: a.asset_categories?.name || null,
    location: a.current_location || null,
}))
```

**The page renders the aliases `category` and `location`, not the underlying
`asset_categories.name` and `current_location`.** An RPC returning
`category_name` would satisfy the search manifest and still break this screen
unless the mapping is updated with it.

### (B) Rendered — in `BulkQRGenerator`

| field | where | note |
|---|---|---|
| `name` | `:273` table cell, `:148-150` PDF label (truncated at 20 chars) | |
| `serial_number` | `:274` cell, `:154-157` PDF label | |
| `category` (alias) | `:275` cell, `:52` CSV | |
| `location` (alias) | `:53` CSV | |
| **`qr_code`** | **`:95` the QR image itself, `:54` CSV, `:55` scan URL** | load-bearing: no `qr_code`, no QR code |
| `id` | `:259`, `:263`, `:268` | selection state |

### (C) Non-display logic

`id` only — row key and the `selectedAssets` Set.

### DIFF

- **`qr_code` is the product of this page.** It generates the image, the
  printable PDF label and the `/scan/{qr_code}` URL. Dropping it does not
  degrade the page, it empties it.
- **`category` / `location` are aliases.** The RPC's field names will not match
  what the component reads; the mapping must be updated in the same change.
- **Everything else on `assets` is unused here** — `purchase_price`,
  `current_value`, `is_demo_data`, `last_seen_at`, `description`,
  `archived_at`. `select('*')` fetches them all and renders none.

### Pre-existing defect, unchanged by this work

This page has **no search at all** and **no archived filter**: it loads every
asset in the org, including retired ones, so retired equipment gets printable
QR labels. Recorded in the inventory as B4, tier 2 (needs virtualisation as
well as search). Noting it here so the rewire does not silently inherit it.

---

## AUDITS LIST

### (A) Fetched today — `app/(dashboard)/audits/page.tsx:211-221`

```ts
.from('audits')
.select(`
  *,
  users:created_by ( full_name, email )
`)
.eq('organization_id', userData.organization_id)
.order('created_at', { ascending: false });
```

`*` expands to `id, organization_id, name, status, scheduled_date,
started_at, completed_at, total_assets, verified_assets, missing_assets,
created_by, created_at`. No `.limit()` or `.range()`.

### (B) Rendered, and the diff

| rendered | source | risk |
|---|---|---|
| `name` | column | low |
| `status` | column | must stay the **raw** enum — it drives the badge label, badge colour, bar colour, and which of three action buttons appears |
| `scheduled_date` | column | low; `formatDateFR` splits on `T` then `-`, so it needs the raw date string |
| **`users.full_name` / `users.email`** | **nested embed** | **HIGH.** A flat RPC loses the "Created by" column entirely and it falls to `'-'`. Needs explicit `created_by_full_name`/`created_by_email` in the return type |
| `total_assets`, `verified_assets`, `missing_assets` | columns | **all three required.** `missing_assets` is never rendered on its own — it appears only inside two computed expressions, which is exactly what makes it easy to drop |
| **`progress` (COMPUTED)** | `(verified + missing) / total` client-side, `:577-579` | **highest risk on this surface.** The `vgp_status` failure mode again: a derived value with no column. Drop `missing_assets` and the bar and `%` silently **under-report** rather than erroring |
| **"N of M assets" (COMPUTED)** | same three columns, `:696` | mobile-only, so desktop QA misses it |
| **stat cards (COMPUTED)** | `.filter().length` over the **unpaginated** array, `:229-234` | **HIGH.** The moment the query paginates, these four become counts of the current page, not the org. Produces plausible wrong numbers, not a crash |

**Fetched, never rendered here:** `started_at`, `completed_at`, `created_by`
(raw), `created_at` (sort only), `organization_id`. Safe to omit **for this
surface** — but `completed_at` IS rendered on the detail page.

### Two structural findings worth acting on before any rewire

1. **`GET /api/audits` is dead code.** Verified independently: the only call is
   `fetch('/api/audits', { method: 'POST' })` at `page.tsx:360`. Both audit
   pages query Supabase directly from the browser. **Swapping only the API
   route changes nothing on screen** — the page query is where a regression
   would land.
2. **The export is a PDF, not a CSV** (`export/route.ts:125-129`,
   `Content-Type: application/pdf`). It builds its joins by hand across three
   round-trips rather than using embeds, so it shares no shape with the page.

---

## AUDIT DETAIL / AUDIT ITEMS

### (A) Fetched today — `app/(dashboard)/audits/[id]/page.tsx:167-179`

```ts
.from('audit_items')
.select(`
  *,
  assets (
    id, name, serial_number, current_location,
    asset_categories (name)
  )
`)
.eq('audit_id', auditId);
```

No `.limit()` or `.range()` — **every item is loaded into the browser, and
every statistic on the page depends on that being the complete set.**

### (B) The diff

| rendered | source | risk |
|---|---|---|
| `audit.name` | column | also builds the PDF download filename (`:314`), so it must be raw |
| **`audit.completed_at`** | column | **medium, and sneaky.** Rendered only when `status === 'completed'` (`:400-404`), so a missing field is **invisible in any non-completed fixture**. Not rendered on the list page at all, so easy to omit from a shared shape |
| `item.assets.name` / `serial_number` / `current_location` | nested embed | rendered *and* the three search keys |
| **`item.assets.asset_categories.name`** | **doubly-nested embed** | **highest structural risk.** Two levels. An RPC that flattens one level will plausibly drop it, silently degrading the Category column to `'-'` on every row. It is **rendered but not searchable**, so a search-shaped RPC has no functional reason to include it — precisely what this check exists to catch |
| **`item.notes`** | column | **HIGH.** Rendered only in the Excluded section (`:699`), where it carries the exclusion reason. It is the sole payload of that section, and the only `audit_items` scalar rendered besides `status` |
| **`stats.*` (COMPUTED)** | `items.filter().length` over the full array, `:333-339` | **highest risk on this surface.** Four stat cards, the progress line, the excluded heading and three modal rows all derive from having every item in memory. Verified in the source. |
| **`progressColor` (COMPUTED)** | three-band derived status, `:346-348` | **the closest analogue to the `vgp_status` incident**: a derived status with no column, no name in the data layer, purely visual output |

### The trap if `audits`' stored counters are used as a substitute

They are **not** equivalent, and I verified the definitions differ:

- `stats.total` counts non-excluded items; `audits.total_assets` is the stored
  active count.
- `stats.missing` counts `status === 'missing'`; `completeAudit` (`:277`)
  counts `pending || missing`.
- The list page's progress uses stored columns; the detail page's uses live
  items with a different denominator. **The two screens can legitimately
  disagree today**, and an RPC-provided single `progress` would have to pick
  one and change at least one screen's numbers.

An RPC must therefore return **status-bucket counts computed server-side over
the whole audit**, not per page, and not borrowed from the `audits` row.

### PDF vs screen

The PDF renders `verified_at` per row (screen never shows it), uses the
**stored** counters and `scheduled_date`/`started_at` (screen shows recomputed
ones), includes `organizations.name`, and shows `notes` for every missing item
where the screen shows it only for excluded ones.

---

## VGP INSPECTIONS

### (A) Fetched today

The **screen** (`app/api/vgp/inspections/history/route.ts:49-70`) and the
**export** (`app/api/vgp/inspections/export/route.ts:56-74`) run two different
selects. That divergence is the finding:

| field | screen | export |
|---|---|---|
| `verification_type` | ✅ | ❌ |
| `observations` | ✅ | ❌ |
| `findings` | ❌ | ✅ |
| `certification_number` | ❌ | ✅ |

The CSV column headed **`Observations`** is populated from **`findings`**
(`export/route.ts:112` vs `:132`), while the screen's Observations cell comes
from `observations` (`page.tsx:305-306`). Already recorded as a defect in the
original audit; it becomes a *displayed-field* hazard here because **a reviewer
diffing CSV headers against screen columns would conclude `observations` is
already covered.** It is not.

### (B) The diff

| rendered | source | risk |
|---|---|---|
| `asset_name`, `asset_serial` | relation + **server-side flatten** (`history/route.ts:79-80`) | medium — not columns on the root table; need explicit join columns |
| **`asset_category`** | **two-level nested** `assets → asset_categories(name)` | **HIGH.** The root here is `vgp_inspections`, so it needs a **two-hop** join. Every generated precedent joins one level only |
| **`verification_type`** | root column | **HIGH** — already absent from the export select. If a shared query builder is modelled on the export, this visible column blanks |
| **`observations`** | root column | **HIGH** — same, plus the header-name trap above. Rendered twice: body text *and* the `title` tooltip |
| `result` | root column | drives badge label, badge colour class, **and** an inline mobile colour. If it becomes a `resolvedClientSide` filter param like `assets.status`, it must still be **returned** |
| `certificate_url` | root column | **nullability is load-bearing**: `null` selects the "no certificate" text. A `COALESCE(..., '')` in a generated SELECT turns every row into a broken link |
| **result count / pagination** | client `filteredInspections.length` | **HIGH** — becomes page size under server-side search. `total_count` exists in the template but must be wired |

Nothing on this surface is computed in SQL today, so there is no `vgp_status`
analogue — the derived values are all client-side (the `verification_type`
label map, `RESULT_CONFIG`, the count arithmetic).

---

## VGP SCHEDULES

This surface has the closest analogue to the `vgp_status` incident, and I
verified it directly.

### The derived status — highest risk anywhere in this document

`VGPSchedulesManager.tsx:85-91`:

```ts
function deriveStatus(nextDueISO: string): StatusFilter {
  const days = daysUntilDue(nextDueISO);
  if (days < 0) return 'overdue';
  if (days <= 30) return 'upcoming';
  if (days <= 90) return 'soon';
  return 'compliant';
}
```

Computed **client-side from `next_due_date` alone**. It feeds eight displayed
outputs: the table badge, the mobile badge, the mobile border colour, all four
stat-card counts, and the DetailsModal badge.

**Two traps, both verified:**

1. **Name collision.** `vgp_schedules.status` is a real column, selected today
   (`route.ts:92`), and **never rendered** — grep for `schedule.status`
   returns nothing. It holds `'active'`. A generated
   `RETURNS TABLE (… status text …)` selecting `vs.status` would emit
   `'active'` for every row, and the badge's `config[status]` lookup returns
   `undefined` → runtime crash on `.bg`. A manifest entry documented as "the
   schedule's status" would be *literally true and completely wrong*.
2. **Different scale from Fleet.** This has **four** buckets including `soon`
   (`days <= 90`); `search_assets.sql` computes **three**
   (`unknown`/`overdue`/`upcoming`/`compliant`, no `soon`). Reusing the Fleet
   expression would silently collapse a bucket the stat cards display.

### Stat cards need whole-dataset aggregation

The four counts iterate **every loaded row** (`:251-265`), which is why
`fetchAllSchedules` walks to exhaustion — and the comment at `:95-103` records
that a prior 100-row cap produced "overdue 100, upcoming 0". Server-side paging
breaks all four unless the RPC returns per-bucket counts.

Fleet solves this with separate `assets_status_counts` / `assets_category_counts`
RPCs. **This surface has no equivalent, and would need one.**

### Modal-only fields — the quietest losses

Verified as rendered only inside DetailsModal/ArchiveModal:

| field | line | why it is losable |
|---|---|---|
| `assets.qr_code` | `:871` | in no table column, no card, no search predicate — visible only after clicking the eye icon |
| `interval_months` | `:848`, `:939` | modal-only; **undocumented in the search inventory on either axis** |
| `last_inspection_date` | `:850-852` | modal-only **and** behind a truthiness guard, so its absence produces no error and no visual artefact — the row simply stops appearing |

### A date-type trap

`formatDateFR` uses `parseDateOnly`, which splits `YYYY-MM-DD` on `-` to parse
as **local** time deliberately. If an RPC returns `timestamptz` instead of
`date`, the split mis-parses an ISO datetime and **dates shift by a day**. A
type change alone is a display regression here.

### Two pre-existing gaps, not caused by this work

`inspector_name` (`:853-855`) and `created_by` (`:856-858`) are declared on the
client type and rendered behind guards, but **absent from the select** — so
they are always `undefined` and never appear. Flagged because the §9 field
additions may *restore* them, and restoring them means putting them in
`RETURNS TABLE`, not just in the manifest.

---

## Summary — what to carry into every surface build

Ranked by likelihood of shipping broken:

1. **VGP Schedules derived status** — client-computed, name-collides with a
   real unrendered column, four buckets where Fleet has three.
2. **Stat cards / result counts on four surfaces** (audits list, audit detail,
   schedules, inspections) — all assume an unpaginated fetch. Server paging
   turns them into page-local counts: plausible wrong numbers, not crashes.
3. **`audit_items.notes`** and **`audit.completed_at`** — both behind
   conditional renders, so absent fields are invisible in ordinary fixtures.
4. **Two-hop nested relations** (`asset_categories.name`) on inspections,
   schedules and audit detail — every generated precedent joins one level.
5. **Modal-only fields** — `qr_code`, `interval_months`,
   `last_inspection_date`, and audits' `users.full_name`.
6. **Type and nullability**: `certificate_url` null means "no certificate";
   `next_due_date` as `timestamptz` shifts every displayed date by a day.

**The manifest does not protect any of these.** It governs `RETURNS TABLE`
only indirectly, via the display columns passed to the generator — which is
exactly how `vgp_status` was nearly lost. Each surface build must diff its
rendered set against the generated return type before wiring.
