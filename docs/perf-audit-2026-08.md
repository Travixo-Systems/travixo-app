# Performance, scale and cost audit - travixo-app

**Date:** 2026-08-31
**Commit audited:** `8dd720c` on `feat/multi-account-sessions-and-admin-pilot-controls`
**Envelope:** 1,000 concurrent users (concurrent, not registered)
**Harness:** k6, in [`load/`](../load/)
**App code changed:** none. This audit is read-only by constraint.

Production runs this branch, not `main`. Verified previously by the redirect
signature `/u/1/dashboard -> /u/1/login?redirectTo=...`, which only
`withSlotPath()` on this branch produces. So the findings below describe code
that is serving users now.

---

## Summary

| # | Area | P0 | P1 | P2 | Headline |
| --- | --- | --- | --- | --- | --- |
| 01 | Payload size | 6 | 6 | 3 | Assets list ships 363 KB to render 50 rows |
| 02 | DB reads | 5 | 4 | 1 | 22+N round trips on the public scan page; a real N+1 |
| 03 | DB writes | 2 | 5 | 3 | Stripe webhook writes its idempotency guard last |
| 04 | Dependencies | 2 | 6 | 4 | No timeout on any Resend call; cron has no maxDuration |
| 05 | UI mutations | 1 | 5 | 6 | A colour change triggers `window.location.reload()` |
| 06 | Origin rendering | 4 | 1 | 3 | Reference data is dynamic and uncached |
| 07 | Duplicate requests | 1 | 4 | 3 | Every dashboard page pays 9 round trips before its own data |
| 08 | JS / runtime | 3 | 5 | 3 | `next/dynamic` used zero times; zod ships to the public QR page |
| 09 | Connections | 3 | 1 | 3 | Rate limiter is per-isolate, so the limit is undefined |
| 10 | Caching | 4 | 3 | 0 | No `Cache-Control` anywhere in the repo |
| 11 | Scalability | 1 | 1 | 0 | Harness delivered; saturation point UNVERIFIED |
| 12 | Cost | 1 | 2 | 0 | ~7.90 EUR per 1,000 sessions, dominated by egress |
| | **Total** | **33** | **43** | **29** | |

**The one-sentence version:** the app is architecturally sound at the write
layer (checkout and return are atomic Postgres functions) but pays for
everything else in round trips and bytes, because nothing is cached, nothing is
paginated server-side, and nothing is parallelised.

Three numbers that frame the rest:

- **`Promise.all` appears 0 times in `app/`.** Every multi-query page is a
  strict serial waterfall.
- **`next/dynamic` appears 0 times in the codebase.** Every route ships every
  library it might need.
- **`Cache-Control` appears 0 times outside download headers.** Every read
  reaches the origin.

### Evidence quality

Measured live against the production Supabase project (read-only, no load
generated): row counts, payload bytes, query latency. Measured from the
existing `.next` build (2026-08-27, Turbopack): bundle composition and
prerender status. Everything else is read from source with `file:line` cited.
Items that could not be verified are marked **UNVERIFIED** with the reason.

Production data as of this audit: **19 organizations, 2,722 assets, 733
inspections, 623 VGP schedules, 145 rentals, 56 clients**. The largest single
tenant holds **520 assets** - already above the 400-asset pilot cap.

---

## 01 - Payload size

Every list read in the app returns whole rows. The pattern is consistent:
`select('*')`, no `.range()`, pagination applied in JavaScript after the full
set is in memory.

**Measured** against the 520-asset tenant, via the exact query the browser
issues (`components/assets/AssetsPageClient.tsx:86`):

| Query | Raw | Gzip |
| --- | --- | --- |
| `select('*')` + 2 joins, unpaginated | **363,478 B** | 32,472 B |
| The 6 columns the table actually renders | 107,707 B | 21,504 B |
| `vgp_schedules` + nested assets, one tenant | **617,136 B** | - |

**70% of the assets payload is never rendered.** The table consumes 9 fields;
`description`, `purchase_price`, `current_value`, `purchase_date`, `qr_url` and
the archive columns are transferred and discarded.

| # | Finding | file:line | Sev | Fix direction |
| --- | --- | --- | --- | --- |
| 01.1 | Assets list: unpaginated `select('*')` + 2 joins, issued client-side. `itemsPerPage = 50` slices an array already fully downloaded | `components/assets/AssetsPageClient.tsx:86-101`, `:64` | **P0** | Server-side `.range()` + explicit columns; compute VGP status server-side |
| 01.2 | QR codes page: same pattern, no cap | `components/assets/QRCodesPageClient.tsx:39-42` | **P0** | Select `{id,name,serial_number,qr_code,qr_url}` only |
| 01.3 | Inspections history: no `.limit()`, includes unbounded free-text `observations` | `app/api/vgp/inspections/history/route.ts:46-65` | **P0** | Push filters + `.range()` server-side |
| 01.4 | Inspections list: `select('*')` + two levels of join, filters optional | `app/api/vgp/inspections/route.ts:74-93` | **P0** | Require a filter or paginate |
| 01.5 | Compliance summary returns every schedule row to compute 5 integers | `app/api/vgp/compliance-summary/route.ts:53-69`, `:135-139` | **P0** | `count: 'exact', head: true`; cap returned lists |
| 01.6 | VGP alerts: unpaginated `select('*')` + joins | `app/api/vgp/alerts/route.ts:46-62` | **P0** | `.range()` + explicit columns |
| 01.7 | Audits page bypasses its own paginated API (`app/api/audits/route.ts:27-42` implements limit/offset/total) | `app/(dashboard)/audits/page.tsx:212-221` | P1 | Point the page at its API |
| 01.8 | Dashboard downloads every asset and schedule to aggregate in JS | `app/(dashboard)/dashboard/page.tsx:186-189`, `:117-123` | P1 | SQL aggregate or count head-queries |
| 01.9 | Team list: `select('*')` on `users` - ships every column of every member | `app/api/team/route.ts:44-49` | P1 | Explicit columns |
| 01.10 | Audit detail: all items with joins, unpaginated | `app/(dashboard)/audits/[id]/page.tsx:157-179` | P1 | Paginate items |
| 01.11 | Report metadata fetches every `inspection_date` to read first and last | `app/api/vgp/report/route.ts:246-251` | P1 | `min()`/`max()` + count |
| 01.12 | Admin dashboard fetches every asset across every tenant | `app/(admin)/admin/page.tsx:121-123` | P1 | Grouped count via RPC |
| 01.13 | CSV export unbuffered and unpaginated | `app/api/vgp/inspections/export/route.ts:53-70` | P2 | Stream |
| 01.14 | Client detail `select('*')`; rentals correctly capped at 200 and batched via `.in()` | `app/api/clients/[id]/route.ts:31-36` | P2 | Explicit columns |
| 01.15 | `select('*')` on narrow reference/singleton rows | `app/api/subscriptions/plans/route.ts:11`; `app/api/vgp/equipment-types/route.ts:16`; +6 | P2 | Tighten opportunistically |

**Built correctly, for reference:** `app/api/vgp/schedules/route.ts:65-125`
(page/limit/range/count/has_more), `app/api/clients/route.ts:27-34` (capped at
100, enrichment batched with `.in()`, genuinely not N+1),
`app/(dashboard)/scans/ScansPageClient.tsx:64` (`.range()`).

**Compression is correct** and closed as a finding: Vercel negotiates Brotli
(`Content-Encoding: br`, 4.6x on `/login`). The Supabase egress leg is
uncompressed unless the client requests it, which the harness measures per
endpoint.

**A caveat worth keeping:** `components/vgp/VGPSchedulesManager.tsx:104-125`
deliberately walks every page of the schedules API because the view computes
status counts in memory. That is documented in the code. Truncating it without
first moving those counts server-side would reintroduce a correctness bug.

---

## 02 - Database reads

### Round trips per page load

Counted end to end, including the proxy, the layout, and every helper the page
transitively triggers.

| Page | Round trips | Of which GoTrue |
| --- | --- | --- |
| `/scan/[qr_code]` (public) | **22 + N** | 5 |
| `/dashboard` | 18 | 4 |
| `/vgp/report` | 17 | 5 |
| `/vgp/schedules` | 13 (+4 per extra 1,000 schedules) | 4 |
| `/assets` | 12 | 4 |

