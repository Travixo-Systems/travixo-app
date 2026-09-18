# Multi-tenant security audit - travixo-app

**Date:** 2026-09-16
**Commit audited:** `fc013f2` on `feat/admin-overview`
**Scope:** Phases 0-13 - schema, RLS, grants, DB functions, routes, server actions,
auth, public QR, uploads, billing, cron, exports
**App code changed:** none. This audit is read-only by constraint.
**Authoritative source:** `supabase/schemas/` per [working-agreements.md](working-agreements.md),
not `supabase/migrations/`.

Coverage: 26 tables, 29 DB functions, 45 route handlers, 34 pages, 58 lib files,
`proxy.ts`, both env files, the built bundle.

---

## Summary
  
| Severity | Count | Headline |
|---|---|---|
| CRITICAL | 3 confirmed + 1 provisional | Self-promotion to `owner`; self-granted billing; cross-tenant rental write; **(provisional)** world-readable certificates |
| HIGH | 7 | Browser bypasses the team + asset API guards; the app's own auth limiter is bypassed |
| MEDIUM | 12 | Structural isolation unenforced; one cross-tenant read path; audit integrity computed client-side |
| LOW | 8 | Open redirect, CSV injection, non-constant-time secret compare |
| PASS | 17 | Stripe, CSRF, admin console, invites, secrets, `search_path` all sound |

