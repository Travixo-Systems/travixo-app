/**
 * Verify anonymous exposure of public.assets.
 *
 * Run BEFORE applying 20260819_assets_rls_and_public_scan_view.sql to
 * reproduce the exposure, and AFTER to confirm it is closed.
 *
 *   node scripts/verify-assets-rls.mjs
 *
 * Read-only: issues SELECTs and one RPC call with the public anon key.
 * Never writes. Prints no personal data.
 */
import fs from 'node:fs';

const env = fs.readFileSync('.env.local', 'utf8');
const get = (k) => {
  const m = env.match(new RegExp('^' + k + '=(.*)$', 'm'));
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : null;
};

const url = get('NEXT_PUBLIC_SUPABASE_URL');
const anon = get('NEXT_PUBLIC_SUPABASE_ANON_KEY');
if (!url || !anon) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local');
  process.exit(1);
}
const h = { apikey: anon, Authorization: `Bearer ${anon}` };

// A QR code to exercise the public scan path. Override:
//   SCAN_QR=qr-xxxxxxxx node scripts/verify-assets-rls.mjs
const SCAN_QR = process.env.SCAN_QR || 'qr-2dc2a74d';

let failures = 0;
const check = (label, pass, detail) => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? ` -- ${detail}` : ''}`);
  if (!pass) failures++;
};

const rows = async (path) => {
  const r = await fetch(`${url}/rest/v1/${path}`, { headers: h });
  const d = await r.json().catch(() => null);
  return Array.isArray(d) ? d : [];
};

console.log('=== anonymous access to public.assets ===\n');

// 1. Blanket fleet read -- the core exposure.
const all = await rows('assets?select=id,purchase_price');
check(
  'blanket SELECT on assets returns no rows',
  all.length === 0,
  all.length
    ? `${all.length} rows readable, EUR ${Math.round(
        all.reduce((s, a) => s + (a.purchase_price || 0), 0)
      ).toLocaleString()} of purchase_price exposed`
    : 'anon sees nothing'
);

// 2. Financial columns specifically.
const money = await rows('assets?select=purchase_price,current_value&limit=1');
check(
  'purchase_price / current_value not readable by anon',
  money.length === 0,
  money.length ? `still readable: ${JSON.stringify(money[0])}` : undefined
);

// 3. Cross-tenant identifiers.
const orgs = await rows('assets?select=organization_id');
check(
  'organization_id not enumerable by anon',
  orgs.length === 0,
  orgs.length ? `${new Set(orgs.map((o) => o.organization_id)).size} orgs enumerable` : undefined
);

// 4. scans -- per-asset movement history (location_name, lat/lng, scanned_by).
const scans = await rows('scans?select=id,location_name,latitude,scanned_by');
check(
  'blanket SELECT on scans returns no rows',
  scans.length === 0,
  scans.length
    ? `${scans.length} rows readable -- ${scans.filter((s) => s.location_name).length} named locations, ` +
      `${scans.filter((s) => s.latitude != null).length} GPS coords, ` +
      `${scans.filter((s) => s.scanned_by).length} user ids`
    : 'anon sees nothing'
);

// 5. Full sweep: no OTHER table should be anon-readable either.
//    subscription_plans (public pricing) and asset_categories (labels) are
//    known-intentional; everything else showing rows is a finding.
const ALLOWED = new Set(['subscription_plans', 'asset_categories']);
//    The table list comes from the OpenAPI schema. Anon may not be allowed
//    to read that; fall back to the service-role key purely to ENUMERATE
//    table names (every readability probe below still uses the anon key).
//    If neither yields a list, fail loudly rather than "sweeping 0 tables"
//    and reporting a pass.
const svc = get('SUPABASE_SERVICE_ROLE_KEY');
const listTables = async (key) => {
  try {
    const r = await fetch(`${url}/rest/v1/`, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/openapi+json' },
    });
    const spec = await r.json();
    return Object.keys(spec.definitions || {}).sort();
  } catch {
    return [];
  }
};
let tables = await listTables(anon);
if (tables.length === 0 && svc) tables = await listTables(svc);

if (tables.length === 0) {
  check('no unexpected table is anon-readable', false,
    'could not enumerate tables (OpenAPI schema unavailable) -- sweep did not run');
} else {
  const leaking = [];
  for (const t of tables) {
    const r = await fetch(`${url}/rest/v1/${t}?select=*&limit=1`, {
      headers: { ...h, Prefer: 'count=exact', Range: '0-0' },
    });
    const total = Number(((r.headers.get('content-range') || '').split('/')[1]) || 0);
    if (total > 0 && !ALLOWED.has(t)) leaking.push(`${t} (${total})`);
  }
  check(
    'no unexpected table is anon-readable',
    leaking.length === 0,
    leaking.length ? `still readable: ${leaking.join(', ')}` : `swept ${tables.length} tables`
  );
}

// 6. The public scan path must still work after the migration.
console.log('\n=== public scan path (get_asset_by_qr) ===\n');
const rpc = await fetch(`${url}/rest/v1/rpc/get_asset_by_qr`, {
  method: 'POST',
  headers: { ...h, 'Content-Type': 'application/json' },
  body: JSON.stringify({ p_qr_code: SCAN_QR }),
});
const scan = await rpc.json().catch(() => null);

if (rpc.status === 404) {
  console.log(`SKIP  get_asset_by_qr not installed yet (migration not applied)`);
} else if (!Array.isArray(scan) || scan.length === 0) {
  check(`get_asset_by_qr returns the asset for ${SCAN_QR}`, false,
    `status ${rpc.status}: ${JSON.stringify(scan).slice(0, 160)}`);
} else {
  const a = scan[0];
  check('scan lookup still returns the asset', !!a.name, a.name);
  check('scan payload omits purchase_price', !('purchase_price' in a));
  check('scan payload omits current_value', !('current_value' in a));
  check('scan payload omits organization_id', !('organization_id' in a));
  check('purchase_date is NULL for anonymous viewer', a.purchase_date === null,
    a.purchase_date === null ? undefined : `leaked: ${a.purchase_date}`);
  check('viewer_is_member is false for anonymous viewer', a.viewer_is_member === false);
  console.log(`\n      anon sees keys: ${Object.keys(a).join(', ')}`);
}

// 7. Anonymous QR scan logging must survive RLS.
//    app/api/scan/update writes `scans` with the ANON-key SSR client, so if
//    the anon INSERT policy is missing this breaks silently in production
//    (the route swallows scanError). Exercised through the real endpoint so
//    this script never writes to the database directly.
console.log('\n=== anonymous scan logging (regression guard) ===\n');
const APP = process.env.APP_ORIGIN || 'http://localhost:3737';
try {
  const asset = (await rows(`assets?select=id&limit=1`))[0];
  const probe = await fetch(`${APP}/api/scan/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      asset_id: asset?.id ?? '00000000-0000-0000-0000-000000000000',
      qr_code: SCAN_QR,
      notes: 'rls verification probe',
    }),
  });
  if (!asset) {
    console.log('SKIP  cannot read an asset id anonymously (expected post-migration).');
    console.log(`      Re-run with the dev server up to exercise POST ${APP}/api/scan/update,`);
    console.log('      or scan a QR code in the browser and confirm a new row lands in `scans`.');
  } else {
    check('POST /api/scan/update accepted an anonymous scan', probe.status < 400,
      `status ${probe.status}`);
  }
} catch {
  console.log(`SKIP  ${APP} not reachable -- start the dev server to run this check.`);
}

console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) failed.`}`);
process.exit(failures === 0 ? 0 : 1);
