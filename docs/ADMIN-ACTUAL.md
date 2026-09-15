# ADMIN-ACTUAL

What the platform-admin surface actually is, as of 2026-09-15, branch
`chore/reseed-vgp-due-dates`. Read-only inventory. Every claim carries a
`file:line` or a live row count. Where evidence was unobtainable, that is
stated rather than filled in.

Row counts were read live via the service-role key against production on
2026-09-15. Schema claims come from `supabase/schemas/` (the authoritative
mirror per `AGENTS.md`), not from `supabase/migrations/`.

## Scope note

The admin pages live under the route group `app/(admin)/admin`, not
`app/admin`. A glob for `app/admin` returns nothing. The whole surface is
six source files plus three lib helpers.

---

## 1. Routes

| Path | File | Guard | Methods |
|---|---|---|---|
| `/admin` (layout) | `app/(admin)/admin/layout.tsx:23` | `requireSuperAdmin()` | — |
| `/admin` | `app/(admin)/admin/page.tsx:70` | inherited from layout | GET (RSC) |
| `/admin/orgs/[id]` | `app/(admin)/admin/orgs/[id]/page.tsx:93` | inherited from layout | GET (RSC) |
| `/api/admin/trigger-vgp-alerts` | `app/api/admin/trigger-vgp-alerts/route.ts:57` | **tenant role, NOT `requireSuperAdmin`** | POST |

Server actions (not routes, but the only write path in the UI), all in
`app/(admin)/admin/orgs/[id]/actions.ts`:

| Action | Line | Guard |
|---|---|---|
| `extendTrial` | `:48` | `requireSuperAdmin()` |
| `endPilot` | `:89` | `requireSuperAdmin()` |
| `toggleFeatureFlag` | `:123` | `requireSuperAdmin()` |
| `markPaid` | `:165` | `requireSuperAdmin()` |

### requireSuperAdmin coverage

Both pages are covered. `layout.tsx:23` gates every `/admin/**` route, so
child pages inherit it; neither page calls the guard itself, which is correct
given the layout runs first. All four server actions call it independently
(defence in depth), and each underlying SQL function re-checks
`is_super_admin()` — `extend_trial.sql:22`, `end_pilot.sql:38`,
`set_feature_flag.sql:23`, `admin_mark_paid.sql:18`.

The guard itself (`lib/auth/requireSuperAdmin.ts:45`) validates the session
with `getUser()` (`:52`, a real auth-server call, not `getSession()`), then
gates on `is_super_admin()` (`:62`). The profile read at `:71` is display-only
and cannot grant access.

`/admin` is also matched by the proxy (`proxy.ts` matcher, `/admin` and
`/admin/:path*`), but not for authorisation — the comment at `proxy.ts:249`
records that it is there for account-slot resolution, without which
`lib/supabase/server.ts` falls back to slot 0 and the page reads the wrong
account's session.

### FINDING — `/api/admin/trigger-vgp-alerts` is not platform-admin gated

`route.ts:72` gates on the caller's **tenant** role:

```
if (!['admin', 'owner'].includes(user.role)) {
```

`user.role` is read from `public.users.role` (`:36-39`), the per-organization
role. It is not `platform_admins` membership. The file never imports
`requireSuperAdmin`.

Under the B1 identity model documented at `lib/auth/requireSuperAdmin.ts:4-8`,
a platform admin is a `platform_admins` row and their `users.role` is an
ordinary value conveying no privilege. The two models are disjoint. So any
tenant owner or tenant admin of any of the 19 organizations can POST this
endpoint, and the actual platform admins — whose `users.role` is ordinary —
may not even pass it.

`scripts/verify-write-gate-coverage.mjs:28` carried the opposite claim:

```
'app/api/admin/trigger-vgp-alerts/route.ts': 'platform admin only, already gated by requireSuperAdmin',
```

Correction to an earlier version of this document, which called that a failing
assertion. It was not an assertion at all. That line is an entry in an `EXEMPT`
map, and the text after the colon is a free-text human reason the script never
reads. The script checks only two things about the list: that a mutating route
either calls `requireWriteAccess()` or is exempt, and that every exempt path
names a file that exists (`:83-85`). Both held, so nothing was silently
failing — the claim was simply unverified, and read as a finished control. The endpoint invokes
`runVGPAlertsCron()` (`:88`), which sends real email — see section 3.