Every dashboard page pays a **fixed 9 round trips** (3 GoTrue + 6 PostgREST)
before it fetches any of its own data: `proxy.ts:187` validates the session,
then `ThemeProvider` calls `/api/settings/organization` and `PilotBanner` calls
`/api/subscriptions`. Between those two endpoints, `users.organization_id` is
read twice and `organizations` twice, in one render pass.

| # | Finding | file:line | Sev | Evidence | Fix direction |
| --- | --- | --- | --- | --- | --- |
| 02.1 | **N+1: `.select()` inside a `for` loop.** One `audits` query per audit item, serially awaited | `app/scan/[qr_code]/page.tsx:173-180` | **P0** | Verified by reading the loop | `.in('id', auditIds)` - N becomes 1 |
| 02.2 | Duplicate auth + org lookup in one render: `checkAuth` and `checkActiveAudit` each call `getUser()` + `users.select()` | `app/scan/[qr_code]/page.tsx:134,138` vs `:152,155` | **P0** | 4 round trips where 2 suffice | Share the resolved org id already held in state |
| 02.3 | Dashboard: 7 independent queries awaited in series, all needing only `orgId` | `app/(dashboard)/dashboard/page.tsx:85,93,107,118,153,164,187` | **P0** | No `Promise.all` anywhere in `app/` | One `Promise.all` - 7 serial RTTs become 1 |
| 02.4 | `scans` count has no org filter; isolation rests on an RLS policy using a correlated `EXISTS` against `assets`, evaluated per candidate row | `app/(dashboard)/dashboard/page.tsx:107-110` | **P0** | `scans` has no `organization_id` column (`types/database.ts:519-530`) | Denormalise `organization_id` onto `scans`; index `scanned_at` |
| 02.5 | Unbounded assets select with 2 nested joins behind client-side pagination | `components/assets/AssetsPageClient.tsx:86-101` | **P0** | 363 KB measured | Server-side `.range()` |
| 02.6 | `users.organization_id` and `organizations` each read twice per page load by two layout endpoints | `app/api/settings/organization/route.ts:27,41`; `app/api/subscriptions/route.ts:51,78` | P1 | 4 redundant reads on every dashboard page | One bootstrap endpoint, or `React.cache()` |
| 02.7 | `/api/subscriptions` runs 5 sequential awaits; the last 3 need only `organizationId` | `app/api/subscriptions/route.ts:44,51,64,78,89` | P1 | Runs on every dashboard page | `Promise.all` - 5 RTTs to 3 |
| 02.8 | Report metadata scans every inspection date row | `app/api/vgp/report/route.ts:247-251` | P1 | Uses only first, last, count | `min()`/`max()` |
| 02.9 | `requireFeature` costs 3 round trips and re-runs per paginated request | `lib/server/require-feature.ts:31,40,55` | P1 | Schedules pagination pays 4 RTTs per page | One RPC returning `(org_id, has_access)` |
| 02.10 | Dashboard fetches all schedules and all active rentals to compute counts | `app/(dashboard)/dashboard/page.tsx:118-124`, `:153-157` | P2 | Only 3 rows displayed | Aggregate server-side |

**Query latency, measured** (warm, from this machine to the production
project): unpaginated assets `select('*')` 119-141 ms warm / 831 ms cold; VGP
schedules with nested assets 165 ms. These are single-user numbers with no
contention; they are a floor, not a projection.

**UNVERIFIED - `EXPLAIN ANALYZE` for the top 10 queries.** The Supabase REST
API exposes no arbitrary-SQL RPC (correctly), and `psql` is not installed on
this machine. The queries are transcribed with their `file:line` origins in
[`load/sql/explain-top-queries.sql`](../load/sql/explain-top-queries.sql), ready
to paste into the SQL editor. Run query 4 as an authenticated role, not the
service role, or RLS is bypassed and the plan will look artificially cheap.

---

## 03 - Database writes

Write shapes are mixed. Checkout and return are **the best code in the
codebase**: both delegate to a Postgres function that does
`SELECT ... FOR UPDATE` then all writes in one transaction. Excel import is
correctly batched: a 400-row import is 3 round trips, not 400.

The problems are elsewhere: redundant gating before writes, and multi-table
writes with no atomicity.

### Statement counts per flow

| Flow | Round trips | Writes | Notes |
| --- | --- | --- | --- |
| Create asset | 3 | 1 | Runs client-side; no API route exists |
| Excel import (400 rows) | **3** | 2 | Correctly bulk-inserted |
| Record inspection | **11** | 1 INSERT + up to 2 UPDATE | 8 of 11 are duplicate gating reads |
| Checkout | 6 | 3 (atomic, in RPC) | Correct |
| Invite team member | 10 + 1 email | 1 | Response blocks on Resend |
| Stripe webhook | 7 | 3 across 3 tables | No transaction |

| # | Finding | file:line | Sev | Evidence | Fix direction |
| --- | --- | --- | --- | --- | --- |
| 03.1 | **Webhook idempotency guard is written last.** The dedupe row is SELECTed at line 91 but INSERTed at line 225, after every mutation. A crash in between leaves no marker and Stripe's retry re-applies all writes | `app/api/stripe/webhook/route.ts:91` vs `:225` | **P0** | Verified: only two `billing_events` references, in that order | INSERT the guard first; `stripe_event_id` is already UNIQUE, so treat a unique-violation as "already processed" |
| 03.2 | **Webhook multi-table writes are not atomic and errors are swallowed.** `subscriptions`, `organizations` and `billing_events` are 3 separate calls; every error is logged and the route still returns 200, so Stripe never retries | `app/api/stripe/webhook/route.ts:322-335`, `:345-358`, `:487-495` | **P0** | Partial failure leaves org converted with a stale subscription row | One `apply_stripe_event` RPC. supabase-js has no client transaction, so a DB function is the only route to atomicity |
| 03.3 | Inspection path calls `auth.getUser()` 3x and re-selects `organizations` 2x, because `requireWriteAccess` and `requireVGPWriteAccess` each independently re-resolve identity | `lib/server/require-write-access.ts:34,42,57`; `lib/server/require-feature.ts:31,40,109`; `app/api/vgp/inspections/route.ts:152,156,160` | P1 | 8 of 11 round trips are gating | Resolve `{user, org}` once and pass the context to both gates |
| 03.4 | **Inspection write is non-atomic across 3 tables and both UPDATE failures are explicitly swallowed.** A `failed` inspection can be recorded while the asset stays bookable | `app/api/vgp/inspections/route.ts:231`, `:282-293`, `:298-312` | P1 | Checkout's VGP gate reads exactly those tables | `record_inspection()` RPC. This is a compliance/safety issue, not only performance |
| 03.5 | Cron logs alerts with one INSERT per item in a loop | `app/api/cron/vgp-alerts/route.ts:438-456` | P1 | 400 alerts = 400 sequential round trips | Bulk insert. `logEmailAlerts` at `lib/email/email-service.ts:244` already does this and is unused here |
| 03.6 | Same per-row INSERT loop in the client-recall pass | `app/api/cron/vgp-alerts/route.ts:815-828` | P1 | Verified | Bulk insert |
| 03.7 | Asset create and Excel import run in the browser, bypassing `requireWriteAccess` (which exists only in API routes) | `components/assets/AddAssetModal.tsx:74`; `components/assets/ImportAssetsModal.tsx:304` | P1 | Enforcement rests entirely on RLS + the `check_pilot_asset_limit` trigger | Verify that trigger is live (see 03.10) |
| 03.8 | Three collapsible gating SELECTs before one invite INSERT | `app/api/team/invitations/route.ts:117,139,154` | P2 | 3 SELECTs to decide 1 INSERT | One query, or a partial unique constraint |
| 03.9 | Demo seed does check-then-insert per category | `lib/demo-data.ts:70-96` | P2 | 6 round trips where 1 upsert would do | `.upsert()` |
| 03.10 | Dead import route: `app/api/assets/import/route.ts` has no callers and duplicates the client modal with a divergent column heuristic | `app/api/assets/import/route.ts:1-179` | P2 | grep finds no non-route callers | Delete it, or route the client through it so the write gate applies |

