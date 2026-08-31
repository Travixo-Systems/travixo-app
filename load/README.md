# load/ - k6 load testing harness

Load and scale testing for travixo-app, sized against the audit envelope:
**1,000 concurrent users**.

This directory is self-contained. It adds **no dependency to the app** and
changes no application code. k6 is a standalone binary; nothing here is
imported by `next build`.

Findings this harness was built to test are in
[`../docs/perf-audit-2026-08.md`](../docs/perf-audit-2026-08.md).

---

## Install k6

k6 is not an npm package. Install the binary:

```bash
# macOS
brew install k6

# Windows
winget install k6 --source winget     # or: choco install k6

# Linux (Debian/Ubuntu)
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
  --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" \
  | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install k6

# Docker (no install)
docker run --rm -i -v "$PWD:/src" grafana/k6 run /src/load/scenarios/journey.js
```

Verify: `k6 version`

---

## Never point this at production

`BASE_URL` is checked at startup and the run **aborts** if it contains
`app.travixosystems.com`. Use a preview deployment or a local `next start`.

The guard can be lifted with `ALLOW_PROD_HOST=true`. Do not, unless you have
explicit sign-off: a `target` run is 1,000 concurrent users against whatever you
aimed it at.

```bash
# Local target
npm run build && npm run start          # http://localhost:3000

# Or a Vercel preview
vercel deploy                           # use the preview URL it prints
```

---

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `BASE_URL` | **yes** | App under test. No default, by design. |
| `SUPABASE_URL` | for auth | Your Supabase project URL. |
| `SUPABASE_ANON_KEY` | for auth | Anon key. Never the service-role key. |
| `TEST_USERS` | preferred | Pool: `a@x.com:pw,b@x.com:pw`. |
| `TEST_USER_EMAIL` / `TEST_USER_PASSWORD` | alternative | A single user. |
| `AUTH_COOKIE_NAME` | branch-dependent | See below. Gets this wrong and every request 401s. |
| `ACCOUNT_SLOT` | no (default `0`) | Multi-account slot; drives `/u/<slot>/...` paths. |
| `SCAN_QR_CODE` | for scan scenario | A real QR code from the target's data. |
| `ENABLE_WRITES` | no (default `false`) | Required for write scenarios. **These mutate rows.** |
| `CONTENTION_ASSET_ID` | write-contention | Asset every VU fights over. |
| `INSPECTION_ASSET_ID` | write scenarios | Asset to record inspections against. |
| `DEGRADE_MODE` | dep-degrade | `none` \| `resend` \| `stripe`. |
| `DEBUG` | no | Verbose auth logging. |

### `AUTH_COOKIE_NAME` - read this before your first run

The app pins its auth cookie name, and the value differs by branch. If the
harness writes the wrong name, GoTrue sign-in **succeeds** and then every app
route returns 401, because the app reads a cookie that was never set.

| Target branch | Value |
| --- | --- |
| `feat/multi-account-sessions-and-admin-pilot-controls` (currently deployed) | `travixo-auth` |
| `origin/main` | omit - derived as `sb-<project-ref>-auth-token` |

Source: `lib/supabase/cookie-name.ts` (`AUTH_COOKIE_NAME`) and
`lib/supabase/account-slot.ts` (`cookieNameForSlot`, which appends `-<slot>` for
slots above 0). `load/lib/config.js:authCookieName()` mirrors that logic.

**Symptom check:** if `travixo_auth_failures` is 0 but every request is a 401,
this is why.

---

## Run the profiles

All eight profiles run the same workload; only the arrival shape changes. That
is deliberate: comparing runs is only meaningful if the mix is constant.

```bash
export BASE_URL="http://localhost:3000"
export SUPABASE_URL="https://<ref>.supabase.co"
export SUPABASE_ANON_KEY="<anon-key>"
export TEST_USERS="load1@example.com:pw1,load2@example.com:pw2"
export AUTH_COOKIE_NAME="travixo-auth"     # omit on main
export SCAN_QR_CODE="qr-xxxxxxxx"
```

| Profile | Shape | Command |
| --- | --- | --- |
| smoke | 5 VUs, 5 min | `k6 run -e PROFILE=smoke load/scenarios/journey.js` |
| normal | 50 VUs, 10 min | `k6 run -e PROFILE=normal load/scenarios/journey.js` |
| busy | 250 VUs, 10 min | `k6 run -e PROFILE=busy load/scenarios/journey.js` |
| peak | 500 VUs, 10 min | `k6 run -e PROFILE=peak load/scenarios/journey.js` |
| **target** | **1000 VUs, 15 min** | `k6 run -e PROFILE=target load/scenarios/journey.js` |
| spike | 100 -> 1000 in 30s | `k6 run -e PROFILE=spike load/scenarios/journey.js` |
| soak | 300 VUs, 2 h | `k6 run -e PROFILE=soak load/scenarios/journey.js` |
| cache-cold | 1000 VUs, no warmup | `k6 run -e PROFILE=cache-cold load/scenarios/journey.js` |