---

## 2. UI per page

### `/admin` — `app/(admin)/admin/page.tsx`

Render order:

**Header** (from `layout.tsx:27-49`): title link, "Organizations" nav link
(`:34`), admin email + `platform_admin` chip (`:41-44`), sign-out button
(`:46` → `AdminLogoutButton.tsx`).

**Section 1 — Organizations** (`page.tsx:146`), heading + `{orgs.length} total`
(`:149`). One table, 11 columns:

| Column | Line | Source |
|---|---|---|
| Name (link to detail) | `:180` | `organizations.name` |
| Slug | `:187` | `organizations.slug` |
| Tier | `:188` | `organizations.subscription_tier` |
| Status | `:189` | `organizations.subscription_status` |
| Pilot | `:190` | `organizations.is_pilot` |
| Access | `:191-208` | derived, `accessLevel(org)` `:193` |
| Last connected | `:209-224` | Auth admin API, not the DB |
| Pilot ends | `:225` | `organizations.pilot_end_date` |
| Users | `:226-228` | count from `users` |
| Assets | `:229-231` | count from `assets` |
| Created | `:232` | `organizations.created_at` |

Queries behind it: `organizations` select at `:75-80`; `users` select at
`:87-89` (all rows, counted in JS at `:96-102`); `assets` select at `:121-123`
(all rows, counted in JS at `:125-129`).

**Section 2 — Recent signups** (`:242`), "last 20 users" (`:245`). Five
columns — Email `:269`, Name `:280`, Role `:281`, Organization `:282`,
Created `:287`. Query at `:132-136`, `users` ordered by `created_at` limit 20.

Live vs derived on this page:

- Live: every column above.
- Derived, not stored: Access (`accessLevel`), Last connected (Auth admin
  API via `lib/admin/lastConnected.ts:53`, **not** a DB column — `public.users`
  has no last-login field, documented at `lib/admin/orgHealth.ts:13-18`).
- Heuristic, explicitly non-authoritative: the `TEST?` chip at `:271-278`,
  driven by hardcoded string patterns at `:27-32` (`+test`, `example.com`,
  `@travixosystems.com`, `travixo`). The comment at `:20-25` states there is no
  database column marking test accounts and that a real customer could match.

No filters and no action buttons on this page. It is read-only.

There are no admin tables, metrics or actions beyond these two sections.

### `/admin/orgs/[id]` — `app/(admin)/admin/orgs/[id]/page.tsx`

**Back link** (`:229`).

**Section 1 — Org fields** (`:235`), a 12-row definition list built at
`:195-211`: Name, Slug, Tier, Status, Pilot, Trial ends, Pilot ends, Converted
to paid, Access level, Last connected, Created, Org ID. Query at `:103-109`.

**Section 2 — Engagement** (`:250`). Four metric tiles:

| Metric | Line | Behind it |
|---|---|---|
| Last connected | `:254-268` | Auth admin API + `engagementLevel()` |
| Real assets (+ demo count) | `:269-277` | `assets` split on `is_demo_data`, `:138-145` |
| VGP inspections | `:278-285` | `vgp_inspections` count, `:147-150` |
| Access | `:286-306` | `accessLevel()` via `orgHealth()` `:152` |

Below the tiles, a "Conversion signals" block (`:309-326`) with a `score
{health.score}` chip (`:314-316`) and a bulleted signal list (`:318-322`), both
from `orgHealth()` in `lib/admin/orgHealth.ts:206`. The score is a hardcoded
additive heuristic (`orgHealth.ts:225-265`: +40 active, +30/+15 assets, +20
inspections, +10 multi-user). The page labels it "Triage hint only — never used
for billing or access decisions" (`:323-325`), and that is accurate: nothing
persists or reads it.

**Section 3 — Actions** (`:331`) → `AdminOrgActions.tsx`. See section 3.

**Section 4 — Users** (`:346`), `{users.length} total` (`:349`). Six columns:
Email `:374`, Name `:375`, Role `:376`, Language `:377`, Last connected
`:378-389`, Created `:390`. Query at `:119-123`.

**Section 5 — Admin activity** (`:400`), "last 10 actions" (`:403`). Four
columns: When `:426`, Action `:429`, Change `:430` (via `summarizeAudit()`
`:68`), Actor `:431-435`. Query at `:171-176` on `admin_audit_log` filtered by
`target_org_id`; actor emails resolved at `:185-192`.

