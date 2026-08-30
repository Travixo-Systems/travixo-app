// load/lib/endpoints.js
//
// The canonical list of request labels the scenarios emit.
//
// Why this file exists: k6 gives every VU its own isolated JavaScript runtime,
// and handleSummary runs in yet another one, so a module-level accumulator
// written by VUs is invisible to the summary. The supported way to get a
// per-label breakdown out of a run is to declare a threshold on the tagged
// sub-metric, which makes k6 compute it and include it in the summary data.
//
// The thresholds generated from this list are deliberately permissive
// (`p(95)<86400000`, i.e. a day) so they can never fail a run. They exist only
// to surface the sub-metric. The real pass/fail thresholds live in
// config.js:THRESHOLDS.
//
// Keep a label here in sync with the string passed to get()/post()/timed().
// A label that is emitted but not listed still works; it just will not appear
// in the per-endpoint table.

export const ENDPOINTS = [
  // auth
  'gotrue token',
  'gotrue getUser (Sidebar)',
  'gotrue getUser (dashboard)',
  'gotrue getUser (assets)',
  'gotrue getUser (scan checkAuth)',
  'gotrue getUser (scan audit ctx)',

  // documents
  'GET /login (doc)',
  'GET /dashboard (doc)',
  'GET /dashboard (post-login)',
  'GET /assets (doc)',
  'GET /qr-codes (doc)',
  'GET /scan/[qr] (doc anon)',
  'GET /scan/[qr] (doc auth)',
  'GET /vgp/report (doc)',
  'GET /vgp/inspection/[id] (doc)',

  // app API
  'GET /api/settings/organization',
  'GET /api/subscriptions',
  'GET /api/subscriptions (scan)',
  'GET /api/subscriptions (inspection)',
  'GET /api/vgp/schedules (page)',
  'GET /api/vgp/schedules/[id]',
  'GET /api/vgp/compliance-summary',
  'GET /api/vgp/inspections/history',
  'GET /api/vgp/report (metadata)',
  'GET /api/vgp/report (preview)',
  'POST /api/vgp/report (PDF)',
  'POST /api/vgp/inspections',
  'POST /api/scan/update (auto log)',
  'POST /api/scan/update (auto log auth)',
  'POST /api/scan/update (contention)',
  'POST /api/rentals/checkout',
  'POST /api/rentals/return',
  'POST /api/team/invitations',

  // direct PostgREST, as the client components issue it
  'pgrst users.organization_id',
  'pgrst users (Sidebar)',
  'pgrst users+org (dashboard)',
  'pgrst users.organization_id (assets)',
  'pgrst users (scan checkAuth)',
  'pgrst users (scan audit ctx)',
  'pgrst assets count (total)',
  'pgrst assets count (in_use)',
  'pgrst scans count (7d unscoped)',
  'pgrst vgp_schedules (dashboard)',
  'pgrst rentals (all active)',
  'pgrst rentals (top 3)',
  'pgrst assets+category (utilisation)',
  'pgrst assets FULL LIST (unpaginated)',
  'pgrst assets FULL LIST (qr-codes)',
  'pgrst audit_items (scan audit ctx)',
  'rpc get_asset_by_qr',
  'rpc get_asset_by_qr (auth)',
];

const NEVER_FAILS_MS = 86400000;

/**
 * Threshold entries that force k6 to compute per-endpoint sub-metrics.
 * Merge into a profile's `thresholds`.
 */
export function endpointThresholds() {
  const out = {};
  for (const e of ENDPOINTS) {
    out[`http_req_duration{name:${e}}`] = [`p(95)<${NEVER_FAILS_MS}`];
    out[`http_req_failed{name:${e}}`] = ['rate<=1'];
    out[`payload_bytes{endpoint:${e}}`] = [`avg<${Number.MAX_SAFE_INTEGER}`];
    out[`payload_uncompressed_bytes{endpoint:${e}}`] = [`avg<${Number.MAX_SAFE_INTEGER}`];
    out[`responses_without_compression{endpoint:${e}}`] = ['rate<=1'];
    out[`responses_without_content_length{endpoint:${e}}`] = ['rate<=1'];
  }
  return out;
}
