// load/lib/scenarios.js
//
// The six user flows from the brief, as reusable functions.
//
// Each returns quickly on failure rather than throwing, so one bad response
// does not kill a VU and distort the concurrency the test is trying to hold.
//
// IMPORTANT: these hit the routes the REAL UI hits. Where a page fetches from
// Supabase directly in a client component (the assets list does exactly this,
// see components/assets/AssetsPageClient.tsx:86), the scenario reproduces that
// call against PostgREST, because that is the request the browser actually
// makes. Testing only /api/* would miss the app's heaviest query entirely.

import http from 'k6/http'
import { check, group } from 'k6'
import {
  BASE_URL,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SCAN_QR_CODE,
  ENABLE_WRITES,
  CONTENTION_ASSET_ID,
  slotPath,
  TARGET_ORG_ID,
  appHeaders,
} from './config.js'
import {
  record,
  dashboardLatency,
  assetsListLatency,
  scanLatency,
  inspectionLatency,
  reportLatency,
} from './metrics.js'
import { bearer } from './auth.js'

// App requests carry the Vercel bypass header when one is configured;
// requests straight to Supabase deliberately do not.
const jsonHeaders = () => appHeaders({ 'Content-Type': 'application/json' })

/** GET an app route, following the account slot prefix if one is configured. */
function appGet(path, name, kind, trend) {
  const res = http.get(`${BASE_URL}${slotPath(path)}`, {
    tags: { name },
    headers: appHeaders({ 'Accept-Encoding': 'br, gzip' }),
  })
  return record(res, kind || 'read', trend)
}

// ---------------------------------------------------------------------------
// 1. Dashboard
// ---------------------------------------------------------------------------
// Mirrors app/(dashboard)/dashboard/page.tsx: the HTML, then the two layout
// endpoints every dashboard page pays for (ThemeProvider -> organization,
// PilotBanner -> subscriptions).
export function dashboard() {
  group('dashboard', () => {
    appGet('/dashboard', 'page:dashboard', 'read', dashboardLatency)
    appGet('/api/settings/organization', 'api:organization', 'read')
    appGet('/api/subscriptions', 'api:subscriptions', 'read')
  })
}

// ---------------------------------------------------------------------------
// 2. Assets list
// ---------------------------------------------------------------------------
// The page shell is server-rendered, but the asset rows come from a direct
// PostgREST call in the client component. Both are measured; the PostgREST
// call is the one that carries the payload.
// organizationId is no longer a parameter: the RPCs resolve the org from the
// session via get_my_organization_id(), so a caller cannot ask for another
// tenant's rows by passing an id.
export function assetsList(session) {
  group('assets_list', () => {
    appGet('/assets', 'page:assets', 'read', assetsListLatency)

    if (session && SUPABASE_URL) {
      // Mirror what the page ACTUALLY does.
      //
      // This used to issue the old unpaginated `select=*` with two embedded
      // joins, which is the request the pagination work removed. Left as it
      // was, the harness kept measuring code the app no longer runs, and the
      // before/after comparison for this page was meaningless -- the numbers
      // moved by a few percent because the same old query was being timed on
      // both sides.
      //
      // The page now calls the assets_page RPC for one page of rows, plus two
      // aggregate calls for the fleet-wide figures above the table. All three
      // are reproduced here, because all three are on the critical path for a
      // page load.
      const rpcHeaders = { ...bearer(session), 'Content-Type': 'application/json' }

      const page = http.post(
        `${SUPABASE_URL}/rest/v1/rpc/assets_page`,
        JSON.stringify({ p_limit: 50, p_offset: 0 }),
        { headers: rpcHeaders, tags: { name: 'db:assets_page' } }
      )
      record(page, 'read', assetsListLatency)
      check(page, { 'assets page ok': (r) => r.status === 200 })

      const counts = http.post(
        `${SUPABASE_URL}/rest/v1/rpc/assets_status_counts`,
        '{}',
        { headers: rpcHeaders, tags: { name: 'db:assets_status_counts' } }
      )
      record(counts, 'read', assetsListLatency)

      const cats = http.post(
        `${SUPABASE_URL}/rest/v1/rpc/assets_category_counts`,
        '{}',
        { headers: rpcHeaders, tags: { name: 'db:assets_category_counts' } }
      )
      record(cats, 'read', assetsListLatency)
    }
  })
}

// ---------------------------------------------------------------------------
// 3. Public scan page
// ---------------------------------------------------------------------------
// Unauthenticated: this is the QR landing page a site worker opens on a phone.
export function scanPage(qrCode) {
  const code = qrCode || SCAN_QR_CODE
  if (!code) return
  group('scan_page', () => {
    const res = http.get(`${BASE_URL}/scan/${code}`, {
      tags: { name: 'page:scan' },
      headers: appHeaders({ 'Accept-Encoding': 'br, gzip' }),
    })
    record(res, 'read', scanLatency)
    check(res, { 'scan page 200': (r) => r.status === 200 })
  })
}

