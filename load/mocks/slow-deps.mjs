#!/usr/bin/env node
// load/mocks/slow-deps.mjs
//
// A dependency-free stand-in for Resend and Stripe that answers slowly on
// purpose, so the dep-degrade profile can measure what a degraded third party
// does to the app.
//
// Usage:
//   node load/mocks/slow-deps.mjs --port 8787 --latency 5000 --error-rate 0.1
//
// Then start the app under test with:
//   RESEND_BASE_URL=http://127.0.0.1:8787 npm run start
//
// RESEND_BASE_URL is read by the installed Resend SDK
// (node_modules/resend/dist/index.cjs:882), so no app change is needed.
//
// Stripe is different. lib/stripe.ts and app/api/stripe/webhook/route.ts
// construct `new Stripe(key, { apiVersion })` without a `host` option, and the
// Stripe SDK has no env-var equivalent of RESEND_BASE_URL. To degrade Stripe
// without touching app code you have to intercept at the network layer:
// run the app locally and add
//   127.0.0.1  api.stripe.com
// to /etc/hosts with this server on 443 behind a self-signed cert your Node
// process trusts (NODE_EXTRA_CA_CERTS). On a Vercel preview it is not
// injectable at all. The honest read is: the Stripe leg of dep-degrade is
// measurable locally and UNVERIFIABLE against a preview deployment.

import http from 'node:http';

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] !== undefined ? args[i + 1] : fallback;
}

const PORT = Number(arg('port', 8787));
const LATENCY_MS = Number(arg('latency', 5000));
const JITTER_MS = Number(arg('jitter', 1000));
const ERROR_RATE = Number(arg('error-rate', 0));
// Fraction of requests that hang until the caller gives up. This is the case
// that actually hurts: a slow dependency with no client-side timeout.
const HANG_RATE = Number(arg('hang-rate', 0));

let served = 0;
let hung = 0;
let failed = 0;

const server = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  served += 1;

  const wait = LATENCY_MS + Math.random() * JITTER_MS;

  if (Math.random() < HANG_RATE) {
    hung += 1;
    console.log(`[slow-deps] HANG   ${req.method} ${req.url}`);
    return; // never respond; the socket stays open
  }

  await new Promise((r) => setTimeout(r, wait));

  if (Math.random() < ERROR_RATE) {
    failed += 1;
    console.log(`[slow-deps] 500    ${req.method} ${req.url} (+${Math.round(wait)}ms)`);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'injected upstream failure', name: 'internal_error' }));
    return;
  }

  console.log(`[slow-deps] 200    ${req.method} ${req.url} (+${Math.round(wait)}ms)`);
  res.writeHead(200, { 'Content-Type': 'application/json' });

  // Resend send-email response shape.
  if (req.url.startsWith('/emails')) {
    res.end(JSON.stringify({ id: `mock-${served}` }));
    return;
  }

  // Stripe-ish fallbacks, used only when intercepting at the network layer.
  if (req.url.includes('/v1/checkout/sessions')) {
    res.end(
      JSON.stringify({
        id: `cs_mock_${served}`,
        object: 'checkout.session',
        url: 'https://checkout.stripe.com/mock',
      })
    );
    return;
  }
  if (req.url.includes('/v1/billing_portal/sessions')) {
    res.end(
      JSON.stringify({
        id: `bps_mock_${served}`,
        object: 'billing_portal.session',
        url: 'https://billing.stripe.com/mock',
      })
    );
    return;
  }

  res.end(JSON.stringify({ ok: true, mock: true }));
});

server.listen(PORT, () => {
  console.log(
    `[slow-deps] listening on http://127.0.0.1:${PORT} ` +
      `latency=${LATENCY_MS}ms jitter=${JITTER_MS}ms error-rate=${ERROR_RATE} hang-rate=${HANG_RATE}`
  );
  console.log('[slow-deps] point the app at it with: RESEND_BASE_URL=http://127.0.0.1:' + PORT);
});

process.on('SIGINT', () => {
  console.log(`\n[slow-deps] served=${served} hung=${hung} failed=${failed}`);
  process.exit(0);
});
