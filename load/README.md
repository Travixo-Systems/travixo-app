# TraviXO load harness (k6)

Ten load profiles and six user scenarios for `travixo-app`, built for the
audit in `docs/perf-audit-2026-08.md`.

Nothing in this directory is imported by the app. No dependency was added to
`package.json`; the seed script and the dependency mock use only Node's
built-ins, and k6 runs its own JavaScript runtime.

**Never point this at production.** `load/config.js` refuses to start if the
`BASE_URL` host is listed in `PROD_HOSTS` (default:
`app.travixosystems.com`). Use a Vercel preview deployment or a local
`next start`, backed by a throwaway Supabase project or a branch database.

---

## 1. Install k6

```
# macOS
brew install k6
# Debian/Ubuntu
sudo gpg -k && sudo gpg --no-default-keyring \
  --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
  --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" \
  | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install k6
# Anywhere with Docker
docker run --rm -i -v "$PWD:/src" -w /src grafana/k6 run load/main.js
```

## 2. Seed the environment

The harness signs in as real users, because the app has no server-side login
endpoint: `app/(auth)/login/page.tsx:73` calls `signInWithPassword()` straight
against GoTrue.

```
SUPABASE_URL=https://<preview-ref>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<service key> \
USER_COUNT=50 \
USER_PASSWORD='<a strong throwaway password>' \
ORG_COUNT=5 \
ASSETS_PER_ORG=400 \
node load/seed/seed-load-users.mjs
```

It creates the auth users, the `users` rows, five organisations in an active
pilot window, 400 assets each, one VGP schedule per asset and ~300 historical
inspections per org (the DREETS report needs volume to be meaningful). It
prints the `-e` flags to paste into the k6 command.

`USER_COUNT` is the number of distinct accounts, not the number of VUs. VUs
are assigned round-robin across them, so 1,000 VUs over 50 accounts is
realistic: a depot has more browser tabs than staff.

## 3. Run

```
k6 run load/main.js \
  -e PROFILE=smoke \
  -e BASE_URL=https://travixo-app-preview.vercel.app \
  -e SUPABASE_URL=https://<preview-ref>.supabase.co \
  -e SUPABASE_ANON_KEY=<anon key> \
  -e USER_PASSWORD='<the seeded password>' \
  -e USER_COUNT=50 \
  -e ASSET_ID=... -e ASSET_QR_CODE=... -e SCHEDULE_ID=...
```

Start with `smoke`. If it is not clean, the larger profiles will only produce
noise.

Add `-e DURATION=30s` to shorten any profile without editing it: useful for a
quick validation pass in CI before committing to a two-hour soak.

### Profiles

| `PROFILE` | Shape | What it answers |
| --- | --- | --- |
| `smoke` | 5 VUs (7 in practice), 5 min | Does every scenario work end to end |
| `normal` | 50 VUs, 10 min | A quiet weekday |
| `busy` | 250 VUs, 10 min | Monday morning across several depots |
| `peak` | 500 VUs, 10 min | The busiest hour observed |
| `target` | 1000 VUs, 15 min | The envelope in the brief |
| `spike` | 100 to 1000 in 30s, hold 3 min | The 07:00 VGP alert email landing at once |
| `soak` | 300 VUs, 2 h | Leaks, pool exhaustion, slow drift |
| `dep_degrade` | 500 VUs, Resend slowed | Does a slow third party starve unrelated reads |
| `write_contention` | 100 VUs on ONE asset | Do `checkout_asset`/`return_asset` serialise cleanly |
| `cache_cold` | 1000 VUs, no connection reuse | Cost of a cold edge and a cold pool |

Every scenario gets at least one VU, so `smoke` actually runs 7 rather than 5.
The larger profiles land exactly on their nominal total.

### Scenarios

Each profile splits its VUs across the same six user journeys, weighted to
model a rental depot's day:

| Scenario | Weight | Code it exercises |
| --- | --- | --- |
| `dashboard` | 30% | `app/(dashboard)/dashboard/page.tsx` plus the layout's three shell fetches |
| `assets` | 25% | `components/assets/AssetsPageClient.tsx` (unpaginated list), 1-in-5 continues to `/qr-codes` |
| `scan` | 22% | `app/scan/[qr_code]/page.tsx`; 3-in-4 anonymous, 1-in-4 signed in with checkout + return |
| `inspection` | 10% | `app/(dashboard)/vgp/inspection/[id]` then `POST /api/vgp/inspections` |
| `dreets` | 8% | compliance summary, schedules list, report preview, PDF generation |
| `login` | 5% | GoTrue password grant then the redirect to `/dashboard` |

