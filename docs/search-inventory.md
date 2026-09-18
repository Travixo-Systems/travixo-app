# Search inventory — every surface where a user locates an existing record

**Block 1 of the search refactor. No code changed.**

Swept by behaviour, not by search bar, per the spec's closing requirement
(*"inventorier les recherches par comportement, pas seulement par page"* and
*"Do not interpret 'search surfaces' as pages containing a search bar"*).

Greps run: `filter(`, `includes(`, `toLowerCase().includes`, `searchTerm`,
`searchQuery`, `query`, `filteredItems`, `filteredClients`, `filteredAssets`,
`filteredUsers`, `filteredInspections`, `Combobox`, `Command`, `CommandInput`,
`Select`, `Autocomplete`, `Popover`, `Dialog`, `Modal`, `Drawer`, `Sheet`,
`<select`, plus every `.limit(`/`.range(` and every fetch with a hardcoded
cap.

**No headless combobox library is in use** (no `Combobox`, `CommandInput`,
`Autocomplete`, `Popover`, `Drawer` or `Sheet` anywhere in `app/` or
`components/`). Every selector is hand-rolled, so the `Combobox`-family greps
return nothing and the surfaces below were found by behaviour instead. That is
precisely the blind spot the spec predicted.

---

## A. Primary search surfaces (a visible search box)

| # | Surface | file:line | Scope | Fields searched | Displayed, not searched | Page size | Hard cap | Org scope from |
|---|---|---|---|---|---|---|---|---|
| A1 | Fleet / assets | `components/assets/AssetsPageClient.tsx:74,87,111` → `supabase/schemas/public/functions/assets_page.sql:47-53` | **server** (RPC) | `name`, `serial_number`, `description`, `current_location` | category name, status, QR code, purchase date, values, vgp_status | 50 | RPC clamps `LEAST(p_limit,200)` | `get_my_organization_id()` inside **SECURITY DEFINER** RPC |
| A2 | VGP schedules | `components/vgp/VGPSchedulesManager.tsx:222,278-282` | client array, but **fully paginated** (`fetchAllSchedules` walks to exhaustion, `:104-125`) | asset `name`, `serial_number`, `current_location`, category `name`, `notes` | inspector, QR code, regulatory reference/profile snapshot, created_by | 1000/fetch, all pages | server clamps limit ≤1000 (`app/api/vgp/schedules/route.ts:74-77`) | `resolveIdentity()` server-side |
| A3 | VGP inspections | `app/(dashboard)/vgp/inspections/page.tsx:90-91` | **client array over a capped fetch** | `asset_name`, `inspector_name` | **serial number**, category, `inspector_company`, `observations`, `verification_type`, certificate no. | 20 (display slice only) | **~1000 silent** (`app/api/vgp/inspections/history/route.ts` has no `.limit()`/`.range()`) | `resolveIdentity()` server-side |
| A4 | VGP inspections export | `app/api/vgp/inspections/export/route.ts:94-99` | server-side JS over a capped fetch | asset `name`, `inspector_name` | — (different column set from A3 entirely) | n/a (whole CSV) | **~1000 silent** (`:88` no limit) | `resolveIdentity()` server-side |
| A5 | Scans | `app/(dashboard)/scans/ScansPageClient.tsx:105-113` | **client array over 50 loaded rows** | asset `name`, `serial_number`, `location_name` | **who scanned** (`users` joined at `:61`, rendered `:279`), scan type, scanned_at | 50 (`:10` `PAGE_SIZE`) | **50 per load; "Load more" hidden while searching (`:293`)** | **RLS only** — no client-side org filter; policy `scans_select_same_org` |
| A6 | Clients | `app/api/clients/route.ts:38-42` | **server** (`.or()` + ilike) | `name`, `company` | **`email`**, **`phone`**, `notes` | none | `limit` clamped ≤100 (`:27`), no pagination UI | `users.organization_id` looked up server-side (`:17-21`) |
| A7 | Audits list | `app/(dashboard)/audits/page.tsx:394` | client array | `name` only | created-by, status, scheduled_date | none | unbounded fetch → ~1000 silent | `users.organization_id` server-side |
| A8 | Audit detail | `app/(dashboard)/audits/[id]/page.tsx:352-354` | client array | asset `name`, `serial_number`, `current_location` | category name (`:601`), exclusion notes (`:699`) | none | unbounded fetch → ~1000 silent | via audit row |
| A9 | Team | `app/(dashboard)/team/page.tsx:396-399` | client array | `displayName`, `first_name`, `last_name`, `email` | **`full_name` (only reachable when both names absent)**, `role` | none | unbounded fetch → ~1000 silent | `users.organization_id` server-side |

