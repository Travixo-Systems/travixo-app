# Audit verification against main and production

**Date:** 2026-08-31
**Audit under review:** `docs/perf-audit-2026-08.md`, written against `d739b5e` (= `origin/main`)
**Verified against:** `origin/main` (`d739b5e`), production (`app.travixosystems.com`),
and `feat/multi-account-sessions-and-admin-pilot-controls` (3 commits ahead of main)

This file records what changed after checking the audit against live and main.
It supersedes the audit where the two disagree.

> **Production is NOT running `origin/main`.** It is running the multi-account
> branch. Proof: `GET /u/1/dashboard` on production returns
> `307 -> /u/1/login?redirectTo=%2Fu%2F1%2Fdashboard`, preserving the slot
> prefix through the redirect. That path shape is produced only by
> `withSlotPath()` in the feature branch proxy. `origin/main` contains no `/u/`
> matcher, no `splitSlotPath`, and no `app/u/` route, so it would 404 there.
>
> This matters for the audit: it was written against `main`, but the code
> serving users is the branch. Section 5 below re-checks every affected finding
> against the branch, and section 4 is a live blocker rather than a
> forward-looking one.

---

## 1. CORRECTION: the rate limiter does not leak (finding 09.5)

**The audit said:**

> It also leaks memory in the other direction: `cleanup()` runs at most once a
> minute (`:15`) and only sweeps expired entries, so a burst of unique IPs grows
> the map until the isolate recycles.

**That is wrong.** Reproduced with the real algorithm from
`lib/security/rate-limit.ts:13-20,40-60`, simulating a scraper rotating source
IPs at 1,000 unique IPs/second against the `/scan` bucket (60s window):

```
  t(s)  entries
     0  1000
    60  61000
   120  61000      <- cleanup runs, drops back
   180  61000
   240  61000
  final: 61000 entries (~4.7 MB), stable
```

The map is **bounded at roughly `2 x windowSeconds x arrival_rate`**, not
unbounded. `cleanup()` is throttled to once a minute, so between sweeps the map
holds at most one extra window of keys; each sweep returns it to steady state.
It does not grow until the isolate recycles.

**What is actually true, and still worth fixing:**

- `cleanup()` is *arrival-driven*: it only runs from inside `rateLimit()`.
  After traffic stops, whatever was in the map stays there until the next
  request or until the isolate is recycled. That is retention, not a leak.
- The bound scales with attacker-controlled arrival rate. At 10,000 unique
  IPs/s the steady state is ~610,000 entries (~47 MB), which on a
  memory-constrained function is a real availability concern.

**Revised severity: P2** (was bundled into a P1). The per-instance correctness
problem in the same finding is unaffected and remains P1:

> The effective limit is `configured_limit x number_of_live_isolates`, which is
> unbounded and unknowable.

That half of finding 09.5 stands, and is the reason to move to a shared store.

---

## 2. CONFIRMED against production

Single read-only requests to `app.travixosystems.com`. No load was generated.

| Finding | Check | Result |
| --- | --- | --- |
| 06.3 no cache headers on reference data | `GET /api/subscriptions/plans` | `Cache-Control: public, max-age=0, must-revalidate`, `X-Vercel-Cache: MISS`. Confirmed |
| 06.1 scan page uncacheable | `GET /scan/<code>` | `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate`. Confirmed, worse than reported |
| 06.1 scan HTML carries no data | grep decoded body | 0 matches for `serial_number` / `qr_code` in 12,104 B. Confirmed |
| 08.1 bundle size | measured live `/login` chunks | **271.1 KB gz / 896.1 KB raw** vs 266.4 / 892.5 measured locally. Within 2%, confirmed |
| 08.3 i18n ships both languages | grep live i18n chunk | both the French and English strings in one 23.2 KB gz chunk. Confirmed |
| 08.2 no lazy loading | grep for `next/dynamic` | zero occurrences on `main` **and** on the feature branch. Confirmed, unchanged |
| proxy runs on `/api/*` | `GET /api/subscriptions` | 401 from handler, proxy in path. Confirmed |

### Live chunk breakdown (`/login`, production)

| gz | raw | contents |
| --- | --- | --- |
| 72.4 KB | 229.3 KB | react-dom |
| 55.1 KB | 202.4 KB | @supabase |
| 43.4 KB | 156.5 KB | (unidentified) |
| 38.9 KB | 110.0 KB | (unidentified) |
| 23.2 KB | 79.1 KB | i18n (both languages) |
| 34.1 KB | 118.9 KB | 7 smaller chunks |
| **271.1 KB** | **896.1 KB** | **total** |

