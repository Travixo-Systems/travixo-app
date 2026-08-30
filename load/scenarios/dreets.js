// load/scenarios/dreets.js
//
// The DREETS compliance report.
//
// POST /api/vgp/report renders the PDF synchronously with jsPDF inside the
// request (app/api/vgp/report/route.ts:175). jsPDF is CPU-bound and blocking,
// so this endpoint is the one most likely to stall a whole function instance
// rather than just itself. It is classed as a mutation here because it is a
// POST that users wait on, even though it writes nothing.

import { get, post, timed, ok } from '../lib/metrics.js';
import { appHeaders } from '../lib/auth.js';
import { BASE_URL, ENABLE_WRITES } from '../config.js';

function range(months) {
  const end = new Date();
  const start = new Date(end.getTime() - months * 30 * 86400000);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

/** Opening the report page: metadata, then the preview list. */
export function dreetsPreview(session, months) {
  const r = range(months || 12);

  get('GET /vgp/report (doc)', `${BASE_URL}/vgp/report`, {
    headers: appHeaders(session, { Accept: 'text/html' }),
  });

  // Metadata mode reads every inspection_date row for the org just to derive
  // min/max/count (route.ts:242).
  get('GET /api/vgp/report (metadata)', `${BASE_URL}/api/vgp/report`, {
    headers: appHeaders(session),
  });

  get(
    'GET /api/vgp/report (preview)',
    `${BASE_URL}/api/vgp/report?start_date=${r.start}&end_date=${r.end}`,
    { headers: appHeaders(session) }
  );
}

/** Generating the PDF. */
export function dreetsGenerate(session, months) {
  if (!ENABLE_WRITES) return;
  const r = range(months || 12);

  const res = timed(
    'mutation',
    'POST /api/vgp/report (PDF)',
    'POST',
    `${BASE_URL}/api/vgp/report`,
    JSON.stringify({ start_date: r.start, end_date: r.end }),
    {
      headers: appHeaders(session, {
        'Content-Type': 'application/json',
        Origin: BASE_URL,
        Accept: 'application/pdf',
      }),
      // A large PDF can legitimately exceed the default timeout; we want the
      // real number, not a client-side abort.
      timeout: '120s',
      responseType: 'binary',
    }
  );

  ok('POST /api/vgp/report (PDF)', res, [200, 403]);
}

/** The compliance dashboard, which aggregates every schedule in JS. */
export function complianceSummary(session) {
  get('GET /api/vgp/compliance-summary', `${BASE_URL}/api/vgp/compliance-summary`, {
    headers: appHeaders(session),
  });
}

/** The schedules list: the client follows pagination until has_more is false. */
export function schedulesList(session) {
  let page = 1;
  for (;;) {
    const res = get(
      'GET /api/vgp/schedules (page)',
      `${BASE_URL}/api/vgp/schedules?include_archived=false&limit=1000&page=${page}`,
      { headers: appHeaders(session) }
    );
    if (res.status !== 200) break;
    let body;
    try {
      body = JSON.parse(res.body);
    } catch (_) {
      break;
    }
    if (!body.has_more) break;
    page += 1;
    if (page > 20) break; // safety valve
  }
}