Note `summarizeAudit()` (`:68-91`) handles `extend_trial`, `set_feature_flag`
and `end_pilot` but has no branch for `admin_mark_paid`, so it returns `'-'`
(`:90`) for that action. Both audit rows currently in production are
`admin_mark_paid`, so the Change column renders `-` for 2 of 2 rows.

---

## 3. Actions

| Action | Writes | Table | Audited | Reversible |
|---|---|---|---|---|
| `extendTrial` | `pilot_end_date`, `trial_ends_at` (pilot branch) or `trial_ends_at` (trial branch), `updated_at` | `organizations` | Yes — `extend_trial.sql:78` | No undo in UI; never shortens (`:44`), so re-running only extends further |
| `endPilot` | `pilot_end_date`, `trial_ends_at`, `pilot_start_date`, `updated_at` | `organizations` | Yes — `end_pilot.sql:93` | No undo in UI. `locked` mode backdates `pilot_start_date` by 46 days (`:68`), destroying the original start date — the `before` payload is the only record of it |
| `toggleFeatureFlag` | one `feature_flags` jsonb key | `organizations` | Yes — `set_feature_flag.sql:49` | Yes, toggle back |
| `markPaid` | `converted_to_paid`, `is_pilot`, `subscription_tier`, `subscription_status`, `updated_at` | `organizations` | Yes — `admin_mark_paid.sql:82` | No undo in UI |
| `POST /api/admin/trigger-vgp-alerts` | sends email; writes whatever `runVGPAlertsCron()` writes | `vgp_alerts` and related | **No** — no `admin_audit_log` write | No — email cannot be unsent |

Every audited mutation performs its `UPDATE` and its audit `INSERT` in one
transaction, so an audit failure rolls the mutation back
(`end_pilot.sql:91-92` states this explicitly).

Confirmation strength varies deliberately: `extendTrial` and
`toggleFeatureFlag` use `window.confirm` (`AdminOrgActions.tsx:79`, `:161`);
`endPilot` requires typing the exact org name (`:99-105`, gated at `:359`);
`markPaid` requires a ≥10-character reason (`:129-135`) plus a `window.confirm`
naming the consequence (`:136-143`).

`markPaid` is the only non-Stripe path that can set `converted_to_paid`
(`actions.ts:150-155`). It records `source: 'admin_manual'`
(`admin_mark_paid.sql:92`) so manual grants stay distinguishable from Stripe
conversions. It is idempotent: an already-converted org returns
`changed: false` without rewriting (`:55-61`).

### FIXED — `markPaid` offered only plans the database rejects

**Status: fixed. Recorded here because a stale finding gets re-reported as
live.** Verified 2026-09-15 on `feat/admin-console-rehaul`:
`ALLOWED_PLAN_SLUGS` (`lib/admin/featureFlags.ts:98`) now reads `['travixo']`,
and `featureFlags.ts:87-96` documents the defect and the correction in place.
The set now matches the one active plan, so the control works.

What it was: `admin_mark_paid.sql:30-35` requires the plan to exist **and be
active**:

```
SELECT 1 FROM public.subscription_plans WHERE slug = p_plan_slug AND is_active
```

Live `subscription_plans` (5 rows, re-read 2026-09-15 — unchanged):

| slug | is_active | price_monthly | max_assets |
|---|---|---|---|
| starter | false | 490 | 100 |
| professional | false | 1200 | 500 |
| business | false | 2400 | 2000 |
| enterprise | false | 999999 | 999999 |
| travixo | **true** | 179 | 2147483647 |

`ALLOWED_PLAN_SLUGS` previously offered exactly `starter`, `professional`,
`business`, `enterprise` — the four inactive ones. The one active plan,
`travixo`, was not offered. The two sets were disjoint, so every selectable
option raised `invalid_plan`, surfaced to the admin as "Unknown plan."
(`actions.ts:203`), and the working plan was unreachable through the UI.

Caveat on the original evidence, kept for the record: `admin_mark_paid` was
**not** executed to confirm the rejection — an RPC probe against production was
correctly blocked as a write to a shared resource. The finding rested on the
SQL predicate at `:30-35` and the live `is_active` values, both read directly.
The two successful `admin_mark_paid` audit rows are dated 2026-09-02 and
recorded `plan: professional`, which means `professional` was active then or
the check passed differently; today's values are as tabulated.