---

## 3. RESOLVED: compression was UNVERIFIED, now measured

The audit marked finding 01.4 UNVERIFIED because it could not reach a
deployment. Production **does** negotiate Brotli, and gzip when only gzip is
offered:

```
GET /login    Content-Encoding: br     (gzip: 2,827 B wire -> 12,872 B decoded, 4.6x)
GET /scan/... Content-Encoding: br     (gzip: 2,760 B wire -> 12,104 B decoded, 4.4x)
```

**Finding 01.4 is closed.** Compression is correctly applied at the Vercel edge.
The Supabase-egress half of that finding is still unmeasured, because it does
not pass through Vercel; the harness measures it per endpoint.

A caution for anyone re-running these probes: `curl` with an
`Accept-Encoding: br` header advertises Brotli but does **not** decode it. An
early pass here misread 2,829 compressed bytes as the page size. Force
`Accept-Encoding: gzip` and pipe through `gzip -dc`, or use `curl --compressed`.

---

## 4. BLOCKER for the harness: the auth cookie name is branch-dependent

`load/lib/auth.js` reconstructs the session cookie as `sb-<project-ref>-auth-token`,
derived from `@supabase/supabase-js` `dist/index.mjs:206`.

That is correct for `origin/main`, which passes no `cookieOptions` and so
inherits the library default. It is **wrong** for what is actually deployed:
`feat/multi-account-sessions-and-admin-pilot-controls` pins the name:

```ts
// lib/supabase/cookie-name.ts:55
export const AUTH_COOKIE_NAME = 'travixo-auth'
```

and adds per-tab slots on top:

```ts
// lib/supabase/account-slot.ts:188-190
export function cookieNameForSlot(slot) {
  const n = parseSlot(slot)
  return n === DEFAULT_SLOT ? AUTH_COOKIE_NAME : `${AUTH_COOKIE_NAME}-${n}`
}
```

Against that branch the harness signs in successfully at GoTrue and then gets
401 from every app route, because the app reads a cookie the harness never set.
That is the exact failure mode `load/README.md` warns about, from a cause the
README did not anticipate.

Because production runs the branch, **the harness as committed cannot
authenticate against any current deployment.** This is the one thing that has
to be fixed before any load run happens.

**Fix:** make the cookie name configurable, defaulting to the library
derivation. The patch is in `docs/audit-followup/harness-cookie-name.patch`
and applies to the `claude/travixo-perf-audit-cszced` branch:

```
-e AUTH_COOKIE_NAME=travixo-auth      # feature branch, slot 0
-e AUTH_COOKIE_NAME=travixo-auth-1    # feature branch, slot 1
# omit entirely for main
```

The patch also adds `ACCOUNT_SLOT` so the harness can drive the `/u/<slot>/...`
URL prefix the new proxy introduced, which is needed to load-test the
multi-account paths at all.

---

## 5. Findings unaffected by the feature branch

The branch rewrites the auth cookie layer, so every finding that touches it was
re-checked. All of these survive unchanged, because the branch changes *which
cookie is read*, not *how many times the session is validated*:

- **02.1**: 22 Supabase round trips per dashboard load, 7 of them GoTrue.
  `proxy.ts` still calls `supabase.auth.getUser()` after the slot logic. The
  three server guards are untouched.
- **02.2**: `getEntitlementContext()` is 7 round trips; `lib/billing/entitlements.ts`
  is not in the branch diff.
- **03.1**: the inspection write path still gates 9 times before writing.
- **07.1**: `users.organization_id` still read 4x per dashboard load.
- **09.2**: the ~350 GoTrue req/s projection at 1,000 concurrent users stands.

The branch **adds** proxy work rather than removing it: `splitSlotPath`,
`parseSlot`, a `Headers` clone, and a conditional `NextResponse.rewrite` now run
on every matched request, and the matcher gained `/u/:slot/:path*`. None of it
is expensive, but it means finding 09.2 is marginally more pressing, not less.

Since production runs the branch, these are findings about live code, not about
a historical commit.

---

## 6. Still UNVERIFIED

Unchanged from the audit; this pass did not close them:

- **All database findings** (02.8, 03.6, 09.1). No credentials on this machine
  either. `load/sql/index-audit.sql` and `load/sql/explain-top-queries.sql`
  remain the way to settle them.
- **Saturation point** (11.3). Deliberately not probed: load-testing production
  is out of scope, and no preview was authenticated.
- **Stripe dependency degradation** (11.3). Still not injectable without app
  changes.
- **Cost model unit prices** (12.7).
