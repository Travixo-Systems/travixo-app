# TraviXO performance, scale and cost audit

**Date:** 2026-08-30
**Commit:** `d739b5e`
**Envelope:** 1,000 concurrent users (not registered users)
**Method:** read-only review of the working tree, plus a production `next build`
run locally for bundle measurement. No app code was changed.
**Load tool:** k6. Harness delivered in `load/` (see `load/README.md`).

## What was and was not verified

Everything in this report was read out of the code in this commit, not out of
`docs/`. Where a claim comes from a measurement, the measurement is named.

**Measured here:**

- Per-route JavaScript bundle sizes, from a real `next build` (Next 16.3.3,
  Turbopack) with the emitted chunks gzipped at level 9 and attributed back to
  routes through the prerendered HTML.
- Library behaviour, read from the installed packages in `node_modules`, not
  from documentation. In particular that `supabase.auth.getUser()` always
  issues a network request (`@supabase/auth-js@2.95.1`
  `dist/main/GoTrueClient.js:1265-1288`), which is the single most load-bearing
  fact in this report.
- Request counts and call graphs, traced by reading every route handler and
  every page.

**Not verified, marked UNVERIFIED where it matters:**

- **No database access.** This workspace has no Supabase credentials, so no
  `EXPLAIN ANALYZE` was run and no index list was retrieved. The repository is
  also not a source of truth here: `supabase/migrations/` contains a single
  pricing `UPDATE`, and `migrations/vgp-email-alerts-migration.sql` is the only
  DDL in the tree. Several migrations referenced in code comments
  (`20260819_assets_rls_and_public_scan_view.sql`,
  `20260820_drop_permissive_public_policies.sql`) are not in the repository at
  all. Every query-plan and index finding below is therefore a *prediction from
  the query shape*, and `load/sql/index-audit.sql` and
  `load/sql/explain-top-queries.sql` are the ready-to-run pack that settles
  them.
- **No load run.** There is no deployed preview reachable from here and no
  credentials for one. The harness was built and validated end to end against a
  local `next start` with a stubbed Supabase, so it runs and produces its
  report; the numbers it produces about *this* app are still to be taken.
- **Real payload sizes.** Byte counts below are computed from row shapes and
  are marked ESTIMATED. The harness measures them exactly, per endpoint, in its
  `avg wire KB` / `avg decoded KB` columns.

---

## Summary

| # | Area | P0 | P1 | P2 | Headline |
| --- | --- | --- | --- | --- | --- |
| 01 | Payload | 1 | 3 | 1 | Eight unpaginated list reads; `select('*')` on 14 endpoints |
| 02 | DB reads | 2 | 6 | 1 | One dashboard load is 22 round trips; 3 N+1 loops |
| 03 | DB writes | 1 | 5 | 2 | 9 round trips of gating before an inspection is written; no transaction |
| 04 | Dependencies | 2 | 3 | 1 | Signup blocks on Resend; webhook idempotency is a race |
| 05 | UI mutations | 0 | 3 | 2 | 10 optimistic-safe mutations block; every one refetches the whole list |
| 06 | Origin rendering | 2 | 2 | 1 | Public scan page is a client component; zero cache headers anywhere |
| 07 | Duplicate requests | 1 | 4 | 1 | `users.organization_id` read 4x per dashboard load |
| 08 | JS / runtime | 1 | 3 | 2 | `/assets` ships 547 KB gz; no `dynamic()` anywhere in the app |
| 09 | Connections | 2 | 3 | 1 | ~350 GoTrue req/s at the envelope; pooler size unknown |
| 10 | Cache | 2 | 2 | 1 | No `Cache-Control`, no ISR, no `revalidate` anywhere |
| 11 | Scalability | 1 | 2 | 1 | Cron has no `maxDuration` and is O(orgs) sequential |
| 12 | Cost | 0 | 1 | 0 | ~160 Supabase round trips and ~35 Vercel invocations per session |
| | **Total** | **15** | **37** | **14** | 66 findings |

Counts are derived from the severity tag on each subsection heading below, so
the table and the body cannot drift apart.

**The one-sentence version:** the app is architecturally a single-page client
that talks to Supabase directly from the browser, with an authentication check
that costs a network round trip and is repeated seven times per page load; at
1,000 concurrent users the binding constraint will be Supabase Auth request
volume and the connection pool, not application CPU.

---

# 01. Payload

Every route handler and every direct-from-browser query was inventoried. The
app has 41 route handlers and no server actions except
`app/(admin)/admin/orgs/[id]/actions.ts`.

## 01.1 Unpaginated list endpoints (P0)

Four endpoints return an entire tenant's table with no server-side limit.

| Endpoint | File | Bound |
| --- | --- | --- |
| Assets list | `components/assets/AssetsPageClient.tsx:86` | none |
| QR codes list | `components/assets/QRCodesPageClient.tsx:38` | none |
| Inspection history | `app/api/vgp/inspections/history/route.ts:40` | none |
| Inspections (raw) | `app/api/vgp/inspections/route.ts:68` | none |
| Compliance summary | `app/api/vgp/compliance-summary/route.ts:48` | none |
| Dashboard schedules | `app/(dashboard)/dashboard/page.tsx:118` | none |
| Dashboard rentals | `app/(dashboard)/dashboard/page.tsx:153` | none |
| Dashboard categories | `app/(dashboard)/dashboard/page.tsx:187` | none |

The assets list is the worst of these and the most-visited:

```ts
// components/assets/AssetsPageClient.tsx:86
const { data, error } = await supabase
  .from('assets')
  .select(`*, asset_categories (id, name), vgp_schedules (id, next_due_date, archived_at)`)
  .eq('organization_id', userData.organization_id)
  .order('created_at', { ascending: false })
```

Pagination exists but is entirely client-side
(`AssetsPageClient.tsx:174`, `itemsPerPage = 50`). So does search
(`:159`) and filtering (`:149`). A pilot org is capped at 400 assets
(`lib/billing/access-model.ts:89`) and Professional at 500, so the payload is
bounded today, but the bound is a billing constant, not an engineering one.

ESTIMATED payload: an asset row carries ~20 columns including a 36-character
`qr_code` and a ~60-character `qr_url`, plus two embedded relations. At ~700
bytes of JSON per row that is **~280 KB raw / ~30 KB gzipped for 400 assets**,
fetched twice per session (assets page, then again after every mutation, see
05.1). The harness measures the real figure.

**Fix direction:** add `.range()` driven by the existing page state, move
search and status filters into the query (`ilike`, `eq`), and return only the
columns the table renders. The table renders name, serial, status, location,
category and VGP status; it does not render `purchase_price`, `current_value`,
`description`, `qr_url`, `archived_by` or `updated_at`.

**Cost impact:** Supabase egress scales linearly with fleet size and with
mutation frequency. At 400 assets and ~8 list loads per session this is ~240 KB
gz of Supabase egress per session from this endpoint alone, against ~30 KB if
paginated to 50 rows with a narrow projection. **~8x reduction on the single
largest read in the product.**

## 01.2 `select('*')` on 14 endpoints (P1)

`select('*')` appears at `app/api/team/route.ts:45`,
`app/api/team/invitations/[id]/route.ts:66`,
`app/api/team/invitations/accept/route.ts:40`,
`app/api/audits/[id]/export/route.ts:36`,
`app/api/audits/[id]/notify-missing/route.ts:48`,
`app/api/clients/[id]/route.ts:32`,
`app/api/vgp/schedules/[id]/route.ts:139`,
`app/api/vgp/equipment-types/route.ts:16`,
`app/api/subscriptions/plans/route.ts:11`,
`app/api/subscriptions/route.ts:209`,
`app/(dashboard)/team/page.tsx:226`,
`app/(dashboard)/audits/[id]/page.tsx:159`,
`app/(dashboard)/assets/[id]/page.tsx:179`,
and `app/api/vgp/compliance-summary/route.ts:51`.

Two of these matter more than the rest:

- `app/api/vgp/compliance-summary/route.ts:48` selects `*` from every
  non-archived schedule *and* embeds assets and categories, then throws most of
  it away: the handler computes three counters and two arrays from the result.
- `app/api/vgp/report/route.ts:242` selects `inspection_date` from **every**
  inspection an org has ever recorded, purely to compute a min, a max and a
  count.

**Fix direction:** name the columns. For the two above, replace with SQL
aggregates (a Postgres view or an RPC returning the four counters).

**Cost impact:** the report metadata call alone reads O(all inspections) on
every visit to `/vgp/report`. At 3,000 inspections that is ~90 KB raw for three
numbers.

## 01.3 Excess returned on write (P1)

`app/api/assets/import/route.ts:160-170` returns every inserted row with every
column:

```ts
const { data: insertedAssets, error } = await supabase
  .from('assets').insert(assetsToInsert).select()
...
return NextResponse.json({ success: true, imported: insertedAssets.length, assets: insertedAssets })
```

The client uses `imported` only. A 400-row import returns ~280 KB the caller
discards.

Same shape at `app/api/vgp/inspections/route.ts:244` (returns the full
inspection plus the embedded asset; the client reads only `res.ok`, see
`app/(dashboard)/vgp/inspection/[id]/page.tsx:168-170`).

**Fix direction:** `.select('id')` or drop `.select()` and return the count.

## 01.4 Compression (P1, UNVERIFIED for the deployed origin)

`next.config.ts` sets six security headers and nothing about compression. Next
compresses HTML and route-handler responses by default when self-hosted; on
Vercel, compression is applied at the edge. But **Supabase egress is the larger
share here and it is not going through Vercel at all**: the assets list, the
dashboard's seven queries and the scan RPC all go browser to PostgREST
directly. Supabase does gzip PostgREST responses when the client sends
`Accept-Encoding`, which `@supabase/supabase-js` does.

What cannot be checked from here is whether Brotli is negotiated and what the
actual ratios are. The harness reports this exactly, per endpoint, in its
`uncompressed >1KB` and `no Content-Length` columns.

**Fix direction:** run `load/main.js -e PROFILE=smoke` and read the
`uncompressed >1KB` column. Any endpoint above 0% with a payload over a few KB
is shipping uncompressed bytes.

## 01.5 Fields returned versus consumed (P2)

Two concrete cases beyond 01.2:

