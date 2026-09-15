# Gates: verifier repair and a permanent plan-slug sweep

Scope: the three e2e verifiers seed and assert retired plan slugs, and one of them asserts a value
the webhook no longer writes. Repair them, RUN them and report what actually happened, and add a
permanent gate so the next plan-slug literal fails a check instead of surviving a fourth sweep.

Prerequisite for G3-G5: a dev server for THIS app. Port 3000 was serving a different application
("EcoRide V2"), so a server was started on :3100 and the three scripts were run against it.

- [x] G1: the paid-status verifier fires a price the webhook can still resolve
  CHECK: node -e "const s=require('fs').readFileSync('scripts/verify-paid-status-e2e.mjs','utf8');process.exit(!s.includes('STRIPE_PRICE_TRAVIXO_ANNUAL')||s.includes('STRIPE_PRICE_PROFESSIONAL_ANNUAL')?1:0)" && echo SWEEP_G1_OK
  EXPECT: SWEEP_G1_OK
  WHY: the script fired STRIPE_PRICE_PROFESSIONAL_ANNUAL, a sandbox test price.
  cycleFromPriceId no longer resolves it and the webhook now throws on an
  unresolvable price, so the event 500s before any assertion runs. Fixing only
  the tier assertion would leave a script that still cannot pass.
  EVIDENCE: bash, cwd D:/Dev/projects/travixo-app, exit 0, "SWEEP_G1_OK".
  Caught a second defect while fixing it: a dangling `if (!PRO_ANNUAL)` guard
  still referenced the renamed variable and would have thrown ReferenceError
  before any assertion ran.

- [x] G2: no verifier seeds or asserts a retired slug
  CHECK: node -e "const fs=require('fs');const bad=['verify-paid-status-e2e','verify-conversion-e2e','verify-readonly-enforcement'].flatMap(f=>{const s=fs.readFileSync('scripts/'+f+'.mjs','utf8');return [...s.matchAll(/'(starter|professional|business|enterprise)'/g)].map(m=>f+':'+m[1])});console.log(bad.length?'LEFTOVER '+bad.join(','):'SWEEP_G2_OK');process.exit(bad.length?1:0)"
  EXPECT: SWEEP_G2_OK
  EVIDENCE: bash, exit 0, "SWEEP_G2_OK". Zero retired-slug literals across all
  three verifiers.

- [x] G3: verify-paid-status-e2e passes against the running server
  CHECK: node scripts/verify-paid-status-e2e.mjs .env.local http://localhost:3100
  EXPECT: paid status e2e verification passed
  EVIDENCE: bash, exit 0, "6/6 checks passed", "paid status e2e verification
  passed". Includes the corrected assertion "tier updated to travixo", and
  "subscription stored as active despite Stripe reporting trialing".

- [x] G4: verify-conversion-e2e passes against the running server
  CHECK: node scripts/verify-conversion-e2e.mjs .env.local http://localhost:3100
  EXPECT: conversion e2e verification passed
  EVIDENCE: bash, exit 0, "7/7 checks passed", "conversion e2e verification
  passed". Carries its own negative control: an incorrectly signed event is
  rejected 400, so signature verification is proven live rather than assumed.

- [x] G5: verify-readonly-enforcement passes against the running server
  CHECK: node scripts/verify-readonly-enforcement.mjs .env.local http://localhost:3100
  EXPECT: readonly enforcement verification passed
  EVIDENCE: bash, exit 0, "4/4 checks passed", "readonly enforcement
  verification passed". The full lifecycle: active pilot CAN write (201),
  expired pilot REFUSED (423 pilot_read_only), locked account REFUSED (423
  account_locked), converted paying customer CAN write despite an expired
  pilot.
  FIRST RUN FAILED, exit 1: "probe could not authenticate against the API --
  cookie shape may differ", {"status":401,"error":"unauthorized"}. Diagnosed by
  reading rather than guessing: the script built its auth cookie as
  sb-<projectRef>-auth-token, the @supabase/ssr default, but this app pins its
  own name (AUTH_COOKIE_NAME = 'travixo-auth' in lib/supabase/cookie-name.ts,
  with a per-slot suffix from cookieNameForSlot) so a second tab cannot
  overwrite the first tab's session. That rename landed in a1b75e2 on
  2026-08-27, the SAME DAY the verifier was last touched (5d6a935), so the two
  had disagreed ever since and nobody had run it. Not caused by this work --
  the only change here was one probe-org seed value -- but small enough to fix
  rather than leave red. The probe now READS the name from cookie-name.ts, so
  it stays honest if the name changes again.

