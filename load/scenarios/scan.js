// load/scenarios/scan.js
//
// The public QR scan page, plus the checkout and return mutations reached
// from it.
//
// app/scan/[qr_code]/page.tsx:1 is a client component, so the HTML is an
// empty shell and the asset is fetched by RPC after hydration (line 250).
// Mounting also fires an automatic scan log (line 325) and, for signed-in
// users, two more auth round trips plus an audit-context lookup that is an
// N+1 over audit_items (line 173).

import { sleep } from 'k6';
import http from 'k6/http';
import { get, post, ok } from '../lib/metrics.js';
import { appHeaders } from '../lib/auth.js';
import { rpc, selectSingle, select } from '../lib/rest.js';
import {
  BASE_URL,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  ASSET_ID,
  ASSET_QR_CODE,
  ENABLE_WRITES,
} from '../config.js';

function anonSession() {
  return {
    anonKey: SUPABASE_ANON_KEY,
    supabaseHeaders: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, br',
    },
  };
}

/**
 * Anonymous scan: what a driver in a depot actually does. No session.
 */
export function anonymousScan(qrCode) {
  const qr = qrCode || ASSET_QR_CODE;
  const anon = anonSession();

  get('GET /scan/[qr] (doc anon)', `${BASE_URL}/scan/${qr}`, {
    headers: { Accept: 'text/html', 'Accept-Encoding': 'gzip, br' },
    tags: { name: 'GET /scan/[qr] (doc anon)' },
  });

  const assetRes = rpc('rpc get_asset_by_qr', anon, 'get_asset_by_qr', { p_qr_code: qr }, true);
  ok('rpc get_asset_by_qr', assetRes, [200]);

  let assetId = ASSET_ID;
  try {
    const parsed = JSON.parse(assetRes.body);
    const row = Array.isArray(parsed) ? parsed[0] : parsed;
    if (row && row.id) assetId = row.id;
  } catch (_) {
    /* keep the configured fallback */
  }

  if (!assetId) return null;

  // autoLogScan (page.tsx:302). Always fires, signed in or not.
  const logRes = post(
    'POST /api/scan/update (auto log)',
    `${BASE_URL}/api/scan/update`,
    JSON.stringify({
      asset_id: assetId,
      qr_code: qr,
      notes: 'Automatic scan log',
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        Origin: BASE_URL,
        'Accept-Encoding': 'gzip, br',
      },
    }
  );
  ok('POST /api/scan/update (auto log)', logRes, [200]);

  return assetId;
}

/**
 * Signed-in scan: adds the two auth round trips and the audit lookup that
 * checkAuth() and checkActiveAudit() perform (page.tsx:132, :149).
 */
export function authenticatedScan(session, qrCode) {
  const qr = qrCode || ASSET_QR_CODE;

  get('GET /scan/[qr] (doc auth)', `${BASE_URL}/scan/${qr}`, {
    headers: appHeaders(session, { Accept: 'text/html' }),
  });

  const assetRes = rpc('rpc get_asset_by_qr (auth)', session, 'get_asset_by_qr', { p_qr_code: qr });
  let assetId = ASSET_ID;
  try {
    const parsed = JSON.parse(assetRes.body);
    const row = Array.isArray(parsed) ? parsed[0] : parsed;
    if (row && row.id) assetId = row.id;
  } catch (_) {
    /* fallback */
  }

  // checkAuth()
  http.get(`${SUPABASE_URL}/auth/v1/user`, {
    headers: session.supabaseHeaders,
    tags: { name: 'gotrue getUser (scan checkAuth)', class: 'read' },
  });
  selectSingle(
    'pgrst users (scan checkAuth)',
    session,
    'users',
    `select=organization_id&id=eq.${session.userId}`
  );

  // checkActiveAudit() repeats both, then queries audit_items.
  http.get(`${SUPABASE_URL}/auth/v1/user`, {
    headers: session.supabaseHeaders,
    tags: { name: 'gotrue getUser (scan audit ctx)', class: 'read' },
  });
  selectSingle(
    'pgrst users (scan audit ctx)',
    session,
    'users',
    `select=organization_id&id=eq.${session.userId}`
  );
  select(
    'pgrst audit_items (scan audit ctx)',
    session,
    'audit_items',
    `select=id,status,audit_id&asset_id=eq.${assetId}&status=in.(pending,verified,missing)`
  );

  // useFeatureAccess('rental_management') -> /api/subscriptions
  get('GET /api/subscriptions (scan)', `${BASE_URL}/api/subscriptions`, {
    headers: appHeaders(session),
  });

  post(
    'POST /api/scan/update (auto log auth)',
    `${BASE_URL}/api/scan/update`,
    JSON.stringify({ asset_id: assetId, qr_code: qr, notes: 'Automatic scan log' }),
    { headers: appHeaders(session, { 'Content-Type': 'application/json', Origin: BASE_URL }) }
  );

  return assetId;
}

/**
 * Checkout then return. Both go through RPCs (checkout_asset / return_asset),
 * so the DB work is transactional; the cost sits in requireWriteAccess()
 * running before them (lib/server/require-write-access.ts:34-61 = three
 * round trips) plus a repeat getUser and users lookup in the handler.
 */
export function checkoutReturn(session, assetId) {
  if (!ENABLE_WRITES) return;
  const id = assetId || ASSET_ID;
  if (!id) return;

  const coRes = post(
    'POST /api/rentals/checkout',
    `${BASE_URL}/api/rentals/checkout`,
    JSON.stringify({
      asset_id: id,
      client_name: `k6-${__VU}-${__ITER}`,
      client_contact: 'k6@example.invalid',
      expected_return_date: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
      notes: 'k6 load test',
    }),
    { headers: appHeaders(session, { 'Content-Type': 'application/json', Origin: BASE_URL }) }
  );

  // 409 already_rented is an expected outcome under contention, not a failure.
  ok('POST /api/rentals/checkout', coRes, [200, 201, 409, 403]);

  let rentalId = null;
  try {
    const body = JSON.parse(coRes.body);
    rentalId = body.rental_id || (body.rental && body.rental.id) || null;
  } catch (_) {
    /* nothing to return */
  }

  if (!rentalId) return;

  sleep(0.5);

  const retRes = post(
    'POST /api/rentals/return',
    `${BASE_URL}/api/rentals/return`,
    JSON.stringify({ rental_id: rentalId, return_condition: 'good', return_notes: 'k6' }),
    { headers: appHeaders(session, { 'Content-Type': 'application/json', Origin: BASE_URL }) }
  );
  ok('POST /api/rentals/return', retRes, [200, 404]);
}
