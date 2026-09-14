# Shipped feature state - evidence-based audit (v2)

Date: 2026-09-14. Branch: `hotfix/vgp-alert-claim-rpc`.
Method: production build + running instance on port 3001, unauthenticated HTTP
sweep of all 32 pages and 43 API routes, live Supabase introspection against
project `kvptgaygmokhinfnuofs`, repo-wide negative proofs with `git log --all -S`.
Read-only: no code, migrations, or commits. Working tree restored to its
session-start state (agent-file md5s re-verified after the build).

This revision supersedes the v1 audit of the same date. **Three v1 verdicts were
wrong and are corrected below** (findings 1, 2, 3). They were wrong because v1
never ran the app and asserted runtime behaviour from code reading.

## Phase 0 - what was discovered, not assumed

| Thing | Briefed / assumed | Actually found |
|---|---|---|
| i18n | `messages/*.json` | **Hand-rolled.** `lib/i18n.ts`, a 4251-line object with `{en, fr}` leaves. No i18n library in `package.json`. `messages/` does not exist. |
| Auth middleware | `middleware.ts` | **`proxy.ts`** (Next.js 16.3.3 renamed it; build output labels it `ƒ Proxy (Middleware)`). |
| DB access | `DATABASE_URL` / psql | **Absent.** No `DATABASE_URL` in `.env.local`. Resolved via rung 3 - service-role + anon clients. |
| Cron | - | `vercel.json`: `/api/cron/vgp-alerts` at `0 7 * * *`, `/api/cron/vgp-weekly-digest` at `0 8 * * *`. |
| Payments | - | `stripe` SDK, `lib/stripe.ts` `PRICE_MAP`. |
| Route count | v1 said 42 API routes | **43** `route.ts` files (v1 filed `app/auth/callback/route.ts` under pages). |

## Phase 1 - running instance

`npm run build` → **exit 0**, no errors. `npx next start -p 3001` → ready in 97ms.
`AGENTS.md` / `CLAUDE.md` were backed up before the build and restored after;
md5s re-verified identical (`96d3341…`, `5c27369…`).

`/api/health` → `200 {"status":"ok","db":true,"latencyMs":86}`.

### Pages, unauthenticated (32 routes, all curled)

| Result | Routes |
|---|---|
| **307 → `/login?redirectTo=…`** | `/`, `/dashboard`, `/assets`, `/assets/[id]`, `/audits`, `/audits/[id]`, `/settings` ×6, `/team`, `/vgp`, `/vgp/inspections`, `/vgp/inspection/[id]`, `/vgp/report`, `/vgp/schedules`, `/admin`, `/admin/orgs/[id]` |
| **200 public by design** | `/login`, `/signup`, `/confirm`, `/check-email`, `/forgot-password`, `/reset-password`, `/scan/[qr_code]`, `/accept-invite/[token]` |
| **200 - unintended** | `/clients`, `/clients/[id]`, `/clients/[id]/equipment`, `/qr-codes`, `/scans` - see finding 1 |

### API routes, unauthenticated (43 routes, all curled)

- **401 `Unauthorized`** on 22 routes (all `assets/*`, `audits/*`, `clients/*`, `settings/*`, `team/*`, `vgp/*` GETs, plus `subscriptions`).
- **403 `CSRF validation failed`** on every POST/PATCH/DELETE tested (10 routes probed). See finding 2.
- **405** on 12 GET-to-POST-only routes - correct, not stubs.
- **401** on both cron routes with no secret *and* with a wrong secret.
- **400** on `stripe/webhook` POST without a signature; **404** on its GET without `CRON_SECRET`.
- **200** on 3 intentionally public routes: `health`, `subscriptions/plans` (4 plans), `uploadthing` (router *config* only - file types and size caps, no tenant data; upload paths each call `getUser()` in `.middleware()`, with an owner/admin role check on the logo router at `core.ts:100`).

## Phase 2 - live DB

Rung 1 (`DATABASE_URL`/psql): **unavailable**, no such var.
Rung 2 (`supabase db pull --declarative`): available, already run by v1.
Rung 3 (**client introspection**): **this is what worked.** No SQL-execution RPC
exists - `exec_sql`, `exec`, `execute_sql`, `run_sql`, `sql` all return `PGRST202`.

RLS was therefore verified *behaviourally* rather than by reading `pg_class`:
each table was queried with the anon key alongside the service key.