- `app/(dashboard)/dashboard/page.tsx:153` fetches every active rental to
  compute two integers (`activeRentalCount`, `overdueReturns`), then
  `:164` issues a *second* query for the top three. Both counters are
  `count(*)` questions.
- `app/(dashboard)/dashboard/page.tsx:187` fetches `status`, `category_id` and
  the category name for every asset in the org to build a group-by that
  Postgres would do in one aggregate.

## 01.6 Positives (no finding)

`app/(dashboard)/scans/ScansPageClient.tsx:52-64` is correct: server-side
`.range()`, a named column list, and a date filter pushed into the query.
`app/api/clients/route.ts:27` caps `limit` at 100. `app/api/audits/route.ts:42`
uses `.range()`. These are the pattern the rest should follow.

---

# 02. DB reads

## 02.1 One dashboard load is 22 Supabase round trips (P0)

`/dashboard` is a client component (`app/(dashboard)/dashboard/page.tsx:1`), so
the HTML carries no data and everything is fetched after hydration. Counting
every network call to Supabase for one cold load:

| Origin | Calls | Detail |
| --- | --- | --- |
| `proxy.ts:118` | 3 | one per request the matcher covers: the document, `/api/settings/organization`, `/api/subscriptions` |
| `/api/settings/organization` | 3 | `getUser` + `users` + `organizations` |
| `/api/subscriptions` | 5 | `getUser` + `users` + `subscriptions` + `organizations` + `assets` count |
| `Sidebar.tsx:93-99` | 2 | `getUser` + `users` |
| `dashboard/page.tsx:63-192` | 9 | `getUser` + `users`+org, 3 counts, schedules, 2x rentals, assets+category |
| **Total** | **22** | of which **7 are `GET /auth/v1/user`** |

The seven auth calls are the important number. Verified against
`@supabase/auth-js@2.95.1`:

```js
// node_modules/@supabase/auth-js/dist/main/GoTrueClient.js:1265
async _getUser(jwt) {
  ...
  return await _request(this.fetch, 'GET', `${this.url}/user`, { ... });
}
```

`getUser()` has no local-verification path. Every call is an HTTP round trip to
GoTrue. At 1,000 concurrent users doing roughly one page load every 20 seconds,
that is **~350 GoTrue requests per second** purely to answer "who is this",
before a single row of business data is read.

**Fix direction, in order of payoff:**

1. Replace `getUser()` with `getClaims()` in the middleware and in the server
   guards. `getClaims()` exists in this version
   (`GoTrueClient.js:2789`) and verifies the JWT locally against cached JWKS
   with no per-request round trip. Keep `getUser()` only where the freshest
   server-side user record genuinely matters.
2. Render `/dashboard` as a server component and fetch its data in one
   `Promise.all` on the server. That removes the browser's `getUser` +
   `users` pair and collapses seven queries into one round trip from the
   function to the database.
3. Resolve `organization_id` once per request and pass it down, rather than
   four independent lookups (see 07.1).

**Cost impact:** 22 round trips to 4 is a **5.5x reduction in Supabase request
volume for the most-visited page in the app**, and removes ~350 req/s of
GoTrue load at the envelope.

## 02.2 The entitlement context is 7 round trips, including two `count(*)` (P0)

`lib/billing/entitlements.ts:43-117`:

```ts
const { data: { user } } = await supabase.auth.getUser();          // 1 network
const { data: userData } = await supabase.from('users')...         // 2
const [subResult, overrideResult, assetCount, userCount, orgResult]
  = await Promise.all([ ... ]);                                    // 3-7 (parallel)
```

The comment on line 42 says "5 parallel DB queries for performance", which is
true of those five but understates the total: it is seven round trips, two of
which are `count: 'exact'` (`:70`, `:74`). An exact count in Postgres is a full
scan of the matching rows under RLS; there is no shortcut.

`/api/subscriptions` (`app/api/subscriptions/route.ts:35-95`) does the same
work again in five *sequential* round trips, including its own
`count: 'exact'` on assets at `:85`. That endpoint is called on **every
dashboard route** because `PilotBanner` and `AccountLockedOverlay` both mount in
`app/(dashboard)/layout.tsx:20,22`, and again on the scan page
(`app/scan/[qr_code]/page.tsx:94`).

**Fix direction:** one RPC returning the whole entitlement context as a single
row; maintain `current_assets` as a counter column updated by trigger, or
accept `count: 'estimated'`. Cache the result per request with React `cache()`.

## 02.3 N+1: audit context on the scan page (P1)

`app/scan/[qr_code]/page.tsx:164-193`:

```ts
const { data: auditItems } = await supabase.from('audit_items')
  .select('id, status, audit_id').eq('asset_id', assetId)...

for (const item of auditItems) {
  const { data: audit } = await supabase.from('audits')
    .select('id, name, status, verified_assets, total_assets')
    .eq('id', item.audit_id)...
    .single()
  if (audit) { ...; return }
}
```

One query per audit item, from the browser, on the critical path of a QR scan.
This is the page a driver loads on a phone with a weak signal.

**Fix direction:** one query with an embed
(`audit_items?select=id,status,audits!inner(...)&audits.status=eq.in_progress`).

## 02.4 N+1: demo seeding (P1)

`lib/seed/demo-data.ts:70-96` loops the demo categories doing a `select` then
an `insert` per category: two round trips each. This runs inside
`POST /api/internal/post-registration`, which is fired from
`app/(dashboard)/dashboard/page.tsx:81` on **every dashboard load** while
`demo_data_seeded` is false. If seeding ever fails before line 169 sets the
flag, every subsequent dashboard load re-runs the whole thing *and* re-sends
the welcome email.

**Fix direction:** one `upsert` with `onConflict` for the categories; set
`demo_data_seeded` before the work, or guard the trigger with a dedicated
`demo_seed_attempted_at` column.

## 02.5 N+1: cron, once per organization (P1)

`app/api/cron/vgp-alerts/route.ts:316-327` and `:750-758` both loop
organizations issuing two queries each (`getOrgNotificationPrefs`,
`getAlertRecipients`), sequentially. At 1,000 organizations that is 2,000
sequential round trips in one function invocation, before any email is sent.

**Fix direction:** two batch queries before the loop
(`organizations?id=in.(...)`, `users?organization_id=in.(...)`), then group in
memory. The code already does exactly this for schedules at `:280`.

## 02.6 Repeated identical reads per render (P1)

`app/(dashboard)/audits/page.tsx` has three loaders, each of which independently
calls `auth.getUser()` and reads `users.organization_id`:
`fetchAudits` (`:197`, `:203`), `fetchLocationsAndCategories` (`:245`, `:248`)
and `fetchAssetPreviewCount` (`:285`, `:288`). Two fire on mount (`:186-187`),
the third on every scope change (`:190-192`).

`app/scan/[qr_code]/page.tsx` does the same twice: `checkAuth` (`:134`, `:138`)
and `checkActiveAudit` (`:152`, `:155`).

## 02.7 The VGP schedules list double-fetches every load (P1)

`components/vgp/VGPSchedulesManager.tsx:249`:

```ts
useEffect(() => { ...await fetchAllSchedules(...) }, [t]);
```

`t` is `createTranslator(language)` (`:733`), and `createTranslator` returns a
new closure on every call (`lib/i18n.ts:4150-4152`). `t` is created in the
parent on every parent render and passed down as a prop, so its identity changes
whenever `VGPSchedulesManager` re-renders.

`LanguageProvider` (`lib/LanguageContext.tsx:15-50`) guarantees at least one
such re-render: it sets `mounted` in a mount effect (`:25`), its context value
is a fresh object literal on every render (`:47`), and it is memoised nowhere.
So every consumer re-renders once after hydration, `t` changes identity, and
the effect re-runs.

`fetchAllSchedules` (`:105-126`) follows pagination until `has_more` is false at
`limit=1000`. The list is therefore fetched **twice** on every load of
`/vgp/schedules`, and each fetch is a `count: 'exact'` plus a 1,000-row page
with two embeds (`app/api/vgp/schedules/route.ts:99`).

**Fix direction:** memoise the context value in `LanguageProvider`
(`useMemo`), memoise `t` (`useMemo(() => createTranslator(language), [language])`),
and drop `t` from the effect's dependency array.

## 02.8 Full-scan shapes to confirm (P1, UNVERIFIED)

These queries will seq-scan unless a matching index exists. The repository does
not say whether one does.

| Query | File | Index it needs |
| --- | --- | --- |
| assets by org, ordered by `created_at` | `AssetsPageClient.tsx:86` | `(organization_id, created_at DESC)` |
| assets count where `archived_at IS NULL` | `dashboard/page.tsx:85` | partial on `(organization_id) WHERE archived_at IS NULL` |
| **scans in the last 7 days, no org filter** | `dashboard/page.tsx:107` | `(scanned_at DESC)`; see below |
| schedules by org, ordered by due date | `dashboard/page.tsx:118` | `(organization_id, next_due_date) WHERE archived_at IS NULL` |
| asset by `qr_code` | `get_asset_by_qr` RPC | unique on `(qr_code)` |
| inspections by org and date range | `report/route.ts:90` | `(organization_id, inspection_date DESC)` |

The scans count is the one to look at first:

```ts
// app/(dashboard)/dashboard/page.tsx:107 - note the absent organization filter
const { count: recentScans } = await supabase
  .from('scans')
  .select('*', { count: 'exact', head: true })
  .gte('scanned_at', sevenDaysAgo.toISOString())
```

It relies entirely on RLS for tenancy. That is correct for security but means
the planner sees a whole-table predicate on `scanned_at` with an RLS filter
applied on top. `scans` is the highest-insert table in the product (every QR
scan writes a row, `app/api/scan/update/route.ts:193`), so it will be the
largest, and this query runs on every dashboard load. Add
`.eq('organization_id', orgId)`, assuming `scans` carries that column. The
insert at `:181` does not set one, so it may not, in which case the fix is a
join or a denormalised column.

**Fix direction:** run `load/sql/index-audit.sql` section 2 (foreign keys with
no index) and section 4 (tables being seq-scanned), then
`load/sql/explain-top-queries.sql` under `set local role authenticated`. Without
the role set the plans will flatter the app, because RLS predicates are
frequently the reason a query that looks indexed still scans.

## 02.9 A query that always errors (P2)