Both audit rows also carry a `reason` that is the UI's own warning text
pasted back in: *"If this organization just needs more time to evaluate, use
Extend pilot above instead, which keeps them unpaid."* Both target
`ZZ-LOADTEST-1` and `ZZ-LOADTEST-2`. The 10-character minimum
(`admin_mark_paid.sql:24-26`) was satisfied without a real reason being given —
the bar stops empty strings, not meaningless ones.

---

## 4. Data reached

Read or written by the admin surface, with live counts (2026-09-15):

| Table | Rows | Access | Where |
|---|---|---|---|
| `organizations` | 19 | read + write | `page.tsx:75`, `orgs/[id]/page.tsx:103`; written by all 4 SQL functions |
| `users` | 32 | read | `page.tsx:87`, `:132`, `orgs/[id]/page.tsx:119`, `:187`, `requireSuperAdmin.ts:71` |
| `assets` | 2732 | read | `page.tsx:121`, `orgs/[id]/page.tsx:138` |
| `vgp_inspections` | 733 | read (count only) | `orgs/[id]/page.tsx:147-150` |
| `admin_audit_log` | 2 | read + write | read `orgs/[id]/page.tsx:171`; written by the 4 SQL functions |
| `platform_admins` | 2 | read (via `is_super_admin()`) | `requireSuperAdmin.ts:62` |
| `subscription_plans` | 5 | read (validation only) | `admin_mark_paid.sql:31` |
| `auth.users` | — | read (Auth admin API, not PostgREST) | `lib/admin/lastConnected.ts:68` |

Admin pages read through the cookie-bound anon client
(`lib/supabase/server.ts`, `createServerClient` with
`NEXT_PUBLIC_SUPABASE_ANON_KEY`), so every read above is RLS-scoped and works
only because of the `super_admin_*` policies —
`organizations.sql:110`, `users.sql:64`, `assets.sql:124`,
`admin_audit_log.sql:17`, `platform_admins.sql:14`. The service-role key is
used in exactly one place, `lastConnected.ts:61`, for the Auth admin API.

**This is the whole of it, and it is why `/admin/evidence` rendered nothing.**
Those five tables were the *only* ones carrying a `super_admin_*` policy. Nine
operational tables — `vgp_inspections`, `vgp_schedules`, `rentals`,
`vgp_alerts`, `vgp_digest_deliveries`, `clients`, `subscriptions`,
`billing_events`, `scans` — had only tenant-scoped SELECT policies of the shape
`organization_id IN (SELECT organization_id FROM users WHERE id = auth.uid())`.
A platform admin is org-less (B1), so that subquery yields NULL, `x IN (NULL)`
is never true, and the read returns **zero rows with no error**.

Measured 2026-09-15 by minting a real session for `travixosystems@gmail.com`
and reading each table through the anon key beside the same read as
service-role: 733 inspections → 0, 625 schedules → 0, 146 rentals → 0, 20697
alerts → 0, 56 clients → 0, 19 subscriptions → 0, 4 billing events → 0, 344
scans → 0, 2 digest deliveries → 0. `is_super_admin()` returned true
throughout.

Note the consequence for the evidence gate: `verify-admin-evidence-live.mjs`
runs the detectors with the **service-role key** and so recorded 561 of 733
inspections lacking a certificate, while the page itself saw nothing at all.
The gate and the page disagreed, and the gate was the one telling the truth.
Fixed by `20260915150000_super_admin_read_operational_tables.sql`
(SELECT-only, additive, gated on `is_super_admin()`).

`admin_audit_log` holds 2 rows, both `admin_mark_paid`, both against
`ZZ-LOADTEST-*` orgs. There has never been a production `extend_trial`,
`end_pilot` or `set_feature_flag`.

`platform_admins` holds 2 rows (created 2026-06-05).

---

## 5. Dead or stale

**Feature flags are write-only.** `ALLOWED_FLAGS`
(`lib/admin/featureFlags.ts:16-32`) defines `beta_dashboard`,
`advanced_reports`, `bulk_export`. A repo-wide grep for each key outside
`featureFlags.ts` returns nothing — no page, component or API route reads
`organizations.feature_flags` for these keys. Live: 0 of 19 organizations have
any `feature_flags` value set. The toggle writes a jsonb key, audits it, and
nothing consumes it. `ORPHAN`.