| Table | Service rows | Anon rows | Reading |
|---|---|---|---|
| vgp_alerts | 20694 | RLS reject | scoped |
| assets | 2732 | RLS reject | scoped |
| vgp_inspections | 733 | RLS reject | scoped |
| vgp_schedules | 625 | RLS reject | scoped |
| scans | 344 | 0 | scoped |
| entitlement_overrides | 228 | 0 | scoped |
| rentals | 146 | RLS reject | scoped |
| client_recall_alerts | 138 | RLS reject | scoped |
| asset_categories | 70 | RLS reject | scoped |
| clients | 56 | RLS reject | scoped |
| users | 32 | RLS reject | scoped |
| organizations / subscriptions | 19 / 19 | RLS reject | scoped |
| audit_items / billing_events / audits | 36 / 4 / 3 | RLS reject / 0 / RLS reject | scoped |
| usage_tracking | 12 | 0 | scoped |
| subscription_plans | 4 | **4** | public by design - the pricing page |
| admin_audit_log / platform_admins / team_invitations | 2 / 2 / 2 | 0 / 0 / RLS reject | scoped |
| vgp_equipment_types | **0** | **0** | `TO PUBLIC USING (true)` - world-readable reference data, never seeded |
| user_notification_preferences | **0** | RLS reject | opt-in prefs - normal |
| pending_weekly_digests | **0** | RLS reject | queue/outbox - normal |
| settings_audit_log | **0** | RLS reject | no writer exists - see finding 5 |

**No tenant table leaks to anon.** 25/25 tables enforce RLS behaviourally.

### Empty-table classification (false-negative guard applied)

| Table | Class | Verdict |
|---|---|---|
| `pending_weekly_digests` | Queue/outbox. Enqueued by `cron/vgp-alerts/route.ts:463` (upsert, `ignoreDuplicates`), drained Mondays by `cron/vgp-weekly-digest/route.ts:113`. | **Drained = normal. Not a defect.** v1 marked this UNVERIFIED. |
| `user_notification_preferences` | Opt-in prefs. `preferences/route.ts:119` reads with `.maybeSingle()`; a missing row falls through to `resolveRecipientPreference(null, orgDefaults)` with `DEFAULT_THRESHOLDS = [30,15,7,1,0]`. | **Empty = everyone on org defaults. Not a defect.** v1 marked this UNVERIFIED. |
| `vgp_equipment_types` | **Reference/seed read by UI.** | **BROKEN** - finding 4. |
| `settings_audit_log` | Neither. No reader, no writer. | **ORPHAN** - finding 5. |

## Findings

### 1. Five pages serve a static shell to anonymous visitors (BROKEN at proxy matcher)

**v1 called this "no auth redirect" and hedged that it was unconfirmed. Confirmed
live, and the shape is different from what v1 described.**

`/clients`, `/clients/[id]`, `/clients/[id]/equipment`, `/qr-codes`, `/scans` all
return **HTTP 200** to an unauthenticated request. None appears in the `proxy.ts`
matcher (`proxy.ts:343-373`) or in `protectedRoutes` (`proxy.ts:254-263`), so the
proxy never executes for them. `app/(dashboard)/layout.tsx` has no auth check.

The build marks `/clients`, `/qr-codes`, `/scans` as `○ (Static)` - they are
**prerendered at build time**, so the 200 is a static HTML shell, not a
server-rendered page that happened to skip a check.

No tenant data leaks: every underlying table rejects anon (table above), so the
shell hydrates empty. `/clients` additionally fetches `/api/clients`, which
returns 401. The defect is that an anonymous visitor sees a dashboard chrome
instead of `/login`.

Failing step: **`proxy.ts` matcher omits these five paths.**

### 2. CSRF validation runs ahead of auth on every mutation (correction to v1)

**v1 claimed the inspection PATCH/DELETE stubs "are exported, so they answer
rather than 405." They do not.**

`proxy.ts:128-136` calls `validateCsrf(request)` and returns
`403 {"error":"CSRF validation failed"}` *before* slot resolution and before any
`getUser()`. Live probe of `/api/vgp/inspections`:

| Method | Actual |
|---|---|
| GET | `401 {"error":"Unauthorized"}` |
| POST / PATCH / DELETE | `403 {"error":"CSRF validation failed"}` |