`app/api/vgp/report/route.ts:148` filters `.eq("archived", false)` on
`vgp_schedules`. That table has no `archived` column: `types/database.ts:354-376`
lists `archived_at`, `archived_by` and `archive_reason`, and every other query
in the codebase uses `archived_at IS NULL`. PostgREST will return
`42703 column does not exist`, the handler ignores the error, and
`overdueSchedules` is `null`, so **the overdue section of the DREETS report is
always empty**. It also costs a round trip that can never succeed.

This is a correctness bug found while auditing performance; flagging it because
the DREETS report is a compliance artefact.

---

# 03. DB writes

Counts below are per user action, from the first line of the handler.

## 03.1 Record inspection: 9 round trips of gating, then 3 unwrapped writes (P0)

`app/api/vgp/inspections/route.ts:141-308`.

| Step | Line | Round trips |
| --- | --- | --- |
| `proxy.ts` auth | `proxy.ts:118` | 1 |
| `requireWriteAccess` | `:147` | 3 (`getUser`, `users`, `organizations`) |
| `requireVGPWriteAccess` -> `requireFeature` | `:151` | 3 (`getUser`, `users`, `has_feature_access` RPC) |
| `requireVGPWriteAccess` org read | `require-feature.ts:109` | 1 |
| `auth.getUser()` again for `performed_by` | `:155` | 1 |
| INSERT `vgp_inspections` | `:226` | 1 |
| UPDATE `vgp_schedules` | `:277` | 1 |
| UPDATE `assets` (on failure) | `:293` | 1 |
| **Total** | | **11 normally, 12 on a failed result; 9 of them are gating** |

Four of those gating calls are `GET /auth/v1/user` for the same user in the
same request. Two are the same `users.organization_id` read. One is an
`organizations` read that `requireWriteAccess` already performed.

The three writes are not in a transaction. If the schedule update fails the
code logs and continues (`:283-285`); if the asset update fails, same
(`:302-304`). A failed inspection can therefore leave the asset in service.

**Fix direction:** one `requireWriteAccess` that returns the entitlement
context and is reused by the feature gate; one RPC that performs all three
writes in a transaction, the way `checkout_asset` and `return_asset` already do
for rentals.

**Cost impact:** 11 round trips to 3 on the single most business-critical
mutation, and three of the four GoTrue calls go with them.

## 03.2 Checkout / return: correct at the database, expensive at the gate (P1)

`app/api/rentals/checkout/route.ts` and `return/route.ts` both delegate to an
RPC (`checkout_asset` at `:52`, `return_asset` at `:38`), which is the right
shape: one transaction, one round trip, atomic.

The gating around them is not. Checkout is:
`proxy` auth (1) + `requireWriteAccess` (3) + a **second** `auth.getUser()`
at `:14` (1) + a **second** `users` read at `:36` (1) + the RPC (1) = **7
round trips for one transaction**. Return is 6.

**Fix direction:** have `requireWriteAccess` return the user and the
organization it already fetched.

## 03.3 Excel import writes bypass the write gate entirely (P1)

There are two import paths.

`app/api/assets/import/route.ts` is gated (`requireWriteAccess` at `:102`) and
does a single batch insert at `:160`. Good shape, five round trips.

`components/assets/ImportAssetsModal.tsx:225-308`, the path the UI actually
uses, writes **from the browser straight to PostgREST**:

| Step | Line | Round trips |
| --- | --- | --- |
| `auth.getUser()` | `:231` | 1 |
| `users.organization_id` | `:234` | 1 |
| `asset_categories` select | `:259` | 1 |
| `asset_categories` insert | `:275` | 1 |
| `assets` insert (batched) | `:304` | 1 |

Five sequential round trips from the browser, no transaction (a failed asset
insert leaves orphan categories at `:275`), no `requireWriteAccess`, and no
asset-limit check. An expired pilot can still import through this path even
though `/api/assets/import` would refuse them, because RLS enforces tenancy but
knows nothing about the pilot window.

**Fix direction:** route the modal through `POST /api/assets/import`, which
already exists and is already gated. Move the category resolution server-side
into the same request.

## 03.4 Stripe webhook: 6 sequential writes, no transaction (P1)

`handleSubscriptionChange` (`app/api/stripe/webhook/route.ts:281-415`):
plan lookup (`:320`) -> existing-subscription lookup (`:357`) -> update or
insert (`:364`/`:371`) -> `markOrganizationConverted` (`:387`) or org update
(`:394`) -> `billing_events` insert (`:401`). Six round trips, none
transactional.

`handleSubscriptionDeleted` (`:417-462`) updates `subscriptions` at `:425`,
then looks up the starter plan at `:436`, then updates **the same
`subscriptions` row again** at `:445`. Two writes where one would do.

**Fix direction:** the existing-subscription lookup plus update-or-insert is an
`upsert` on `organization_id`. The two subscription updates in
`handleSubscriptionDeleted` merge into one once the plan id is fetched first.

## 03.5 Cron writes one row at a time (P1)

`app/api/cron/vgp-alerts/route.ts:438-456` inserts into `vgp_alerts` inside a
`for` loop, one statement per schedule. `:815-828` does the same for
`client_recall_alerts`. With `MAX_EMAILS_PER_RUN = 80` (`:20`) and a digest
covering many schedules, this is dozens to hundreds of sequential inserts per
run.

**Fix direction:** collect and `insert(rows)` once, as the same file already
does elsewhere.

## 03.6 Index audit (P1, UNVERIFIED)

Cannot be completed without database access. The candidate list is in
`load/sql/index-audit.sql` section 10, derived from the query shapes above;
section 2 of that file finds foreign keys with no supporting index, and section
3 finds indexes that have never been read.

One index is worth calling out because it is a correctness fix, not a
performance one:

```sql
CREATE UNIQUE INDEX CONCURRENTLY uq_billing_events_stripe_event
  ON billing_events (stripe_event_id);
```

See 04.4.

## 03.7 Sequential writes that should batch (P2)

`lib/seed/demo-data.ts:134-164` inserts two VGP schedules with two separate
statements; `:70-96` inserts categories one at a time.

## 03.8 A write with no bound (P2)

`app/api/assets/import/route.ts:127-130` reads the entire uploaded file into
memory and parses it synchronously with `XLSX.read`. There is no file-size cap,
no row cap, and `XLSX.read` is CPU-bound and blocking: on a Node runtime it
stalls the event loop for the whole isolate, so every other request sharing
that function instance waits. See 11.2.

---

# 04. Dependency chains

Dependencies in play: Supabase (auth, PostgREST, RPC), Stripe, Resend,
UploadThing, Sentry.

## 04.1 Signup: confirmation blocks on Resend (P0)

`app/(auth)/signup/page.tsx:122` -> GoTrue `signUp` (browser to Supabase) ->
email confirmation -> `app/auth/callback/route.ts:11` `exchangeCodeForSession`
-> `/confirm` -> `app/(auth)/confirm/page.tsx:137`
`rpc('create_organization_and_user')` -> `:116`
`POST /api/internal/post-registration`.

That last call is the problem:

```ts
// app/api/internal/post-registration/route.ts:48-53
// 4. Send welcome email (fire-and-forget, don't block confirmation)
const emailResult = await sendWelcomeEmail({ ... });
```

The comment says fire-and-forget; the code awaits. The request also awaits
`seedDemoData` (`:45`), which is 20+ round trips (02.4). A new user's
confirmation therefore blocks on Resend.

**P0. Fix direction:** the DB work commits, then the email is queued. On Vercel
that is `after()` from `next/server`, or a row in an outbox table the cron
drains. The seeding should move behind the same boundary.

## 04.2 Record inspection: upload before commit (P1)

`app/(dashboard)/vgp/inspection/[id]/page.tsx:133-166`:

```ts
if (selectedFile) {
  const uploadResult = await startUpload([selectedFile]);   // UploadThing, up to 4 MB
  ...
}
const res = await fetch('/api/vgp/inspections', { ... });   // only then
```

Strictly sequential: the certificate uploads to UploadThing, and only when that
resolves does the DB write begin. On depot wifi a 4 MB upload is the dominant
term in the user's wait, and the whole inspection is lost if the subsequent API
call fails after a successful upload (the file is orphaned in UploadThing,
paid for, referenced by nothing).

There is no timeout and no abort on `startUpload`. The same shape appears in
`components/vgp/AddVGPScheduleModal.tsx:224-227`: the inspection report uploads
to UploadThing, and only then does `POST /api/vgp/schedules` run.

**P1. Fix direction:** write the inspection first with
`certificate_status = 'pending'`, return, and attach the URL from
UploadThing's `onUploadComplete` callback (`app/api/uploadthing/core.ts:60`),
which already runs server-side and already has the metadata. That inverts the
dependency: the DB commit no longer waits on a third party.

The harness models the upload leg with `UPLOAD_DELAY_MS` so the reported
end-to-end latency stays honest.

## 04.3 Checkout: no third party on the path (no finding)

`app/api/rentals/checkout/route.ts`: Supabase only, one RPC, no third party.
This is the healthiest write path in the app.

## 04.4 Stripe webhook: idempotency is a check-then-act race (P0)

```ts
// app/api/stripe/webhook/route.ts:89-99
const { data: existing } = await supabase
  .from('billing_events').select('id').eq('stripe_event_id', event.id).single();
if (existing) return NextResponse.json({ received: true, duplicate: true });
```

The `billing_events` row is written at the *end* of processing
(`logBillingEvent`, `:225`). Between the check and the insert there is a window
of six round trips. Stripe retries on any non-2xx and can deliver the same
event concurrently. Two concurrent deliveries both read no row, both process,
both insert. The visible consequence is a duplicated conversion and duplicated
billing-event rows.

Whether the second insert fails depends on a unique constraint on
`stripe_event_id` that the repository does not prove exists. **UNVERIFIED**:
check with `load/sql/index-audit.sql` section 1.

**Fix direction:** insert the `billing_events` row *first* with
`ON CONFLICT (stripe_event_id) DO NOTHING` and treat "zero rows affected" as
the duplicate signal. Requires the unique index.

Also: no `maxDuration` is set on this route, and Stripe's delivery timeout is
short. Six sequential Supabase round trips plus a cold start can exceed it,
which produces a retry, which re-enters the same race.

## 04.5 VGP alert cron: no timeouts, no resumability (P1)