Always start with `smoke`. It is the cheapest way to catch a bad
`AUTH_COOKIE_NAME` before burning 15 minutes at 1,000 VUs.

### Specialised scenarios

```bash
# Write contention: N VUs fight over ONE asset.
# Expect mostly 409s - that is the row lock working, not a failure.
ENABLE_WRITES=true CONTENTION_ASSET_ID="<uuid>" \
  k6 run -e CONTENTION_VUS=50 load/scenarios/write-contention.js

# Dependency degradation: 500 VUs while Resend/Stripe is slow.
# Read the header of the file first - latency must be injected externally,
# because the app hardcodes both SDK base URLs and this audit changes no app code.
ENABLE_WRITES=true DEGRADE_MODE=resend \
  k6 run load/scenarios/dep-degrade.js
```

---

## Thresholds

From the audit brief. A run fails if any is breached
(`load/lib/metrics.js`):

| Metric | Budget |
| --- | --- |
| `http_req_failed` | < 1% |
| Reads p95 | < 500 ms |
| Mutations p95 | < 800 ms |
| Everything p99 | < 1500 ms |
| `travixo_auth_failures` | 0 |

Reads and mutations are measured separately. A page of fast reads will
otherwise mask a slow write inside an aggregate p95.

Deliberate business-rule responses (`409 already_rented`, `403 vgp_blocked`,
`422`) are **not** counted as errors. Counting them would make the
write-contention scenario report a false collapse exactly when the locking is
working correctly.

---

## Finding the saturation point

Run the profiles in order and record p95, p99 and error rate at each step:

| VUs | read p95 | mutation p95 | p99 | errors | notes |
| --- | --- | --- | --- | --- | --- |
| 5 | | | | | baseline |
| 50 | | | | | |
| 250 | | | | | |
| 500 | | | | | |
| 1000 | | | | | envelope |

**Saturation** is the VU count where latency stops rising linearly and turns
upward sharply, or where errors cross 1%. Report the last healthy step and the
first unhealthy one; the truth is between them.

Watch for **progressive collapse** in the `soak` run: if p95 climbs steadily at
constant VUs, something is leaking or degrading over time. A flat line at 300
VUs for 2 hours is the pass condition.

---

## Database checks

Two read-only SQL files settle the findings the harness cannot reach from
outside. Run them in the Supabase SQL editor:

- **`sql/index-audit.sql`** - unindexed foreign keys, unused and redundant
  indexes, sequential scans, live RLS policy text, duplicate function
  overloads. The core tables have no `CREATE TABLE` in this repo, so this file
  is the only way to verify their indexes.
- **`sql/explain-top-queries.sql`** - `EXPLAIN ANALYZE` for the ten hottest
  reads, each annotated with the `file:line` that issues it. Set the `org_id`
  and `qr` variables at the top first.

Run query 4 as an authenticated role, not the service role - it exists to
measure RLS policy cost, and the service role bypasses RLS.

---

## Interpreting results

**Auth failures > 0.** Wrong `AUTH_COOKIE_NAME` (see above), bad credentials,
or GoTrue rate-limiting your sign-ins. `DEBUG=true` prints the sign-in response.

**Reference-data checks failing** (`plans cache hit`, `equipment types cache
hit`). Expected today: these routes send no cache headers, so every VU reaches
the origin. When those checks start passing, the caching fix has landed.

**`db:assets_list_unpaginated` dominating.** Working as intended - that tag
exists to make the unpaginated assets query visible in the per-endpoint
breakdown. It reproduces what the browser actually does
(`components/assets/AssetsPageClient.tsx:86`).

**Everything slow at 1000 but fine at 500.** Look at Supabase Auth first. The
dashboard path alone makes several `auth.getUser()` calls per page load, and
each is a network JWT validation, not a local decode.

---

## Files

```
load/
  README.md
  lib/
    config.js       env parsing, prod guard, slot/cookie naming
    auth.js         GoTrue sign-in -> @supabase/ssr cookie encoding
    metrics.js      custom metrics + thresholds
    scenarios.js    the six user flows
  scenarios/
    journey.js          all 8 load profiles (PROFILE env var)
    write-contention.js concurrent writes to one asset
    dep-degrade.js      500 VUs + slow dependency
  sql/
    index-audit.sql        indexes, FKs, RLS, table sizes
    explain-top-queries.sql EXPLAIN ANALYZE for the top 10 reads
```