All ten mutation routes probed (`assets/import`, `rentals/checkout`,
`rentals/return`, `scan/update`, `vgp/recall`, `vgp/schedules`, `clients`,
`audits`, `stripe/checkout`, `team/invitations`) returned the same 403.

The stub bodies at `app/api/vgp/inspections/route.ts:343,354` are therefore
**unreachable without a valid CSRF token and session**. They are still stubs, but
they are not an exposed surface.

### 3. `record_inspection` is an orphaned live function (CONFIRMED, with provenance)

Negative proof passed. Repo-wide, `record_inspection` appears only in:
`load/lib/scenarios.js:147` (a k6 group label) and its own schema mirror file.
**No route calls it.**

`git log --all -S"record_inspection"` places it on commit `5d80b45`
"fix(vgp): record an inspection in one transaction", on the **unmerged** branch
`feat/multi-account-sessions-and-admin-pilot-controls`.

The function's own `COMMENT` states its purpose: *"Record a VGP inspection and
its consequences in ONE transaction: the inspection row, the schedule advance,
and out_of_service on a failed result. Replaces three sequential writes where
two failures were swallowed."*

Consequence: `POST /api/vgp/inspections` still performs the non-atomic three-step
write. The author's own text confirms two of those three failures are swallowed.

By contrast `claim_vgp_alerts` **is** wired, confirmed at
`app/api/cron/vgp-alerts/route.ts:833`.

**Grant note.** Per `docs/working-agreements.md`, `REVOKE ... FROM PUBLIC` does
not undo the Supabase default `EXECUTE` grant to `anon`; a separate
`REVOKE ... FROM anon` is required. Neither `record_inspection.sql:123` nor
`claim_vgp_alerts.sql:51` contains one - both only revoke from `PUBLIC`. This
matches `assets_page.sql:88`, the case the working agreement records as having
been missed before. `claim_vgp_alerts` is granted only to `postgres`/`service_role`
so it is not callable by a browser session regardless; `record_inspection` is
granted to `authenticated`. Both scope through `get_my_organization_id()`, which
is NULL without a session - defence by predicate, not by permission.
**Verifying the live grant needs the one command below.**

### 4. `vgp_equipment_types` is empty reference data (BROKEN at data)

Classified under the guard as **reference/seed read by UI** - the third category,
the one that is a defect. The route's own comment confirms it:
*"The rows are the same for every tenant."* Its policy is
`FOR SELECT TO PUBLIC USING (true)` - deliberately world-readable reference data.

Live rows: **0**. **No seed file anywhere in `supabase/`** - the table appears
only in the schema mirror and the pgdelta export. Nothing in the repo would ever
populate it.

Blast radius is smaller than v1 implied. `AddVGPScheduleModal.tsx:106` fetches it
inside `fetchEquipmentTypes()`, and the result only pre-fills a default interval:

```
const matchingType = data.equipment_types?.find(...)
if (matchingType) { setFormData(prev => ({...prev, interval_months: ...})) }
```

An empty list means `matchingType` is `undefined` and the interval keeps its
existing default. **The form still works**; users lose the regulatory-interval
auto-fill and must set `interval_months` by hand. The route is also gated -
`/api/vgp/equipment-types` returns 401 unauthenticated - so this only affects
signed-in, VGP-entitled users.

### 5. `settings_audit_log` has no writer and no reader (ORPHAN)

Negative proof passed. Repo-wide the only hits are the schema mirror, the
generated `types/database.ts:833`, and the v1 audit document itself. **Zero
references in `app/`, `lib/`, or `components/`.** The table has 2 policies, an
index (`idx_settings_audit_log_org`), and 0 rows.

Contrast `admin_audit_log`, which is written and holds 2 rows. v1 listed this
table's row count without classifying it.

### 6. `DashboardClient.tsx` is dead code (CONFIRMED)

Negative proof passed. Repo-wide the only references are its own
`export default` (`DashboardClient.tsx:24`) and `scripts/verify-slot-url.mjs:314`,
which lists it as a file to *check*, not to render. No unmerged branch mounts it.
The live dashboard is `app/(dashboard)/dashboard/page.tsx`, confirmed reachable
(307 → `/login` unauthenticated).

It is the sole origin of two apparent defects, which are therefore **not
user-facing**:

- **40 undefined i18n keys.** It calls 48 `dashboard.*` keys; `lib/i18n.ts:2439`
  defines 24. `getTranslation` returns the raw key on a miss, so these would
  render as literal `dashboard.title` text - but the component never mounts.