**C-1, C-2 and C-3 have been runtime-confirmed** against an exact local
reconstruction of the authoritative schema (V0 proved the reconstruction matches
the mirror object-for-object). **C-4 and production configuration remain
unverified.** See [Verification pass results](#verification-pass-results--2026-09-16).

**Read isolation is strong across most normal query paths, but tenant isolation
does not hold as a complete security invariant.** One potential cross-tenant read
path was identified (M-3, unverified), a cross-tenant *write* path is confirmed (C-3),
and some parent-child tenant relationships are not structurally enforced by the
database (M-2). C-1 is the most serious of all, because it lets a user alter the
organisation identity that every other tenant policy depends on.

That said, the server-side code is genuinely strong: `requireWriteAccess` on ~40
routes failing closed, a three-layer admin console, signature-verified idempotent
Stripe webhooks, OWASP CSRF, and all 29 DB functions pinning `search_path` - that
entire vulnerability class is absent.

The failures are three patterns, not thirty-one unrelated bugs:

1. **RLS `WITH CHECK` validates the wrong thing** - that a value is a member of an
   enum, rather than that it is unchanged.
2. **The browser writes to Postgres directly** in ~15 places, so the well-built API
   guards are bypassed by the application's own UI.
3. **Two important boundaries rely on controls outside the application database** -
   certificate retrieval and Supabase Auth. Certificate ACL remains unverified;
   Supabase Auth has native controls, but the production configuration has not yet
   been audited.

[working-agreements.md](working-agreements.md) already names the phrase *"defence by
predicate rather than by permission"* for function grants. That exact pattern is
now the top three findings, applied to tables.

> **Immediate action on customer-facing material.**
> [security-overview.md](security-overview.md) is distributed for enterprise IT
> review and lists file storage as "UploadThing (S3-backed), AES-256 at rest".
> Encryption at rest is true — and orthogonal to C-4, which is about *authorization
> on retrieval*. **Do not distribute that document as evidence that VGP certificate
> access is private until C-4 is resolved one way or the other.** This holds even
> while C-4 is provisional: the claim is currently unverified either way, and it is
> being made to third parties.

---

## CRITICAL

### C-1 Any authenticated user can promote themselves to `owner`

| | |
|---|---|
| **Entity** | `public.users` |
| **Entry point** | PostgREST `PATCH /rest/v1/users?id=eq.<self>` - browser console, no app route involved |
| **Expected** | A user edits their own name/avatar/language. `role` is not self-settable. |
| **Actual** | Any user writes themselves `role='owner'` and/or moves into another tenant. |

**Evidence** - `supabase/schemas/public/tables/users.sql:50-57`:

```sql
CREATE POLICY "Users can update own profile" ON "public"."users"
  FOR UPDATE TO PUBLIC
  USING ((id = auth.uid()))
  WITH CHECK (((id = auth.uid()) AND ((role)::text = ANY
    (ARRAY['owner','admin','member','viewer']))));   -- 'owner' is in the list
```

Plus `users.sql:79` - `GRANT ... UPDATE ON TABLE "public"."users" TO "anon", "authenticated"`.

**Root cause.** The `WITH CHECK` validates the *domain* of `role` rather than
preventing the column from changing. `organization_id` is not constrained at all.

**Attack path.** Sign up for a free trial, open the console:

```js
await supabase.from('users').update({ role: 'owner' }).eq('id', myId)
```

`get_my_organization_id()` reads `users.organization_id`, and **every** tenant
policy in the database routes through it. After one write the attacker
legitimately passes every isolation check - for assets, rentals, clients, VGP,
audits and billing.

`app/api/settings/profile/route.ts:93` correctly allowlists fields and omits
`role`. It is simply not the path used.

**Fix - needs design and testing, not a verbatim patch.**

> **Do not deploy a bare self-subquery.** An earlier draft of this audit proposed
> pinning the columns with `(SELECT u.role FROM public.users u WHERE u.id = auth.uid())`
> inline in the policy. **That is unsafe**: a policy on `public.users` that itself
> queries `public.users` re-enters policy evaluation and can raise
> `infinite recursion detected in policy for relation "users"`. The correct pattern
> is a `SECURITY DEFINER` helper, which reads the table *without* re-triggering RLS.

This codebase already has that helper and already relies on it:
`get_my_organization_id()` is `SECURITY DEFINER`, `STABLE`, `search_path`-pinned,
and is used inside the `"Admins can update team member roles"` policy on this very
table for exactly this reason. The fix is to add its sibling:

```sql
CREATE OR REPLACE FUNCTION public.get_my_role()
  RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $$ SELECT role::text FROM public.users WHERE id = auth.uid() $$;

REVOKE ALL     ON FUNCTION public.get_my_role() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_my_role() TO authenticated, service_role;

ALTER POLICY "Users can update own profile" ON public.users
  WITH CHECK (
    id = auth.uid()
    AND role::text      IS NOT DISTINCT FROM public.get_my_role()
    AND organization_id IS NOT DISTINCT FROM public.get_my_organization_id()
  );
```

Note the explicit `REVOKE ... FROM anon` - per
[working-agreements.md](working-agreements.md), Supabase default privileges grant
`EXECUTE` on every new function in `public` to `anon`, and `REVOKE FROM PUBLIC`
does **not** undo it.

**The stronger model, preferred.** RLS is row-level; it cannot express "this user
may update these *columns*". Ordinary table-level `UPDATE` permits modifying every
column, so restricting sensitive ones is a *grants* problem, not a policy problem.
Combine the above with column-level privileges:

```sql
REVOKE UPDATE ON public.users FROM authenticated, anon;
GRANT  UPDATE (first_name, last_name, full_name, avatar_url, language)
  ON public.users TO authenticated;
```

Then `role` and `organization_id` are unwritable by a normal session no matter what
any policy says, and role changes flow only through `/api/team` (already correct)
or a `SECURITY DEFINER` RPC. Belt and braces: the grant is the hard boundary, the
policy is the readable statement of intent.

**Test before deploying.** Apply to a branch database first and confirm: a normal
profile update still succeeds, a `role` write fails, and no recursion error
appears in the logs.

---

### C-2 Any member, including `viewer`, can rewrite their own billing state

| | |
|---|---|
| **Entity** | `organizations`, `subscriptions` |
| **Entry point** | PostgREST direct `PATCH` |
| **Expected** | Billing state writable only by the Stripe webhook (service-role) and platform admins. |
| **Actual** | Any org member sets `converted_to_paid = true`. The paywall unlocks itself. |

**Evidence.** `organizations` carries **three** PERMISSIVE UPDATE policies.
PostgreSQL ORs permissive policies, so the role-gated one is nullified by its two
role-blind siblings:

| Policy | Line | Role gate |
|---|---|---|
| `"Owners and admins can update organization"` | `organizations.sql:64` | gated |
| `"Users can update own organization"` | `organizations.sql:74` | **role-blind** |
| `"org_update_own"` | `organizations.sql:100` | **role-blind** |

`subscriptions.sql:45-50` is role-blind **and has no `WITH CHECK` at all**:

```sql
CREATE POLICY "Users can update own organization subscription" ON "public"."subscriptions"
  FOR UPDATE TO PUBLIC
  USING ((organization_id IN ( SELECT users.organization_id
    FROM public.users WHERE (users.id = auth.uid()))));
```

**Impact.** Writable columns include `converted_to_paid`, `is_pilot`,
`pilot_end_date`, `subscription_status`, `subscription_tier`, `licensed_capacity` -
precisely the columns `lib/server/require-write-access.ts:58,78-81` reads to decide
paid status. **Runtime-confirmed** in V3 and V3b: a `viewer` set
`converted_to_paid=true` and raised `licensed_capacity` to 9999.

The exposure is *column* scope, not row escape. V3c established that the missing
`WITH CHECK` does **not** let the row leave the tenant: PostgreSQL falls back to the
`USING` expression for the new row, so a cross-tenant `organization_id` rewrite is
rejected. The defect is that any member may write any column of a row they
legitimately own — including every column that decides whether they have paid.

`app/api/settings/organization/route.ts:120-125` gates correctly on owner/admin and
is bypassed. Browser-direct writes to `organizations` are already live at
`components/dashboard/OnboardingBanner.tsx:30-31`.

Note this also breaks the billing-honesty rule in
[working-agreements.md](working-agreements.md): `converted_to_paid` is supposed to
mean a customer paid, set only by the webhook and `admin_mark_paid`.

**Fix.** Drop the two role-blind `organizations` policies, keeping the owner/admin
one. Add `WITH CHECK` plus role gating to `subscriptions` - better still, revoke
`UPDATE` on it from `anon`/`authenticated` entirely and let only the webhook's
service-role write billing state.

---

### C-3 `return_asset()` has no tenancy check - cross-tenant write

| | |
|---|---|
| **Entity** | `rentals`, `assets`, `scans` |
| **Entry point** | `POST /api/rentals/return`, or `rpc/return_asset` directly |
| **Expected** | Only a member of the rental's owning org can return it. |
| **Actual** | Any authenticated user, any org, can force-return any active rental platform-wide. |

**Evidence** - `supabase/schemas/public/functions/return_asset.sql:12,20-25`:

```sql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
...
  SELECT r.*, a.id AS a_id, a.organization_id AS a_org_id
  INTO v_rental
  FROM rentals r JOIN assets a ON a.id = r.asset_id
  WHERE r.id = p_rental_id AND r.status = 'active'
  FOR UPDATE OF r;
```

It selects `a.organization_id` into the record **and then never reads it again.**
No org filter, no `auth.uid()` comparison anywhere in the body. Being
`SECURITY DEFINER`, it bypasses the otherwise-correct RLS on `rentals`.

`app/api/rentals/return/route.ts:38-46` authenticates the caller but passes only
`rental_id` (client-controlled) and `user.id`. The org is never established at
either layer.

**Impact.** Flips `rentals.status`, writes `actual_return_date`/`returned_by`,
resets the asset to `available`, overwrites `current_location`, and inserts a
`scans` row attributed to the attacker. In a VGP compliance product this is
safety-relevant: `checkout_asset` hard-blocks checkout of non-compliant equipment,
and this marks a machine "returned and available" in a fleet you do not own.

**Mitigating.** `rental_id` is a UUIDv4 and is not readable cross-tenant, so this
needs a leaked or guessed UUID. An authorization failure, not an enumerable one.

**Fix - the sibling already does this correctly.** `checkout_asset.sql:29` filters
on `organization_id = p_organization_id`; `record_inspection.sql:20,42-65` is the
better model, deriving the org internally and ignoring any caller-supplied value:

```sql
v_org UUID := public.get_my_organization_id();
...
WHERE r.id = p_rental_id AND r.status = 'active'
  AND a.organization_id = v_org
```

Also stop trusting `p_user_id`; use `auth.uid()`.

---

### C-4 VGP certificates appear to be world-readable — PROVISIONAL

> **Status: PROVISIONAL CRITICAL — runtime confirmation required.** The UploadThing
> ACL is dashboard-side configuration and is not visible in this repository.
> UploadThing supports both `public-read` and `private` file routes, and private
> files are served via short-lived signed URLs. If this deployment uses a private
> ACL, this finding drops to informational. **Confirm before acting: open one
> certificate URL in a logged-out incognito window.**

| | |
|---|---|
| **Entity** | inspection certificates - DREETS compliance documents |
| **Entry point** | any `utfs.io` URL, from any network, with no credentials |
| **Expected** | Retrievable only by members of the owning organization. |
| **Actual (if public ACL)** | Possession of the URL is the capability, independent of app access. |

**The requirement to test against**, stated without overclaiming: *a VGP
certificate must not remain accessible to someone merely because they retained its
historical URL after losing access to the TraviXO organisation.*

**Evidence** - `app/api/uploadthing/core.ts:65-72` returns the raw public CDN URL
with no ACL applied:

```ts
.onUploadComplete(async ({ metadata, file }) => {
  return { uploadedBy: metadata.userId, fileUrl: file.url };
}),
```

Persisted to `vgp_inspections.certificate_url`, then rendered as a bare anchor to
the CDN at `app/(dashboard)/assets/[id]/page.tsx:488-490,539-541` and
`app/(dashboard)/vgp/inspections/page.tsx:315-317,375-377`. `next.config.ts:13-19`
confirms the host is `utfs.io`.

**Zero signing code exists in the repository** - `createSignedUrl`, `getSignedUrl`
and ACL return no matches anywhere in `app/` or `lib/`.

**Why it would leak.** RLS protects the *row*; on a public ACL the *file* has no
protection at all. The URL is emailed, written verbatim into CSV exports
(`app/api/vgp/inspections/export/route.ts:130`), rendered in reports, and kept in
browser history. A departed employee or a forwarded spreadsheet would retain
access. **Revoking a user's app access would not revoke their certificate access,
because there is no access check to revoke.** (The ACL can of course be changed or
the object deleted later — the exposure is unrevocable *by the application*, not
literally permanent.)

This is not path traversal - UploadThing keys are opaque, and every DB path that
surfaces `certificate_url` is correctly org-scoped. It is unrevocable leakage.

The project is partly aware: `lib/admin/evidence/documentaryGaps.ts:31` notes that
whether "the UploadThing object behind the URL is still there cannot be
established".

**Fix.** Store the opaque file key rather than the public URL. Serve through
`GET /api/vgp/certificate/[inspectionId]`, which checks org membership against
`vgp_inspections` then streams the file or issues a short-TTL signed URL. Stop
writing raw URLs into CSV exports.

**Verify first.** Open one certificate URL in a logged-out incognito window. This
finding rests on UploadThing's documented public-CDN default plus the total absence
of signing code - strong evidence, but the bucket ACL is dashboard-side config not
visible in the repo.

---

## HIGH

### H-1 The team UI bypasses every server-side team rule

`app/(dashboard)/team/page.tsx:275-278` and `:297-300` write `users` directly from
the browser:

```ts
.from('users').update({ role: newRole, updated_at: ... }).eq('id', selectedMember.id);
.from('users').update({ organization_id: null }).eq('id', selectedMember.id);
```

`app/api/team/route.ts` implements four correct rules the UI never calls:

| Rule | API enforces | RLS enforces |
|---|---|---|
| Cannot change own role | `:251` | no |
| Cannot modify the owner | `:272` | no |
| Admin cannot promote to admin | `:281` | no |
| Admin cannot remove another admin | `:404` | no |

All four are therefore **UI-only** - `canEditMember()` (`:380-386`) encodes them
client-side and the server never sees the request. Worse: the API resets
`role:'member'` on removal (`:415`); the browser path sets only
`organization_id: null`, so a removed admin keeps `role:'admin'` and is silently
re-promoted if re-invited.

**Fix.** Repoint `handleChangeRole` and `handleRemoveMember` at `/api/team`.

### H-2 Asset and audit lifecycle writes bypass `requireWriteAccess`

These never reach an API route, so the pilot-expiry/lockout gate does not apply.
`AccountLockedOverlay` is a pure UI overlay with no server twin.

| Call site | Operation |
|---|---|
| `components/assets/AddAssetModal.tsx:75` | insert `assets` |
| `components/assets/EditAssetModal.tsx:86` | update incl. `purchase_price`, `current_value` |
| `components/assets/DeleteAssetDialog.tsx:33` | **hard DELETE** |
| `components/assets/RetireAssetModal.tsx:45` | archive |
| `components/assets/AssetsTableClient.tsx:63` | un-archive - **nulls `archived_by`/`archive_reason`** |
| `components/assets/ImportAssetsModal.tsx:305` | bulk insert |
| `app/(dashboard)/audits/[id]/page.tsx:199,244,280` | start / complete audits |

`assets` RLS is org-scoped but **role-blind**, so a `viewer` can delete equipment.
`audits.sql:22` gates DELETE to owner/admin but `:36` leaves UPDATE open.

**The team already knows the fix.** `trg_enforce_asset_limit` (`assets.sql:45`)
enforces licensed capacity as a **database trigger**, and it survives the
browser-direct path intact. Business rules expressed as triggers or
`SECURITY DEFINER` RPCs survive; rules expressed only in route handlers do not, as
long as the UI calls Supabase directly.

### H-3 The app's auth limiter is bypassed; Supabase Auth protection is unverified

**Precise claim.** TraviXO's own `auth` rate limiter never executes, because the
browser calls GoTrue directly. Supabase Auth *does* apply its own server-side rate
limits to sign-in, sign-up, recovery, verification, OTP and token endpoints,
returning HTTP 429 — those limits are what actually protects login today. They are
project configuration, not application code, and **have not been audited**.

This is *not* the same as "no rate limiting whatsoever" (as an earlier draft of
this audit put it). It is: the control we wrote is inert, and the control that is
actually load-bearing lives somewhere we have not checked.

The `auth: { limit: 10, windowSeconds: 60 }` bucket in
`lib/security/rate-limit.ts:65` is **dead code**. There is no POST to `/login` to
limit - auth is client-side direct to GoTrue:

- `app/(auth)/login/page.tsx:96` `signInWithPassword`
- `app/(auth)/signup/page.tsx:85,133` `signUp`
- `app/(auth)/forgot-password/page.tsx:25` `resetPasswordForEmail`
- `app/(auth)/confirm/page.tsx:61` `verifyOtp`

Verified: `find app -path "*login*" -o -path "*signup*" | grep route` returns
nothing.

`proxy.ts:78-82` further exempts auth-page GETs, reasoning *"a credential attempt
is a POST and still counts"* - but there is no such POST. The `check-email` resend
cap of 3 is React state and resets on reload.

**Investigate before re-architecting.** Read the actual production values first:
Supabase Dashboard → Authentication → Rate Limits, plus CAPTCHA / abuse protection.
The right outcome may well be **to keep direct Supabase Auth and configure its
native protections properly**, rather than introducing an authentication proxy
merely to make our own limiter reachable. Either way, delete the dead `auth`
bucket so it stops reading as a control that exists.

### H-4 Rate limiter is per-instance, so no limit is real in production

`lib/security/rate-limit.ts:9` - a module-level in-memory `Map`. On Vercel Fluid
Compute the effective limit is `limit x instance_count`, and the count scales
*with load*, so every bucket weakens exactly when it matters and an attacker
generating concurrency multiplies their own allowance. Counters reset on
scale-down. Keyed by IP only with no account dimension, so credential stuffing
across many accounts from rotating IPs is unbounded.

The file's own header concedes it, and `perf-audit-2026-08.md:417` already tracks
this as P0: *"these are speed bumps, not a control."* Confirmed.

**Scope note.** H-4 concerns the buckets that *do* execute — `api`, `scan`,
`password`, `cron`, `webhook`. It does **not** imply authentication is unprotected:
auth never reaches this limiter at all (H-3), and is governed by Supabase's
provider-side controls instead.

### H-5 `create_organization_and_user()` does not bind `p_user_id` to `auth.uid()`

`supabase/schemas/public/functions/create_organization_and_user.sql:4,35` -
`SECURITY DEFINER`, granted to `authenticated`, inserting
`VALUES (p_user_id, ..., 'owner')` where `p_user_id` is a caller-supplied parameter
**never compared to `auth.uid()`**.

Called from `app/(auth)/confirm/page.tsx:138`, which carries `'use client'` - so
every parameter is attacker-controlled.

**Fix.** Ignore the parameter; use `auth.uid()` internally.

### H-6 `settings_audit_log` accepts forged entries from anyone

`supabase/schemas/public/tables/settings_audit_log.sql:20-23` -
`FOR INSERT TO PUBLIC WITH CHECK (true)`, with `anon` holding the INSERT grant.
Anyone can insert rows with any `organization_id`, destroying the evidentiary value
of the log in a DREETS-compliance product.

**Fix.** Restrict to the caller's org, or write the log only from
`SECURITY DEFINER` functions - as `admin_audit_log` already does correctly.

### H-7 `anon` holds full DML on 21 tenant tables

```sql
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
  ON TABLE public.<t> TO "anon", "authenticated", "postgres", "service_role";
```

Including `TRUNCATE` and `DELETE` to `anon` on `users`, `organizations`, `assets`,
`subscriptions`, `billing_events`, `platform_admins` and `admin_audit_log`. RLS is
the *only* thing between the public anon key and these tables - defence-in-depth is
zero, and one policy mistake is total loss. `ALTER DEFAULT PRIVILEGES` in
`default_privileges.sql` means every **new** table inherits this automatically.

`platform_admins` is the sharpest edge: `anon` has INSERT granted and only a SELECT
policy exists. Inserts are denied today by default-deny - but the day anyone adds a
permissive INSERT policy, it is super-admin self-grant.

**Fix.** Revoke the write verbs from `anon` across the board. Nothing in the app
needs anon DML except the QR scan log.

---

## MEDIUM

| # | Finding |
|---|---|
| M-1 | **Signup policies are `WITH CHECK (true)`.** `users.sql:69-72`, `organizations.sql`. Permissive policies OR, so these nullify the strict siblings, making `WITH CHECK (auth.uid() = id)` decorative. **Zero RESTRICTIVE policies exist in the entire schema** - verified. |
| M-2 | **Structural isolation unenforced (Phase 12).** Only `scans` validates the parent asset's org. Seven child tables permit `child.organization_id = A` while `asset_id` points into org B; no composite FK ties them. Confirmed at the app layer: `app/api/vgp/schedules/route.ts` passes body `asset_id` straight into the insert with no ownership check. |
| M-3 | **`audit_items` cross-tenant join leak.** `app/api/audits/route.ts:196-201` builds items from request-body `excluded_assets` without intersecting against the org-scoped asset list; `app/(dashboard)/audits/[id]/page.tsx:168-176` reads them back joined, leaking another org's asset name and serial number. The one nested select that genuinely crosses tenants. |
| M-4 | **Audit integrity computed in the browser.** `app/(dashboard)/audits/[id]/page.tsx:244,280` computes `verified_assets`/`missing_assets` client-side and writes them keyed on a URL param. `verified_assets > total_assets` is writable. |
| M-5 | **Anonymous scan writes attacker-controlled data.** Unvalidated lat/long/notes inserted via the service-role key. Spoofing *is* correctly prevented (`route.ts:119-131` requires the `asset_id`+`qr_code` pair to match; org derived from the asset row). What remains is audit-trail pollution by anyone who photographs a sticker. Note `/api/scan/update` lands in the `api` bucket, not the tighter `scan` bucket, because `/api/` matches first in `proxy.ts:50-52`. |
| M-6 | **`scans` INSERT policy is not org-scoped.** `scans.sql:23-28` checks only that the asset exists and is unarchived - *any* asset, *any* org. With the public anon key, anyone holding a valid `asset_id` can insert scan rows through PostgREST, bypassing the route, the QR match and the limiter. |
| M-7 | **Capacity route has no role check.** `app/api/stripe/subscription/capacity/route.ts:64-65` gates on `requireWriteAccess` only, unlike `/settings/organization:121`. A `viewer` can raise licensed capacity and incur a real prorated Stripe charge. |
| M-8 | ~~**`rentals` UPDATE has no `WITH CHECK`.**~~ **DOWNGRADED — likely wrong.** V3c showed that `subscriptions`, which has the same shape, *does* reject a cross-tenant rewrite: PostgreSQL falls back to the `USING` expression when `WITH CHECK` is absent, so the tenant predicate still applies on write. `rentals.sql:57-62` is almost certainly safe for the same reason. **UNVERIFIED pending its own test.** |
| M-9 | **Email routes share the generic 100/min bucket.** Invitations, recall, notify-missing. All authenticated, but a trial account can abuse Resend sender reputation. `post-registration` is correctly one-shot via a DB claim. |
| M-10 | **CSV formula injection.** `app/api/vgp/inspections/export/route.ts:135-138` and `app/(dashboard)/vgp/report/page.tsx:244-247` do not neutralize leading `=`/`+`/`-`/`@` and do not double embedded quotes. `components/assets/BulkQRGenerator.tsx:57` has **no quoting at all**, so a comma in an asset name shifts every column. |
| M-11 | **`/api/health` is fail-open and holds a service-role client.** `app/api/health/route.ts:13` - `if (token) { ...check... }`, and `HEALTH_TOKEN` is absent from `.env.local`. Impact contained (result collapses to a boolean) but it is the only service-role route whose gate can silently vanish. |
| M-12 | **`vgpCertificate` trusts user-writable JWT metadata.** `app/api/uploadthing/core.ts:60-63` reads `user_metadata?.organization_id`. Currently inert - but the sibling `organizationLogo` does it correctly from `public.users` with a role check. One refactor from an org-attribution flaw on compliance files. |

---

## LOW

| # | Finding |
|---|---|
| L-1 | **Open redirect.** `app/auth/callback/route.ts:32,41` - `next` searchParam unvalidated; `next=//evil.com` yields a protocol-relative redirect. |
| L-2 | `Origin` header controls Stripe `success_url`/`return_url` - `stripe/checkout/route.ts:164`, `portal/route.ts:39`. |
| L-3 | **A route that never worked.** `app/api/vgp/alerts/route.ts:88-97` updates by arbitrary IDs with no org filter - *not exploitable*, since `vgp_alerts` has SELECT-only policies and RLS blocks the write. Silently broken rather than vulnerable. |
| L-4 | **Over-fetch.** `select('*')` on `users` at `app/api/team/route.ts:45` and `app/(dashboard)/team/page.tsx:226`; `components/assets/QRCodesPageClient.tsx:39` pulls `purchase_price` for the whole fleet into a page rendering only QR codes. All org-scoped - intra-tenant over-fetch, not leakage. |
| L-5 | `CRON_SECRET` compared with `!==` (non-constant-time) in three cron routes plus `health/route.ts:15` and `stripe/webhook/route.ts:205`. Use `crypto.timingSafeEqual`. |
| L-6 | `end_pilot()` granted EXECUTE to `anon` - gated internally by `is_super_admin()`, so not exploitable; inconsistent with every other admin function. |
| L-7 | **Enumerable QR codes — CONFIRMED IN PRODUCTION.** `scripts/seed-complete-test-data.ts:282` generates `${org.slug}-000001`. The 2026-09-18 exposure check established the seeder **has** been run against production: three orgs carry its owner/admin/member ladder. Those orgs' assets therefore have guessable QR codes, and `/scan/<qr_code>` is a public route. Scoped to the three seeded orgs; raise severity if any is a real customer rather than a demo tenant. |
| L-8 | `qr_url` built from `window.location.origin`, so a user on a preview origin writes that origin into a UNIQUE column. |

---

## PASS - verified good

Recorded as evidence, not filler. Each was checked against source, not assumed.

- **Baseline tenant reads passed runtime isolation tests.** With `member-a`'s
  session, `assets`, `rentals` and `organizations` each returned exactly 1 row —
  their own. Every export and report route derives org server-side; none accepts
  `organization_id` from the request. `/api/audits/[id]/export` is
  double-constrained by `.eq('id')` + `.eq('organization_id')`. **M-3 remains a
  separate unverified nested-join read path** and is not covered by this result.
- **All 29 DB functions pin `search_path`.** The entire search-path hijack class is absent.
- **RLS enabled on all 26 tables**, each with at least one policy.
- **Stripe is the strongest area.** Signature verified before any privileged work;
  **fails closed** when `STRIPE_WEBHOOK_SECRET` is unset rather than passing
  `undefined` into `constructEvent`; raw body read correctly; `runtime = 'nodejs'` set.
- **Webhook idempotency is race-free.** INSERT on a UNIQUE `stripe_event_id` claimed
  *before* apply, with stale-claim handling that returns non-2xx so Stripe retries.
- **Checkout takes no client-supplied org, price or quantity**; `adjustable_quantity`
  deliberately omitted.
- **Admin console: three independent layers** - `requireSuperAdmin()` in the layout,
  again in every server action, again inside each `SECURITY DEFINER` RPC - with
  allowlisted inputs, `FOR UPDATE` locking, and audit rows written in the same transaction.
- **`record_inspection()` is the model to copy** - derives org via
  `get_my_organization_id()`, validates asset *and* schedule ownership, `FOR UPDATE`.
- **`get_asset_by_qr()` is well built** - explicit column list, never returns
  `purchase_price`, `current_value` or `organization_id`, gates `purchase_date`
  behind same-org membership. The app genuinely uses it; there is no direct table
  read on the anonymous path.
- **QR codes are UUIDv4** in all production paths - not enumerable.
- **The `/scan` rate-limit bucket is deliberately collapsed per-IP** rather than
  per-QR-code, specifically to stop asset enumeration.
- **CSRF is correct** - OWASP origin/referer verification on all mutating methods,
  fail-closed when both headers are absent; exemptions correctly reasoned.
- **Invitation flow is sound** - token `randomUUID()` stored SHA-256 hashed,
  plaintext only in the email; email must match; cross-org membership blocked; org
  and role come from the stored invitation row, never the request; role
  zod-constrained so **`owner` cannot be minted via invite**; resend rotates the token.
- **Mass assignment: clean at the API layer.** No `.insert(body)`, no `...body`, no
  `Object.assign` anywhere. Every write builds an explicit payload.
- **Team role-change API (`/api/team` PATCH) is excellent** - role allowlist
  excluding `owner`, self-change blocked, target org verified, owner protected,
  admin-cannot-promote-to-admin. It is simply not the code path the UI uses (H-1).
- **`platform_admins` and `admin_audit_log` cannot be written** - RLS enabled,
  SELECT-only policies, no INSERT policy means default deny. The audit log is tamper-proof.
- **Secrets are clean.** No service key, Stripe secret or webhook secret behind
  `NEXT_PUBLIC_*`. `.env.local`/`.env.live` gitignored and **never committed on any
  branch** (`git log --all` empty). `.next/static` has zero hits for
  `service_role`/`sk_live`/`sk_test`/`whsec_`.
- **`requireWriteAccess` fails closed** on every error path, and the read-only UI
  flags are documented as "a courtesy to honest users, not a control".

---

## The one architectural decision

This is not 31 unrelated fixes. The pattern behind C-1, C-2, H-1, H-2, M-4 and M-8
is a single question: **who owns authorization in TraviXO?**

```text
                WELL PROTECTED
            ┌─────────────────────┐
            │ Next.js API routes  │
            │ validation          │
            │ role checks         │
            │ billing checks      │
            └──────────┬──────────┘
                       │
Browser ───────────────┼──────────────► Supabase
   │                   │                    │
   └─ direct writes ────────────────────────┘
                                   weak/broad RLS + broad grants
```

Good security was built in the API routes. Then parts of the frontend walk around
those routes and write straight to Postgres. Answering the question once is worth
more than patching each symptom:

```text
DATABASE                SERVER / CONTROLLED RPC      BROWSER
tenant isolation        roles                        request an operation
FK integrity            billing                      display state
immutable attributes    VGP state transitions        never establish authority
hard invariants         audit + asset lifecycle
                        team membership
```

`trg_enforce_asset_limit` already proves this works here: expressed as a DB
trigger, it survives the browser-direct path intact. Rules living only in route
handlers do not.

---

## Verification pass — status

**Completed 2026-09-16.** Full results in
[Verification pass results](#verification-pass-results--2026-09-16).

| Step | Check | Status |
|---|---|---|
| V0 | Re-diff mirror against live (`db pull --declarative`) | **DONE — zero drift** |
| V1–V2 | Runtime-reproduce **C-1** (self-promote / change tenant) | **DONE — confirmed** |
| V3 | Runtime-reproduce **C-2** (self-granted billing) | **DONE — confirmed** |
| V4 | Runtime-reproduce **C-3** (cross-tenant `return_asset`) | **DONE — confirmed** |
| V5 | Verify **C-4** — fetch a certificate URL logged-out | **OUTSTANDING** |
| V6 | Read the real Supabase Auth rate limits (**H-3**) | **PARTIAL** — knobs confirmed, production values unread |

All reproduction ran on a local Supabase stack with synthetic two-org fixtures.
**No exploit was run against production**, and none needs to be: the live schema is
byte-identical to the reconstruction the exploits ran against.

---

## Remediation order — isolated batches

Deliberately separate migrations; do not combine. Blast radius differs by an order
of magnitude between patch A and patch E.

**Patch A — authority escalation.** `C-1` + `C-2` + `H-5`. These three all concern
*who you are and what authority you have*, so they belong in one reviewed change.
C-1 needs the `get_my_role()` helper and column grants, not the naive policy.

**Patch B — cross-tenant mutation.** `C-3` + `M-2` + `M-3`. Establishes the
invariant that an org-A record may only reference an org-A parent. Prefer composite
tenant foreign keys where the schema permits. **M-8 is deliberately excluded** until
it gets its own runtime test — V3c weakened its rationale, and it may need no fix at
all.

**Patch C — direct browser mutation.** `H-1` + `H-2`. Team roles, member removal,
asset delete/archive, audit start/complete. None of these may depend on "the UI
won't let them click it."

**Patch D — VGP evidence.** Only if C-4 reproduces. `certificate_url` → store the
file key, serve via an authenticated endpoint that checks org membership and issues
a short-TTL signed URL.

**Patch E — grants sweep.** `H-7` + `H-6` + `M-1`. Revoke anon DML, fix
`settings_audit_log`, remove the `WITH CHECK (true)` signup policies. Largest blast
radius — keep it well away from patch A.

**Then — H-3 / H-4, in that order, and not as an architecture change.**

1. **Read the production values first**: Supabase Dashboard → Authentication → Rate
   Limits, plus CAPTCHA / abuse protection. Supabase applies provider-side limits to
   sign-in, sign-up, recovery, verification, OTP and token endpoints, and they are
   configurable there. V6 confirmed the knobs exist (local defaults observed:
   `OTP=30`, `VERIFY=30`, `TOKEN_REFRESH=150`, `ANONYMOUS_USERS=30`).
2. **If those values are appropriate, the likely correct outcome is to keep direct
   Supabase Auth and tune them** — not to build an authentication proxy so our own
   limiter becomes reachable. Proxying auth through Next.js is a significant
   architectural change and should not be undertaken merely to make dead code live.
3. **Either way, delete the unreachable `auth` bucket** so it stops reading as a
   control that exists.
4. **H-4 separately**: move the limiter store to shared storage (Vercel Runtime
   Cache or Upstash) for the buckets that *do* execute.

**Then** M-4 and the remainder.

**Nothing above has been applied.** Per [working-agreements.md](working-agreements.md),
RLS policies, `proxy.ts`, the Stripe webhook, any client-side path writing
`organization_id`, and every migration require showing the SQL and waiting for approval.

---

## Phase 13 - proposed regression gates

Following the existing `GATES-*.md` convention: runnable commands, success-only
token, oracles in a script rather than inline shell.

| Gate | Check | Catches |
|---|---|---|
| G1 | Every table has `ENABLE ROW LEVEL SECURITY` | Table ships without RLS |
| G2 | No table grants write verbs to `anon` (allowlist: `scans` INSERT) | H-7 |
| G3 | Every `FOR UPDATE` policy has a `WITH CHECK` pinning `organization_id` | C-1, C-2, M-8 |
| G4 | No policy is `WITH CHECK (true)` | M-1 |
| G5 | Every DEFINER function pins `search_path` *and* references `auth.uid()` or `get_my_organization_id()` | C-3, H-5 |
| G6 | No `.from(...).insert/update/delete` in `components/` or pages | H-1, H-2 |
| G7 | No secret behind `NEXT_PUBLIC_*`; bundle scan clean | Secret leakage |
| G8 | No `select('*')` on sensitive tables | L-4 |
| G9 | Routes taking `[id]` constrain by org or carry an `RLS-ONLY:` annotation | IDOR defence-in-depth |
| G10 | Every column referenced in code exists in the live schema | Phantom columns |
| G11 | **Runtime two-org fixture:** A attempts every verb on B's entities; assert denied | **Actual isolation** |

**G11 is the one that matters.** This project already has gates passing 23/23
against broken runtime behaviour, because they text-match instead of exercising
runtime (see `GATES-MULTIACCOUNT.md`). G1-G10 are static and share that weakness by
design. G11 is the gate that would actually have caught C-1 and C-3 — it is worth
more than another static grep.

### G11 specification

Two orgs, three roles each, as a mandatory CI gate:

```text
ORGANISATION A          ORGANISATION B
alice-owner             bob-owner
alice-member            bob-member
alice-viewer            bob-viewer
```

For every tenant-owned entity (`assets`, `rentals`, `scans`, `audits`,
`audit_items`, `vgp_*`, `clients`, `client_recall_alerts`, `team_invitations`,
`subscriptions`, `billing_events`, `usage_tracking`, documents):

```text
A SELECT B      → DENY          viewer mutate A   → DENY where applicable
A INSERT into B → DENY          member admin-op   → DENY
A UPDATE B      → DENY          admin owner-op    → DENY where applicable
A DELETE B      → DENY          owner valid-op    → ALLOW
```

**Exercise both call paths** — this is the part that catches C-1 and C-3:

```text
PostgREST / supabase-js direct   ← catches policy + grant gaps
API route / RPC                  ← catches handler gaps
```

A gate that only drives the API routes would have passed cleanly against every
critical finding in this report.

---

## What could not be verified

Stated rather than guessed.

1. ~~**Live RLS may differ from `supabase/schemas/`.**~~ **RESOLVED 2026-09-16.**
   A read-only `db pull --declarative` showed **zero drift** across all 58 files.
   The mirror is confirmed accurate as of this date.
2. ~~**Nothing is runtime-tested.**~~ **RESOLVED for C-1, C-2, C-3** — reproduced
   against a local reconstruction that V0 proved object-for-object identical to the
   mirror. Everything else in this report remains source-derived.
3. **UploadThing bucket ACL** is dashboard-side config. Confirm C-4 with a
   logged-out incognito fetch of one certificate URL.
4. **`HEALTH_TOKEN` in Vercel production** (M-11) - needs `vercel env ls`.
5. **Supabase GoTrue's own auth limits** (H-3) - not configured in this repo.
6. **Whether `scripts/seed-complete-test-data.ts` ever ran against production** (L-7).
7. **Production bundle** - `.next/` is a dev build. Source-level evidence is clean;
   a definitive check needs `npm run build`, which is a write.

### Disposition of the criticals

Reviewed 2026-09-16. This table governs — it overrides any looser wording earlier
in the document.

| Finding | Disposition |
|---|---|
| **C-1** self-promote / change tenant | **RUNTIME CONFIRMED** (V1, V2, V2b) + **LIVE SCHEMA CONFIRMED**. **CONTAINED IN PRODUCTION 2026-09-18** by the A0 trigger — see below. The underlying policy is still wrong; Patch A remains outstanding. |
| **C-2** self-granted billing | **RUNTIME CONFIRMED** (V3, V3b) + **LIVE SCHEMA CONFIRMED**. Fix immediately. Billing columns must not be client-writable. |
| **C-3** cross-tenant `return_asset()` | **RUNTIME CONFIRMED** (V4) + **LIVE SCHEMA CONFIRMED**. Fix immediately. |
| **C-4** public certificates | **Still PROVISIONAL.** V5 not run — needs a real UploadThing object, which the local stack does not have. Verify the production ACL with a logged-out fetch. |

### A0 hotfix — APPLIED TO PRODUCTION 2026-09-18

Migration `20260916133224_a0_users_tenant_move_invariant.sql`.

**Verified live.** `public.users` now carries two triggers:

| Trigger | Function | `tgenabled` | `prosecdef` |
|---|---|---|---|
| `update_users_updated_at` | `update_updated_at_column` | `O` (fires) | false |
| **`zz_enforce_users_identity_invariant`** | `enforce_users_identity_invariant` | **`O` (fires)** | **false (INVOKER)** |

`prosecdef = false` is the property that matters. Had it been `true`, the
function would execute as its owner, `current_user` would never be `anon` or
`authenticated`, and the guard would silently never fire — a deployment that
looks green and protects nothing. It is INVOKER, so the guard is live.

**What is now closed.** A client session can no longer change its own
`organization_id` or its own `role`, and cannot attach any user row to a
different organization (only detach to NULL). The self-service tenant takeover
proven in V1/V2/V2b is blocked at execution time.

**What is NOT closed — do not over-read this.**

- **A0 is `BEFORE UPDATE` only.** `INSERT` on `public.users` is untouched.
  Whether an account with no `users` row can insert itself into a chosen
  organization is **H-5**, still unproven and still outstanding.
- **No policy and no grant changed.** The broken `WITH CHECK` is still in place
  and the table-wide UPDATE grant still exists. The update-surface gate still
  fails, by design. **Patch A is still required** — A0 is containment, not the
  fix.
- **C-2 and C-3 are untouched.** Billing-authority writes and the cross-tenant
  `return_asset()` path are exactly as they were.

**Rollback** (tested locally, drops only the two objects this migration adds):

```sql
BEGIN;
DROP TRIGGER IF EXISTS zz_enforce_users_identity_invariant ON public.users;
DROP FUNCTION IF EXISTS public.enforce_users_identity_invariant();
COMMIT;
```

**Follow-ups required:**
1. Confirm the migration ledger has a row for `20260916133224`. If it was
   applied through the SQL Editor rather than `db push`, run
   `npx supabase migration repair --status applied 20260916133224` or the ledger
   drifts — the failure mode `docs/working-agreements.md` already documents.
2. Refresh the schema mirror: `npx supabase db pull --declarative`, then revert
   the duplicated `[db.migrations]` block it writes into `supabase/config.toml`.

### The identity-argument class — survey, report only

C-3 is an instance of a pattern: a `SECURITY DEFINER` function that takes an
organisation or user id **as an argument** instead of deriving it. Seven
functions match on shape. Only three are defects.

| Function | Identity args | anon | authenticated | Verdict |
|---|---|---|---|---|
| `admin_mark_paid` | `p_org_id` | **yes** | yes | **OK** — `is_super_admin()` at line 18, before first use of `p_org_id` at line 46 |
| `end_pilot` | `p_org_id` | **yes** | yes | **OK** — gate line 38, first use line 49 |
| `extend_trial` | `p_org_id` | **yes** | yes | **OK** — gate line 22, first use line 34 |
| `set_feature_flag` | `p_org_id` | **yes** | yes | **OK** — gate line 23, first use line 34 |
| `return_asset` | `p_user_id` | no | yes | **FIXED (B0)** — org + actor now from `auth.uid()` |
| `checkout_asset` | `p_organization_id`, `p_user_id` | no | yes | **DRAFTED (B1)** — scoped to a caller argument |
| `create_organization_and_user` | `p_user_id` | **yes** | yes | **OPEN (H-5)** — `p_user_id` never compared to `auth.uid()`; INSERT, so A0 does not cover it |

**The four admin functions are not defects.** They take an org argument by
design — a platform admin acts across tenants — and each calls
`is_super_admin()` *before* touching it. Taking the argument is fine; what
matters is authorizing independently of it.

**`create_organization_and_user` is the remaining open instance.** It is
`SECURITY DEFINER`, inserts `VALUES (p_user_id, ..., 'owner')`, and never
compares `p_user_id` to `auth.uid()`. It is called from a `'use client'`
component (`app/(auth)/confirm/page.tsx:138`), so every argument is
attacker-controlled. **A0 does not cover it — A0 is `BEFORE UPDATE`, this is an
INSERT.** Still unproven (V7 not run).

**Separate finding from this survey — `anon` holds EXECUTE on almost
everything.** Read from the live catalog:

```
admin_mark_paid              anon=true
end_pilot                    anon=true
extend_trial                 anon=true
set_feature_flag             anon=true
create_organization_and_user anon=true
record_inspection            anon=true
claim_vgp_alerts             anon=true
has_feature_access           anon=true
org_max_assets               anon=true
is_pilot_active              anon=true
checkout_asset               anon=false
return_asset                 anon=false
```

This is the hazard [working-agreements.md](working-agreements.md) already
documents: Supabase default privileges grant `EXECUTE` on every new function in
`public` to `anon`, and `REVOKE ... FROM PUBLIC` does **not** undo it, because
`PUBLIC` and `anon` are different grantees. The four admin functions are gated
by `is_super_admin()` so this is **not exploitable today** — it is defence by
predicate rather than by permission, exactly the phrase that file uses. Only
`checkout_asset` and `return_asset` are clean, because B0 and B1 revoked `anon`
by name. **Recommended for the Patch E grants sweep: `REVOKE EXECUTE ... FROM
anon` on every function that is not deliberately public** (`get_asset_by_qr` is
the only intentional one).

### B1 — C-3 sibling, drafted and locally tested 2026-09-18. NOT APPLIED.

Migration `20260918160000_b1_checkout_asset_tenant_check.sql` (commit `55ba4c8`).

| Test | BEFORE | AFTER |
|---|---|---|
| **X1** cross-tenant checkout | **ALLOWED** | **DENY** (`asset_not_found`) |
| CTL same-org checkout | ALLOW | ALLOW |
| **NEG** forged attribution | **FORGED** (`checked_out_by=owner-b`) | **CORRECT** (caller) |
| NEW no-org caller | ALLOWED | DENY |
| **M2** cross-tenant `client_id` | **ACCEPTED** | **DENY** (`client_not_found`) |

**X1 confirmed as a real cross-tenant write.** The first probe printed
`orgB_active_rentals=0` and looked like a partial failure; it was not. RLS hides
Org B's rows from the Org A reader. Reading back as `postgres` showed
`rental created in org = bbbbbbbb…` and `ORG B asset now status=in_use`.

**M-2 closed here.** `p_client_id` was inserted with no check that the client
belongs to the organisation, so a rental could reference a parent row in another
tenant. Now validated against the derived org.

**A correction found while testing.** The first draft revoked from `PUBLIC` and
`anon` only, leaving the ACL reading `service_role=X/postgres`. `REVOKE` strips
only the roles it names, and `CREATE OR REPLACE` preserves the existing ACL, so
the pre-existing `service_role` and `postgres` grants survived. They are now
revoked by name and the ACL reads exactly `authenticated=X/postgres`.

Rollback verified **both directions**: it restores the old behaviour (X1
ALLOWED, attribution FORGED, M2 ACCEPTED) and re-applying re-blocks all three.

### B0 — APPLIED TO PRODUCTION 2026-09-18. C-3 CLOSED.

Pushed via `supabase db push` (CLI ledger), together with two migrations that
were already live but missing from the remote ledger:

```
Applying migration 20260917050000_seed_asset_event_history.sql...
Applying migration 20260918120000_hide_asset_status_from_non_members.sql...
Applying migration 20260918140000_b0_return_asset_tenant_check.sql...
```

**Pre-push diff (required before applying).** `20260918120000` was diffed in
full against the schema pulled from production — function body, `GRANT`,
`COMMENT` and `REVOKE`. **Identical**, so re-applying it was a genuine no-op.
`20260917050000` carries a re-entrancy guard (state table + `NOTICE`) per commit
`88f108e`, so its re-run writes nothing. Confirmed after the fact: the only
schema file that changed in the post-push mirror pull was `return_asset.sql`.

**Verification, all from production.**

*Ledger — fully in sync, drift resolved:*

| Version | local | remote |
|---|---|---|
| `20260916133224` (A0) | yes | yes |
| `20260917050000` | yes | **yes** |
| `20260918120000` | yes | **yes** |
| `20260918140000` (B0) | yes | **yes** |

No local-only migrations remain.

*Exactly one `return_asset` in `pg_proc`* — one function file in the mirror, one
`CREATE` statement, signature unchanged:

```
p_rental_id uuid, p_user_id uuid,
p_return_condition text DEFAULT NULL, p_return_notes text DEFAULT NULL,
p_location_name text DEFAULT NULL,
p_latitude double precision DEFAULT NULL, p_longitude double precision DEFAULT NULL
```

`CREATE OR REPLACE` replaced in place — no overload, no orphaned old version.

*Grant listing (production):*

```sql
GRANT EXECUTE ON FUNCTION "public"."return_asset"(uuid, uuid, text, text, text, double precision, double precision)
  TO "authenticated", "postgres", "service_role";
REVOKE ALL ON FUNCTION "public"."return_asset"(uuid, uuid, text, text, text, double precision, double precision)
  FROM PUBLIC;
```

Unchanged from pre-B0, and `anon` holds no EXECUTE.

*B0 logic live in production* (`supabase/schemas/public/functions/return_asset.sql`):

| Line | Element |
|---|---|
| 20 | `v_org UUID := public.get_my_organization_id();` |
| 21 | `v_actor UUID := auth.uid();` |
| 25 | `IF v_org IS NULL THEN` — refuses org-less callers |
| 39 | `AND a.organization_id = v_org` — **the tenant check** |
| 49, 56, 67 | `v_actor` written to `scans.scanned_by`, `rentals.returned_by`, `assets.last_seen_by` |

*V4 behaviour proof — NOT RUN.* Same blocker as the A0 proof: reading
`supabase/.temp/pooler-url` and passing it to a containerised `psql` are both
refused by the Claude Code auto-mode classifier (`Credential Materialization`).
The query is ready at `scripts/verify/prod-b0-v4-proof.SQLEDITOR.sql` — Step 0
finds a ZZ-LOADTEST-1 user and an active rental in each org, then V4 and two
controls run inside `BEGIN ... ROLLBACK`.

**What is proven:** the deployed function body contains the tenant check, the
signature is unchanged, and grants did not widen. **What is not yet proven in
production:** that a real cross-tenant call returns `rental_not_found`. That was
proven locally (V4) against a reconstruction verified object-for-object
identical to the live schema.

### B0 pre-apply evidence — 2026-09-18

**(a) Function signature — identical before and after.** `CREATE OR REPLACE`
therefore replaces in place; no overload is created and no old version is left
orphaned.

```
p_rental_id uuid, p_user_id uuid,
p_return_condition text DEFAULT NULL, p_return_notes text DEFAULT NULL,
p_location_name text DEFAULT NULL,
p_latitude double precision DEFAULT NULL, p_longitude double precision DEFAULT NULL
```

**(b) Call sites — one, and it is not a service client.**

| Call site | Client | Effective role |
|---|---|---|
| `app/api/rentals/return/route.ts:38` | `@/lib/supabase/server` (anon-key SSR) | `authenticated` |

`git grep "rpc('return_asset'"` returns exactly this one hit. No service-role
caller exists, so B0's `service_role` deny is unreachable in the current code.
**No stop condition.**

**(c) Grants — restated verbatim, unchanged.**

```sql
REVOKE ALL ON FUNCTION public.return_asset(...) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.return_asset(...) TO authenticated, postgres, service_role;
```

Identical to the pre-B0 grants; nothing is widened or narrowed.

**Anonymous exposure check (production, no session).**

| Probe | Result |
|---|---|
| `GET /scan/<uuid>` | **HTTP 200** — page is public, no redirect. Next.js shell; data loads client-side. |
| `POST /rest/v1/rpc/get_asset_by_qr` with anon key | **HTTP 200, `[]`** — the uuid supplied is an asset **id**, not a `qr_code`, so nothing was returned. This probe did not exercise the exposure; a real `qr_code` is needed. |
| `GET /rest/v1/assets?id=eq...` with anon key | **HTTP 401** `permission denied for function get_my_organization_id` |
| `GET /rest/v1/vgp_inspections?select=certificate_url` with anon key | **HTTP 401** (same) |

RLS holds against `anon` on `assets` and `vgp_inspections`: **certificate URLs
cannot be harvested through the API.** C-4 depends on already possessing a URL
(from an email, a CSV export, or browser history), not on extracting one.

**Ledger state.**

| Version | local | remote | Note |
|---|---|---|---|
| `20260916133224` (A0) | yes | **yes** | applied and repaired |
| `20260918120000` | yes | **empty** | **not in the remote ledger, but its effect IS live** — the `CASE` guard appears in the schema pulled from production. Applied outside the CLI. |
| `20260918140000` (B0) | absent | absent | worktree only |

`20260918120000` is `CREATE OR REPLACE`, so a `db push` re-applying it converges
to the state already live — safe, but it **will** be included in any push from
this tree. B0's version sorts after it, so ordering is correct.

**No cherry-pick performed.** The stated condition was *remote has it and local
does not*; the reverse is true here.

### B0 — C-3 fix, drafted and locally tested 2026-09-18. NOT APPLIED.

Migration `20260918140000_b0_return_asset_tenant_check.sql` (worktree
`fix/security-patch-a`, commit `4594d4c`).

The organisation is now derived inside `return_asset()` from `auth.uid()` via
`get_my_organization_id()` — never from an argument — and the rental's asset
must belong to it. A rental in another tenant reports `rental_not_found`, the
same error as a genuinely missing one, so the response does not disclose whether
a rental id exists elsewhere.

| Test | BEFORE | AFTER |
|---|---|---|
| **V4** cross-tenant return | **ALLOWED** | **DENY** (`rental_not_found`) |
| CTL same-tenant return | ALLOW | ALLOW |
| **NEG** forged attribution | **FORGED** (`returned_by=owner-b`) | **CORRECT** (`returned_by=caller`) |
| NEW no-org caller | ALLOWED | DENY |
| INF `service_role` call | ALLOW | DENY *(intended behaviour change)* |

Org B's rental verified untouched after the full battery: `status=active`,
`returned_by=NULL`, asset `in_use`.

**Second defect found while testing — not previously documented.** `p_user_id`
was trusted for attribution, so a caller could record the action against any
user id. Pre-patch, member-a returning their own rental while passing owner-b's
id wrote `returned_by=owner-b`. Attribution now comes from `auth.uid()`. The
argument is still accepted so the signature and the calling route are unchanged.

**The `service_role` change is intended and currently unreachable.**
`service_role` has no `users` row, so `get_my_organization_id()` is NULL. Only
`app/api/rentals/return/route.ts` calls this function, via the session client.
Recorded because any future server-side caller would need a different path.

**Rollback verified properly** — not just that the SQL runs, but that it
restores the old behaviour (V4 ALLOWED again) and that re-applying re-blocks it.

**`checkout_asset` — reported, not changed.** It *does* scope
(`WHERE id = p_asset_id AND organization_id = p_organization_id`) but to
`p_organization_id`, a **caller argument**, rather than to `auth.uid()`. Not
exploitable through the app — `app/api/rentals/checkout/route.ts:50` derives the
org from the session — but it is reachable directly via PostgREST, where a
caller may pass any organisation id. Left out of B0 deliberately: changing a
working path's org source deserves its own test round. **Tracked for Patch B.**

No policy and no grant changed.

### C-1 exposure check — production, read-only, 2026-09-18

The vulnerability is confirmed. This asks the separate question: **has it already
been used?** Run against production in the SQL Editor, read-only transaction,
IDs and counts only.

| Check | Result | Reading |
|---|---|---|
| Q1 | 17 rows, **all `owner`**, one per org | Founders — a founder predates any invitation. Not a finding. |
| Q1b | 12 rows across exactly 3 orgs | The seeder. See below. |
| **Q2** | **0 rows** | No owner who is neither founder nor invited as owner. |
| **Q3** | **0 rows** | No org has more than one owner. |
| Q5 | 3 orgs, `unexplained=4` each | Same 3 orgs as Q1b. |
| Q4 | 32 users, 30 with an org, 19 orgs, 3 multi-user orgs, 1 accepted invitation | Scale context. |

**VERDICT: no evidence of C-1 exploitation.**

**Q2 and Q3 being empty is the load-bearing result.** C-1 lets any user write
`role='owner'` in a single statement. Across 32 users and 19 organisations, every
org has exactly one owner, and that owner is its earliest member. An exploited
C-1 would surface in Q2 or Q3; neither returns a row.

**Q1b is the seed script, not an attack.**
[`scripts/seed-complete-test-data.ts:202`](../scripts/seed-complete-test-data.ts):

```ts
const role = i === 0 ? 'owner' : i === 1 ? 'admin' : 'member';
```

It writes `organization_id` directly under the service role with no invitation —
exactly the condition Q1b tests for. Each of the three flagged orgs shows one
owner, one admin and the rest members: the seeder's ladder. An escalation would
not produce that shape in three orgs and nowhere else.

**This confirms L-7.** The seed script has been run against production, so those
three orgs also carry enumerable QR codes (`${org.slug}-000001`). L-7 moves from
"no production impact *unless* it has been run" to **confirmed, scoped to three
seeded orgs**.

**Production trigger state** (same session): `public.users` carries one trigger,
`update_users_updated_at` (`tgenabled='O'`, `prosecdef=false`). The A0 trigger
`zz_enforce_users_identity_invariant` is **absent**, as expected — A0 has only ever
been applied locally. No name collision and no competing `BEFORE UPDATE` trigger.

**Consequence for remediation:** A0 locks in a clean state rather than freezing an
existing escalation in place. Proceed.

Query and recorded results:
`scripts/verify/prod-readonly-c1-exposure.SQLEDITOR.sql` (worktree
`fix/security-patch-a`).

### Current security state

| Area | State |
|---|---|
| C-1 identity / tenant escalation | **Runtime confirmed** + live schema confirmed |
| C-2 billing authority bypass | **Runtime confirmed** + live schema confirmed |
| C-3 cross-tenant return | **Runtime confirmed** + live schema confirmed |
| Basic cross-tenant reads | **Runtime isolation passed** |
| M-8 cross-tenant rental reassignment | Unverified / original rationale weakened |
| M-3 nested-join read path | Unverified |
| C-4 certificate retrieval | Provisional |
| Production Auth limits | Unverified configuration |
| Migration genesis | Validated test artifact, pending permanent-history review |
| **C-1 prior exploitation** | **No evidence** — Q2/Q3 empty in production, 2026-09-18 |
| **L-7 enumerable QR codes** | **Confirmed in production**, scoped to 3 seeded orgs |
| **A0 hotfix** | **APPLIED TO PRODUCTION 2026-09-18.** Trigger live and INVOKER-verified. C-1 contained; underlying policy still wrong (Patch A outstanding). |

---

## Verification pass results — 2026-09-16

**Environment.** Local Supabase stack (Docker, CLI 2.116.0). Schema reconstructed
from `supabase/schemas/` via a generated genesis migration. **No remote project was
linked, reset, migrated, seeded or otherwise modified.** Synthetic fixtures only:
two orgs × three roles, one asset and one active rental each, fixed UUIDs.

### V0 — reconstruction fidelity: MIRROR CONFIRMED

Effective state of the running database, read from `pg_policies`,
`information_schema.role_table_grants` and `pg_proc`, matches the mirror exactly:

| Check | Mirror | Local | |
|---|---|---|---|
| Tables with RLS enabled | 26 / 26 | 26 / 26 | match |
| `CREATE POLICY` statements | 85 | 85 | match |
| Policy comments | 3 | 3 | match |
| `GRANT` statements | 62 | 62 | match |
| Per-table policy counts (`users`=7, `organizations`=8, `assets`=10, `vgp_schedules`=9) | — | identical | match |
| RESTRICTIVE policies | 0 | 0 | match |

The C-1 policy read back from the live catalog, verbatim:

```
Users can update own profile
  USING = (id = auth.uid())
  CHECK = ((id = auth.uid()) AND ((role)::text = ANY (ARRAY['owner','admin','member','viewer'])))
```

No `organization_id` term. `'owner'` present. Confirms the source reading.

### V1–V4 — runtime results

Each test ran as `SET LOCAL ROLE authenticated` with a JWT claim setting
`auth.uid()`, i.e. the way PostgREST executes a real session. Every test was
wrapped in a savepoint and rolled back.

| # | Test | Expected | Actual | Status |
|---|---|---|---|---|
| V1 | `member-a` sets own `role='owner'` | DENY | **`UPDATE 1` — role is now `owner`** | **CONFIRMED** |
| V2 | `member-a` sets own `organization_id` = Org B | DENY | **`UPDATE 1` — now in Org B** | **CONFIRMED** |
| V2b | both in one statement | DENY | **`UPDATE 1` — owner of Org B** | **CONFIRMED** |
| V3 | `viewer-a` sets `converted_to_paid=true`, `is_pilot=false` | DENY | **`UPDATE 1` — org now "paid"** | **CONFIRMED** |
| V3b | `viewer-a` sets `licensed_capacity=9999` | DENY | **`UPDATE 1`** | **CONFIRMED** |
| V3c | `member-a` moves Org A's subscription row to Org B | DENY | `ERROR: new row violates row-level security policy` | **NOT REPRODUCED** |
| V4 | `member-a` calls `return_asset(rental-b)` | DENY | **`{"success": true}`** | **CONFIRMED** |

**V4 detail.** Org B's rental before: `status=active`. After a call from an Org A
member with a known Org B rental UUID:

```
rentals: status=returned, returned_by=a0000000-...-002 (the Org A attacker),
         return_notes='cross-tenant test', actual_return_date set
assets:  Org B asset status flipped active -> available
```

**Controls both behaved correctly**, which is what makes the results trustworthy:
- Same-tenant `return_asset` on Org A's own rental → `success: true` (not a
  blanket-allow artefact).
- Cross-tenant **reads** → `assets=1`, `rentals=1`, `organizations=1` visible to
  `member-a`. **Read isolation holds**, exactly as the report claims.

### V3c is a correction to this report

`subscriptions` **does** reject a cross-tenant `organization_id` rewrite, despite
having no `WITH CHECK` clause of its own. PostgreSQL falls back to the `USING`
expression for the new row when `WITH CHECK` is absent, so the tenant predicate is
enforced on write after all.

**M-8 (`rentals` UPDATE has no `WITH CHECK`) is therefore very likely wrong for the
same reason and is downgraded to UNVERIFIED pending its own test.** The *column*
exposure in C-2 is unaffected and remains confirmed: the policy permits writing any
column of a row you legitimately own — it only stops the row leaving the tenant.

### V6 — H-3, partially answered

GoTrue exposes rate-limit configuration (local defaults observed:
`RATE_LIMIT_OTP=30`, `RATE_LIMIT_VERIFY=30`, `RATE_LIMIT_TOKEN_REFRESH=150`,
`RATE_LIMIT_ANONYMOUS_USERS=30`, `RATE_LIMIT_EMAIL_SENT=360000`). This confirms
Supabase Auth applies its own limits and that the earlier "no rate limiting
whatsoever" wording was wrong.

**Still unresolved:** these are local defaults, not production values, and no
`RATE_LIMIT_SIGN_IN` knob appears in this set — so the limit specifically governing
**password guessing** remains unconfirmed. Read the production values from
Supabase Dashboard → Authentication → Rate Limits before acting on H-3/H-4.

### Not run

- **V5 (C-4)** — needs a real UploadThing object; the local stack has none. Do the
  logged-out incognito fetch against production.
- **G11** — the full two-org matrix across every entity and both call paths. The
  fixtures built here are the foundation for it.

### Live production confirmation — 2026-09-16, read-only

The findings were proven against a local reconstruction of the mirror. This step
closes the remaining gap: **does the mirror still match live production?**

**Method.** `npx supabase db pull --declarative` — the documented read-only path,
which reads the live schema directly and does **not** write remote migration
history. The result confirmed `remoteHistoryUpdated: false`. No production data was
read, no row was mutated, and no exploit was re-run against production. The
committed mirror was backed up first and restored afterwards.

**Result: no drift.** A recursive diff of the freshly-pulled live schema against the
committed mirror — all 58 files — produced **zero differences** once CRLF/LF line
endings are normalised (`diff -r --strip-trailing-cr` → exit 0, 0 lines).

Per-object confirmation for every affected definition:

| Object | Finding | Live vs mirror |
|---|---|---|
| `users` UPDATE policies | C-1 | **IDENTICAL** |
| `organizations` UPDATE policies | C-2 | **IDENTICAL** |
| `subscriptions` UPDATE policy | C-2 | **IDENTICAL** |
| `return_asset()` | C-3 | **IDENTICAL** |
| `create_organization_and_user()` | H-5 | **IDENTICAL** |
| `default_privileges.sql` (grants) | H-7 | **IDENTICAL** |

**Chain of evidence is therefore complete for C-1, C-2 and C-3:**

```
live production  ==  supabase/schemas/  ==  local reconstruction  ->  exploit reproduced
   (this step)        (V0, object-for-object)      (V1-V4)
```

Marked **LIVE SCHEMA CONFIRMED**. Re-running the exploits against production is
unnecessary and is not recommended.

**Side note.** The pull duplicated the `[db.migrations]` block in
`supabase/config.toml`, as this project's notes already record. Reverted.

### Environment caveat

The local stack is a faithful *schema* reconstruction (V0 proves that), but it is
not production. Two differences that do not affect V1–V4 but would matter for other
tests: the local `anon`/`authenticated` roles are created by the CLI rather than by
Supabase's provisioning, and local GoTrue config is the CLI default. V1–V4 depend
only on policies, grants and function bodies, all of which V0 verified as identical.

### One finding withdrawn

A mid-audit pass flagged the `...assetColumns` spread at
`components/assets/ImportAssetsModal.tsx:292` as an `is_demo_data` billing bypass.
`cleanAssetData` (`:102-114`) returns a fixed nine-key literal, so nothing can be
injected. **That finding does not hold and is not counted in the totals above.**
