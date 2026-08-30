// load/lib/rest.js
//
// Thin PostgREST helpers. The dashboard, assets list, QR codes page and scan
// page all talk to Supabase directly from the browser rather than through a
// Next route, so a harness that only exercises /api/* would miss most of the
// load these pages actually generate. These helpers issue the same requests
// the client components issue.

import { SUPABASE_URL } from '../config.js';
import { timed } from './metrics.js';

export function restUrl(table, query) {
  const qs = query ? `?${query}` : '';
  return `${SUPABASE_URL}/rest/v1/${table}${qs}`;
}

/** Equivalent of supabase.from(t).select(...) */
export function select(name, session, table, query, extraHeaders) {
  return timed('read', name, 'GET', restUrl(table, query), null, {
    headers: Object.assign({}, session.supabaseHeaders, extraHeaders || {}),
  });
}

/** Equivalent of .single() / .maybeSingle(): PostgREST returns an object. */
export function selectSingle(name, session, table, query) {
  return select(name, session, table, query, {
    Accept: 'application/vnd.pgrst.object+json',
  });
}

/** Equivalent of .select('*', { count: 'exact', head: true }) */
export function count(name, session, table, query) {
  return timed('read', name, 'HEAD', restUrl(table, `select=*&${query}`), null, {
    headers: Object.assign({}, session.supabaseHeaders, { Prefer: 'count=exact' }),
  });
}

/** Equivalent of supabase.rpc(fn, args) */
export function rpc(name, session, fn, args, anonymous) {
  const headers = anonymous
    ? {
        apikey: session.anonKey,
        Authorization: `Bearer ${session.anonKey}`,
        'Content-Type': 'application/json',
        'Accept-Encoding': 'gzip, br',
      }
    : Object.assign({}, session.supabaseHeaders, { 'Content-Type': 'application/json' });

  return timed('read', name, 'POST', `${SUPABASE_URL}/rest/v1/rpc/${fn}`, JSON.stringify(args), {
    headers: headers,
  });
}

/**
 * Resolve the signed-in user's organization_id, exactly as every client
 * component does before it can query anything else
 * (components/assets/AssetsPageClient.tsx:78, dashboard/page.tsx:67, ...).
 */
export function resolveOrgId(session) {
  const res = selectSingle(
    'pgrst users.organization_id',
    session,
    'users',
    `select=organization_id&id=eq.${session.userId}`
  );
  if (res.status !== 200) return null;
  try {
    return JSON.parse(res.body).organization_id;
  } catch (_) {
    return null;
  }
}