`has_feature_access()` (`supabase/schemas/public/functions/has_feature_access.sql`)
reads `subscription_plans.features`, not `organizations.feature_flags` — a
different mechanism, so it is not the missing consumer.

**`summarizeAudit` has no `admin_mark_paid` branch.** `orgs/[id]/page.tsx:68-91`
covers three actions; `admin_mark_paid` falls to `return '-'` at `:90`. Both
live audit rows render an empty Change column. Stale relative to
`admin_mark_paid` being added later.

**Admin UI is entirely untranslated.** The app has a two-language system
(`lib/i18n.ts`, `en`/`fr`, ~4000 lines). Every string in the admin surface is
a hardcoded English literal — "Organizations" (`page.tsx:148`), "Recent
signups" (`:244`), "Engagement" (`orgs/[id]/page.tsx:251`), "End pilot"
(`AdminOrgActions.tsx:303`), and all of `END_MODE_LABELS`
(`featureFlags.ts:67-78`). A grep for `useTranslations`/`getTranslations`/`t('`
across `app/(admin)` and `lib/admin` returns no translation calls, and
`lib/i18n.ts` contains no admin namespace. The org detail page displays each
user's `language` column (`:377`) while itself being English-only.

**Test-user detection is hardcoded string matching.** `page.tsx:27-32`. The
file documents this as non-authoritative (`:20-25`). Noted as hardcoded per
the brief, not as a defect — the labelling is honest.

**`orgHealth.hasRealUsage` is computed and never read.** Defined
`lib/admin/orgHealth.ts:191`, set `:211`, returned `:275`. No consumer
anywhere in `app` or `lib`. Dead field.

**Retired plan model.** No admin code references a retired plan model beyond
`ALLOWED_PLAN_SLUGS` (exempted, though see section 3 for its live
consequence). `entitlement_overrides` (228 rows) is explicitly retired —
`lib/billing/entitlements.ts:24-25`: "entitlement_overrides is no longer read:
it only ever fed per-feature gating, and every feature now ships on the one
plan." Admin does not touch it. Those 228 rows are stale data, outside the
admin surface.

**Grant asymmetry on the admin SQL functions** (mirror-derived; I did not
verify against live `information_schema` — a probe was blocked as credential
exploration):

| Function | Grants |
|---|---|
| `extend_trial` | `authenticated, postgres, service_role`; `REVOKE ALL FROM PUBLIC` |
| `set_feature_flag` | `authenticated, postgres, service_role`; `REVOKE ALL FROM PUBLIC` |
| `end_pilot` | `anon, authenticated, postgres, service_role`; `REVOKE ALL FROM PUBLIC` |
| `admin_mark_paid` | **`PUBLIC, anon,`** `authenticated, postgres, service_role`; **no REVOKE** |

`admin_mark_paid.sql:100` grants EXECUTE to `PUBLIC` and `anon` with no
revoke, unlike its siblings. The in-function `is_super_admin()` check at `:18`
still refuses the write, so this is not an open door — but it is the only one
of the four billing-critical functions an anonymous caller may invoke at all,
and it is the one that sets `converted_to_paid`. Worth aligning with the other
three.

**Not stale, worth recording:** `trial_ends_at` is a legacy mirror of
`pilot_end_date` (`lib/billing/access-model.ts:14-31`) and drives no runtime
logic — it is read *only* by these admin screens for display
(`orgs/[id]/page.tsx:201`). `subscription_tier` is likewise documented as
unreliable (`access-model.ts:27-32`); the admin table shows it as a plain
column (`page.tsx:188`) with no caveat. Live tiers: `trial` 8, `professional`
5, `starter` 5, `travixo` 1.

---

## 6. Visual

Tailwind utility classes throughout. No component library, no design tokens,
no CSS variables in the admin surface.