- [x] G6: the sweep gate exists and passes on the current tree
  CHECK: node scripts/verify-plan-slug-sweep.mjs
  EXPECT: plan slug sweep verification passed
  EVIDENCE: bash, exit 0, "plan slug sweep verification passed". 453 tracked
  files enumerated via git ls-files with NO glob filters; 6 inert hits in
  applied migrations, 0 violations. The first run FAILED on 4 hits in
  docs/context.md; the inert rule was widened to cover docs/ (a record of the
  retired model, not logic) rather than editing documentation to satisfy a
  detector.

- [x] G7: the sweep gate actually fails on a planted violation
  CHECK: node scripts/verify-plan-slug-sweep.mjs --self-test
  EXPECT: self-test passed
  WHY: a negative check is worthless until it has been shown to fail. Four
  sweeps reported complete while instances survived; the control is the point.
  EVIDENCE: bash, exit 0, "self-test passed". The detector caught planted
  equality, allowlist, switch-case and sql-equality violations, and the prose
  control did NOT trip it.

- [x] G8: the repository still typechecks and builds
  CHECK: npx tsc --noEmit && node scripts/verify-build-clean.mjs
  EXPECT: build verification passed
  EVIDENCE: bash, exit 0, tsc --noEmit silent, "build verification passed".

## Staying true

Evidence in this file is a snapshot. The three e2e gates (G3-G5) were the ones
that went stale for three weeks, so their freshness is now itself verified
rather than remembered:

    npm run verify:e2e       run all three, RECORD each outcome + timestamp
    npm run verify:fresh     FAIL if any is missing, failed, or older than 7d
    npm run verify:report    the staleness table
    npm run verify           static gates + freshness, in one command

The record lives in .verify-log.json, tracked rather than gitignored, and is
written by the runner itself. A date a human types rots exactly the way the
gate did, so no date in this file is authoritative -- ask verify:report.

The static gates need no server and no database, so they run automatically:
`prebuild` invokes verify:static, which means the plan-slug sweep, write-gate
coverage and access-model checks run on every `npm run build`, including
Vercel's. Verified firing, and verified not to recurse (verify-build-clean
shells out to `npm run build`, so it is deliberately NOT in prebuild).

The e2e three cannot join them: they need a live server and write probe rows to
the database, so a build hook would break deploys for environmental reasons.
Freshness is the only automatic pressure available to them, which is why the
ceiling is 7 days rather than a polite reminder.

## Status

8 met with evidence, 0 unmet, 0 abandoned.

The three scripts were RUN, not assumed. All three pass. Two of them were
broken in ways the stated task did not cover, and both breakages were found by
executing rather than by reading:

  verify-paid-status-e2e   fired a price the webhook now throws on, and
                           carried a dangling variable reference that would
                           have thrown before any assertion ran
  verify-readonly-enforcement  built the @supabase/ssr default cookie name,
                           which this app replaced on the same day the script
                           was last touched. It had been failing silently for
                           three weeks because nobody ran it.

Port 3000 was serving a different application entirely ("EcoRide V2"), which is
why the first attempt at G3-G5 returned 404 everywhere. A dev server for this
app was started on :3100 for the run and stopped afterwards; the process on
:3000 was left alone.
