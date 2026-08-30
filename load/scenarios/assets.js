// load/scenarios/assets.js
//
// One cold load of /assets.
//
// components/assets/AssetsPageClient.tsx:86 fetches EVERY asset the org owns
// in a single query, with two embedded relations and `select('*')`, then
// paginates in the browser (line 174). There is no server-side limit, offset
// or range on this query, so the payload grows linearly with fleet size.

import { get } from '../lib/metrics.js';
import { appHeaders } from '../lib/auth.js';
import { select, selectSingle } from '../lib/rest.js';
import { BASE_URL, SUPABASE_URL } from '../config.js';
import http from 'k6/http';

export function assetsListLoad(session, orgId) {
  get('GET /assets (doc)', `${BASE_URL}/assets`, {
    headers: appHeaders(session, { Accept: 'text/html' }),
  });

  // Layout shell, same as every dashboard route.
  get('GET /api/settings/organization', `${BASE_URL}/api/settings/organization`, {
    headers: appHeaders(session),
  });
  get('GET /api/subscriptions', `${BASE_URL}/api/subscriptions`, {
    headers: appHeaders(session),
  });

  http.get(`${SUPABASE_URL}/auth/v1/user`, {
    headers: session.supabaseHeaders,
    tags: { name: 'gotrue getUser (assets)', class: 'read' },
  });
  selectSingle(
    'pgrst users.organization_id (assets)',
    session,
    'users',
    `select=organization_id&id=eq.${session.userId}`
  );

  // The unpaginated list. This is the request to watch.
  select(
    'pgrst assets FULL LIST (unpaginated)',
    session,
    'assets',
    `select=*,asset_categories(id,name),vgp_schedules(id,next_due_date,archived_at)` +
      `&organization_id=eq.${orgId}&order=created_at.desc`
  );
}

/**
 * /qr-codes pulls the same list again with a different projection
 * (components/assets/QRCodesPageClient.tsx:38) and ships jsPDF + qrcode to do
 * the rendering client side.
 */
export function qrCodesLoad(session, orgId) {
  get('GET /qr-codes (doc)', `${BASE_URL}/qr-codes`, {
    headers: appHeaders(session, { Accept: 'text/html' }),
  });
  select(
    'pgrst assets FULL LIST (qr-codes)',
    session,
    'assets',
    `select=*,asset_categories(name)&organization_id=eq.${orgId}&order=created_at.desc`
  );
}
