#!/usr/bin/env node
// load/seed/seed-load-users.mjs
//
// Creates the accounts, organisations and fixtures the k6 harness needs.
// Dependency-free: it talks to the Supabase Auth admin API and PostgREST with
// the built-in fetch, so nothing is added to the app's package.json.
//
// Run against a THROWAWAY project or a preview branch database. It writes
// real rows.
//
//   SUPABASE_URL=https://<ref>.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=... \
//   USER_COUNT=50 \
//   USER_PASSWORD='<a strong password>' \
//   ASSETS_PER_ORG=400 \
//   node load/seed/seed-load-users.mjs
//
// It prints the env block to paste into your k6 invocation.

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const USER_COUNT = Number(process.env.USER_COUNT || 50);
const USER_PASSWORD = process.env.USER_PASSWORD || '';
const EMAIL_PATTERN = process.env.USER_EMAIL_PATTERN || 'loadtest+{i}@example.invalid';
const ASSETS_PER_ORG = Number(process.env.ASSETS_PER_ORG || 400);
const ORG_COUNT = Number(process.env.ORG_COUNT || 5);
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/+$/, '');

if (!SUPABASE_URL || !SERVICE_KEY || !USER_PASSWORD) {
  console.error(
    'SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and USER_PASSWORD are required.\n' +
      'Refusing to run without them.'
  );
  process.exit(1);
}

if (/\bapp\.travixosystems\.com\b/.test(SUPABASE_URL)) {
  console.error('Refusing to seed what looks like a production target.');
  process.exit(1);
}

const adminHeaders = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