`app/api/cron/vgp-alerts/route.ts:866-896` runs `runVGPAlertsCron()` and then
`runClientRecallPass()` sequentially in one request, each sending emails
one at a time with `await` (`:419`, `:564`, `:801`).

Timeouts, retries, idempotency:

| Concern | State |
| --- | --- |
| Function timeout | **No `maxDuration`.** Vercel's default applies. See 11.1. |
| Resend retry | 2 attempts, fixed 2s sleep (`lib/email/email-service.ts:172-190`). No jitter, no cap on total time. |
| Resend timeout | **None.** No `AbortController`, no `signal`. A hung Resend hangs the cron until the platform kills it. |
| Idempotency | Partial. The cooldown map (`:296-301`) and `client_recall_alerts` dedup (`:718-732`) prevent most re-sends, but a run killed mid-way has already sent emails whose `vgp_alerts` rows were never written, so the retry re-sends them. |
| Circuit breaker | None. |
| Fallback | None. A Resend outage produces `result.errors` entries and an HTTP 207; nothing retries later. |

**P1. Fix direction:** `export const maxDuration = 300`; batch the sends
(Resend's batch endpoint takes up to 100); write the `vgp_alerts` row *before*
the send with `sent = false` and flip it after, so a killed run is resumable;
add an `AbortSignal.timeout(10_000)` to every Resend call; page the cron by
organization so one invocation cannot be O(all tenants).

## 04.6 Requests that block on a third party (P1)
would do (P1)

| Route | Blocks on | Line |
| --- | --- | --- |
| `POST /api/internal/post-registration` | Resend | `:49` |
| `POST /api/team/invitations` | Resend | `route.ts:217` |
| `POST /api/audits/[id]/notify-missing` | Resend | after `:96` |
| `POST /api/vgp/recall` | Resend | `:173` |
| `POST /api/vgp/report` | jsPDF (CPU, blocking) | `:175` |
| `POST /api/stripe/checkout` | Stripe API | `:123` |

All six should commit, return, and do the outward-facing work after. Only the
Stripe checkout genuinely needs the third party's answer before responding (it
returns the redirect URL).

## 04.7 Sentry (P2)

`app/providers.tsx:11-15` dynamically imports the Sentry client config in a
mount effect on every page. The module is 112.1 KB gzipped (measured, see 08.1)
and downloads on every page view regardless of `NODE_ENV`, because the
`enabled: false` check inside `Sentry.init` (`sentry.client.config.ts:12`)
happens after the module has already loaded. `tracesSampleRate: 0.1` is
sensible.

---

# 05. UI mutations

Every mutation in the app, classified.

| # | Mutation | Where | Class | Today |
| --- | --- | --- | --- | --- |
| 1 | Dismiss onboarding banner | `components/dashboard/OnboardingBanner.tsx:26` | optimistic-safe | **optimistic** |
| 2 | Edit asset (name, location, notes) | `components/assets/EditAssetModal.tsx:85` | optimistic-safe | blocks + full refetch |
| 3 | Add asset | `components/assets/AddAssetModal.tsx:74` | optimistic-safe (append) | blocks + full refetch |
| 4 | Restore archived asset | `components/assets/AssetsTableClient.tsx:60` | optimistic-safe | blocks + full refetch |
| 5 | Retire asset | `components/assets/RetireAssetModal.tsx:44` | must-wait | blocks |
| 6 | Delete asset | `components/assets/DeleteAssetDialog.tsx:32` | must-wait | blocks |
| 7 | Excel import | `components/assets/ImportAssetsModal.tsx:304` | must-wait | blocks |
| 8 | Create VGP schedule | `components/vgp/AddVGPScheduleModal.tsx:227` | optimistic-safe | blocks + full refetch |
| 9 | Edit VGP schedule | `components/vgp/EditScheduleModal.tsx:41` | optimistic-safe | blocks + full refetch |
| 10 | Archive VGP schedule | `components/vgp/VGPSchedulesManager.tsx:315` | optimistic-safe | blocks + full refetch |
| 11 | Record inspection | `app/(dashboard)/vgp/inspection/[id]/page.tsx:162` | must-wait (cert upload) | blocks |
| 12 | Generate DREETS PDF | `app/(dashboard)/vgp/report/page.tsx:167` | must-wait | blocks |
| 13 | Rental checkout | `components/rental/CheckoutOverlay.tsx:186` | must-wait | blocks |
| 14 | Rental return | `components/rental/ReturnOverlay.tsx:104` | must-wait | blocks |
| 15 | Scan status update | `app/scan/[qr_code]/page.tsx:353` | must-wait | blocks |
| 16 | Scan location update | `app/scan/[qr_code]/page.tsx:391` | optimistic-safe | blocks |
| 17 | Notification preferences toggles | `app/(dashboard)/settings/notifications/page.tsx:62-102` | optimistic-safe | staged, explicit save |
| 18 | Organization profile | `app/(dashboard)/settings/organization/page.tsx` | optimistic-safe | blocks |
| 19 | Branding colours | `hooks/useOrganization.ts:99` | optimistic-safe | blocks |
| 20 | Team role change | `app/(dashboard)/team/page.tsx:277` | must-wait | blocks |
| 21 | Remove team member | `app/(dashboard)/team/page.tsx:299` | must-wait | blocks |
| 22 | Invite team member | `app/(dashboard)/team/page.tsx:322` | must-wait (Resend) | blocks |
| 23 | Verify asset in audit | `app/scan/[qr_code]/page.tsx:204` | optimistic-safe | **optimistic** (`:215`) |
| 24 | Audit item status | `app/(dashboard)/audits/[id]/page.tsx:200-293` | optimistic-safe | blocks |
| 25 | Stripe checkout | `hooks/useSubscription.ts:159` | must-wait | blocks |
| 26 | Stripe portal | `hooks/useSubscription.ts:180` | must-wait | blocks |