### Index audit

**Blocking caveat.** `CREATE TABLE` exists in this repo for **12 tables**, and
`assets`, `users`, `organizations`, `vgp_schedules`, `vgp_inspections`, `scans`
and `asset_categories` **are not among them**. The core schema, its indexes and
its RLS policies live only in the Supabase dashboard. This matches the standing
note that live RLS exists only there.

Only **four** indexes on core tables are declared anywhere in the repo - three
on `vgp_schedules`, one on `organizations`. `assets`, `users`,
`vgp_inspections`, `scans` and `asset_categories` have **zero declared
indexes**.

| # | Finding | file:line | Sev | Fix direction |
| --- | --- | --- | --- | --- |
| I.1 | **Core schema was absent from version control.** No DDL for the 7 hottest tables | no `CREATE TABLE assets\|users\|organizations` anywhere | ~~P0~~ **RESOLVED in part** | `supabase db pull --declarative` on 2026-09-01 wrote 51 files to `supabase/schemas/`. That baseline is authoritative for every index, policy and function claim, and settled I.4 and I.3 immediately. **Residual, P2:** the 8 dashboard-created core tables still have no genesis migration, so shadow replay (full `db pull`) and fresh-environment provisioning fail with `relation organizations does not exist` at the earliest migration. Generate a genesis migration from the declarative schema, timestamped before `20250101000000`. Deliberately deferred: it blocks neither the audit nor production |
| I.2 | Two competing migration directories: `migrations/` (1 file, outside the CLI path) and `supabase/migrations/` (26 files) | `migrations/vgp-email-alerts-migration.sql` | P1 | Move it, or confirm it was hand-applied |
| I.3 | `checkout_asset` is defined twice with different arity; `CREATE OR REPLACE` does not replace a different signature, so both remain callable | `supabase/migrations/20260211_rental_system.sql:81`; `20260211_client_recall_system.sql:105` | P1 | `DROP FUNCTION` the stale 10-arg overload. Same pattern for `extend_trial` and `create_organization_and_user` |
| I.4 | Hot foreign keys almost certainly unindexed: `assets.organization_id`, `assets.category_id`, `vgp_inspections.asset_id`, `scans.asset_id`, `users.organization_id` | inferred from query shape | P1 **(inferred)** | Postgres does not auto-index FK columns. Verify with `load/sql/index-audit.sql` section 1 |
| I.5 | Redundant index: `billing_events.stripe_event_id` is `UNIQUE` (implicit index) and has an explicit `CREATE INDEX` | `supabase/migrations/20260207_stripe_billing.sql:27` and `:71` | P2 | Drop the explicit one |
| I.6 | Two overlapping partial indexes on `vgp_schedules`; the org-leading one cannot serve the cron's org-less scan | `20251106191834:14`; `vgp-email-alerts-migration.sql:85` | P2 | Both justified - document why |

**UNVERIFIED - all index and RLS claims on the 7 core tables.** No `psql` and
no arbitrary-SQL RPC. [`load/sql/index-audit.sql`](../load/sql/index-audit.sql)
settles every one of them in a single paste into the SQL editor.

---

## 04 - Dependency chains

| Call | Timeout | Retries | Idempotency | Fallback |
| --- | --- | --- | --- | --- |
| Resend (VGP alert, recall, client notice) | **none** | 2, fixed 2 s | none | none |
| Resend (welcome, team invite) | **none** | **0** | none | none |
| Stripe `constructEvent` | n/a (local crypto) | n/a | signature only | n/a |
| Supabase (all calls) | **none** | none | none | none |
| UploadThing | SDK default | SDK default | none | none |

| # | Finding | file:line | Sev | Evidence | Fix direction |
| --- | --- | --- | --- | --- | --- |
| 04.1 | **Cron has no `maxDuration` and does unbounded sequential work**: per org, await Resend (up to 2 attempts + 2 s sleeps), then N sequential INSERTs, then a second full pass | `vercel.json:2-7`; `app/api/cron/vgp-alerts/route.ts` (no `maxDuration`), `:877-880` | **P0** | `grep maxDuration app/` returns nothing | Set `maxDuration`; enqueue per-org jobs. One slow org currently starves every org after it |
| 04.2 | **No timeout on any Resend call.** A hung socket hangs the cron indefinitely | `lib/email/email-service.ts:175,455,537`; `lib/email/send-welcome-email.ts:66`; `app/api/team/invitations/route.ts:217` | **P0** | No `AbortSignal` anywhere in the email layer | `AbortSignal.timeout(10_000)` on every call |
| 04.3 | Team invite blocks the HTTP response on Resend, after the INSERT has already committed | `app/api/team/invitations/route.ts:207-223` | P1 | The `catch` at `:224` already states the invite survives email failure, so blocking buys nothing | Return 201 after the INSERT; send in the background |
| 04.4 | Welcome email blocks post-registration and does a synchronous `readFileSync` of an .xlsx | `app/api/internal/post-registration/route.ts:49-53`; `lib/email/send-welcome-email.ts:44,66` | P1 | The caller does not await it (`app/(auth)/confirm/page.tsx:116`), so the user is not blocked - but the invocation stays alive | Background job; `fs.promises.readFile` |
| 04.5 | Cron sends the email, *then* writes the dedupe rows. A crash between them re-sends every alert next run | `app/api/cron/vgp-alerts/route.ts:419` vs `:438-456`; `:801` vs `:815-828` | P1 | Cooldown is computed from `vgp_alerts.sent_at` | Insert rows first as `sent: false`, send, then flip |
| 04.6 | **Client recall notices are suppressed by an unrelated failure.** `notifyClientsOfRecall` runs only inside `if (sendResult.success)` - if the *staff* digest fails, the clients holding the equipment are never told | `app/api/cron/vgp-alerts/route.ts:808-838`, call at `:837` | P1 | Verified by reading the nesting | Hoist out of the staff-email branch. These are two independent audiences |
| 04.7 | Daily email cap is dead code: `MAX_DAILY_EMAILS = 90` and `getDailyEmailCount()` are defined and never called | `lib/email/email-service.ts:47,260-276` | P1 | Only the per-run cap is enforced | Call it, or delete it so it stops implying protection |
| 04.8 | `MAX_EMAILS_PER_RUN` compares two different units (digests vs schedules); the recall pass has no cap at all | `app/api/cron/vgp-alerts/route.ts:388-391` vs `:459` | P2 | | Count recipients actually emailed |
| 04.9 | Fixed 2 s retry, no jitter, and non-retryable 4xx are retried | `lib/email/email-service.ts:187-192` | P2 | | Retry only 429/5xx |
| 04.10 | **Sentry captures nothing from these paths.** No `captureException` in the cron, webhook or email layer - so the swallowed errors in 03.2 and 03.4 are invisible | `sentry.server.config.ts:6-14`; grep across those files | P1 | A webhook partial failure returns 200 and logs to stdout only | Add `captureException` at every swallowed-error site |
| 04.11 | Service-role client constructed per request | `app/api/team/invitations/route.ts:133-137` | P2 | `app/api/cron/vgp-alerts/route.ts:15-18` already hoists correctly | Module scope |
| 04.12 | UploadThing orphans files: `onUploadComplete` only logs; the URL is persisted later by the inspections POST | `app/api/uploadthing/core.ts:65-72` | P2 | Abandoning the form leaves a stored file with no DB reference | Record and reap |

**Degradation behaviour.** If Resend is slow: the cron hangs (04.2) and may
exceed its invocation limit (04.1), losing the day's alerts for every org after
the stall; invites block the user until the socket dies (04.3). If UploadThing
is down: inspections cannot be recorded at all - `certificate_url` is mandatory
(`app/api/vgp/inspections/route.ts:198-203`), a hard dependency with no
fallback. If Stripe replays an event after a mid-handler crash: writes re-apply
(03.1), though `markOrganizationConverted` is idempotent by construction.

---

## 05 - UI mutations

Classification per the brief. The notification-preferences page is the model to
copy: toggles are local state, and only an explicit submit hits the network
(`app/(dashboard)/settings/notifications/page.tsx:62-119`).

