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

## INSPECTIONS, SCHEDULES, AUDITS, AUDIT ITEMS

Analysed separately; see the sections appended below.