**Layout primitives**
- Page shell: `min-h-screen bg-gray-50 text-gray-900` (`layout.tsx:26`)
- Header: `border-b border-gray-200 bg-white` (`:27`)
- Width: `mx-auto max-w-7xl px-6` — header `:28`, main `:50`
- Section rhythm: `space-y-10` between sections (`page.tsx:144`)
- Card: `rounded-lg border border-gray-200 bg-white` (`orgs/[id]/page.tsx:252`)
- Destructive card: `rounded-lg border border-red-200 bg-white` (`AdminOrgActions.tsx:302`)
- Metric grid: `grid grid-cols-2 gap-4 sm:grid-cols-4` (`orgs/[id]/page.tsx:253`)
- Field list: `dl` + `grid grid-cols-3 gap-4 px-4 py-3` (`:238-240`)

**Table pattern** (identical in all three tables)
- Wrapper `overflow-x-auto rounded-lg border border-gray-200 bg-white`
- `min-w-full divide-y divide-gray-200 text-sm`
- `thead`: `bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500`
- `th`: `px-4 py-3 font-medium`; numeric columns add `text-right`
- `tbody`: `divide-y divide-gray-100`, rows `hover:bg-gray-50`
- Cells `px-4 py-3`; empty state is a full-width centred `text-gray-400` row

**Chips**
- Role badge: `rounded bg-gray-900 px-2 py-0.5 text-xs font-medium text-white` (`layout.tsx:42`)
- Score badge: same, `px-1.5` (`orgs/[id]/page.tsx:314`)
- Status chips: `inline-block rounded px-1.5 py-0.5 text-xs font-medium` + semantic pair

**Colour tokens** (semantic, consistently applied)

| Meaning | Classes |
|---|---|
| Good / full / active / enabled | `bg-green-100 text-green-800` |
| Warning / read_only / idle | `bg-amber-100 text-amber-800` |
| Bad / locked / dormant | `bg-red-100 text-red-800` |
| Neutral / never | `bg-gray-200 text-gray-700` |

Defined twice as maps: `engagementClass` (`orgs/[id]/page.tsx:213-218`) and
`accessClass` (`:220-224`); inline equivalents on the list page (`page.tsx:196-199`,
`:215-221`).

**Buttons**
- Primary: `rounded bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800`
- Destructive: `rounded bg-red-700 ... hover:bg-red-800` (`AdminOrgActions.tsx:360`)
- Secondary: `rounded border border-gray-300 px-2.5 py-1 text-sm text-gray-700` (`AdminLogoutButton.tsx:53`)
- Toggle on: `border-green-300 bg-green-50 text-green-800`; off: `border-gray-300 bg-white text-gray-700` (`:390-391`)
- Disabled: `disabled:cursor-not-allowed` + `disabled:opacity-50` or `disabled:bg-gray-300`

**Feedback**: `role="status"` banner, green or red `rounded border ... px-3 py-2 text-sm` (`AdminOrgActions.tsx:183-194`).

**Links**: `text-blue-700 hover:underline` (`page.tsx:182`, `orgs/[id]/page.tsx:229`).

**Icons**: Heroicons 24/outline. Exactly one in the whole surface —
`ArrowRightOnRectangleIcon` (`AdminLogoutButton.tsx:14`).

**Type scale**: `text-xl font-semibold` headings, `text-sm` body, `text-xs`
labels/captions, `text-lg font-semibold` metric values. Dates render as
locale-independent `YYYY-MM-DD` slices (`page.tsx:40-45`) by deliberate choice.

No dark mode, no responsive breakpoints beyond `sm:` on the metric grid and
the mark-paid row, no animation or transition beyond `transition-colors` on
the logout button.

---

## 7. Not reachable from admin

Specifically flagged in the brief:

| Table | Rows | Admin surface |
|---|---|---|
| `vgp_inspections` | 733 | **Count only.** `orgs/[id]/page.tsx:147-150`, a `head: true` count for the Engagement tile and the health score. No inspection is ever listed, opened or edited |
| `vgp_schedules` | 625 | **None** |
| `rentals` | 146 | **None** |
| `clients` | 56 | **None** |
| `vgp_alerts` | 20697 | **None in the UI.** Only reachable by POSTing `/api/admin/trigger-vgp-alerts`, which runs the cron and sends mail — and is not platform-admin gated (section 1) |
| `vgp_digest_deliveries` | 2 | **None** |
| `client_recall_alerts` | 138 | **None** |

Verified by grepping each table name across `app/(admin)`, `lib/admin` and
`app/api/admin`; only `vgp_inspections` returns a hit.