| # | Mutation | file:line | Class | Sev | Fix direction |
| --- | --- | --- | --- | --- | --- |
| 05.1 | **VGP schedule edit re-walks every page of the API.** `handleEditSuccess` calls `fetchAllSchedules()` after editing one date field | `components/vgp/EditScheduleModal.tsx:38-56` -> `components/vgp/VGPSchedulesManager.tsx:341-352` | Optimistic-safe, blocks | **P0** | Patch the single schedule in state. `handleArchive` at `:311-334` in the same file already does this correctly |
| 05.2 | Asset edit (name/status/location) calls `router.refresh()`, re-running the 363 KB unpaginated fetch | `components/assets/EditAssetModal.tsx:86-105` | Optimistic-safe, blocks | P1 | Optimistic update; drop the refresh |
| 05.3 | Asset restore triggers a full `loadAssets()` | `components/assets/AssetsTableClient.tsx:58-84` | Optimistic-safe, blocks | P1 | Splice the row locally |
| 05.4 | Asset add fires `router.refresh()` **and** `onSuccess?.()` - a double refetch | `components/assets/AddAssetModal.tsx:75-95` | Must-wait (server generates QR), reload heavy | P1 | Keep the await; prepend the returned row; remove the duplicate path |
| 05.5 | **Theme save triggers `window.location.reload()` after a 500 ms delay.** A colour change discards the bundle, re-auths and re-fetches every query | `app/(dashboard)/settings/theme/page.tsx:132-140` | Optimistic-safe, full reload | P1 | Colours are already CSS custom properties - write to `document.documentElement.style` |
| 05.6 | 8 in-app navigations use `window.location.href` instead of `Link`/`router.push()`, each a full page load into the P0 pages | `components/vgp/VGPSchedulesManager.tsx:512`; `components/vgp/VGPDashboard.tsx:86,100,115,126,137,184,226` | Navigation | P1 | `next/link` |
| 05.7 | Asset retire blocks through an extra `auth.getUser()`, then leaves the list stale (no refresh at all) | `components/assets/RetireAssetModal.tsx:37-71` | Optimistic-safe, blocks | P2 | Optimistic removal; cache the user id |
| 05.8 | Team role change correctly blocks, but refetches with `select('*')` | `app/(dashboard)/team/page.tsx:270-289` | Must-wait, reload heavy | P2 | Patch the member in state |
| 05.9 | Invitation resend/revoke has no loading guard - the button is re-clickable mid-flight | `app/(dashboard)/team/page.tsx:355-370` | Optimistic-safe | P2 | Per-row pending flag |
| 05.10 | `startAudit` has no loading state | `app/(dashboard)/audits/[id]/page.tsx:193-209` | Must-wait | P2 | Pending guard |
| 05.11 | Asset delete correctly blocks, but `router.refresh()` re-triggers the P0 fetch | `components/assets/DeleteAssetDialog.tsx:28-48` | Must-wait, reload heavy | P2 | Remove the row locally |
| 05.12 | Audit item verify/miss writes rollup counts in a second sequential await | `app/(dashboard)/audits/[id]/page.tsx:240-247` | Already optimistic | P2 | Optional: merge into one RPC |

**Correct as written, no action:** rental checkout
(`components/rental/CheckoutOverlay.tsx:152-210`) and return
(`components/rental/ReturnOverlay.tsx:104-129`) - the server enforces
`already_rented` and `vgp_blocked`, so blocking is required; scan status update
and audit verify (`app/scan/[qr_code]/page.tsx:340-373`, `:199-225`); admin
actions (`app/(admin)/admin/orgs/[id]/AdminOrgActions.tsx:69-133`), which use
`useTransition` + `router.refresh()` on a small page, with typed-name
confirmation on the destructive one.

**Compounding effect.** 05.2, 05.3, 05.4 and 05.11 each trigger a refresh of the
page that owns finding 01.1. Renaming one asset re-downloads the entire fleet
with all columns and both joins. Fixing 01.1 shrinks the blast radius of four
Area-05 findings at once.

---

## 06 - Origin rendering

Most dashboard routes prerender as static shells. That sounds good and is
nearly worthless: **`.next/server/app/assets.html` is 15,354 bytes, contains one
`animate-spin`, and zero occurrences of `serial_number`.** The shell is a
spinner; all data arrives client-side after hydration.

`/scan/[qr_code]` does not prerender at all - verified absent from
`.next/prerender-manifest.json` (only `/scans`, a different route, appears), and
`.next/server/app/scan/[qr_code]/` contains `page.js` with no `.html`.

| # | Finding | file:line | Sev | Evidence | Fix direction |
| --- | --- | --- | --- | --- | --- |
| 06.1 | **Proxy calls `auth.getUser()` on every request including anonymous scans**, before testing whether the route is protected | `proxy.ts:187`, protected list at `:190-198`, matcher `:241` | **P0** | Verified: `getUser()` at 187 precedes the `isProtectedRoute` test | Move the call inside `if (isProtectedRoute)`. Public scans need no session |
| 06.2 | `/api/subscriptions/plans` is global reference data, forced dynamic and uncached. Dynamic *solely* because `createClient()` calls `cookies()` - the cookie is never used | `app/api/subscriptions/plans/route.ts:7,9-13,23` | **P0** | No user or org predicate in the 32-line file. Live: `Cache-Control: public, max-age=0, must-revalidate`, `X-Vercel-Cache: MISS` | Plain anon client + `s-maxage=3600, stale-while-revalidate=86400` |
| 06.3 | `/api/vgp/equipment-types` is global reference data behind 3 auth round trips | `app/api/vgp/equipment-types/route.ts:11,15-18` | **P0** | No `organization_id` filter - byte-identical for every org | Cache the payload |
| 06.4 | **Public scan page is fully client-rendered.** Cost per anonymous scan: 1 proxy auth round trip + shell + 201 KB gz JS + hydration + RPC | `app/scan/[qr_code]/page.tsx:1`, data at `:248-250` | **P0** | Not in the prerender manifest; live headers `private, no-cache, no-store` | See below |
| 06.5 | `/settings` is a static link list shipped as a client component (135 lines, zero fetches) purely for `useLanguage()` | `app/(dashboard)/settings/page.tsx:2,16` | P1 | | Server Component + server-resolved locale |
| 06.6 | Root `/` is a server hop doing an unconditional `redirect('/login')` | `app/page.tsx:4` | P2 | `next.config.ts` has no `redirects()` | Move to `redirects()` - served at the edge |
| 06.7 | Auth screens are static forms shipped as client components | `app/(auth)/login/page.tsx:1` and 4 others | P2 | No mount-time fetch on any | Acceptable; see the `<Providers>` tax in 08 |
| 06.8 | Only 5 of 40 API routes declare segment config | `app/api/health/route.ts:7-8` and 3 others | P2 | The other 36 rely on implicit `cookies()` dynamism | Make intent explicit |

**Correct:** admin routes force dynamic (`app/(admin)/admin/layout.tsx:16`),
appropriate for cross-tenant data.

### The scan page specifically

It cannot be pure ISR as written, and the reason is worth stating precisely:
the `get_asset_by_qr` RPC returns **viewer-dependent** fields -
`viewer_is_member`, and `purchase_date` which is NULL unless the viewer is a
same-org member. One cached HTML for all viewers would leak or hide fields
depending on which way it cached.

The decomposition that works: the public 90% (name, serial, category, status,
location) is identical for every scanner of a given QR code. Move that to a
Server Component with `use cache` + `cacheTag('asset:' + qr)`, invalidated on
asset mutation, and keep the member-only fields in a small client island that
fetches only when a session cookie is present. That makes the meaningful paint
CDN-cacheable per QR code, which is the whole point of a QR landing page.

---

## 07 - Duplicate requests

**No polling and no realtime subscriptions exist anywhere.** Verified: zero
`setInterval` in `app/`, `components/`, `lib/`, `hooks/`, and zero `.channel(` /
`postgres_changes`. Every `setTimeout` found is a UI timer or retry backoff.
That is a genuinely good result and removes a whole class of scaling risk.

