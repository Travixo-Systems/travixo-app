// load/main.js
//
// Entry point. Pick a profile with PROFILE=<name>; every profile drives the
// same scenario functions below.
//
//   k6 run load/main.js -e PROFILE=smoke -e BASE_URL=... -e SUPABASE_URL=...
//
// See load/README.md for the full env list and for how each scenario maps onto
// the code it exercises.

import { sleep } from 'k6';
import exec from 'k6/execution';
import { resolveProfile } from './profiles/index.js';
import { buildReport, renderMarkdown, post, ok } from './lib/metrics.js';
import { authenticate } from './lib/auth.js';
import { resolveOrgId } from './lib/rest.js';
import {
  assertNotProduction,
  thinkTime,
  BASE_URL,
  COLLAPSE_FACTOR,
  ENABLE_WRITES,
  ASSET_ID,
  ASSET_QR_CODE,
  SCHEDULE_ID,
  CONTENTION_ASSET_ID,
  CONTENTION_ASSET_QR,
} from './config.js';

import { loginFlow } from './scenarios/login.js';
import { dashboardLoad } from './scenarios/dashboard.js';
import { assetsListLoad, qrCodesLoad } from './scenarios/assets.js';
import { anonymousScan, authenticatedScan, checkoutReturn } from './scenarios/scan.js';
import {
  inspectionFormLoad,
  recordInspection,
  inspectionsHistory,
} from './scenarios/inspection.js';
import {
  dreetsPreview,
  dreetsGenerate,
  complianceSummary,
  schedulesList,
} from './scenarios/dreets.js';

const PROFILE = __ENV.PROFILE || 'smoke';
export const options = resolveProfile(PROFILE).options;

// --- Per-VU session cache --------------------------------------------------
//
// Signing in on every iteration would measure GoTrue, not the app. Each VU
// authenticates once and reuses the session, which is what a browser does.

let cached = null;

function session() {
  if (cached) return cached;
  const s = authenticate(exec.vu.idInTest);
  if (!s) return null;
  s.orgId = resolveOrgId(s);
  cached = s;
  return cached;
}

export function setup() {
  assertNotProduction();
  console.log(`[k6] profile=${PROFILE} target=${BASE_URL} writes=${ENABLE_WRITES}`);
  if (!ENABLE_WRITES) {
    console.log('[k6] ENABLE_WRITES=false: mutation scenarios run their read half only.');
  }
  return { startedAt: new Date().toISOString() };
}

// --- Scenario entry points -------------------------------------------------

export function loginScenario() {
  loginFlow(exec.vu.idInTest);
  sleep(thinkTime());
}

export function dashboardScenario() {
  const s = session();
  if (!s || !s.orgId) {
    sleep(thinkTime());
    return;
  }
  dashboardLoad(s, s.orgId);
  sleep(thinkTime());
}

export function assetsScenario() {
  const s = session();
  if (!s || !s.orgId) {
    sleep(thinkTime());
    return;
  }
  assetsListLoad(s, s.orgId);
  sleep(thinkTime());
  // One in five visits to the assets list continues to the QR sheet.
  if (exec.scenario.iterationInTest % 5 === 0) {
    qrCodesLoad(s, s.orgId);
    sleep(thinkTime());
  }
}

export function scanScenario() {
  // Most scans in the field are anonymous: a driver points a phone at a
  // sticker. Every fourth one is a signed-in depot user doing a checkout.
  if (exec.scenario.iterationInTest % 4 !== 0) {
    anonymousScan(ASSET_QR_CODE);
    sleep(thinkTime());
    return;
  }

  const s = session();
  if (!s) {
    sleep(thinkTime());
    return;
  }
  const assetId = authenticatedScan(s, ASSET_QR_CODE) || ASSET_ID;
  checkoutReturn(s, assetId);
  sleep(thinkTime());
}

export function inspectionScenario() {
  const s = session();
  if (!s) {
    sleep(thinkTime());
    return;
  }
  inspectionFormLoad(s, SCHEDULE_ID);
  recordInspection(s, SCHEDULE_ID, ASSET_ID);
  inspectionsHistory(s);
  sleep(thinkTime());
}

export function dreetsScenario() {
  const s = session();
  if (!s) {
    sleep(thinkTime());
    return;
  }
  complianceSummary(s);
  schedulesList(s);
  dreetsPreview(s, 12);
  dreetsGenerate(s, 12);
  sleep(thinkTime());
}

/**
 * dep-degrade: only the routes that block on a third party.
 *   POST /api/team/invitations -> awaits Resend inside the request
 *   POST /api/vgp/report       -> synchronous jsPDF, CPU-bound, blocks the loop
 *   POST /api/vgp/inspections  -> preceded by an UploadThing upload client side
 */
export function dependencyScenario() {
  const s = session();
  if (!s) {
    sleep(thinkTime());
    return;
  }

  if (ENABLE_WRITES) {
    const res = post(
      'POST /api/team/invitations',
      `${BASE_URL}/api/team/invitations`,
      JSON.stringify({
        email: `k6-invite-${exec.vu.idInTest}-${exec.scenario.iterationInTest}@example.invalid`,
        role: 'member',
      }),
      {
        headers: {
          Cookie: s.cookie,
          'Content-Type': 'application/json',
          Origin: BASE_URL,
          'Accept-Encoding': 'gzip, br',
        },
        timeout: '60s',
      }
    );
    // 400/403/409/429 are legitimate business answers; what matters here is
    // latency and whether the request completes at all.
    ok('POST /api/team/invitations', res, [200, 201, 400, 403, 409, 429]);
  }

  dreetsGenerate(s, 3);
  inspectionFormLoad(s, SCHEDULE_ID);
  recordInspection(s, SCHEDULE_ID, ASSET_ID);
  sleep(thinkTime());
}

/**
 * write-contention: every VU targets one asset, with no think time.
 */
export function contentionScenario() {
  const s = session();
  if (!s) {
    sleep(1);
    return;
  }

  const assetId = CONTENTION_ASSET_ID || ASSET_ID;
  const qr = CONTENTION_ASSET_QR || ASSET_QR_CODE;

  // /api/scan/update writes last_seen_at on the shared row on every hit, so
  // this is the contention floor even with no rental in play.
  const res = post(
    'POST /api/scan/update (contention)',
    `${BASE_URL}/api/scan/update`,
    JSON.stringify({ asset_id: assetId, qr_code: qr, notes: 'k6 contention' }),
    {
      headers: {
        'Content-Type': 'application/json',
        Origin: BASE_URL,
        Cookie: s.cookie,
        'Accept-Encoding': 'gzip, br',
      },
    }
  );
  ok('POST /api/scan/update (contention)', res, [200, 404, 403]);

  checkoutReturn(s, assetId);
  sleep(0.1);
}

// --- Summary ---------------------------------------------------------------

export function handleSummary(data) {
  const meta = {
    profile: PROFILE,
    baseUrl: BASE_URL,
    startedAt: new Date().toISOString(),
    collapseFactor: COLLAPSE_FACTOR,
    writesEnabled: ENABLE_WRITES,
  };
  const report = buildReport(data, meta);
  const md = renderMarkdown(report, data);

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const out = {};
  out['stdout'] = md + '\n';
  out[`load/results/${PROFILE}-${stamp}.md`] = md;
  out[`load/results/${PROFILE}-${stamp}.json`] = JSON.stringify(
    { report: report, k6: data },
    null,
    2
  );
  return out;
}