// ---------------------------------------------------------------------------
// 4. Checkout / return  (WRITE - gated behind ENABLE_WRITES)
// ---------------------------------------------------------------------------
// 409 already_rented and 403 vgp_blocked are CORRECT under concurrency and are
// classified as business rules in metrics.record(), not as errors.
export function checkoutReturn(assetId, clientId) {
  if (!ENABLE_WRITES) return
  const id = assetId || CONTENTION_ASSET_ID
  if (!id) return

  group('checkout_return', () => {
    const co = http.post(
      `${BASE_URL}${slotPath('/api/rentals/checkout')}`,
      JSON.stringify({ asset_id: id, client_id: clientId || undefined }),
      { headers: jsonHeaders(), tags: { name: 'api:checkout' } }
    )
    record(co, 'mutation', scanLatency)
    check(co, {
      'checkout resolved': (r) => [200, 201, 400, 403, 409, 422].includes(r.status),
    })

    // Only attempt a return if we actually took the asset out.
    if (co.status === 200 || co.status === 201) {
      const ret = http.post(
        `${BASE_URL}${slotPath('/api/rentals/return')}`,
        JSON.stringify({ asset_id: id }),
        { headers: jsonHeaders(), tags: { name: 'api:return' } }
      )
      record(ret, 'mutation', scanLatency)
    }
  })
}

// ---------------------------------------------------------------------------
// 5. Record inspection  (WRITE)
// ---------------------------------------------------------------------------
export function recordInspection(assetId, scheduleId) {
  if (!ENABLE_WRITES) return
  if (!assetId) return

  group('record_inspection', () => {
    const body = {
      asset_id: assetId,
      schedule_id: scheduleId || undefined,
      inspection_date: new Date().toISOString().slice(0, 10),
      result: 'pass',
      inspector_name: 'k6 load harness',
      observations: 'automated load test - not a real inspection',
    }
    const res = http.post(
      `${BASE_URL}${slotPath('/api/vgp/inspections')}`,
      JSON.stringify(body),
      { headers: jsonHeaders(), tags: { name: 'api:inspection_create' } }
    )
    record(res, 'mutation', inspectionLatency)
    check(res, {
      'inspection resolved': (r) => [200, 201, 400, 403, 422].includes(r.status),
    })
  })
}

// ---------------------------------------------------------------------------
// 6. DREETS / VGP report
// ---------------------------------------------------------------------------
// Two requests, because the page itself makes two: a metadata call for the date
// range, then the report. Each pays the 3-call auth preamble in require-feature.
export function dreetsReport() {
  group('dreets_report', () => {
    appGet('/vgp/report', 'page:vgp_report', 'read', reportLatency)
    appGet('/api/vgp/report?metadata=true', 'api:report_metadata', 'read', reportLatency)

    const end = new Date()
    const start = new Date(end.getTime() - 90 * 24 * 3600 * 1000)
    const qs = `start_date=${start.toISOString().slice(0, 10)}&end_date=${end
      .toISOString()
      .slice(0, 10)}`
    appGet(`/api/vgp/report?${qs}`, 'api:report_data', 'read', reportLatency)
  })
}

// ---------------------------------------------------------------------------
// Reference data - the cacheability probe
// ---------------------------------------------------------------------------
// These are static reference tables. Under load they should be served from a
// cache; if every VU reaches the origin, finding 06/10 is confirmed live.
export function referenceData() {
  group('reference_data', () => {
    const plans = appGet('/api/subscriptions/plans', 'api:plans', 'read')
    const types = appGet('/api/vgp/equipment-types', 'api:equipment_types', 'read')
    // Plans is PUBLIC reference data, so it belongs in the shared CDN and a
    // HIT is the right assertion.
    check(plans, {
      'plans served from CDN': (r) =>
        (r.headers['X-Vercel-Cache'] || '').includes('HIT'),
    })

    // Equipment types is NOT public: it sits behind the vgp_compliance gate,
    // so it is deliberately `private` and must never enter a shared cache -- a
    // CDN hit there would serve gated data to an org without the feature.
    //
    // Asserting a CDN HIT here was simply the wrong test, and it failed on
    // every run (0/569) while the route was behaving exactly as designed. What
    // matters is that the response carries a private cache directive, which is
    // what lets the BROWSER stop re-fetching it and skip the three-call auth
    // preamble each fetch drags along.
    check(types, {
      'equipment types privately cacheable': (r) =>
        r.status !== 200 || (r.headers['Cache-Control'] || '').includes('private'),
    })
  })
}

/** Resolve the signed-in user's organization_id, for the direct DB queries. */
export function resolveOrgId(session) {
  // An explicit target wins: the load-test tenants are the ones sized for this
  // (1,000 assets each), and the signed-in user may belong somewhere smaller.
  if (TARGET_ORG_ID) return TARGET_ORG_ID
  if (!session || !SUPABASE_URL) return null
  const res = http.get(
    `${SUPABASE_URL}/rest/v1/users?select=organization_id&id=eq.${session.user.id}`,
    { headers: bearer(session), tags: { name: 'db:resolve_org' } }
  )
  if (res.status !== 200) return null
  try {
    const rows = res.json()
    return rows && rows[0] ? rows[0].organization_id : null
  } catch (e) {
    return null
  }
}