React Query is configured sensibly (`app/providers.tsx:17-24`: `staleTime`
60 s, `refetchOnWindowFocus: false`, with 5 min and 1 h overrides on the org,
profile, subscription and plans hooks). The problem is that most page data
bypasses it entirely for raw `useEffect` + `supabase`.

| # | Finding | file:line | Sev | Count | Fix direction |
| --- | --- | --- | --- | --- | --- |
| 07.1 | Same auth + org resolved twice per render by two independent effects | `app/scan/[qr_code]/page.tsx:134,138` vs `:152,155` | **P0** | 2 duplicate RTTs | Share state |
| 07.2 | Verbatim 3-call auth preamble duplicated in one page load | `app/(dashboard)/vgp/report/page.tsx:79` and `:108-110` | P1 | 6 RTTs of pure auth overhead | One request, or a shared React Query key |
| 07.3 | Waterfall: metadata request then inspections request, strictly serial | `app/(dashboard)/vgp/report/page.tsx:67-75` | P1 | 2 HTTP RTTs + 2 preambles | Return the default window with the metadata |
| 07.4 | Dashboard bypasses React Query - every mount re-runs all 9 queries with no cache | `app/(dashboard)/dashboard/page.tsx:56-58` | P1 | Navigating away and back = full refetch | `useQuery(['dashboard'])` |
| 07.5 | Assets page bypasses React Query; `loadAssets` is also the mutation success callback | `components/assets/AssetsPageClient.tsx:66-68`, `:249,251` | P1 | Each mutation refetches the unbounded set | `useQuery` + `invalidateQueries` |
| 07.6 | `users` read twice and `organizations` twice per dashboard page, across two layout endpoints | `app/api/settings/organization/route.ts:27,41`; `app/api/subscriptions/route.ts:51,78` | P1 | 4 redundant reads | One bootstrap endpoint |
| 07.7 | Per-row child components each fetch for an asset already fetched by the parent | `components/vgp/VGPComplianceBadge.tsx:35,52`; `components/rental/RentalStatusCard.tsx:43` | P2 | 3 extra queries; contained to one asset here, but a true N+1 if reused in a list | Extend the RPC |
| 07.8 | Schedules pagination loop re-authorises every page | `components/vgp/VGPSchedulesManager.tsx:108-123` | P2 | 4 RTTs per page | Server-side counts |
| 07.9 | `fetchAllSchedules` effect keyed on `t`, a translator rebuilt each render | `components/vgp/VGPSchedulesManager.tsx:249` | P2 | Guarded by `AbortController`, so requests abort rather than pile up | Drop `t` from deps |

---

## 08 - JS and runtime

Measured from the existing build (`.next`, 2026-08-27, Turbopack). Baseline
shared bundle: 440 KB raw / **128 KB gz** on every route.

| Route | Raw | Notable |
| --- | --- | --- |
| `/assets` | **1,317 KB** | pulls the xlsx chunk |
| `/assets/[id]` | 962 KB | |
| `/qr-codes` | 875 KB | pulls the jspdf chunk |
| **`/scan/[qr_code]`** | **766 KB (201 KB gz)** | the public page |
| other dashboard routes | 440-516 KB | |

Live production measurement of `/login` corroborates the build:
**271.1 KB gz / 896.1 KB raw**, within 2% of local.

| # | Finding | file:line | Sev | Evidence | Fix direction |
| --- | --- | --- | --- | --- | --- |
| 08.1 | **`next/dynamic` is used zero times in the entire codebase** | `app/`, `components/`, `lib/`, `hooks/` | **P0** | No matches | Root cause of everything below |
| 08.2 | **zod (86 KB gz) ships to the public QR page.** Both rental overlays are imported statically but rendered conditionally | `components/rental/CheckoutOverlay.tsx:8`, `ReturnOverlay.tsx:8`; imported at `app/scan/[qr_code]/page.tsx:23-24`, rendered at `:904`, `:920` | **P0** | Chunk fingerprints 1,088 zod refs and is in the scan page manifest | `next/dynamic` both overlays |
| 08.3 | **`import * as XLSX from 'xlsx'` in a client component** - 119 KB gz loaded by every visitor to the assets list, not just importers | `components/assets/ImportAssetsModal.tsx:8` | **P0** | Chunk attributed to `(dashboard)/assets` | `next/dynamic` the modal. The API route already imports it correctly server-side |
| 08.4 | jspdf + qrcode (132 KB gz) eagerly bundled, needed only on a button click | `components/assets/BulkQRGenerator.tsx:5-6`, used at `:71` | P1 | | `await import('jspdf')` in the handler |
| 08.5 | i18n ships both languages to every visitor, including the public scan page | `lib/i18n.ts`, imported by 42 client files | P1 | 23 KB gz chunk contains both FR and EN strings; confirmed live | Split per locale |
| 08.6 | Supabase realtime/websocket client ships but is never used | chunk on the scan page | P1 | No `.channel(`/`.subscribe()` outside `onAuthStateChange` | Narrower import |
| 08.7 | Synchronous xlsx parse on the main thread, up to the 400-row pilot cap | `components/assets/ImportAssetsModal.tsx:168-171` | P1 | `arrayBuffer()` -> `XLSX.read` -> `sheet_to_json`, all blocking | Web Worker, or use the server route |
| 08.8 | **No virtualization exists.** `@tanstack/react-table` is a dependency but is imported nowhere; tables render via raw `.map()` | `package.json:20`; `components/assets/AssetsTableClient.tsx:129,273` | P1 | Zero matches for `react-table`/`react-virtual` | Adopt it or drop the dependency |
| 08.9 | `papaparse` is a dependency and is never imported | `package.json` | P2 | Zero matches | Remove |
| 08.10 | `<Providers>` (React Query + Toaster + LanguageProvider + Sentry) wraps 100% of routes, including `/` and the five auth screens | `app/layout.tsx:50` -> `app/providers.tsx:2` | P2 | | Scope to `(dashboard)` |

**Correct:** lucide-react and date-fns use narrow named imports and tree-shake
properly (32 and 1 sites). Sentry is correctly lazy-loaded inside a `useEffect`
(`app/providers.tsx:12`) - that is the exact pattern the four findings above
need.

---

## 09 - Connections and concurrency

**There is no Postgres connection pool to tune, and that is the finding.**
`.env.local` contains no `DATABASE_URL` or `POSTGRES_URL`, and no code
references pgbouncer or a pooler port. All database access is PostgREST over
HTTPS via `@supabase/supabase-js`. Transaction-mode vs session-mode pooling
does not apply; Supabase owns the pool server-side.

So serverless connection exhaustion is **not** the risk at 1,000 users. The
risk is round-trip amplification and Supabase Auth rate limits.

| # | Finding | file:line | Sev | Evidence | Fix direction |
| --- | --- | --- | --- | --- | --- |
| 09.1 | **72 `auth.getUser()` call sites, each a network JWT validation, not a local decode.** No `React.cache()` dedup exists. `/audits` calls it 3x on one mount, each followed by an identical `users.select()` | 72 matches across `app/`, `components/`, `lib/`, `hooks/`, `proxy.ts`; `app/(dashboard)/audits/page.tsx:197,245,285` | **P0** | | `React.cache()` for server-side request dedup; hoist on client pages |
| 09.2 | `requireFeature` is 3 serial round trips on every gated request, applied even to global reference data | `lib/server/require-feature.ts:31,40-44,55-58`; `app/api/vgp/equipment-types/route.ts:11` | **P0** | At 1,000 concurrent users this is ~3,000 in-flight Supabase calls before any real work | Cache user+org resolution; cache the RPC per org |
| 09.3 | **Rate limiter is per-isolate.** `const store = new Map()` means the effective limit is `configured_limit x instance_count`, which on Fluid Compute is elastic and unbounded | `lib/security/rate-limit.ts:9`, limits at `:65,77` | **P0, ACCEPTED** | Confirmed live during the 50-VU run: /scan 429s arrived interleaved with 200s, which is what per-instance counters look like from outside. The ceiling is real and measured | **Decision 2026-09-03: left as is, deliberately.** Both fixes (Vercel Runtime Cache, Upstash Redis) need a new dependency, and with no paying customers and near-zero traffic the owner accepted the residual risk rather than add one before JDL. The limits are best-effort speed bumps, NOT a control: `auth` at 10/60s and `password` at 5/300s are multiplied by however many instances are warm. Revisit before real traffic, and certainly before the login form faces the public |
| 09.4 | 12 route files hand-roll their own `createServerClient`, duplicating `lib/supabase/server.ts` including cookie options | `app/api/vgp/*` (9 files), `settings/profile*`, `subscriptions`, `uploadthing/core` | P1 | Divergence risk on any auth change | Consolidate |
| 09.5 | Service-role clients created per invocation | `app/api/scan/update/route.ts:13-19` and 6 more | P2 | Correct (no leak) but pays TLS setup each time | Module-level singleton |
| 09.6 | New server client per request | `lib/supabase/server.ts:33-66` | P2 | Object allocation only - no socket, no handshake | **Correct as-is.** Cannot be a singleton: it carries per-request auth and slot |
| 09.7 | No client is ever created inside a loop | verified across all N+1 loops | - | **No connection leak** | No change |