- **Two dead links.** `/vgp/inspections/new` and `/audits/new`
  (`DashboardClient.tsx:203,210`). Neither route exists; `find app -type d -name new`
  returns nothing.

Per the brief's orphan-component guard, the live route was confirmed to render
something else before these were reported as non-defects.

### 7. Stripe mode - local only, production not read

`STRIPE_SECRET_KEY` in `.env.local` is `sk_test_`. **`.env.local` is LOCAL-ONLY
and the production value was not pulled**, so no production claim is made here.
The Vercel CLI is not installed in this environment.

Wiring is complete and traced: `PRICE_MAP` (`lib/stripe.ts:13`) reads six
`STRIPE_PRICE_*` env vars, all present; `app/api/stripe/checkout/route.ts:110`
resolves the price into `line_items`.

### 8. i18n is a hand-rolled dictionary (mis-specified brief)

The brief named `messages/fr.json` / `messages/en.json`. **Neither exists and no
i18n library is installed** - a mis-specified path, not a missing feature.
FR/EN lives in `lib/i18n.ts`: a 4251-line `translations` object across 23
namespaces, consumed via `createTranslator(lang)` in 105 files. Every defined
entry carries both `en` and `fr` - zero half-translated keys. The only gap is the
40 dead-component keys in finding 6.

## Feature verdicts

WORKS-EXECUTED = exercised against the running instance.
WORKS-TRACED = code path to a named live table, not executed - reason given.