**Optimistic-safe and currently blocking: 10 of 26** (#2, #3, #4, #8, #9, #10,
#16, #18, #19, #24). Two more are optimistic-safe and already handled well:
#1 and #23 update local state first. #17 is a third pattern, a staged form with
an explicit Save, which is a reasonable choice for a preferences screen and
needs no change.

## 05.1 Every mutation refetches the entire list (P1)

The dominant pattern is `mutate -> await -> onSuccess() -> reload everything`:

```ts
// components/assets/AssetsTableClient.tsx:60-77
const { error } = await supabase.from('assets').update({...}).eq('id', asset.id)
...
onRefresh?.()   // -> AssetsPageClient.loadAssets() -> the full unpaginated query
```

`onRefresh` is `loadAssets` (`AssetsPageClient.tsx:249,251,370`), which re-runs
`auth.getUser()` + the `users` lookup + the entire assets query with both
embeds. Renaming one asset costs three round trips and re-downloads the whole
fleet.

Same shape for VGP schedules: `VGPSchedulesManager.tsx` `onSuccess` re-runs
`fetchAllSchedules`, which pages through everything at `limit=1000`.

**Fix direction:** patch the row in local state from the mutation's own
response instead of refetching. Where a refetch is genuinely needed, refetch
the page, not the table.

**Cost impact:** a depot doing 20 status edits in a session currently issues 20
full-fleet reads. At ~30 KB gz each that is ~600 KB of avoidable Supabase
egress per session, and 60 avoidable round trips.

## 05.2 Optimistic-safe mutations that spin (P1)

The ten listed above are all cases where the server cannot plausibly refuse
(the user has already passed the write gate, the value is free-text or an enum,
and the failure mode is "put it back and show a toast"). #2, #4, #16 and #24 in
particular are single-field updates behind a full-screen wait.

`#23` shows the right pattern already exists in the codebase
(`app/scan/[qr_code]/page.tsx:215-219`): update local state, fire the request,
revert on error.

**Fix direction:** TanStack Query is already installed and configured
(`app/providers.tsx:17`). `useMutation` with `onMutate` / `onError` rollback is
the idiomatic fix and needs no new dependency.

## 05.3 Must-wait mutations correctly identified (P1, no change needed)

#5, #6, #7, #11, #12, #13, #14, #15, #20, #21, #22, #25, #26 all correctly
block. Two notes:

- #13/#14 (checkout/return) can return 409 `already_rented`
  (`app/api/rentals/checkout/route.ts:75`), so they genuinely must wait.
- #15 (scan status) can be refused for a cross-org asset
  (`app/api/scan/update/route.ts:110`), so it must wait; #16 (location) cannot,
  and is safe to make optimistic.

## 05.4 Debounce and abort (P2)

`VGPSchedulesManager.tsx:222-225` debounces search at 300ms and
`:211,234-236` aborts in-flight fetches. That is the correct pattern and it is
used in exactly one place. `AssetsPageClient.tsx:284` filters on every keystroke
against in-memory state, which is fine today only because the whole table is
already in memory. The moment the list is paginated server-side (01.1) it will
need the same debounce and abort.

## 05.5 No mutation shows what it will cost (P2)

`POST /api/vgp/report` can take seconds (04.6, 08.4). The button at
`app/(dashboard)/vgp/report/page.tsx:168` shows a spinner with no progress and
no timeout.

---

# 06. Origin rendering

The build output classifies 26 routes as static (`○`) and 22 as dynamic (`ƒ`).
The static ones are static in the trivial sense: they are client components
whose prerendered HTML contains no data.

| Route | Build | Should be | Gap |
| --- | --- | --- | --- |
| `/` | STATIC | STATIC | ok |
| `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/check-email` | STATIC | STATIC | ok |
| `/scan/[qr_code]` | DYNAMIC | **CACHEABLE** | P0, see 06.1 |
| `/dashboard` | STATIC shell | PERSONALIZED | P0, see 06.2 |
| `/assets`, `/assets/[id]` | STATIC shell / DYNAMIC | PERSONALIZED | P1 |
| `/vgp`, `/vgp/schedules`, `/vgp/inspections`, `/vgp/report` | STATIC shell | PERSONALIZED | P1 |
| `/audits`, `/audits/[id]` | STATIC shell / DYNAMIC | PERSONALIZED | P1 |
| `/clients`, `/clients/[id]` | STATIC shell / DYNAMIC | PERSONALIZED | P1 |
| `/team`, `/settings/*` | STATIC shell | PERSONALIZED | P2 |
| `/qr-codes`, `/scans` | STATIC shell | PERSONALIZED | P1 |
| `/api/subscriptions/plans` | DYNAMIC | **CACHEABLE** | P1, see 06.3 |
| `/api/vgp/equipment-types` | DYNAMIC | **CACHEABLE** | P1, see 06.3 |
| `/api/health` | DYNAMIC | REAL-TIME | ok |
| `/api/stripe/webhook`, `/api/cron/vgp-alerts` | DYNAMIC | REAL-TIME | ok |

## 06.1 The public scan page is a client component (P0)

`app/scan/[qr_code]/page.tsx:1` is `'use client'`. For a QR sticker on a
machine in a depot this is the wrong shape in every dimension:

- The HTML carries no asset data. The phone downloads ~266 KB gz of JavaScript
  (the shared shell, 08.1) before it can even ask what the machine is.
- The asset then arrives via an RPC round trip (`:250`), after hydration.
- Nothing is cacheable: no CDN can serve a scan, because there is nothing to
  serve but an empty shell.
- A signed-in scan adds four more auth round trips and an N+1 (02.3, 02.6).

The RPC `get_asset_by_qr` was deliberately built to return only display-safe
columns (`:31-46`), which means the payload is already safe to cache.

**Fix direction:** make it a server component that calls `get_asset_by_qr`
during render and returns HTML with the asset already in it, then hydrate only
the interactive parts (status form, checkout overlay) as client islands. Cache
the document with a short `s-maxage` and `stale-while-revalidate`; the fields
shown (name, serial, category, location, status) change on the order of hours,
not seconds, and the page already shows `last_seen_at` as an explicit
freshness marker.

**Cost impact:** turns the most-scanned page in the product from "one Vercel
invocation plus one Supabase RPC per scan" into "a CDN hit for the common
case". At 6 scans per session across 1,000 sessions that is ~6,000 invocations
and ~6,000 Supabase calls removed per 1,000 sessions, plus a first-paint that
does not depend on the phone's signal.

## 06.2 Every authenticated page is a client-side data fetch (P0)

`app/(dashboard)/layout.tsx` is a server component but does no data fetching;
all three of its children (`Sidebar`, `PilotBanner`, `AccountLockedOverlay`)
and `ThemeProvider` fetch from the browser after hydration. Consequence:

- Three HTTP requests to the app plus two direct Supabase calls before the page
  component runs.
- The waterfall is document -> JS -> hydrate -> auth -> org -> data. Four
  serial network legs before the first number appears on screen.
- Nothing can be streamed, because nothing is rendered on the server.

**Fix direction:** fetch in the server component and pass data down. The layout
already has cookie access via `lib/supabase/server.ts`. React's `cache()`
deduplicates the org lookup across the layout and the page within one request,
which fixes 07.1 as a side effect.

## 06.3 Static reference data served dynamically, uncached (P1)

`/api/subscriptions/plans` (`app/api/subscriptions/plans/route.ts:9`) returns
`subscription_plans`: four rows that change when pricing changes, which per
`supabase/migrations/20260710_pricing_full.sql` is roughly annually.

`/api/vgp/equipment-types` (`app/api/vgp/equipment-types/route.ts:14`) returns
a reference table with no organization filter at all. It is nonetheless behind
`requireFeature`, which costs three round trips including a GoTrue call, to
serve data that is identical for every tenant.

Neither sets a cache header.

**Fix direction:**
`return NextResponse.json(data, { headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' } })`,
and drop the feature gate from `equipment-types` (it gates nothing: the data is
not tenant-scoped).

## 06.4 No ISR, no `revalidate`, no cache headers anywhere (P1)

Grepping the whole app for `revalidate`, `unstable_cache`, `Cache-Control` and
`s-maxage` finds exactly two hits, both `revalidatePath` in the admin server
actions (`app/(admin)/admin/orgs/[id]/actions.ts:66,99`). No route handler sets
a single response header. See area 10.

## 06.5 Vercel configuration (P2)

`vercel.json` contains one cron entry and nothing else: no `functions` block,
no `maxDuration`, no `memory`, no `regions`. `next.config.ts` sets security
headers only. Combined with the absence of `export const maxDuration` anywhere
(only `runtime` and `dynamic` are set, in four files), every function runs on
the platform default.

---

# 07. Duplicate requests

Counted per page load, cold cache, authenticated.

## 07.1 `users.organization_id` is read four times per dashboard load (P0)

The same row, for the same user, in the same page load:

1. `app/api/settings/organization/route.ts:28` (via `ThemeProvider`)
2. `app/api/subscriptions/route.ts:47` (via `PilotBanner`)
3. `components/Sidebar.tsx:95`
4. `app/(dashboard)/dashboard/page.tsx:67`

Plus `auth.getUser()` seven times (02.1).

On `/assets` it is three times; on `/audits` it is three times within one page
component alone (02.6); on `/scan/[qr]` signed in, twice (02.6).

**Fix direction:** server-side, wrap the lookup in React `cache()` so it is
deduplicated per request. Client-side, put it in one TanStack Query key.
`useOrganization` already demonstrates the pattern and is already deduplicated
across `PilotBanner` and `AccountLockedOverlay`.

## 07.2 Request count per page load (P1)

| Page | Browser HTTP requests | Supabase round trips | Of which GoTrue |
| --- | --- | --- | --- |
| `/dashboard` | 13 | 22 | 7 |
| `/assets` | 6 | 14 | 5 |
| `/qr-codes` | 4 | 12 | 4 |
| `/vgp/schedules` | 7 (double-fetched, 02.7) | ~20 | 6 |
| `/scan/[qr]` anonymous | 3 | 4 | 0 |
| `/scan/[qr]` signed in | 5 | 13 | 4 |
| `/audits` | 3 | 11 | 4 |

Anonymous scans are cheap on auth because `getUser()` short-circuits without a
session: `_useSession` returns `AuthSessionMissingError` before issuing the
request (`GoTrueClient.js:1280-1282`). Every authenticated path pays in full.

## 07.3 Refetch-on-mount and refetch-on-visibility (P1)

`app/(dashboard)/audits/[id]/page.tsx:138-146` refetches the entire audit and
all its items on every `visibilitychange` to visible, with no staleness check.
Alt-tabbing repeatedly re-reads the whole audit.

`refetchOnWindowFocus` is correctly disabled globally
(`app/providers.tsx:21`), so this is a one-off that reintroduces the behaviour
by hand.

## 07.4 The VGP schedules double-fetch (P1)

Covered in 02.7. It is listed here too because it is the clearest duplicate
request in the app: the same paginated list, fetched twice, on every load.

## 07.5 Duplicate reads inside one handler (P1)

`app/api/scan/update/route.ts` reads the same asset row twice: `:99` (for the
cross-org check) and `:119` (for the QR match). The first select could return
`qr_code` and `archived_at` too and serve both purposes.

## 07.6 Polling and realtime (P2, no issue)

There is no `setInterval`, no `refetchInterval`, and no Supabase realtime
subscription anywhere in the app. The only `subscribe` is
`onAuthStateChange` in `lib/LanguageContext.tsx:32`, which is correct and
unsubscribes on unmount (`:38`). Nothing to fix; noting it because it is a
common source of load that this app does not have.

---

# 08. JavaScript and runtime

All numbers below are measured from a production `next build` at commit
`d739b5e` (Next 16.3.3, Turbopack). "Initial JS" is every `<script src>` the
prerendered HTML references, gzipped at level 9.

## 08.1 Per-route bundle (MEASURED, no finding)

| Route | Initial JS (gz) | Raw | Delta vs shell |
| --- | --- | --- | --- |
| **`/assets`** | **546.9 KB** | 1,854.8 KB | +280.5 KB |
| **`/qr-codes`** | **431.6 KB** | 1,412.5 KB | +165.2 KB |
| `/settings/organization` | 312.9 KB | 1,053.1 KB | +46.5 KB |
| `/settings/profile` | 312.9 KB | 1,049.7 KB | +46.5 KB |
| `/vgp/inspections` | 299.0 KB | 1,004.8 KB | +32.6 KB |
| `/vgp/schedules` | 297.5 KB | 1,002.2 KB | +31.1 KB |
| `/team` | 296.8 KB | 1,005.3 KB | +30.4 KB |
| `/audits` | 296.4 KB | 999.2 KB | +30.0 KB |
| `/dashboard` | 296.0 KB | 993.1 KB | +29.6 KB |
| `/vgp/report` | 295.6 KB | 995.8 KB | +29.2 KB |
| `/clients` | 295.0 KB | 989.6 KB | +28.6 KB |
| `/vgp` | 293.6 KB | 986.1 KB | +27.2 KB |
| `/scans` | 293.1 KB | 981.0 KB | +26.7 KB |
| `/signup` | 267.3 KB | 896.9 KB | +0.9 KB |
| **`/login` (shared shell)** | **266.4 KB** | 892.5 KB | baseline |
| `/` | 166.3 KB | 540.3 KB | - |

Plus **112.1 KB gz of Sentry**, loaded asynchronously on every page from
`app/providers.tsx:12`, not counted in the figures above.

The largest single chunks, identified by content sniffing:

| Chunk | gz | Raw | Contains | Loaded by |
| --- | --- | --- | --- | --- |
| `3k11dvvcax7ti.js` | 132.6 KB | 416.8 KB | jsPDF | `/qr-codes` |
| `0spl5fwmkrd82.js` | 119.9 KB | 370.2 KB | xlsx (SheetJS) | `/assets` |
| `1-i5lm9hhvlxg.js` | 112.1 KB | 333.5 KB | Sentry | every page (async) |
| `01u6nje31dwg3.js` | 86.5 KB | 352.5 KB | Headless UI | `/assets` |
| `3dqc3c7bdfqch.js` | 71.5 KB | 228.8 KB | react-dom | shell |
| `1xs1yfm78y14r.js` | 53.4 KB | 199.7 KB | @supabase | shell |
| `21derrrzd06tm.js` | 22.7 KB | 79.1 KB | i18n | shell |

## 08.2 Full-library imports, none of them lazy (P0)

**There is not one `next/dynamic` or `React.lazy` in the entire application.**
Grepping `app/`, `components/` and `lib/` finds four `await import()` calls,
all server-side in the cron and recall routes.

The two that cost the most:

```ts
// components/assets/ImportAssetsModal.tsx:8
import * as XLSX from 'xlsx'
```

`ImportAssetsModal` is imported eagerly by `ImportAssetsButton`
(`components/assets/ImportAssetsButton.tsx:5`), which is rendered
unconditionally on `/assets` (`AssetsPageClient.tsx:249`). Every visitor to the
assets page downloads 119.9 KB gz of spreadsheet parser whether or not they
ever click Import.

```ts
// components/assets/BulkQRGenerator.tsx:5-6
import QRCode from 'qrcode'
import { jsPDF } from 'jspdf'
```

`BulkQRGenerator` is imported eagerly by `QRCodesPageClient`
(`components/assets/QRCodesPageClient.tsx:6`). 132.6 KB gz of PDF library on
page load, used only when the user actually generates a sheet.

**Fix direction:**

```ts
const ImportAssetsModal = dynamic(() => import('./ImportAssetsModal'), { ssr: false })
```

and the same for `BulkQRGenerator`. Better still, move the `xlsx` parse to the
server: `app/api/assets/preview-import/route.ts` already parses uploaded
workbooks server-side, so the client copy is redundant.

**Cost impact**, from the measured chunk sets:

| Change | `/assets` | `/qr-codes` |
| --- | --- | --- |
| today | 546.9 KB gz | 431.6 KB gz |
| lazy `ImportAssetsModal` only | 427.0 KB (-22%) | unchanged |
| lazy `BulkQRGenerator` only | unchanged | 299.0 KB (-31%) |
| lazy every modal and the QR generator | **~290 KB (-47%)** | **~290 KB (-33%)** |

The last row is the one to aim for. All six `@headlessui/react` consumers are
asset modals (`AddAssetModal`, `EditAssetModal`, `DeleteAssetDialog`,
`RetireAssetModal`, `ViewQRModal`, `ImportAssetsModal`), every one of them
opens on a click, and Headless UI is 86.5 KB gz that appears on `/assets` and
nowhere else. Making all of them dynamic brings both routes down to
approximately the `/dashboard` baseline of 296 KB.

On a depot 4G connection at ~1.5 Mbps effective throughput, the ~257 KB saved
on `/assets` is roughly 1.4 seconds of first load.

## 08.3 The translation file ships twice over (P1)

`lib/i18n.ts` is 4,152 lines and 116 KB of source, structured as one object
containing **both** languages:

```ts
export const translations = {
  vgpDashboard: { pageTitle: { en: "VGP Compliance", fr: "Conformité VGP" }, ... }
```

It is imported by `LanguageProvider`, which sits in the root layout
(`app/layout.tsx:44`), so it is in the shared shell of every route including
`/login` and `/scan/[qr]`. Measured: 22.7 KB gz, 79.1 KB raw. Every user
downloads the French strings and the English strings, and uses one set.

The default language is French (`lib/LanguageContext.tsx:16`); English is
opt-in via localStorage.

**Fix direction:** split into `fr.ts` and `en.ts` and load one. Roughly 11 KB gz
off every route in the app, including the public scan page.

## 08.4 Synchronous CPU work inside request handlers (P1)

Two places do blocking, CPU-bound work on the request path:

- `app/api/vgp/report/route.ts:175` calls `generateVGPReport`, which is
  synchronous jsPDF + jspdf-autotable (`lib/pdf-generator.ts:1-2`). For a
  12-month report over hundreds of inspections this is seconds of pure CPU with
  no yield. On a Node runtime that stalls the event loop for the whole isolate:
  every other request assigned to that instance waits behind it.
- `app/api/assets/import/route.ts:128` calls `XLSX.read` on the whole uploaded
  buffer, synchronously, with no size cap (03.8).

At the 1,000-user envelope these are the two endpoints most likely to produce a
latency cliff that looks like a database problem but is not. The
`write_contention` and `dep_degrade` profiles in the harness are built to
surface exactly this.

**Fix direction:** move PDF generation out of the request (generate to storage,
return a URL, notify when ready), or at minimum set
`export const maxDuration` and cap the date range. Cap the import file size and
row count.

## 08.5 Unnecessary client components (P1)

Every page in `app/(dashboard)` is `'use client'` except the layout. Several
have no interactivity that requires it beyond a data fetch that would be better
done on the server: `/dashboard`, `/vgp`, `/scans`, `/clients`,
`/vgp/inspections`. `app/(dashboard)/assets/page.tsx` is the one server
component and it does nothing but wrap a client component in `Suspense`.

## 08.6 Tables without virtualization (P2)

`@tanstack/react-table` is a dependency but is not imported anywhere in the app
(grep finds no usage). Tables are hand-rolled.

`components/assets/AssetsTableClient.tsx` renders `paginatedAssets`, capped at
50 rows by `AssetsPageClient.tsx:64`, which is fine.

`components/vgp/VGPSchedulesManager.tsx` renders the filtered schedule list with
**no page cap**: `fetchAllSchedules` loads every schedule and the component maps
over the filtered result. An org with 500 assets and one schedule each renders
500 rows with per-row date maths. Above ~200 rows this is where the long tasks
will be.

`app/(dashboard)/audits/[id]/page.tsx` renders all audit items, likewise
uncapped.

**Fix direction:** paginate these two lists the way the assets table already is,
or virtualize.

## 08.7 Icon libraries (P2)

Both `lucide-react` and `@heroicons/react` are used, in the same components in
some cases (`AssetsPageClient.tsx:11` imports Heroicons; `dashboard/page.tsx:6`
imports Lucide). Next 16 tree-shakes both by default via
`optimizePackageImports`, and the measurements above confirm neither appears as
a large chunk, so this is a consistency issue rather than a size one. Noting it
because consolidating removes one dependency.

---

# 09. Connections and concurrency

## 09.1 Supabase pooler mode (P0, UNVERIFIED)

The app never opens a Postgres connection. Every query goes through PostgREST
over HTTPS (`@supabase/supabase-js`), which manages its own pool inside
Supabase's infrastructure. There is no `DATABASE_URL`, no `pg` client, and no
Prisma or Drizzle in `package.json`. So the classic "Vercel function
concurrency exceeds Postgres `max_connections`" failure does not apply directly.

What does apply is PostgREST's own connection pool, which is sized by the
Supabase compute tier and is **not visible from this repository**. On a Micro or
Small instance that pool is small (single-digit to low-double-digit
connections). At 1,000 concurrent users issuing ~22 PostgREST calls per page
load, PostgREST's pool, not the application, is the queue.

**Fix direction:** run `load/sql/index-audit.sql` section 9 to read
`max_connections` and the live connection breakdown, then check the Supabase
project's compute tier. Then run `load/main.js -e PROFILE=target` and watch for
the latency-collapse signature the harness reports: if p95 climbs while
throughput stays flat, the pool is the ceiling.

## 09.2 GoTrue is the harder ceiling (P0)

Auth requests are a separate service from PostgREST, and this app makes a lot of
them: seven per dashboard load (02.1), four per authenticated scan (07.2). At
1,000 concurrent users with a 20-second page cadence:

```
1000 users / 20 s x 7 auth calls = ~350 GoTrue req/s
```

That is more auth traffic than data traffic for a product that is not an
identity provider. Supabase's auth rate limits are per-project and configurable
but not unlimited.

**Fix direction:** as 02.1. `getClaims()` for verification, `getUser()` only
where the server-side user record is genuinely needed. This is the single
highest-leverage change in the whole audit.

## 09.3 Client creation per request (P1)

Twelve route files define their own local `createClient()` rather than
importing `lib/supabase/server.ts`:

```
app/api/settings/profile/password/route.ts   app/api/vgp/inspections/export/route.ts
app/api/settings/profile/route.ts            app/api/vgp/inspections/history/route.ts
app/api/subscriptions/route.ts               app/api/vgp/inspections/route.ts
app/api/uploadthing/core.ts                  app/api/vgp/report/route.ts
app/api/vgp/alerts/route.ts                  app/api/vgp/schedules/[id]/route.ts
app/api/vgp/compliance-summary/route.ts      app/api/vgp/schedules/route.ts
```

All are near-identical copies with subtly different cookie handling: the shared
`lib/supabase/server.ts:13-27` uses the current `getAll`/`setAll` API, the
copies use the older `get`/`set`/`remove` (for example
`app/api/vgp/inspections/route.ts:21-38`).

Creating a `SupabaseClient` per request is cheap in itself: it is a wrapper
around `fetch`. The cost here is maintenance and the risk of drift, not CPU.

`app/api/scan/update/route.ts:13` creates a *service-role* client per request
(`serviceClient()`), which is correct behaviour but should be hoisted to module
scope like `app/api/cron/vgp-alerts/route.ts:15` does.

**Fix direction:** delete the copies, import `lib/supabase/server.ts`.

## 09.4 Module-scope client breaks the build (P1)

```ts
// app/api/cron/vgp-alerts/route.ts:15
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
```

Evaluated at module load, which Next does during page-data collection. A build
without Supabase env vars fails:

```
Error: Failed to collect configuration for /api/admin/trigger-vgp-alerts
  [cause]: Error: supabaseUrl is required.
      at module evaluation (app/api/cron/vgp-alerts/route.ts:15:18)
```

That is a reproduced failure, not a hypothesis: `npx next build` with no
env set fails exactly here. It blocks any CI or preview build that does not
carry production secrets.

**Fix direction:** lazy-init inside the handler, memoised in a module variable,
the way `getStripe()` already does in
`app/api/stripe/webhook/route.ts:8-15`.

## 09.5 Rate limiting is per-instance and therefore not a limit (P1)

```ts
// lib/security/rate-limit.ts:9
const store = new Map<string, RateLimitEntry>()
```

An in-memory `Map` in middleware. On Vercel, middleware runs on many isolates
across many regions, each with its own `Map`. The effective limit is
`configured_limit x number_of_live_isolates`, which is unbounded and
unknowable. The file's own header comment says as much ("For production at
scale, swap the Map for Redis"), so this is a known gap rather than an
oversight, but at 1,000 concurrent users it is fully load-bearing, because it
is the only thing standing between a scraper and the `/scan/` enumeration the
comment at `proxy.ts:33-34` is worried about.

It also leaks memory in the other direction: `cleanup()` runs at most once a
minute (`:15`) and only sweeps expired entries, so a burst of unique IPs grows
the map until the isolate recycles.

**Fix direction:** `@upstash/ratelimit` or Vercel's own KV, keyed the same way.

## 09.6 No timeouts on any outbound call (P2)

No `AbortController`, no `signal`, no `timeout` option on any Supabase, Resend,
Stripe or UploadThing call anywhere in the app. The only timeout in the codebase
is client-side, on the scan page's asset fetch
(`app/scan/[qr_code]/page.tsx:243-245`), which is a `Promise.race` against a
10-second timer. A good pattern, used once.

---

# 10. Cache

## 10.1 There is no caching layer (P0)

| Layer | State |
| --- | --- |
| Browser (`Cache-Control` on API responses) | **none**: zero route handlers set any response header |
| CDN (`s-maxage`, `stale-while-revalidate`) | **none** |
| Next data cache (`revalidate`, `unstable_cache`, `fetch` options) | **none** |
| Next full-route cache (ISR) | **none**: every data-bearing page is a client component, so there is nothing to revalidate |
| React per-request dedup (`cache()`) | **none**: hence 07.1 |
| Application (in-memory, Redis) | **none** |
| Database (materialised views, counter columns) | **none** |

The only cache in the product is TanStack Query's client-side store
(`app/providers.tsx:17-24`, `staleTime: 60s`) and the two hooks that set a
longer one: `useSubscription` 5 minutes (`hooks/useSubscription.ts:22`),
`usePlans` 1 hour (`:38`), `useOrganization` 5 minutes
(`hooks/useOrganization.ts:61`).

That client cache is genuinely doing work: it is why `PilotBanner` and
`AccountLockedOverlay` share one `/api/subscriptions` call. But it is per-tab
and dies on reload.

## 10.2 Reads that are recomputed and should not be (P0)

| Read | Recomputed | Changes | Target |
| --- | --- | --- | --- |
| `subscription_plans` | every `/settings/subscription` visit | ~yearly | `s-maxage=86400`, hit ratio >99% |
| `vgp_equipment_types` | every schedule-modal open | ~never | `s-maxage=86400`, >99% |
| `users.organization_id` | 4x per dashboard load | on team change | request-scoped `cache()`, 75% dedup |
| entitlement context | every guarded route | on plan change | 60s server cache, >90% |
| assets `count(*)` | every `/api/subscriptions` call | on asset create/delete | counter column, 100% |
| org branding / theme | every dashboard route | rarely | already 5 min client-side; add `s-maxage=60` |
| `get_asset_by_qr` | every scan | on rename/move | `s-maxage=60, swr=300`, >80% on repeat scans |
| dashboard counters | every dashboard load | continuously | 30s `s-maxage` acceptable; the page shows a date, not a clock |

## 10.3 Hit-ratio targets (P1)

Proposed, for the first pass:

| Layer | Target | How to read it |
| --- | --- | --- |
| Vercel CDN, static assets | >95% | Vercel analytics, edge cache hit rate |
| Vercel CDN, `/scan/[qr]` documents | >70% | after 06.1; repeat scans of the same machine |
| Vercel CDN, reference-data APIs | >99% | after 06.3 |
| TanStack Query, in-session | >60% | already partly achieved; will rise once the layout stops refetching |
| Request-scoped `cache()` dedup | 75% on `users` | 4 lookups -> 1 |

## 10.4 The public scan page is the biggest miss (P1)

Covered in 06.1. Restating it here because it is a cache finding as much as a
rendering one: the single highest-volume public page in the product is
structurally uncacheable, and the RPC behind it was already designed to return
public-safe data.

## 10.5 Immutable static assets (P2)

Next fingerprints `/_next/static/*` and Vercel serves them with a long
`immutable` cache. Nothing to do. Worth stating because it means the bundle
sizes in area 08 are a *first-visit* cost, not a per-page cost, which is why
08.2 is P0 for the scan page and P1 elsewhere.

---

# 11. Scalability

## 11.1 The cron cannot survive its own success (P0)

`app/api/cron/vgp-alerts/route.ts` is scheduled daily at 07:00
(`vercel.json`). One invocation does, for **all** tenants:

- one unbounded query for every active schedule due within 60 days, across
  every organization (`:240-262`, no `organization_id` filter);
- one unbounded query for every active rental, across every organization
  (`:604-628`);
- two sequential queries per organization (`:318`, `:327`);
- one Resend send per organization per urgency level, sequentially (`:419`);
- one insert per schedule, sequentially (`:439`);
- then the whole recall pass again (`:880`).

There is **no `export const maxDuration`** on the route, so it runs on the
platform default. At a few hundred organizations this times out mid-run, and
because `vgp_alerts` rows are written only *after* a successful send
(`:438-456`), a timed-out run has already sent emails it did not record,
so the next day re-sends them.

`MAX_EMAILS_PER_RUN = 80` (`:20`) caps the damage but is also a hard ceiling on
how many organizations can be alerted per day. The accounting is inconsistent
with itself: `result.emails_sent` is incremented once per digest (`:459`) while
the break check at `:388` compares against `schedulesToAlert.length`, so the cap
does not mean what it appears to.

**Fix direction:** set `maxDuration`; page by organization (`organization_id >
$cursor ORDER BY organization_id LIMIT 50`) and re-enqueue; write the alert row
before the send with `sent = false`; batch the sends.

## 11.2 Blocking CPU on shared instances (P1)

Covered in 08.4. Restating it as a scalability finding: on a Node.js serverless
runtime, one synchronous jsPDF render or `XLSX.read` blocks every other request
on that instance. This is the mechanism by which a single user exporting a
DREETS report degrades unrelated users' dashboards, and it is exactly what the
`dep_degrade` profile's `background_reads` threshold is designed to catch:

```
'read_latency{scenario:background_reads}': ['p(95)<500']
```

If that threshold fails while `dependency_heavy` is running, isolation is
broken.

## 11.3 The harness (P1, delivered ready-to-run)

`load/` contains ten profiles and six scenarios, built against this commit and
validated end to end (it runs, drives the app, and emits its report; the
validation ran against a local `next start` with a stubbed Supabase, so the
*mechanics* are proven and the *numbers about this app* are still to be taken).

| Profile | Shape |
| --- | --- |
| `smoke` | 5 VUs / 5 min |
| `normal` | 50 VUs / 10 min |
| `busy` | 250 VUs / 10 min |
| `peak` | 500 VUs / 10 min |
| `target` | 1000 VUs / 15 min |
| `spike` | 100 -> 1000 in 30s, hold 3 min |
| `soak` | 300 VUs / 2 h |
| `dep_degrade` | 500 VUs with Resend slowed via `RESEND_BASE_URL` |
| `write_contention` | 100 VUs on one asset, no think time |
| `cache_cold` | 1000 VUs, no connection reuse, `no-cache` on every request |

Scenarios: login, dashboard, assets list, scan checkout/return, record
inspection, DREETS report. Each reproduces the app's real request sequence
including the direct-to-PostgREST calls the client components make, which a
harness that only hit `/api/*` would miss entirely.

Thresholds are the brief's: `http_req_failed<1%`, read p95 <500ms, mutation p95
<800ms, p99 <1.5s. The summary reports latency in 30-second buckets and names
the first bucket at which p95 exceeds steady state by 3x. That timestamp,
read against the profile's ramp, is the saturation point.

**Saturation point: UNVERIFIED.** No preview environment was reachable from this
workspace. The prediction from the call graph is that the first ceiling is
GoTrue request volume (09.2) at roughly 300-400 auth req/s, which the `spike`
profile will hit somewhere between 400 and 700 VUs on a default Supabase
project. Run `-e PROFILE=spike` to settle it.

**Dependency degradation, partial (UNVERIFIED for Stripe).** Resend is
injectable with no app change: `RESEND_BASE_URL` is read by the installed SDK
(`node_modules/resend/dist/index.cjs:882`). Stripe is not: the app constructs
`new Stripe(key, { apiVersion })` with no `host` option
(`app/api/stripe/webhook/route.ts:11`) and the SDK has no env-var equivalent,
so degrading Stripe requires network-layer interception against a local app and
is not injectable against a Vercel preview at all.

## 11.4 Load-testing safety (P2)

`load/config.js:109` refuses to start when `BASE_URL`'s host appears in
`PROD_HOSTS` (default `app.travixosystems.com`), and mutations are off unless
`ENABLE_WRITES=true` is passed explicitly. The seed script refuses to run
without a service key and an explicit password and will not target a
production-looking URL.

---

# 12. Cost per 1,000 sessions

## 12.1 Method

```
cost per 1,000 sessions = (total infra cost / completed sessions) x 1000
```

A **session** is modelled as one depot user's working interaction:

| Action | Count |
| --- | --- |
| Login | 1 |
| Dashboard load | 3 |
| Assets list load | 2 |
| QR codes page | 1 |
| Anonymous scan | 4 |
| Authenticated scan (with checkout or return) | 2 |
| Record inspection | 0.4 |
| DREETS report generation | 0.1 |

Unit prices are **list prices to verify against current vendor pricing**; the
quantities are derived from this commit and are the part this audit is
asserting.

## 12.2 Quantities per session (derived from the call graph)

| Resource | Per session | Source |
| --- | --- | --- |
| Vercel function invocations | **~35** | 3 per dashboard load, 3 per assets load, 2 per anonymous scan, 3 per authenticated scan, 4 per inspection, 6 per report |
| Vercel middleware (proxy) executions | ~35 | matcher covers `/api/:path*`, `/scan/:path*` and every dashboard route |
| Supabase round trips | **~160** | 22 per dashboard, 14 per assets, 4 per anonymous scan, 13 per authenticated scan |
| of which GoTrue `/auth/v1/user` | **~40** | 7 per dashboard, 5 per assets, 4 per authenticated scan |
| Supabase egress (ESTIMATED) | ~350 KB gz | 2x full assets list (~30 KB gz each), dashboard queries (~45 KB gz per load) |
| Vercel bandwidth, cold cache (MEASURED) | ~810 KB gz | shell 266 + assets delta 281 + qr delta 165 + Sentry 112 |
| Vercel bandwidth, warm cache | ~40 KB | documents and API JSON only |
| Resend sends | ~0 | user sessions send no mail; the cron does |
| UploadThing | 0.4 files, ~1.6 MB | one certificate per recorded inspection, capped at 4 MB (`inspection/[id]/page.tsx:92`) |
| Stripe API calls | ~0.002 | conversion is rare per session |

## 12.3 Per 1,000 sessions

| Resource | Quantity | Notes |
| --- | --- | --- |
| Vercel function invocations | **35,000** | |
| Vercel middleware executions | **35,000** | billed as invocations on current Vercel plans |
| Vercel bandwidth | **~271 MB** | 300 cold x 810 KB + 700 warm x 40 KB, at a 30% cold-cache rate |
| Supabase API requests | **160,000** | |
| of which GoTrue requests | **40,000** | |
| Supabase egress | **~350 MB** | ESTIMATED |
| UploadThing storage added | **~1.6 GB** | 400 certificates x ~4 MB worst case |
| Resend | **0** | plus the daily cron, see 12.5 |
| Stripe | **~2 calls** | |

The cold-cache rate is the assumption that most moves this number. At 100% cold
it is 810 MB per 1,000 sessions; at 10% it is 109 MB. 30% is a reasonable
starting point for a product whose users open it a few times a day on a phone,
but it should be replaced with the real figure from Vercel analytics.

## 12.4 What the fixes change

| Fix | Resource | Before | After | Reduction |
| --- | --- | --- | --- | --- |
| `getClaims()` instead of `getUser()` (02.1, 09.2) | GoTrue requests | 40,000 | ~5,000 | **-88%** |
| Server-render the dashboard (06.2) | Supabase round trips | 160,000 | ~60,000 | **-63%** |
| Paginate the assets list (01.1) | Supabase egress | 350 MB | ~90 MB | **-74%** |
| Stop refetching after every mutation (05.1) | Supabase requests | n/a | -20% further | |
| Lazy-load the modals and `jspdf` (08.2) | Vercel bandwidth | 271 MB | ~152 MB | **-44%** |
| Split i18n by language (08.3) | Vercel bandwidth (cold) | n/a | -3 MB further | |
| Cache reference-data APIs (06.3) | Vercel invocations | 35,000 | ~32,000 | -9% |
| Server-render + cache `/scan/[qr]` (06.1) | Vercel invocations | 32,000 | ~26,000 | -19% |
| **Combined** | **Supabase requests** | **160,000** | **~45,000** | **-72%** |
| | **Vercel invocations** | **35,000** | **~26,000** | **-26%** |
| | **Vercel bandwidth** | **271 MB** | **~149 MB** | **-45%** |

## 12.5 Cost per successful transaction

| Transaction | Sessions per transaction | Supabase round trips | Vercel invocations |
| --- | --- | --- | --- |
| Inspection recorded | 2.5 | ~410 | ~90 |
| Asset created (single) | 1 (part of a session) | ~165 | ~36 |
| Asset created (bulk import, 400) | 1 | ~165 | ~36 |
| Rental checkout + return | 0.5 | ~85 | ~18 |
| Subscription conversion | rare | ~200 incl. webhook | ~40 |

The bulk import line is the one worth noticing: importing 400 assets costs
almost exactly the same as creating one, because the write itself is a single
batched insert (`app/api/assets/import/route.ts:160`). That part of the system
is already right.

The inspection line is the opposite: 410 Supabase round trips per recorded
inspection, of which roughly 12 are the inspection itself and the rest is
navigation overhead (03.1, 02.1). This is the transaction the product is
actually sold on.

## 12.6 The daily cron (P1)

Separate from user sessions, and the only Resend cost in normal operation:

| Resource | Per day | Per 1,000 orgs |
| --- | --- | --- |
| Vercel invocations | 1 | 1 |
| Supabase round trips | 2 + 2N + inserts | **~2,000+** |
| Resend sends | capped at 80 (`:20`) | **capped, and the cap binds** |

At 1,000 organizations the cron issues over 2,000 sequential Supabase round
trips in one invocation and can alert at most 80 of them. Both numbers are
scalability limits well before they are cost limits.

## 12.7 UNVERIFIED in this section

- All unit prices. Verify Supabase compute tier and egress allowance, Vercel
  plan invocation and bandwidth allowances, Resend tier (the code assumes the
  free tier's 100/day at `lib/email/email-service.ts:47`), and UploadThing
  storage and egress rates.
- Supabase egress figures are ESTIMATED from row shapes. The harness measures
  them per endpoint.
- Whether Vercel middleware executions are billed separately from function
  invocations on the account's current plan.

---

# Prioritized fix list

Ordered by (severity x cost impact) / effort. "Effort" is engineering days for
one developer familiar with the codebase.

| # | Fix | Area | Sev | Cost impact | Effort | Score |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Replace `auth.getUser()` with `getClaims()` in `proxy.ts:118` and the three server guards | 02, 09 | P0 | -88% GoTrue requests; removes the likely first saturation ceiling | 0.5 d | **highest** |
| 2 | `dynamic()` for the six asset modals and `BulkQRGenerator` | 08 | P0 | -47% JS on `/assets`, -33% on `/qr-codes` | 0.5 d | very high |
| 3 | Paginate the assets list server-side; narrow the projection | 01 | P0 | -74% Supabase egress on the largest read | 1 d | very high |
| 4 | Resolve `organization_id` once per request (`cache()` server-side, one query key client-side) | 07 | P0 | 4 lookups -> 1 per dashboard load | 0.5 d | very high |
| 5 | `export const maxDuration` on the cron, Stripe webhook, report and import routes | 04, 11 | P0 | prevents silent timeout and email re-sends | 0.25 d | very high |
| 6 | Unique index on `billing_events.stripe_event_id` + insert-first idempotency | 03, 04 | P0 | removes a duplicate-charge race | 0.5 d | very high |
| 7 | Run `load/sql/index-audit.sql` and `explain-top-queries.sql`; add the indexes they justify | 02, 03 | P0 | unknown until run; likely large | 0.5 d | very high |
| 8 | Server-render `/scan/[qr_code]` and cache the document | 06, 10 | P0 | -6,000 invocations and -6,000 Supabase calls per 1,000 sessions; faster on weak signal | 2 d | high |
| 9 | Server-render `/dashboard`, one `Promise.all` | 02, 06 | P0 | 22 round trips -> ~4 | 2 d | high |
| 10 | Collapse the inspection write path: one gate, one transactional RPC | 03 | P0 | 11 round trips -> 3 on the core transaction | 1.5 d | high |
| 11 | Fix the `[t]` dependency in `VGPSchedulesManager.tsx:249`; memoise `LanguageProvider`'s value | 02, 07 | P1 | halves every `/vgp/schedules` load | 0.25 d | high |
| 12 | `Cache-Control` on `/api/subscriptions/plans` and `/api/vgp/equipment-types`; drop the pointless feature gate | 06, 10 | P1 | >99% CDN hit on reference data | 0.25 d | high |
| 13 | Stop refetching whole lists after every mutation | 05 | P1 | -20% Supabase requests in edit-heavy sessions | 1 d | high |
| 14 | Move the welcome email and demo seeding out of the signup request | 04 | P0 | signup stops blocking on Resend | 0.5 d | high |
| 15 | Split `lib/i18n.ts` by language | 08 | P1 | -11 KB gz on every route including `/scan` | 0.5 d | high |
| 16 | Batch the cron's per-org queries and per-alert inserts; page by organization | 02, 03, 11 | P1 | 2,000+ round trips -> ~10 | 1.5 d | medium-high |
| 17 | Route the Excel import through the gated API; wrap in a transaction | 03 | P1 | closes a write-gate bypass; 5 round trips -> 1 | 1 d | medium-high |
| 18 | Optimistic updates for the 10 safe mutations | 05 | P1 | perceived latency; no infra cost change | 1.5 d | medium |
| 19 | Replace the in-memory rate limiter with a shared store | 09 | P1 | makes the `/scan` limit real | 0.5 d | medium |
| 20 | Fix the N+1 in `checkActiveAudit` (`scan/[qr_code]/page.tsx:173`) | 02 | P1 | removes N queries from the scan path | 0.25 d | medium |
| 21 | Add `organization_id` to the dashboard scans count (`page.tsx:107`) | 02 | P1 | turns a table scan into an index lookup | 0.25 d | medium |
| 22 | Replace `count: 'exact'` on assets with a counter column or `estimated` | 02, 10 | P1 | removes 3 full counts per dashboard load | 1 d | medium |
| 23 | Move DREETS PDF generation off the request path | 08, 11 | P1 | stops one export stalling an instance | 2 d | medium |
| 24 | Add timeouts to every Resend, Stripe and UploadThing call | 04, 09 | P1 | bounds the blast radius of a hung dependency | 0.5 d | medium |
| 25 | Aggregate `compliance-summary` and report metadata in SQL | 01, 02 | P1 | O(all rows) -> O(1) on two endpoints | 1 d | medium |
| 26 | Lazy-init the cron's module-scope Supabase client | 09 | P1 | unblocks builds without secrets | 0.1 d | medium |
| 27 | Fix `.eq("archived", false)` in `report/route.ts:148` | 02 | P2 | the DREETS overdue section currently never populates | 0.1 d | medium |
| 28 | Paginate `VGPSchedulesManager` and the audit detail list | 08 | P2 | removes long tasks above ~200 rows | 1 d | low-medium |
| 29 | Stop returning full rows from import and inspection writes | 01 | P1 | -280 KB per bulk import | 0.25 d | low-medium |
| 30 | Delete the twelve duplicate `createClient()` copies | 09 | P2 | maintenance only | 0.5 d | low |
| 31 | Remove the `visibilitychange` refetch in `audits/[id]` | 07 | P1 | removes unbounded refetch on tab focus | 0.1 d | low |
| 32 | Deduplicate the two asset reads in `scan/update` | 07 | P1 | one round trip per scan | 0.25 d | low |
| 33 | Consolidate on one icon library | 08 | P2 | one fewer dependency | 0.5 d | low |
| 34 | Cap import file size and row count | 03, 08 | P2 | bounds a blocking parse | 0.25 d | low |

## The first week

Items 1-7 total **3.75 developer days** and address the two findings most
likely to decide whether the app holds at 1,000 concurrent users: auth request
volume (item 1) and whatever the index audit turns up (item 7). Item 2 is half
a day for a 47% bundle reduction on the most-visited page.

Run `load/main.js -e PROFILE=smoke` against a preview before and after, then
`-e PROFILE=spike` to find where the saturation point moved.