### Writes

Mutations are **off by default**. A run against a shared preview should not
silently change it.

```
-e ENABLE_WRITES=true
```

With writes off, the mutation scenarios still run their read half, so read
latency numbers stay valid; the mutation trend will simply have fewer samples.

### Environment variables

| Variable | Default | Meaning |
| --- | --- | --- |
| `PROFILE` | `smoke` | Which profile to run |
| `BASE_URL` | `http://localhost:3000` | The Next app under test |
| `SUPABASE_URL` | *(required)* | `https://<ref>.supabase.co` |
| `SUPABASE_ANON_KEY` | *(required)* | The anon key for that project |
| `USER_PASSWORD` | *(required)* | Password set by the seed script |
| `USER_EMAIL_PATTERN` | `loadtest+{i}@example.invalid` | `{i}` is replaced with the account index |
| `USER_COUNT` | `50` | How many distinct accounts exist |
| `ASSET_ID` / `ASSET_QR_CODE` | empty | Fixture asset for scan and checkout |
| `SCHEDULE_ID` | empty | Fixture VGP schedule for the inspection scenario |
| `CONTENTION_ASSET_ID` / `_QR` | falls back to `ASSET_ID` | The single row `write_contention` fights over |
| `ENABLE_WRITES` | `false` | Turn on mutations |
| `UPLOAD_DELAY_MS` | `0` | Models the UploadThing leg the user waits on before `POST /api/vgp/inspections` |
| `THINK_MIN` / `THINK_MAX` | `1` / `4` | Think time between iterations, seconds |
| `COLLAPSE_FACTOR` | `3` | p95 multiple that counts as latency collapse |
| `BUCKET_SECONDS` | `30` | Bucket width for collapse detection |
| `PROD_HOSTS` | `app.travixosystems.com` | Hosts the harness refuses to target |
| `DURATION` | per profile | Override every scenario's duration |
| `MAX_BUCKETS` | `260` | Latency buckets pre-declared for the summary |
| `CACHE_COLD` | on for `cache_cold` | Add `no-cache` headers and a cache-busting query param to every request |
| `DEBUG` | `false` | Log non-2xx bodies |

## 4. Thresholds

From the brief, enforced in `load/config.js`:

```
http_req_failed    rate < 1%
read_latency       p95 < 500ms,  p99 < 1500ms
mutation_latency   p95 < 800ms,  p99 < 1500ms
http_req_duration  p99 < 1500ms
checks             rate > 99%
```

Reads and mutations get their own trend so one slow PDF export cannot hide
behind a fast dashboard call. `cache_cold` relaxes the read/mutation ceilings
(1200ms / 1500ms) because a cold start is legitimately slower; it still fails
on errors. `dep_degrade` drops the global latency thresholds and instead
asserts *isolation*: the `background_reads` scenario, which touches no third
party, must stay under 500ms p95 while dependency-bound routes are slow. If it
does not, a slow Resend is taking the whole app down with it.

## 5. Saturation point

`handleSummary` buckets every request's latency into 30-second windows and
reports the first window whose p95 exceeds the steady-state p95 by
`COLLAPSE_FACTOR`. Cross-reference that timestamp against the ramp in the
profile to read off the VU count at which the system stops scaling. Run
`spike` for the sharpest reading; the constant-VU profiles answer "does it
hold at N", not "where does it break".

Results are written to `load/results/<profile>-<timestamp>.{md,json}` in
addition to stdout. That directory is gitignored.

### How the per-endpoint table is produced

k6 gives every VU its own JavaScript runtime and runs `handleSummary` in yet
another, so a module-level accumulator written by VUs never reaches the
summary. Everything the report needs therefore travels as a *tag*, and
`lib/endpoints.js` declares deliberately permissive thresholds
(`p(95)<86400000`) on those tagged sub-metrics purely to make k6 compute them.
Those thresholds can never fail a run; the real pass/fail ones are in
`config.js`.

Two consequences worth knowing:

- A request label not listed in `lib/endpoints.js` still works, it just will
  not appear in the per-endpoint table. Add it there when you add a request.
- Labels must not contain `,` or `:`, which k6's threshold tag-expression
  parser treats as separators.