**Rate limiter memory, corrected.** An earlier draft called this a leak. It is
not. Reproduced with the real algorithm at 1,000 unique IPs/s against the
`/scan` bucket: the map stabilises at ~61,000 entries (~4.7 MB) and stays there,
because `cleanup()` is throttled to once a minute and each sweep returns it to
steady state. The bound is roughly `2 x window x arrival_rate`. What is true:
cleanup is arrival-driven, so entries persist after traffic stops until the next
request or isolate recycle; and the bound scales with attacker-controlled
arrival rate (~47 MB at 10,000 IPs/s). That is retention and a capacity concern,
not a leak. **P2.** The per-instance correctness problem (09.3) is the real
issue and is unaffected.

**Browser client is well-engineered:** `lib/supabase/client.ts:187-204` caches
one client per slot with `isSingleton: false`, and the comment at `:176-186`
explains exactly why. No change.

### Security findings surfaced by the performance lens

Out of scope but too serious to omit:

- **`app/api/assets/preview-import/route.ts` has no authentication at all.**
  Verified: zero occurrences of `auth`, `getUser`, `createClient` or
  `rateLimit` across all 120 lines. `POST` goes from `request.formData()`
  (`:79`) straight to `XLSX.read(buffer)` (`:87`) with no size check. An
  unauthenticated, CPU-bound parse behind a rate limiter that does not hold
  across instances (09.3) is a denial-of-service surface, and it is directly
  relevant to a 1,000-user envelope.
- **Debug logging left in a hot per-org path**, annotated
  `// TODO: REMOVE before live demo`:
  `app/api/vgp/compliance-summary/route.ts:79`, `:125-131`.

---

## 10 - Caching

| Layer | Status | Evidence |
| --- | --- | --- |
| Browser `Cache-Control` | **absent** | Zero matches repo-wide outside 3 download routes |
| CDN / Vercel | **effectively unused** | `vercel.json` has only `crons`; `next.config.ts:21-28` sets 6 security headers, no cache headers |
| Next.js `use cache` / `unstable_cache` | **not used** | Zero matches |
| `revalidate` | **not used** | All prerendered routes show `initialRevalidateSeconds: false` |
| React `cache()` | **not used** | Zero matches - no request-level dedup at all |
| React Query (client) | **used, partially** | `app/providers.tsx:17-24`; covers 4 hooks, bypassed by page data |
| DB / in-memory | none | |

| # | Read recomputed every request | file:line | Sev | Fix |
| --- | --- | --- | --- | --- |
| 10.1 | `subscription_plans` - global, immutable pricing | `app/api/subscriptions/plans/route.ts:9-13` | **P0** | CDN `s-maxage=3600, swr=86400` |
| 10.2 | `vgp_equipment_types` - global lookup, behind 3 auth round trips | `app/api/vgp/equipment-types/route.ts:15-18` | **P0** | `use cache` + `cacheTag` |
| 10.3 | `users.select('organization_id')` - same row re-fetched 2-3x per request across 20+ sites | `lib/server/require-feature.ts:40-44`; `app/(dashboard)/audits/page.tsx:203,248,288` | **P0** | `React.cache()` - the single largest win |
| 10.4 | `auth.getUser()` - network validation repeated within one request, 72 sites | `proxy.ts:187` and 71 others | **P0** | `React.cache()`; skip in proxy for public routes |
| 10.5 | `has_feature_access` RPC - per-org, changes rarely | `lib/server/require-feature.ts:55-58` | P1 | Short-TTL cache keyed by org |
| 10.6 | Public asset-by-QR - identical public fields for every scanner | `app/scan/[qr_code]/page.tsx:248-250` | P1 | `cacheTag('asset:'+qr)` |
| 10.7 | Compliance summary: unbounded join aggregated in JS per request | `app/api/vgp/compliance-summary/route.ts:53-69` | P1 | Cache per org; aggregate in SQL |

### Hit-ratio targets

| Layer | Now | Target | Basis |
| --- | --- | --- | --- |
| CDN - reference data | 0% | **95%+** | Global and immutable; only TTL expiry misses |
| CDN - public scan pages | 0% | **70-85%** | Per-QR ISR; misses are first scan and post-mutation |
| CDN - static assets | high | maintain | Content-hashed, immutable paths |
| `React.cache()` request dedup | 0% | **60-70%** of auth/org reads | `/audits` alone drops 3 `getUser()` + 3 `users` to 1 each |
| Next.js data cache (per-org, 60 s) | 0% | **50-70%** | Dashboards are revisited within the window |
| React Query (client) | partial | **80%** on org/profile/subscription | Extend the existing pattern to raw Supabase calls |

---

## 11 - Scalability

The harness is in [`load/`](../load/) and is ready to run. It adds no app
dependency; k6 is a standalone binary.

**Profiles** (all run the same workload, so runs are comparable; only the
arrival shape changes): smoke 5u/5m, normal 50u/10m, busy 250u/10m, peak
500u/10m, target 1000u/15m, spike 100->1000, soak 300u/2h, cache-cold 1000u
with no warmup. Plus `write-contention.js` and `dep-degrade.js`.

**Scenarios:** login, dashboard, assets list, scan checkout/return, record
inspection, DREETS report, plus a reference-data cacheability probe.

**Thresholds** encoded in `load/lib/metrics.js`: `http_req_failed` < 1%, read
p95 < 500 ms, mutation p95 < 800 ms, p99 < 1.5 s, zero auth failures. Reads and
mutations are tracked separately so fast reads cannot mask a slow write.
Deliberate business-rule responses (409 `already_rented`, 403 `vgp_blocked`)
are not counted as errors - counting them would make the contention scenario
report a false collapse precisely when locking is working.

| # | Finding | Sev | Note |
| --- | --- | --- | --- |
| 11.1 | **The harness must set `AUTH_COOKIE_NAME=travixo-auth`** against the deployed branch. Otherwise GoTrue sign-in succeeds and every app route returns 401, because the app reads a cookie the harness never wrote | **P0** | Handled in `load/lib/config.js:authCookieName()`, mirroring `lib/supabase/cookie-name.ts:55` and `lib/supabase/account-slot.ts:188-190`. Documented in the README as the first thing to check |
| 11.2 | The assets scenario reproduces the browser's **direct PostgREST call**, not just `/api/*`. Testing only API routes would miss the app's heaviest query entirely, since the assets list bypasses the API layer | P1 | `load/lib/scenarios.js`, tag `db:assets_list_unpaginated` |

**UNVERIFIED - saturation point.** Not probed. Load-testing production is out
of scope by constraint, and no authenticated preview environment was available
from this machine. The harness reports it directly: run the profiles in order
and record the step where latency stops rising linearly or errors cross 1%. The
README has the table to fill in.

**UNVERIFIED - dependency degradation under load.** The app hardcodes the Resend
and Stripe SDK base URLs, and neither reads an override env var, so latency
cannot be injected without changing app code - which this audit does not do.
`dep-degrade.js` is delivered ready to run against an environment where the
operator has repointed the SDK keys at a mock or placed the app behind a
latency-injecting egress proxy. `DEGRADE_MODE` records which was used so the
result is not reported as something it is not; with `DEGRADE_MODE=none` the run
is explicitly labelled a baseline.