async function rest(path, init = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { ...adminHeaders, Prefer: 'return=representation', ...(init.headers || {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method || 'GET'} ${path} -> ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

async function createAuthUser(email) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      email,
      password: USER_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: `Load Test ${email}` },
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (res.status === 200 || res.status === 201) return body.id;
  // Already exists: look it up instead of failing the whole run.
  if (res.status === 422 || res.status === 409 || /already/i.test(body.msg || body.message || '')) {
    const list = await fetch(
      `${SUPABASE_URL}/auth/v1/admin/users?filter=${encodeURIComponent(email)}`,
      { headers: adminHeaders }
    );
    const j = await list.json().catch(() => ({}));
    const found = (j.users || []).find((u) => u.email === email);
    if (found) return found.id;
  }
  throw new Error(`create user ${email}: ${res.status} ${JSON.stringify(body)}`);
}

function uuid() {
  return crypto.randomUUID();
}

async function ensureOrg(index) {
  const name = `k6 Load Depot ${index}`;
  const existing = await rest(`organizations?select=id&name=eq.${encodeURIComponent(name)}&limit=1`);
  if (existing && existing.length) return existing[0].id;

  const created = await rest('organizations', {
    method: 'POST',
    body: JSON.stringify({
      name,
      slug: `k6-load-depot-${index}-${Date.now()}`,
      // A pilot in its full-access window, so write gates do not refuse the
      // harness (lib/billing/access-model.ts:129).
      is_pilot: true,
      pilot_start_date: new Date().toISOString(),
      pilot_end_date: new Date(Date.now() + 29 * 86400000).toISOString(),
      converted_to_paid: false,
      demo_data_seeded: true,
      onboarding_completed: true,
    }),
  });
  return created[0].id;
}

async function ensureCategory(orgId, name) {
  const found = await rest(
    `asset_categories?select=id&organization_id=eq.${orgId}&name=eq.${encodeURIComponent(name)}&limit=1`
  );
  if (found && found.length) return found[0].id;
  const created = await rest('asset_categories', {
    method: 'POST',
    body: JSON.stringify({ organization_id: orgId, name }),
  });
  return created[0].id;
}

async function seedAssets(orgId, categoryIds, howMany) {
  const existing = await rest(`assets?select=id&organization_id=eq.${orgId}&limit=1`);
  const already = await fetch(
    `${SUPABASE_URL}/rest/v1/assets?select=id&organization_id=eq.${orgId}`,
    { headers: { ...adminHeaders, Prefer: 'count=exact', Range: '0-0' } }
  );
  const total = Number((already.headers.get('content-range') || '/0').split('/')[1] || 0);
  if (total >= howMany) {
    console.log(`  assets: ${total} already present, skipping`);
    return existing[0]?.id || null;
  }

  const need = howMany - total;
  console.log(`  assets: creating ${need}`);
  const CHUNK = 200;
  let firstId = existing[0]?.id || null;

  for (let start = 0; start < need; start += CHUNK) {
    const rows = [];
    for (let i = start; i < Math.min(start + CHUNK, need); i++) {
      const qr = uuid();
      rows.push({
        organization_id: orgId,
        name: `Nacelle k6 ${total + i + 1}`,
        serial_number: `K6-${orgId.slice(0, 8)}-${total + i + 1}`,
        status: i % 3 === 0 ? 'in_use' : 'available',
        current_location: `Depot ${((total + i) % 5) + 1}`,
        category_id: categoryIds[(total + i) % categoryIds.length],
        qr_code: qr,
        qr_url: `${APP_URL}/scan/${qr}`,
      });
    }
    const created = await rest('assets', { method: 'POST', body: JSON.stringify(rows) });
    if (!firstId && created && created.length) firstId = created[0].id;
  }
  return firstId;
}

async function seedSchedules(orgId) {
  const assets = await rest(`assets?select=id&organization_id=eq.${orgId}&limit=200`);
  const existing = await rest(
    `vgp_schedules?select=id&organization_id=eq.${orgId}&archived_at=is.null&limit=1`
  );
  if (existing && existing.length) {
    console.log('  vgp_schedules: already present, skipping');
    return existing[0].id;
  }

  const rows = assets.map((a, i) => {
    const due = new Date(Date.now() + (i % 90
      ? (i % 90) - 30
      : 15) * 86400000);
    return {
      asset_id: a.id,
      organization_id: orgId,
      interval_months: 12,
      next_due_date: due.toISOString().slice(0, 10),
      status: 'active',
    };
  });
  console.log(`  vgp_schedules: creating ${rows.length}`);
  const created = await rest('vgp_schedules', { method: 'POST', body: JSON.stringify(rows) });
  return created[0].id;
}

async function seedInspections(orgId, userId) {
  const already = await fetch(
    `${SUPABASE_URL}/rest/v1/vgp_inspections?select=id&organization_id=eq.${orgId}`,
    { headers: { ...adminHeaders, Prefer: 'count=exact', Range: '0-0' } }
  );
  const total = Number((already.headers.get('content-range') || '/0').split('/')[1] || 0);
  if (total >= 300) {
    console.log(`  vgp_inspections: ${total} already present, skipping`);
    return;
  }

  const assets = await rest(`assets?select=id&organization_id=eq.${orgId}&limit=300`);
  const rows = assets.map((a, i) => {
    const when = new Date(Date.now() - (i * 86400000) / 2);
    return {
      asset_id: a.id,
      organization_id: orgId,
      inspection_date: when.toISOString().slice(0, 10),
      inspector_name: 'Seed Inspector',
      inspector_company: 'Seed Verification SARL',
      certification_number: `SEED-${i}`,
      result: 'passed',
      observations: 'seeded for load testing',
      verification_type: 'PERIODIQUE',
      next_inspection_date: new Date(when.getTime() + 365 * 86400000).toISOString().slice(0, 10),
      certificate_url: 'https://utfs.io/f/seed-placeholder.pdf',
      certificate_file_name: 'seed.pdf',
      performed_by: userId,
    };
  });
  console.log(`  vgp_inspections: creating ${rows.length} (DREETS report needs volume)`);
  for (let i = 0; i < rows.length; i += 200) {
    await rest('vgp_inspections', {
      method: 'POST',
      body: JSON.stringify(rows.slice(i, i + 200)),
    });
  }
}

async function main() {
  console.log(`Seeding ${USER_COUNT} users across ${ORG_COUNT} orgs on ${SUPABASE_URL}`);

  const orgIds = [];
  for (let o = 1; o <= ORG_COUNT; o++) {
    const id = await ensureOrg(o);
    orgIds.push(id);
    console.log(`org ${o}: ${id}`);
  }

  let firstUserId = null;
  for (let i = 1; i <= USER_COUNT; i++) {
    const email = EMAIL_PATTERN.replace('{i}', String(i));
    const orgId = orgIds[(i - 1) % orgIds.length];
    const userId = await createAuthUser(email);
    if (!firstUserId) firstUserId = userId;

    await rest('users', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({
        id: userId,
        email,
        organization_id: orgId,
        role: 'owner',
        first_name: 'Load',
        last_name: `Test ${i}`,
        full_name: `Load Test ${i}`,
      }),
    });
    if (i % 10 === 0 || i === USER_COUNT) console.log(`users: ${i}/${USER_COUNT}`);
  }

  const fixtures = {};
  for (const orgId of orgIds) {
    console.log(`fixtures for org ${orgId}:`);
    const cats = [];
    for (const name of ['Nacelles', 'Chariots', 'Echafaudages']) {
      cats.push(await ensureCategory(orgId, name));
    }
    await seedAssets(orgId, cats, ASSETS_PER_ORG);
    const scheduleId = await seedSchedules(orgId);
    await seedInspections(orgId, firstUserId);

    if (!fixtures.assetId) {
      const asset = await rest(
        `assets?select=id,qr_code&organization_id=eq.${orgId}&status=eq.available&limit=1`
      );
      const contention = await rest(
        `assets?select=id,qr_code&organization_id=eq.${orgId}&status=eq.available&offset=1&limit=1`
      );
      fixtures.assetId = asset[0]?.id;
      fixtures.assetQr = asset[0]?.qr_code;
      fixtures.contentionId = contention[0]?.id || asset[0]?.id;
      fixtures.contentionQr = contention[0]?.qr_code || asset[0]?.qr_code;
      fixtures.scheduleId = scheduleId;
    }
  }

  console.log('\n--- paste into your k6 run ---');
  console.log(`  -e USER_COUNT=${USER_COUNT} \\`);
  console.log(`  -e USER_EMAIL_PATTERN='${EMAIL_PATTERN}' \\`);
  console.log(`  -e ASSET_ID=${fixtures.assetId} \\`);
  console.log(`  -e ASSET_QR_CODE=${fixtures.assetQr} \\`);
  console.log(`  -e SCHEDULE_ID=${fixtures.scheduleId} \\`);
  console.log(`  -e CONTENTION_ASSET_ID=${fixtures.contentionId} \\`);
  console.log(`  -e CONTENTION_ASSET_QR=${fixtures.contentionQr}`);
  console.log('------------------------------');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
