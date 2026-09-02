# Gates: two different accounts, two tabs, one browser (Phase 2)

> SUPERSEDED IN PART by GATES-SLOT-URL.md. The cookie-hint fallback described
> below was WRONG: it broke on reload (both tabs showed the last account).
> The slot now travels in the URL. Gates G1-G9 here still hold; the mechanism
> line about SLOT_HINT_COOKIE does not.

OWNS: lib/supabase/account-slot.ts, lib/supabase/cookie-name.ts, lib/supabase/client.ts, lib/supabase/server.ts, components/AccountSlotBootstrap.tsx, components/AccountSwitcher.tsx, app/layout.tsx, proxy.ts, app/api/**/route.ts, app/api/uploadthing/core.ts, scripts/verify-multiaccount.mjs, scripts/verify-multiaccount-wiring.mjs

Scope: Let a prospect hold TWO DIFFERENT accounts signed in at once, in two
tabs of ONE browser, without either tab clobbering the other. Phase 1 stopped
sign-out in tab A from killing tab B; it did NOT deliver concurrent distinct
identities, which is what makes a live evaluation work. This does.

Mechanism (chosen because it needs ZERO routing changes -- a path prefix such
as /a/<slug>/ would touch ~150 call sites: 74 Links, 36 router.push, 5
redirect, 35 fetch):
  - each TAB owns a slot id in sessionStorage (per-tab by construction)
  - the browser sends it as the x-travixo-account header
  - proxy.ts reads the header and resolves it to a DISTINCT cookie name
  - proxy.ts forwards the resolved slot to Server Components as a request
    header, so server-side reads pick the same cookie
Slot 0 keeps the Phase 1 cookie name, so existing sessions survive.

- [x] G1: slot ids are validated and bounded — a hostile or malformed header can never produce an arbitrary cookie name
  CHECK: node --import ./scripts/ts-alias-loader.mjs scripts/verify-multiaccount.mjs
  EXPECT: multiaccount verification passed
  EVIDENCE: exit 0, 16/16 checks. parseSlot proven TOTAL over 34 hostile inputs (negatives, floats, 1e3, 0x2, whitespace-padded, __proto__, 1000-char strings, objects, arrays, functions, out-of-range) - every one maps into [0,3). Separately proven that hostile input cannot reach ANY cookie name outside the 3 declared ones. Negative control confirms parseSlot really rejects, so the totality result is not vacuous.

- [x] G2: distinct slots resolve to DISTINCT cookie names, and slot 0 keeps the Phase 1 name so existing sessions are not signed out
  CHECK: node --import ./scripts/ts-alias-loader.mjs scripts/verify-multiaccount.mjs
  EXPECT: multiaccount verification passed
  EVIDENCE: exit 0, same run as G1. The 3 slot names are distinct (travixo-auth, travixo-auth-1, travixo-auth-2), all valid RFC 6265 tokens, and slot 0 equals the Phase 1 AUTH_COOKIE_NAME exactly - so deploying this does NOT sign out anyone currently logged in.

- [x] G3: the proxy resolves the slot from the request and forwards it to Server Components, and every Supabase construction site derives its cookie name from the resolved slot rather than a hardcoded constant
  CHECK: node --import ./scripts/ts-alias-loader.mjs scripts/verify-multiaccount-wiring.mjs
  EXPECT: multiaccount wiring verification passed
  EVIDENCE: exit 0, 28/28 checks. proxy.ts reads the inbound header, validates via parseSlot, falls back to the hint cookie for navigations, and forwards the RESOLVED slot on a separate header. All 3 NextResponse rebuild sites forward the resolved headers (a miss there would drop the slot during token refresh). All 16 Supabase construction sites derive the cookie from the request/tab slot; a negative control confirms the check rejects a fixed-cookie site. No server module outside proxy.ts reads the unvalidated inbound header.

- [x] G4: the browser sends the slot on every same-origin request without editing the 35 existing fetch call sites, and the value is per-tab (sessionStorage), not per-browser (localStorage/cookie)
  CHECK: node --import ./scripts/ts-alias-loader.mjs scripts/verify-multiaccount-wiring.mjs
  EXPECT: multiaccount wiring verification passed
  EVIDENCE: exit 0, same run as G3. The slot lives in sessionStorage (per-tab), explicitly NOT localStorage (asserted separately, since localStorage would be per-browser and defeat the feature). fetch() is wrapped once and idempotently via a __travixoSlotFetch guard, covering all 35 existing call sites plus any added later; cross-origin requests are left untouched to avoid CORS preflight and slot leakage. AccountSlotBootstrap is confirmed mounted in app/layout.tsx - without that the wrapper never installs.

- [x] G5: Phase 1 guarantees are NOT regressed — no bare signOut(), all construction sites still pinned
  CHECK: node --import ./scripts/ts-alias-loader.mjs scripts/verify-session-scope.mjs
  EXPECT: session scope verification passed
  EVIDENCE: exit 0, 9/9 checks. Phase 1 unregressed: still zero bare signOut() calls across 165 files, 5 sites scoped local, scanner positive control still passes.

- [x] G6: session isolation checks still pass against the slot-aware code
  CHECK: node --import ./scripts/ts-alias-loader.mjs scripts/verify-session-isolation.mjs
  EXPECT: session isolation verification passed
  EVIDENCE: exit 0, 10/10 checks. The verifier was UPDATED as part of this change to accept cookieOptionsForSlot(...) alongside the Phase 1 constant, because Phase 2 replaced the fixed constant with a per-request resolver. Its negative control still passes, so the relaxation did not make it vacuous.

- [x] G7: repository typechecks clean
  CHECK: node -e "const r=require('child_process').spawnSync('npx tsc --noEmit',{shell:true,encoding:'utf8'}); const out=(r.stdout||'')+(r.stderr||''); if(r.status===0){console.log('TSC_CLEAN')}else{console.log(out.slice(0,2000));process.exit(1)}"
  EXPECT: TSC_CLEAN
  EVIDENCE: exit 0, printed TSC_CLEAN.

- [x] G8: production build succeeds
  CHECK: node scripts/verify-build-clean.mjs
  EXPECT: build verification passed
  EVIDENCE: exit 0, printed build verification passed (production next build).

- [x] G9: earlier admin work is unregressed
  CHECK: node --import ./scripts/ts-alias-loader.mjs scripts/verify-admin-end-pilot.mjs
  EXPECT: admin end-pilot verification passed
  EVIDENCE: exit 0, 45/45. Also re-ran the other two admin verifiers: extend-conditional 32/32, org-health 55/55. Full repo suite: 7 verifiers, 195/195 checks, zero regressions.

- [ ] G10: MANUAL — in a real browser: sign in as account A, open a second tab, switch that tab to a new slot, sign in as account B, then confirm BOTH tabs stay on their own account across navigation and refresh. Only a browser can decide this.
  EVIDENCE: pending