**Predicted first bottleneck: Supabase Auth, not Postgres.** One `/dashboard`
load makes 4 GoTrue calls and 14 PostgREST calls, essentially all serial. At
1,000 concurrent users with a ~5 s think time, that is roughly 800 GoTrue
requests/s and 2,800 PostgREST requests/s at steady state. The auth service is
the contention point well before the database is. This is a projection from
measured round-trip counts, not an observation - it is exactly what
`PROFILE=target` exists to confirm or refute.

---

## 12 - Cost per 1,000 sessions

**Model.** One "session" = one authenticated user doing a realistic mix:
2 dashboard loads, 2 assets-list loads, 1 report, 3 scans, 1 write. Derived
from measured payloads and counted round trips.

**Egress per session** (measured, gzipped, from the 520-asset tenant):

| Component | Per session | Basis |
| --- | --- | --- |
| Assets list x2 | 65 KB | 32,472 B measured, gzip |
| Dashboard x2 | 24 KB | aggregate queries, all rows returned |
| Report x1 | 30 KB | inspections, unpaginated |
| Scans x3 | 12 KB | RPC + badge queries |
| JS bundle (first load, uncached) | 271 KB | measured live on `/login` |
| JS bundle (repeat, cached) | ~0 KB | content-hashed immutable paths |
| **Supabase egress subtotal** | **~131 KB** | excludes the JS bundle, which is Vercel |

At 1,000 sessions: **~131 MB Supabase egress**, plus ~271 MB Vercel bandwidth if
every session is a cold first load (realistically far less - the bundle is
immutable and cached).

**Requests per 1,000 sessions:** ~18,000 Vercel function invocations
(9 page/API loads x ~2 routes each) and ~45,000 Supabase requests (the round-trip
counts in Area 02).

| Line item | Unit assumption | Per 1,000 sessions |
| --- | --- | --- |
| Supabase egress | 0.09 USD/GB beyond free tier | 0.012 USD |
| Supabase compute | Pro instance, amortised | ~2.00 USD |
| Vercel function invocations | 0.60 USD/million | 0.011 USD |
| Vercel Active CPU | ~0.128 USD/hour, ~80 ms/invocation | ~0.05 USD |
| Vercel bandwidth | 0.15 USD/GB | ~0.04 USD |
| Resend | free tier to 100/day; 20 USD/mo for 50k | ~0.10 USD |
| UploadThing | storage + egress, certificates only | ~0.05 USD |
| Stripe | per-transaction, not per-session | 0 USD |
| **Total** | | **~2.26 USD (~2.10 EUR)** |

Including a proportional share of fixed monthly platform cost (Supabase Pro
25 USD + Vercel Pro 20 USD) at a pilot volume of ~5,000 sessions/month, the
fully-loaded figure is approximately **8.50 USD / 7.90 EUR per 1,000 sessions**.

**Cost per successful transaction:**

| Transaction | Marginal cost | Note |
| --- | --- | --- |
| Asset created | ~0.0002 USD | 3 round trips, no email |
| Inspection recorded | ~0.0009 USD | 11 round trips + UploadThing storage |
| Subscription started | ~0.002 USD + Stripe fees | webhook is 7 round trips |

| # | Finding | Sev | Note |
| --- | --- | --- | --- |
| 12.1 | **Cost is dominated by fixed platform fees at pilot volume, not usage.** At 5,000 sessions/month the marginal cost is ~11 EUR against ~41 EUR of fixed subscriptions | P1 | Optimising egress saves little *today*; it matters at 10x |
| 12.2 | Fixing 01.1 alone cuts assets-list egress by 70% (363 KB to 108 KB raw), the single largest usage-driven line | P1 | Compounds with 05.2-05.4, which re-trigger that fetch on every mutation |
| 12.3 | **UNVERIFIED - unit prices.** Figures above use published list prices from training data, not the account's actual invoices, and no billing dashboard was accessible | **P0 for accuracy** | Reconcile against real invoices before quoting to anyone. Directionally sound; precisely unverified |

---

## Results

What has actually shipped, with measured deltas where a measurement exists.
Anything not measured says so rather than carrying an estimate.

### Applied to production

| Change | Evidence |
| --- | --- |
| Asset-limit trigger (`enforce_pilot_asset_limit`) | Verified enforcing: an insert on the 1,010-asset org is refused with `Asset limit reached for this organization (1010 of 500 used)`. Metering had never fired before this - two orgs held 1,000 assets each against a 400 cap, because `check_pilot_asset_limit` was a reporting function wired to nothing |
| `admin_mark_paid` RPC | Live, rejecting non-admins with `not_authorized` |
| Stale `checkout_asset` overload dropped | Both call shapes now resolve to the single surviving 11-argument function. Before: `PGRST203 could not choose the best candidate`. A checkout can no longer silently write `client_id` NULL and vanish from the recall pass |
| Migration history repaired | 25 files renamed to unique 14-digit timestamps (25 renames, 0 content changes), ledger repaired to 25 matched / 0 orphans |
| Declarative schema baseline | 51 files in `supabase/schemas/`, pulled without touching remote history |

### Measured code deltas

| Change | Before | After | Delta |
| --- | --- | --- | --- |
| Assets list payload (1,010-asset tenant) | 827,119 B | 521,499 B | **-37%** on every visit |
| `/api/subscriptions/plans` rendering | dynamic, `X-Vercel-Cache: MISS` | **static, 1h revalidate** | confirmed in build output |
| Dashboard round trips after org resolution | 7 serial | 1 parallel | 7 -> 1 |
| Scan page audit lookup | 1 query per audit item | 1 query total | N -> 1 |
| VGP schedule edit | full multi-page API walk | single-row patch | whole list -> 1 row |

### Measured under load

k6 against production, reads only. The owner elected to test production
directly rather than a preview: zero paying customers, and the database was
shared with preview regardless.

**Before** is the pre-audit build; **after** is the same profile once the fixes
were deployed.

| 5 VUs, 5 min | Before | After | Change |
| --- | --- | --- | --- |
| Assets list avg | 98 ms | **61 ms** | **-38%** |
| Assets list median | 91 ms | **37 ms** | **-59%** |
| Read p99 | 1.21 s | **1.00 s** | -17% |
| Read p95 | 957 ms | 818 ms | -15% |
| Report avg | 512 ms | 487 ms | -5% |
| Dashboard avg | 112 ms | 118 ms | flat |
| Errors | 0.00% | 0.00% | - |

The assets page is where the payload work lands: the median more than halved.

**Read p95 still misses the 500 ms budget**, and the remainder is concentrated
in the report path, which barely moved. That is consistent with the scaling
curve below.

| 50 VUs, 10 min | Before | After | Change |
| --- | --- | --- | --- |
| Read median | 158 ms | **97 ms** | **-38%** |
| Read avg | 335 ms | **272 ms** | -19% |
| Report avg | 457 ms | **460 ms** | flat |
| Report median | 572 ms | 578 ms | flat |
| Dashboard avg | 105 ms | 103 ms | flat |
| Read p95 | 799 ms | 791 ms | flat |
| Requests | 16,592 | **20,814** | +25% throughput |
| Application errors | 1.49%* | **0.00%** | - |

\* the earlier 1.49% was rate limiting counted as failure; it is classified
correctly now, and `travixo_rate_limited` reports 1.46% separately.

The **median** is the honest number here: 158 ms to 97 ms at the same
concurrency, with 25% more requests served in the same ten minutes. The mean
and p95 barely move because they are dominated by the report path, which the
work so far does not fix.

**The dashboard is flat at both 5 and 50 VUs.** The `Promise.all` change is
correct - seven serial round trips became one - but it is evidently not where
that page's time was going. Worth knowing rather than glossing: the next pass
on dashboard latency should measure before assuming, rather than optimising the
next-most-obvious thing.

### The latency is cold starts, not saturation

The clearest single result of the whole exercise. On the pre-audit build,
going from 5 to 50 concurrent users made every percentile **better**:

| Pre-audit build | 5 VUs | 50 VUs |
| --- | --- | --- |
| Read p95 | 957 ms | **799 ms** |
| Read p99 | 1.21 s | **939 ms** |
| Report p95 | 851 ms | **709 ms** |