---

## B. Embedded search surfaces — selectors, modals, workflow pickers

These are the surfaces the original audit missed. The spec calls them
first-class.

| # | Surface | file:line | Scope | Fields searched | Displayed, not searched | Page size | Hard cap | Org scope from |
|---|---|---|---|---|---|---|---|---|
| B1 | **Checkout → "Sélectionner un client"** (the spec's screenshot case) | `components/rental/CheckoutOverlay.tsx:56-80,325` | **server** — hits `/api/clients` per keystroke, 300ms debounce (`:75-80`) | inherits A6: `name`, `company` only | `email`, `phone` shown in the picker rows but not searchable | **10** (`:60` `params.set('limit','10')`) | 10, **no "load more" in the picker** | inherits A6 |
| B2 | Checkout → duplicate-client pre-check | `components/rental/CheckoutOverlay.tsx:171-175` | server | same as A6 | — | 10 | 10 | inherits A6 |
| B3 | **Audit creation → asset exclusion picker** | `app/(dashboard)/audits/page.tsx:307,870-872` | client array, **no search box at all** | — (scroll only) | name, serial, location all rendered `:875+`, none searchable | renders all | **`.limit(500)`** (`:307`) | `users.organization_id` server-side |
| B4 | **QR codes → bulk label picker** | `components/assets/QRCodesPageClient.tsx:38-42` → `components/assets/BulkQRGenerator.tsx:238-281` | client array, **no search box at all** | — (scroll only) | name, serial, category, location all rendered, none searchable | renders all, unvirtualised | **unbounded fetch → ~1000 silent; archived included** | `users.organization_id` server-side |
| B5 | Audit scope → location dropdown | `app/(dashboard)/audits/page.tsx:257-265` | client array (distinct of fetched rows) | n/a (exact-match `<select>`) | — | all distinct | **unbounded fetch → ~1000 silent**, so distinct list is itself truncated | `users.organization_id` server-side |
| B6 | Audit scope → category dropdown | `app/(dashboard)/audits/page.tsx:272-276` | client array | n/a (exact-match `<select>`) | — | all | org-scoped, small | `users.organization_id` server-side |
| B7 | Fleet → category filter | `components/assets/AssetsPageClient.tsx:319` ← `assets_category_counts.sql` | server aggregate | n/a (exact-match `<select>`) | — | all | **counts include archived** while A1's status counts exclude them | `get_my_organization_id()` (SECURITY DEFINER) |
| B8 | Fleet → status filter | `components/assets/AssetsPageClient.tsx:295` ← `assets_status_counts.sql` | server aggregate | n/a | — | fixed enum | excludes archived (diverges from B7) | `get_my_organization_id()` (SECURITY DEFINER) |
| B9 | Admin → orgs list filters | `app/(admin)/admin/orgs/AdminOrgsListView.tsx:73-74` | client array | n/a — four `<select>` filters, **no text search** | org name, status, pilot, access | none | **unbounded fetch → ~1000 silent** (`app/(admin)/admin/orgs/page.tsx:31`) | super-admin scope |

---

## C. Exempt under §4 — small, fully-loaded, or not a record search

Listed so the exemption is an explicit decision, per §22/§23, not an omission.

| Surface | file:line | Why exempt |
|---|---|---|
| VGP schedule → regulatory profile `<select>` | `components/vgp/AddVGPScheduleModal.tsx:546-557` ← `app/api/vgp/regulatory-profiles/route.ts` | Fixed reference catalogue, loaded in full, org-independent. §4 permits *"une petite collection explicitement intégralement chargée"*. Revisit if the catalogue grows. |
| Asset status `<select>` (add/edit) | `components/assets/AddAssetModal.tsx:200-206`, `EditAssetModal.tsx` | Static enum, not database records. |
| Settings `<select>` controls | `app/(dashboard)/settings/**` | Preference enums, not record lookup. |
| `signup/page.tsx:166-171` `toLowerCase().includes` | — | Error-message matching, not search. Excluded from the sweep. |

---

## D. What this changes versus the original audit

The audit found 8 surfaces. This sweep finds **9 primary + 9 embedded = 18**,
plus 4 documented exemptions.

Newly surfaced, all of them record-locating UI with no search box:

- **B3 audit exclusion picker** — 500-row scroll to exclude one machine.
- **B4 QR bulk picker** — full fleet, unvirtualised, archived included.
- **B5 audit location dropdown** — the distinct-location list is built from a
  truncated fetch, so locations beyond the cap simply do not appear as
  options. A filter that silently cannot offer a valid value.
- **B9 admin orgs** — filters over a truncated fetch.

**B1 is better than the spec assumed.** The checkout client selector already
queries the server per keystroke with a 300ms debounce. Its failure is not
"filters a preloaded list" — it is that it inherits A6's defects (character
stripping, accent-blindness, no email/phone) and caps at 10 with no way to
page. The spec's §"Cas concret" diagnosis of *"charger N clients → rechercher
uniquement dans cette liste"* does not match this code; the bug is real but
the mechanism differs. Worth correcting before the fix is designed.