### Reading the payload columns

`wire KB` is `Content-Length`. Next.js streams most responses with chunked
transfer encoding and no `Content-Length`, in which case the wire size cannot
be observed and the column falls back to the decoded length. The
`no Content-Length` column says how often that happened. To judge whether
compression is actually being applied, read the `uncompressed >1KB` column,
which is based on the `Content-Encoding` header rather than on the
wire/decoded ratio.

## 6. dep-degrade: what is and is not injectable

| Dependency | Injectable without app changes | How |
| --- | --- | --- |
| Resend | Yes | `RESEND_BASE_URL` is read by the installed SDK (`node_modules/resend/dist/index.cjs:882`). Point it at the mock. |
| UploadThing | Partly | The browser uploads directly to UploadThing, so the app's own latency is unaffected. `UPLOAD_DELAY_MS` models the wait the user actually experiences. |
| Stripe | **No** | The app constructs `new Stripe(key, { apiVersion })` with no `host` option, and the Stripe SDK has no env-var base URL. Degrading it requires a hosts-file plus TLS interception against a *local* app; on a Vercel preview it is not injectable. Treat the Stripe leg as **UNVERIFIED** unless you run locally. |
| Supabase | Yes, at the pooler | Reduce the pool size on the preview project, or use `pg_sleep()` in a policy on a copy of the schema. |

Start the mock, then the app:

```
node load/mocks/slow-deps.mjs --port 8787 --latency 5000 --jitter 1000 --hang-rate 0.05
RESEND_BASE_URL=http://127.0.0.1:8787 npm run start
k6 run load/main.js -e PROFILE=dep_degrade -e ENABLE_WRITES=true ...
```

`--hang-rate` is the case that actually hurts: a dependency that never
answers, against code with no client-side timeout.

## 7. SQL

`load/sql/` holds the queries the audit could not run itself (this workspace
has no database credentials).

- `index-audit.sql` - what indexes exist, which foreign keys have none, which
  indexes are never used, which tables the planner scans sequentially, RLS
  policy shapes, connection counts. **Run this first**; the audit's index
  findings cannot be closed without its output.
- `explain-top-queries.sql` - `EXPLAIN (ANALYZE, BUFFERS)` for the twelve
  hottest statements, transcribed from the code that issues them, with the
  `file:line` of each caller.

Both are read-only. Run them against a preview or branch database with
representative volume, and run them under `set local role authenticated` with
a JWT claim so RLS predicates appear in the plan. Without that, the plans
flatter the app: an RLS subquery on `organization_id` is frequently the reason
a query that looks indexed still scans.

## 8. Layout

```
load/
  main.js                    entry point; scenario functions
  config.js                  env, thresholds, production guard
  lib/auth.js                GoTrue sign-in + @supabase/ssr cookie construction
  lib/metrics.js             read/mutation trends, payload accounting, summary
  lib/endpoints.js           request labels + the sub-metric thresholds they need
  lib/rest.js                PostgREST helpers mirroring the client components
  scenarios/*.js             the six user journeys
  profiles/index.js          the ten load profiles
  mocks/slow-deps.mjs        Resend/Stripe stand-in with injectable latency
  seed/seed-load-users.mjs   fixture creation, no dependencies
  sql/*.sql                  index audit and EXPLAIN pack
  results/                   run output (gitignored)
```

### How the session cookie is built

There is no login endpoint to POST to, so `lib/auth.js` reconstructs what the
browser stores. Verified against the installed packages, not documentation:

- Cookie name `sb-<project-ref>-auth-token`
  (`@supabase/supabase-js` `dist/index.mjs:206`).
- Value `"base64-" + base64url(JSON.stringify(session))`
  (`@supabase/ssr` `dist/main/cookies.js:7,310`; `cookieEncoding` defaults to
  `base64url` in `createBrowserClient.js:21`).
- Split into `<name>.0`, `<name>.1`, ... at 3180 characters
  (`@supabase/ssr` `utils/chunker.js:8,23`).
- The base64url alphabet is unpadded (`utils/base64url.js:17`).

If Supabase changes that encoding, `authenticate()` will start returning 401s
from the app while the GoTrue sign-in still succeeds. That is the symptom to
look for.

Mutating requests also send `Origin: $BASE_URL`, because `proxy.ts:57` rejects
them otherwise (`lib/security/csrf.ts:56`).