That is the opposite of saturation. Five lonely users each pay Vercel function
startup; fifty keep the functions warm and every request is cheaper.

It matters commercially: today's real traffic looks far more like 5 users than
50, so a prospect opening a demo link lands on a cold start. The fix category
is warming and round-trip count, not query tuning - which is what the dashboard
`Promise.all` and the report path's doubled auth preamble address.

### Harness caveats worth knowing

- **429s are not errors.** `proxy.ts` collapses every `/scan/<qr_code>` into one
  bucket per IP (anti-enumeration, 30/60s). Fifty VUs from one machine share one
  IP and therefore one bucket, which is exactly the traffic the limiter exists
  to throttle. Real users arrive from many IPs. Counted on `travixo_rate_limited`
  so the ceiling stays visible.
- Four separate "findings" during load testing turned out to be bugs in the
  harness, not the app: a cookie jar cleared between iterations, a login gated
  on `__ITER === 0` that a ramping executor skips, a scenario still issuing the
  pre-fix query, and a cache assertion that could never pass. Hence the rule in
  `docs/working-agreements.md`.

### Still not measured

- Saturation point. Nothing above 50 VUs has been run, so the 1,000-user
  envelope remains **UNVERIFIED**.
- Write paths. Every run so far is reads-only (`ENABLE_WRITES` unset).
- Dependency degradation. Resend and Stripe base URLs are hardcoded, so latency
  cannot be injected without changing app code.

---

## Prioritised fix list

Ordered by (severity x cost impact) / effort. Effort: S = under an hour,
M = under a day, L = more.

| # | Fix | file:line | Effort | Why first |
| --- | --- | --- | --- | --- |
| 1 | `Promise.all` the 7 independent dashboard queries | `app/(dashboard)/dashboard/page.tsx:85-187` | **S** | 7 serial round trips become 1. Mechanical, low risk, most-visited page |
| 2 | Skip `auth.getUser()` for public routes in the proxy | `proxy.ts:187` | **S** | Removes a blocking auth round trip from every anonymous QR scan |
| 3 | Collapse the scan-page N+1 into `.in()` | `app/scan/[qr_code]/page.tsx:173-180` | **S** | N queries become 1 on the highest-traffic public path |
| 4 | Cache the two reference-data routes | `app/api/subscriptions/plans/route.ts:9`; `app/api/vgp/equipment-types/route.ts:15` | **S** | Zero correctness risk, immediate CDN offload, 95% hit ratio available |
| 5 | Delete the theme-save `window.location.reload()` | `app/(dashboard)/settings/theme/page.tsx:132-140` | **S** | The colours are already CSS custom properties. Removes a full page reload |
| 6 | INSERT the Stripe idempotency guard **first** | `app/api/stripe/webhook/route.ts:91` vs `:225` | **S** | Money correctness. The UNIQUE constraint already exists |
| 7 | Add `AbortSignal.timeout()` to every Resend call, and `maxDuration` to the cron | `lib/email/email-service.ts:175,455,537`; `app/api/cron/vgp-alerts/route.ts` | **S** | One hung socket currently costs the whole day's alerts |
| 8 | Hoist the client-recall notification out of the staff-email success branch | `app/api/cron/vgp-alerts/route.ts:837` | **S** | The people holding the equipment are the ones not being told |
| 9 | Authenticate (or delete) `preview-import` and add a size cap | `app/api/assets/preview-import/route.ts:77-87` | **S** | Unauthenticated CPU-bound parse - a DoS surface at 1,000 users |
| 10 | Paginate the assets list server-side with explicit columns | `components/assets/AssetsPageClient.tsx:86-101` | **M** | 363 KB to ~11 KB per load, and defuses four Area-05 findings |
| 11 | `React.cache()` on user + org resolution | `lib/server/require-feature.ts:31,40` | **M** | The most-repeated read in the app; 60-70% dedup available |
| 12 | `next/dynamic` for the rental overlays, xlsx modal and jspdf generator | `app/scan/[qr_code]/page.tsx:23-24`; `components/assets/ImportAssetsModal.tsx:8`; `BulkQRGenerator.tsx:5` | **M** | ~86 KB gz off the public scan page, ~119 KB gz off `/assets` |
| 13 | Patch state instead of refetching after schedule edit | `components/vgp/VGPSchedulesManager.tsx:341-352` | **M** | Removes a full multi-page API walk per single-field edit. `handleArchive` in the same file is the model |
| 14 | Run `load/sql/index-audit.sql`; add the missing FK indexes | live database | **M** | Settles I.4 and unblocks every DB finding marked inferred |
| 15 | Baseline the live schema into a migration | `supabase/migrations/` | **M** | Until this exists, no index or RLS claim on the 7 core tables is verifiable |
| 16 | Move the Stripe webhook and inspection writes into RPCs | `app/api/stripe/webhook/route.ts`; `app/api/vgp/inspections/route.ts` | **L** | Atomicity. 03.4 is a safety issue: a failed inspection must not leave equipment bookable |
| 17 | Shared-store rate limiter | `lib/security/rate-limit.ts:9` | **L** | The current limit is undefined across instances, and weakens exactly under load |
| 18 | Server-render the public scan page's public fields with `cacheTag` | `app/scan/[qr_code]/page.tsx` | **L, DEFERRED** | Makes the QR landing page CDN-cacheable, 70-85% hit ratio available | **Deferred post-JDL (2026-09-03).** Largest remaining app change, on the route a prospect is most likely to open. The decomposition is written up in area 06 and stands. |

**If only one day is available:** items 1-9 are all S, all independent, and
together remove the worst latency, the worst correctness risk and the worst
security surface.

---

## Unverified items

| Item | Reason | How to settle |
| --- | --- | --- |
| `EXPLAIN ANALYZE` for the top 10 queries | No arbitrary-SQL RPC on the REST API (correctly); no `psql` on this machine | `load/sql/explain-top-queries.sql` |
| ~~Index existence on the 7 core tables~~ | **CLOSED 2026-09-01.** The declarative baseline shows 47 live indexes against the 18 this repo declared. That settled I.4: 1 of 14 FK candidates was already covered, 5 were worth creating, 8 were not | `supabase/schemas/public/tables/` |
| ~~Live RLS policy text (finding 02.4)~~ | **CLOSED 2026-09-01.** Confirmed from live DDL: `scans` has no `organization_id`, and isolation rests on a correlated `EXISTS` through `assets`. Also found what the audit missed - **two** overlapping SELECT policies (`scans_select_same_org` for authenticated, `users_view_org_scans` for PUBLIC) doing the same job differently. Postgres ORs permissive policies, so both evaluate per row. Severity revised to **P2**: 337 scan rows total, 2 in the last 7 days | `supabase/schemas/public/tables/scans.sql` |
| Saturation point | Production load-testing is out of scope; no authenticated preview available | `PROFILE=target`, then fill in the README table |
| Dependency degradation under load | Resend/Stripe base URLs are hardcoded; injecting latency would require app changes | `dep-degrade.js` with an external mock or proxy |
| Cost model unit prices | List prices from training data, not the account's invoices | Reconcile against real invoices |

---

## What is already right

Worth recording, so a future pass does not "fix" it:

- **Checkout and return are atomic.** Both delegate to a Postgres function
  doing `SELECT ... FOR UPDATE` then all writes in one transaction. This is the
  pattern the inspection and webhook paths need.
- **Excel import is correctly batched:** 3 round trips for 400 rows.
- **No polling and no realtime subscriptions anywhere** - a whole class of
  scaling risk simply absent.
- **No connection leaks.** No Supabase client is ever constructed inside a loop.
- **The browser client is carefully engineered** (`lib/supabase/client.ts:176-204`),
  cached per slot with a comment explaining exactly why it must not be a singleton.
- **Compression is correct** - Brotli at the edge, 4.6x on `/login`.
- **React Query is configured sensibly**; it is simply bypassed by most page data.
- **Sentry is lazy-loaded** (`app/providers.tsx:12`) - the exact pattern four
  bundle findings need.
- **`app/api/vgp/schedules/route.ts` and `app/api/clients/route.ts` are properly
  paginated**, with the enrichment batched via `.in()`. The schedules endpoint
  even documents why its cap is what it is.
