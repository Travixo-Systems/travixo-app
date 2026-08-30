// load/scenarios/inspection.js
//
// Record a VGP inspection.
//
// The real flow is strictly sequential: the browser uploads the certificate to
// UploadThing and only when that resolves does it POST /api/vgp/inspections
// (app/(dashboard)/vgp/inspection/[id]/page.tsx:134-166). The upload leg is
// not driven here (it goes to a third party, not to the app), so
// UPLOAD_DELAY_MS models it and is reported in `inspection_e2e_ms` alongside
// the API-only latency.

import { sleep } from 'k6';
import { Trend } from 'k6/metrics';
import { get, post, ok } from '../lib/metrics.js';
import { appHeaders } from '../lib/auth.js';
import { BASE_URL, SCHEDULE_ID, ASSET_ID, ENABLE_WRITES, UPLOAD_DELAY_MS } from '../config.js';

export const inspectionE2E = new Trend('inspection_e2e_ms', true);

/** The read half: opening the inspection form. */
export function inspectionFormLoad(session, scheduleId) {
  const id = scheduleId || SCHEDULE_ID;
  if (!id) return;

  get('GET /vgp/inspection/[id] (doc)', `${BASE_URL}/vgp/inspection/${id}`, {
    headers: appHeaders(session, { Accept: 'text/html' }),
  });
  get('GET /api/vgp/schedules/[id]', `${BASE_URL}/api/vgp/schedules/${id}`, {
    headers: appHeaders(session),
  });
  // useVGPAccess -> useSubscription
  get('GET /api/subscriptions (inspection)', `${BASE_URL}/api/subscriptions`, {
    headers: appHeaders(session),
  });
}

/** The write half. */
export function recordInspection(session, scheduleId, assetId) {
  if (!ENABLE_WRITES) return;
  const sid = scheduleId || SCHEDULE_ID;
  const aid = assetId || ASSET_ID;
  if (!sid || !aid) return;

  const started = Date.now();

  // Stand in for the UploadThing leg the user actually waits on.
  if (UPLOAD_DELAY_MS > 0) sleep(UPLOAD_DELAY_MS / 1000);

  const res = post(
    'POST /api/vgp/inspections',
    `${BASE_URL}/api/vgp/inspections`,
    JSON.stringify({
      asset_id: aid,
      schedule_id: sid,
      inspection_date: new Date().toISOString().slice(0, 10),
      inspector_name: `k6 inspector ${__VU}`,
      inspector_company: 'k6 Verification SARL',
      certification_number: `K6-${__VU}-${__ITER}`,
      result: 'passed',
      findings: 'k6 load test record',
      verification_type: 'PERIODIQUE',
      interval_months: 12,
      // Mandatory: the route rejects an inspection with no certificate
      // (app/api/vgp/inspections/route.ts:193).
      certificate_url: 'https://utfs.io/f/k6-load-test-placeholder.pdf',
      certificate_file_name: 'k6-load-test.pdf',
    }),
    { headers: appHeaders(session, { 'Content-Type': 'application/json', Origin: BASE_URL }) }
  );

  ok('POST /api/vgp/inspections', res, [200, 201, 403]);
  inspectionE2E.add(Date.now() - started);
}

/** The list every inspection write invalidates. */
export function inspectionsHistory(session) {
  get('GET /api/vgp/inspections/history', `${BASE_URL}/api/vgp/inspections/history`, {
    headers: appHeaders(session),
  });
}