| Feature | Route | API | Table | RLS | Reachable | Verdict | Evidence |
|---|---|---|---|---|---|---|---|
| Auth redirect (protected) | 17 pages | proxy | `users` | Yes | Yes | **WORKS-EXECUTED** | 307 → `/login?redirectTo=` on all 17 |
| Auth pages public | `/login` etc | - | - | - | Yes | **WORKS-EXECUTED** | 200 ×6 |
| Health | - | `health` | - | - | Public | **WORKS-EXECUTED** | `200 {"db":true,"latencyMs":86}` |
| Public plan list | - | `subscriptions/plans` | `subscription_plans` (4) | Public policy | Public | **WORKS-EXECUTED** | 200, 4 plans; anon reads 4 rows |
| CSRF gate | all | `proxy.ts:128` | - | - | Yes | **WORKS-EXECUTED** | 403 on 10/10 mutation POSTs |
| API auth gate | 22 routes | - | - | - | Yes | **WORKS-EXECUTED** | 401 ×22 |
| Cron secret gate | - | `cron/*` | - | - | Vercel cron | **WORKS-EXECUTED** | 401 no-secret AND wrong-secret |
| Stripe webhook sig | - | `stripe/webhook` | `billing_events` (4) | Yes | Stripe | **WORKS-EXECUTED** | 400 unsigned POST; GET 404 without CRON_SECRET |
| RLS tenant isolation | all | - | 25 tables | Yes | - | **WORKS-EXECUTED** | anon rejected on every tenant table |
| Public QR scan | `/scan/[qr]` | `scan/update` | `scans` (344), `assets` | Yes | Public | **WORKS-EXECUTED** (page 200) / TRACED (write) | page 200 anon; write needs CSRF+session |
| Asset create/update | `/assets` | direct Supabase | `assets` (2732) | Yes (10 pol) | Yes | **WORKS-TRACED** | no test account; 2732 live rows |
| Excel import | `/assets` | `assets/import` | `assets` | Yes | Yes | **WORKS-TRACED** | 405 on GET = POST-only, correct |
| Import preview | `/assets` | `assets/preview-import` | none | - | Yes | **WORKS-TRACED** | 405 on GET |
| QR generation | `/assets`, `/qr-codes` | client `uuidv4` | `assets.qr_code` | Yes | Yes | **WORKS-TRACED** | - |
| VGP schedule CRUD | `/vgp/schedules` | `vgp/schedules[/id]` | `vgp_schedules` (625) | Yes (8 pol) | Yes | **WORKS-TRACED** | 401 gated; 625 live rows |
| Inspection record | `/vgp/inspection/[id]` | `vgp/inspections` POST | `vgp_inspections` (733) | Yes | Yes | **WORKS-TRACED, non-atomic** | finding 3 |
| Inspection edit/delete | - | `vgp/inspections` PATCH/DELETE | - | - | Gated | **STUB** (unreachable) | `route.ts:343,354`; 403 CSRF live |
| Certificate upload | `/vgp/inspection/[id]` | `uploadthing` | `vgp_inspections.certificate_url` | Yes | Yes | **WORKS-TRACED** | `core.ts:50` getUser |
| Alert cron | - | `cron/vgp-alerts` | `vgp_alerts` (20694) | Yes | 07:00 daily | **WORKS-TRACED** | `claim_vgp_alerts` at `route.ts:833` |
| Weekly digest | - | `cron/vgp-weekly-digest` | `pending_weekly_digests` (0) | Yes | 08:00 daily, Monday-gated | **WORKS-TRACED** | queue drained = normal |
| Notification prefs | `/settings/notifications` | `settings/notifications/preferences` | `user_notification_preferences` (0) | Yes | Yes | **WORKS-TRACED** | empty = org defaults |
| Compliance report | `/vgp/report` | `vgp/report` | reads `vgp_inspections` | Yes | Yes | **WORKS-TRACED** | 401 gated; PDF client-side (jspdf) |
| Client recall | `/clients/[id]` | `vgp/recall` | `client_recall_alerts` (138) | Yes | Yes | **WORKS-TRACED** | 138 live rows |
| Audits | `/audits` | `audits` | `audits` (3), `audit_items` (36) | Yes | Yes | **WORKS-TRACED** | 401 gated |
| Rentals | `/scan/[qr]`, `/clients` | `rentals/checkout`,`/return` | `rentals` (146) | Yes | Yes | **WORKS-TRACED** | 146 live rows |
| Team + invitations | `/team` | `team`, `team/invitations` | `team_invitations` (2) | Yes | Yes | **WORKS-TRACED** | 401 gated |
| Subscription paywall | `/settings/subscription` | `has_feature_access` RPC | `subscriptions` (19) | Yes | Yes | **WORKS-TRACED** | - |
| Stripe checkout | `/settings/subscription` | `stripe/checkout` | `subscriptions`, `billing_events` | Yes | Yes | **WORKS-TRACED** | TEST key locally only - finding 7 |
| Admin console | `/admin` | `admin/trigger-vgp-alerts` | `admin_audit_log` (2) | Yes | Yes | **WORKS-EXECUTED** (guard) | 307 → `/login` |
| i18n FR/EN | all | - | - | - | - | **WORKS-TRACED** | `lib/i18n.ts` - finding 8 |
| `/clients`,`/qr-codes`,`/scans` guard | 5 pages | - | - | Yes | **Yes, anon** | **BROKEN at proxy matcher** | HTTP 200 unauth - finding 1 |
| Equipment-type auto-fill | `/vgp/schedules` | `vgp/equipment-types` | `vgp_equipment_types` (0) | Public policy | Yes | **BROKEN at data** | 0 rows, no seed - finding 4 |
| `settings_audit_log` | - | none | `settings_audit_log` (0) | Yes | **No** | **ORPHAN** | zero code refs - finding 5 |
| `record_inspection` RPC | - | none | `vgp_inspections` | - | **No** | **ORPHAN** | unmerged `5d80b45` - finding 3 |
| `DashboardClient` | none | - | - | - | **No** | **ORPHAN** | 1 ref, a lint script - finding 6 |
| `/audits/new`, `/vgp/inspections/new` | - | - | - | - | linked from orphan only | **ABSENT** | no `new` dir under `app/` |

## BLOCKED - and the exact command that resolves each

| Item | Command |
|---|---|
| Live `anon` EXECUTE grant on `record_inspection` / `claim_vgp_alerts` (mirror text shows only `REVOKE … FROM PUBLIC`) | `npx supabase db pull --declarative` then `grep -n "anon" supabase/schemas/public/functions/record_inspection.sql` |
| Production Stripe mode and price IDs | `vercel env pull .env.production --environment=production` (requires `npm i -g vercel`) |
| Authenticated page/API behaviour, Excel import, QR scan write, cert upload, PDF export end-to-end | No test account credentials in this environment. Provide one, then re-run the Phase 1 sweep with its session cookie. |

## Working-tree note

Unchanged from session start, verified by `git status` and by re-checking the
`AGENTS.md` / `CLAUDE.md` md5s after the build. The `supabase/schemas/` deltas
(four line-ending-only modifications, two untracked function files) are v1's
declarative refresh, still uncommitted. Committing them is your call.
