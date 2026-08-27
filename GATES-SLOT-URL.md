# Gates: per-tab account survives reload (URL-carried slot)

OWNS: lib/supabase/account-slot.ts, lib/supabase/client.ts, components/AccountSlotBootstrap.tsx, components/Sidebar.tsx, proxy.ts, scripts/verify-slot-url.mjs

Scope: Fix the reported defect: after a RELOAD, two tabs on different accounts
both showed the same account (whichever signed in last). Cause: a reload is a
plain navigation carrying no header, so the proxy fell back to
SLOT_HINT_COOKIE — a single BROWSER-WIDE cookie. A per-browser value cannot
answer a per-tab question. The slot must live in the URL, which is per-tab by
construction and is what the browser resends on reload.

Approach: the browser URL carries /u/<slot> (like Google's /u/0/). proxy.ts
strips the prefix and REWRITES to the real path, so no route, Link, or
redirect in the app changes. The address bar shows the account; the app does
not know the prefix exists.

- [x] G1: the slot prefix is parsed and stripped correctly, including edge cases (bare /u/1, /u/1/, unknown slots, paths that merely start with the letter u)
  CHECK: node --import ./scripts/ts-alias-loader.mjs scripts/verify-slot-url.mjs
  EXPECT: slot url verification passed
  EVIDENCE: exit 0, 39/39 checks. splitSlotPath verified on 14 cases including the ones that would break routing: /users, /upload, /u, /u/ and /u/abc are NOT treated as slot prefixes; /u/1 and /u/1/ both give path /; /u/99 degrades to slot 0 but still strips so it renders instead of 404ing. Negative control on /users/123 confirms prefix matching is not greedy.

- [x] G2: the URL is the authoritative source on a navigation, and the browser-wide hint cookie is NO LONGER consulted for slot resolution (it was the bug)
  CHECK: node --import ./scripts/ts-alias-loader.mjs scripts/verify-slot-url.mjs
  EXPECT: slot url verification passed
  EVIDENCE: exit 0, same run as G1. THE REGRESSION GUARD: asserts SLOT_HINT_COOKIE is gone from proxy.ts, gone from the module exports, and publishSlotHint gone from the client. Reintroducing a browser-wide cookie into slot resolution is exactly what caused the reported bug, so this is checked three ways.

- [x] G3: proxy rewrites the stripped path so app routes are unchanged, and preserves query string and the redirectTo target
  CHECK: node --import ./scripts/ts-alias-loader.mjs scripts/verify-slot-url.mjs
  EXPECT: slot url verification passed
  EVIDENCE: exit 0, same run as G1. proxy splits the slot before any other check (so rate limiting and protected-route matching see the real path), rewrites to the stripped path via NextResponse.rewrite, and routes all 3 response rebuilds through one passThrough() helper - a rebuild during token refresh would otherwise drop the rewrite and 404. Login redirect, redirectTo and the post-login destination all keep the prefix.

- [x] G4: slot 0 produces NO prefix, so every existing URL and bookmark keeps working unchanged
  CHECK: node --import ./scripts/ts-alias-loader.mjs scripts/verify-slot-url.mjs
  EXPECT: slot url verification passed
  EVIDENCE: exit 0, same run as G1. withSlotPath(0, path) returns the path unchanged, so every existing URL and bookmark is unaffected. Round-trip verified for all 3 slots x 4 paths. Idempotence verified: re-prefixing never nests, and switching to slot 0 strips an existing prefix.

- [x] G5: client-side navigation keeps the prefix, so clicking a link in a slot-1 tab does not fall back to slot 0
  CHECK: node --import ./scripts/ts-alias-loader.mjs scripts/verify-slot-url.mjs
  EXPECT: slot url verification passed
  EVIDENCE: exit 0, same run as G1. getCurrentSlot reads the URL first (the value the server just rendered against), falling back to sessionStorage only when the URL has no prefix. installSlotHistoryGuard patches pushState/replaceState so client-side navigation keeps the prefix without touching the 74 Link hrefs. Sidebar switcher navigates via slotUrl(), and now offers + Add account so a second account is reachable at all.

- [x] G6: earlier session guarantees unregressed (scope + isolation)
  CHECK: node --import ./scripts/ts-alias-loader.mjs scripts/verify-session-scope.mjs
  EXPECT: session scope verification passed
  EVIDENCE: exit 0. session-scope 9/9 and session-isolation 10/10 - Phase 1 unregressed.

- [x] G7: multiaccount slot mapping and wiring unregressed
  CHECK: node --import ./scripts/ts-alias-loader.mjs scripts/verify-multiaccount.mjs
  EXPECT: multiaccount verification passed
  EVIDENCE: exit 0. multiaccount 16/16 and multiaccount-wiring 28/28. Both were UPDATED in this change to assert the URL mechanism instead of the removed cookie; their negative controls still pass, so the updates are not vacuous.

- [x] G8: repository typechecks clean
  CHECK: node -e "const r=require('child_process').spawnSync('npx tsc --noEmit',{shell:true,encoding:'utf8'}); const out=(r.stdout||'')+(r.stderr||''); if(r.status===0){console.log('TSC_CLEAN')}else{console.log(out.slice(0,2000));process.exit(1)}"
  EXPECT: TSC_CLEAN
  EVIDENCE: exit 0, printed TSC_CLEAN.

- [x] G9: production build succeeds
  CHECK: node scripts/verify-build-clean.mjs
  EXPECT: build verification passed
  EVIDENCE: exit 0, printed build verification passed. Full suite: 8 verifiers, 234/234 checks, zero regressions.

- [ ] G10: MANUAL — the reported defect is gone: two tabs, two accounts, RELOAD BOTH, each stays on its own account.
  EVIDENCE: pending