Every other table in the mirror with no admin surface at all:

`asset_categories` (70), `audit_items` (36), `audits` (3),
`billing_events` (4), `entitlement_overrides` (228, retired),
`pending_weekly_digests` (0), `scans` (344), `settings_audit_log` (0),
`subscriptions` (19), `team_invitations` (2), `usage_tracking` (12),
`user_notification_preferences` (2), `vgp_regulatory_profiles` (24).

Of note: `subscriptions` (19 rows) is invisible to admin even though the
admin screens make billing decisions. `markPaid` writes
`organizations.subscription_tier` and never touches the `subscriptions` table,
so after a manual grant the two records disagree — a divergence
`access-model.ts:96-99` already documents as existing in production
("organizations.subscription_tier says starter while the subscriptions row
points at professional"). `billing_events` (4 rows) is likewise unreadable
from admin.

The operational core of the product — inspections, schedules, rentals,
clients, alerts, digests, recalls — has no administrative surface. Admin is a
tenant-and-billing console: 19 organizations, 32 users, 2732 assets, four
lifecycle mutations.

---

## Page verdict table

| Page | Sections | Live metrics | Actions | Tables | Verdict |
|---|---|---|---|---|---|
| `/admin` | Organizations; Recent signups | org count, per-org user count, per-org asset count, tier, status, pilot, created — all live. Access + Last connected derived (Auth admin API, not DB) | none | `organizations`, `users`, `assets`, `auth.users` | **PARTIAL** — `TEST?` chip is a hardcoded email-pattern heuristic (`page.tsx:27-32`), not data; all strings hardcoded English |
| `/admin/orgs/[id]` | Org fields; Engagement; Actions; Users; Admin activity | org fields, user list, real/demo asset split, inspection count, audit log — all live. Access/engagement/score derived | `extendTrial`, `endPilot`, `toggleFeatureFlag`, `markPaid` | `organizations`, `users`, `assets`, `vgp_inspections`, `admin_audit_log`, `subscription_plans` | **PARTIAL** — conversion score is a hardcoded heuristic (`orgHealth.ts:225-265`, self-labelled); feature-flag toggle writes a value nothing reads (ORPHAN); `markPaid` plan list FIXED 2026-09-15 (`ALLOWED_PLAN_SLUGS` now `['travixo']`, matching the one active plan); `summarizeAudit` has no `admin_mark_paid` branch so both live audit rows show `-`; all strings hardcoded English |
| `POST /api/admin/trigger-vgp-alerts` | n/a | n/a | runs the VGP alert cron, sends email | `vgp_alerts` + cron's tables | **STALE** — gated on tenant role, not `requireSuperAdmin` (`route.ts:72`), contradicting `scripts/verify-write-gate-coverage.mjs:28`; unaudited; not linked from any admin page |
| Feature flags (component) | within Actions | flag state from `organizations.feature_flags` | `toggleFeatureFlag` | `organizations` | **ORPHAN** — no consumer for any of the 3 keys; 0/19 orgs have flags set |

---

## Summary of findings

1. `/api/admin/trigger-vgp-alerts` is gated on tenant role, not platform-admin
   membership (`route.ts:72`). Any tenant owner/admin across all 19 orgs can
   trigger a real email-sending cron run. `verify-write-gate-coverage.mjs:28`
   asserts it is `requireSuperAdmin`-gated; it is not.
2. ~~`markPaid` offers four plans, all `is_active: false` live; the one active
   plan (`travixo`) is not offered.~~ **FIXED 2026-09-15.**
   `ALLOWED_PLAN_SLUGS` (`lib/admin/featureFlags.ts:98`) now reads
   `['travixo']`, matching the one `is_active` plan that
   `admin_mark_paid.sql:30-35` will accept.
3. Feature flags are write-only: 3 keys, 0 consumers, 0/19 orgs set.
4. The entire admin UI is untranslated in a bilingual app.
5. `admin_mark_paid` grants EXECUTE to `PUBLIC`/`anon` with no `REVOKE`,
   unlike its three siblings (mirror-derived, not live-verified).
6. `summarizeAudit` has no branch for `admin_mark_paid`, the only action that
   has ever run in production.
7. The product's operational core — schedules, rentals, clients, alerts,
   digests, recalls, and all 733 inspections beyond a count — has no admin
   surface.