One aggravating detail in B1: the fetch swallows errors silently
(`CheckoutOverlay.tsx:66-68` `catch { /* Silent fail */ }`). A failed lookup
renders identically to "no such client" — the exact path to duplicate creation
that §"Sélection et création sont deux opérations distinctes" warns about.

---

## E. Facts that constrain blocks 2 and 3

- **Org scope is already server-derived everywhere.** No route accepts a
  caller-supplied `organization_id`. A1/B7/B8 use `SECURITY DEFINER` RPCs that
  derive org internally via `get_my_organization_id()`; the rest use
  `resolveIdentity()` or a server-side `users` lookup. The hard rule (no
  `p_organization_id`, ever) is compatible with the existing baseline.
- **Scans rely on RLS alone** — `ScansPageClient.tsx:53` applies no
  organization filter; the policy `scans_select_same_org`
  (`supabase/schemas/public/tables/scans.sql:30-37`) does the work via
  `EXISTS` on `assets.organization_id`. This is what makes scans a clean
  `SECURITY INVOKER` pilot: the tenant boundary already lives in the policy,
  not in the caller.
- **Supabase row cap is the default 1000** — no `max_rows` override in
  `supabase/config.toml`. Every "unbounded fetch" above truncates there.
- **No accent folding on any search path.** `normalize('NFD')` exists only at
  `components/assets/ImportAssetsModal.tsx:257`,
  `lib/import/categoryInference.ts:28`,
  `scripts/backfill-rental-client-ids.mjs:52` — all import paths. These are
  the duplicates block 2 will delete.
- **Debounce is copy-pasted at 300ms** in three places
  (`AssetsPageClient.tsx:87`, `VGPSchedulesManager.tsx:222`,
  `CheckoutOverlay.tsx:75`) and absent from A3, A5, A7, A8, A9. No shared
  hook exists.
- **Migration timestamps**: highest in use on any branch is
  `20260918160000` (`b1_checkout_asset_tenant_check`, on
  `fix/security-patch-a`, which is ahead of `origin/main`). Block 2 migrations
  must start at **`20260919000000`** or later to avoid collision.

---

## F. Field-level detail for the pilot surface (scans)

Block 3 implements `search_scans` only. Current state, for the contract:

**Searched today** (`ScansPageClient.tsx:107-110`): `assets.name`,
`assets.serial_number`, `scans.location_name`.

**Required by §10** — add: *personne ayant scanné* and *informations de scan
visibles pertinentes*.

Columns available on `scans` (`supabase/schemas/public/tables/scans.sql`) and
the joins the page already makes (`:59-62`):

| Field | Source | Visible | Searchable today | §10 requires |
|---|---|---|---|---|
| asset name | `assets.name` | yes (`:263`) | yes | yes |
| asset serial | `assets.serial_number` | yes (`:265`) | yes | yes |
| scan location | `scans.location_name` | yes (`:272`) | yes | yes |
| **scanned by** | `users.first_name`, `users.last_name` | yes (`:279` via `userName()`) | **no** | **yes** |
| scan type | `scans.scan_type` | yes (`:277` via `typeLabel()`) | no | "informations de scan visibles pertinentes" — decision needed |
| scanned_at | `scans.scanned_at` | yes | no | date filter, not text |
| notes | `scans.notes` | not rendered | no | not required |

`scan_type` is rendered as a **translated label** (`check`/`inventory`/
`checkout`/`return` → "Contrôle"/"Inventaire"/…), so searching the French
label cannot match the stored enum without a mapping. Flagging per §19's rule
(*"Il ne faut inventer aucun champ"*): this needs an explicit
`searchable: true/false` decision in block 3 rather than a silent choice.

---

## Proposed order for later blocks (not started)

Block 2 is the kernel; block 3 is scans only, per instructions. For reference,
the remaining surfaces rank by (user pain × spec weight):

A3/A4 inspections (silent 1000 truncation on a compliance record set, plus
export ≠ screen) → A6/B1 clients+selector (one fix serves both) → B3/B4
pickers with no search → A1 Fleet relational search (§5, the largest single
piece) → A7/A8/A9 → B5/B9.
