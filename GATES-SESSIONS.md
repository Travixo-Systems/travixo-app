# Gates: multi-account sessions in one browser

OWNS: lib/supabase/client.ts, lib/supabase/server.ts, lib/supabase/cookie-name.ts, app/(admin)/admin/AdminLogoutButton.tsx, app/(auth)/login/page.tsx, app/accept-invite/[token]/page.tsx, components/dashboard/DashboardClient.tsx, components/Sidebar.tsx, app/api/**/route.ts, app/api/uploadthing/core.ts, proxy.ts, scripts/verify-session-scope.mjs, scripts/verify-session-isolation.mjs

Scope: Stop one browser tab's sign-out from destroying every other tab's
session, and give the app a single owned cookie identity so a second account
in a second tab is a supported thing rather than an accident. Phase 1 of the
session work: it fixes the destructive interference the user reported. It does
NOT deliver two DIFFERENT accounts signed in simultaneously — that is Phase 2
and is declared out of scope here.

- [x] G1: every signOut() call passes an explicit scope, and none relies on the library default of 'global' (which revokes the refresh token for ALL of the user's sessions, on every device)
  CHECK: node --import ./scripts/ts-alias-loader.mjs scripts/verify-session-scope.mjs
  EXPECT: session scope verification passed
  EVIDENCE: exit 0, 9/9 checks, "session scope verification passed". Scanned 165 source files; 0 bare signOut() calls remain; 5 call sites now pass SIGN_OUT_SCOPE_LOCAL (AdminLogoutButton.tsx:26, login/page.tsx:83, accept-invite/[token]/page.tsx:237, DashboardClient.tsx:31, Sidebar.tsx:115). Scanner passed a positive control proving it can still SEE a bare call, so the zero is not vacuous.

- [x] G2: the library default really is 'global' — measured from the installed package, not assumed from docs
  CHECK: node --import ./scripts/ts-alias-loader.mjs scripts/verify-session-scope.mjs
  EXPECT: session scope verification passed
  EVIDENCE: exit 0, same run as G1. MEASURED from the installed package, not from documentation: node_modules/@supabase/auth-js/dist/module/GoTrueClient.js line 1572 declares the signOut default parameter as scope 'global', and line 1578 repeats it for the internal _signOut. Also confirmed SIGN_OUT_SCOPES = ['global','local','others'] in dist/module/lib/types.js, so 'local' is supported in this installed version. The script re-measures this on every run and FAILS LOUDLY if a future upgrade changes the default, since the whole rationale depends on it.

- [x] G3: every Supabase client in the app derives its cookie name from ONE owned constant, so no call site can silently fall back to the library default and split the session
  CHECK: node --import ./scripts/ts-alias-loader.mjs scripts/verify-session-isolation.mjs
  EXPECT: session isolation verification passed
  EVIDENCE: exit 0, 10/10 checks, "session isolation verification passed". AUTH_COOKIE_NAME = travixo-auth, asserted distinct from the sb-<ref>-auth-token default pattern. Runtime-verified separately: createBrowserClient(...,{cookieOptions:{name:travixo-auth}}) yields auth.storageKey === travixo-auth.

- [x] G4: no Supabase client is constructed outside the shared helpers without the shared cookie options (all 15 construction sites accounted for)
  CHECK: node --import ./scripts/ts-alias-loader.mjs scripts/verify-session-isolation.mjs
  EXPECT: session isolation verification passed
  EVIDENCE: exit 0, same run as G3. The sweep independently enumerated 15 createServerClient/createBrowserClient construction sites (matching the 15 found by grep before the change) and confirmed ALL 15 pin the cookie name. Includes a negative control: the pinning regex correctly REJECTS an unpinned control site. The 3 chokepoints (proxy.ts, lib/supabase/server.ts, lib/supabase/client.ts) are asserted by name as well.

- [x] G5: repository typechecks clean
  CHECK: node -e "const r=require('child_process').spawnSync('npx tsc --noEmit',{shell:true,encoding:'utf8'}); const out=(r.stdout||'')+(r.stderr||''); if(r.status===0){console.log('TSC_CLEAN')}else{console.log(out.slice(0,2000));process.exit(1)}"
  EXPECT: TSC_CLEAN
  EVIDENCE: exit 0, printed TSC_CLEAN.

- [x] G6: production build succeeds
  CHECK: node scripts/verify-build-clean.mjs
  EXPECT: build verification passed
  EVIDENCE: exit 0, printed "build verification passed" via scripts/verify-build-clean.mjs (production next build). Also re-ran all three admin verifiers from the previous change: all exit 0, no regression.

- [ ] G7: MANUAL — in a real browser, sign in, open a second tab, sign out in tab A, and confirm tab B's session is NOT destroyed (this is the symptom the user reported; only a browser can decide it)
  EVIDENCE: pending

- [ ] G8: MANUAL — confirm with the user whether Phase 2 (two DIFFERENT accounts signed in at once, per-tab identity) is required now. Phase 1 does not deliver it.
  EVIDENCE: pending
