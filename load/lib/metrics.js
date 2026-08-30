// load/lib/metrics.js
//
// Shared metrics, request wrappers and the summary handler.
//
// Two things this adds over stock k6 output:
//  1. Reads and mutations get their own latency trends, so the brief's
//     separate p95 targets (500ms read / 800ms mutation) are enforceable.
//  2. Every response's transfer size and Content-Encoding are recorded, which
//     is what area 01 of the audit needs and what k6 does not report per route.
//
// Note on how the breakdown reaches the summary: k6 gives every VU its own
// JavaScript runtime and runs handleSummary in yet another, so a module-level
// accumulator written by VUs is invisible to the summary. Everything the
// report needs therefore travels as a *tag* on a metric, and lib/endpoints.js
// declares permissive thresholds on those tagged sub-metrics so k6 computes
// and hands them to handleSummary.

import http from 'k6/http';
import { check } from 'k6';
import exec from 'k6/execution';
import { Trend, Counter, Rate } from 'k6/metrics';
import { BUCKET_SECONDS, DEBUG, CACHE_COLD, MAX_BUCKETS } from '../config.js';
import { ENDPOINTS } from './endpoints.js';

export const readLatency = new Trend('read_latency', true);
export const mutationLatency = new Trend('mutation_latency', true);

// Transfer accounting. `payload_bytes` is what crossed the wire (Content-Length
// when the origin sets it, which is the compressed size when it compresses);
// `payload_uncompressed_bytes` is the decoded body k6 received. The ratio is
// the compression the origin is actually delivering.
export const payloadBytes = new Trend('payload_bytes');
export const payloadUncompressedBytes = new Trend('payload_uncompressed_bytes');
export const uncompressedResponses = new Rate('responses_without_compression');
// Chunked responses carry no Content-Length, so the on-the-wire size cannot be
// observed and `payload_bytes` falls back to the decoded length. This rate says
// how much of the wire-size column is a fallback rather than a measurement.
export const noContentLength = new Rate('responses_without_content_length');
export const bigPayloads = new Counter('payloads_over_256kb');

let bustCounter = 0;

function currentBucket() {
  const ms = exec.instance.currentTestRunDuration || 0;
  const b = Math.floor(ms / 1000 / BUCKET_SECONDS);
  return b < MAX_BUCKETS ? b : MAX_BUCKETS - 1;
}

/**
 * Issue a request and record it as a read or a mutation.
 *
 * @param {'read'|'mutation'} klass
 * @param {string} name  stable label; add it to lib/endpoints.js to have it
 *                       appear in the per-endpoint table
 */
export function timed(klass, name, method, url, body, params) {
  const bucket = String(currentBucket());
  const p = Object.assign({}, params || {});
  p.tags = Object.assign({ name: name, class: klass, bucket: bucket }, p.tags || {});

  let target = url;
  if (CACHE_COLD) {
    bustCounter += 1;
    target += (url.indexOf('?') === -1 ? '?' : '&') + `_k6cb=${exec.vu.idInTest}-${bustCounter}`;
    p.headers = Object.assign({ 'Cache-Control': 'no-cache', Pragma: 'no-cache' }, p.headers || {});
  }

  const res = http.request(method, target, body, p);

  const tags = { endpoint: name, bucket: bucket };
  if (klass === 'mutation') mutationLatency.add(res.timings.duration, tags);
  else readLatency.add(res.timings.duration, tags);

  const bodyLen = res.body ? res.body.length : 0;
  const declared = parseInt(
    res.headers['Content-Length'] || res.headers['content-length'] || '0',
    10
  );
  const onWire = Number.isFinite(declared) && declared > 0 ? declared : bodyLen;
  const enc = (
    res.headers['Content-Encoding'] ||
    res.headers['content-encoding'] ||
    'identity'
  ).toLowerCase();

  payloadBytes.add(onWire, { endpoint: name, encoding: enc });
  payloadUncompressedBytes.add(bodyLen, { endpoint: name });
  uncompressedResponses.add(enc === 'identity' && bodyLen > 1024, { endpoint: name });
  noContentLength.add(!(Number.isFinite(declared) && declared > 0), { endpoint: name });
  if (bodyLen > 256 * 1024) bigPayloads.add(1, { endpoint: name });

  if (DEBUG && (res.status >= 400 || res.status === 0)) {
    console.error(`${name} -> ${res.status} ${String(res.body).slice(0, 300)}`);
  }
  return res;
}

export function get(name, url, params) {
  return timed('read', name, 'GET', url, null, params);
}

export function post(name, url, body, params) {
  return timed('mutation', name, 'POST', url, body, params);
}

export function patch(name, url, body, params) {
  return timed('mutation', name, 'PATCH', url, body, params);
}

export function del(name, url, params) {
  return timed('mutation', name, 'DELETE', url, null, params);
}

export function ok(name, res, allowed) {
  const codes = allowed || [200, 201];
  return check(res, {
    [`${name} status ok`]: (r) => codes.indexOf(r.status) !== -1,
  });
}

// --- Summary ---------------------------------------------------------------

function metric(data, name) {
  return data.metrics[name];
}

function val(m, key) {
  return m && m.values && m.values[key] !== undefined ? m.values[key] : null;
}

function kb(bytes) {
  return bytes === null ? null : +(bytes / 1024).toFixed(1);
}

/**
 * Per-endpoint rollup, read back out of the tagged sub-metrics.
 */
function endpointRows(data) {
  const rows = [];
  for (const name of ENDPOINTS) {
    const dur = metric(data, `http_req_duration{name:${name}}`);
    if (!dur || !val(dur, 'count')) continue;

    const failed = metric(data, `http_req_failed{name:${name}}`);
    const wire = metric(data, `payload_bytes{endpoint:${name}}`);
    const decoded = metric(data, `payload_uncompressed_bytes{endpoint:${name}}`);
    const noComp = metric(data, `responses_without_compression{endpoint:${name}}`);
    const noCL = metric(data, `responses_without_content_length{endpoint:${name}}`);

    rows.push({
      endpoint: name,
      requests: val(dur, 'count'),
      errorRate: val(failed, 'rate'),
      p50: Math.round(val(dur, 'med') || 0),
      p95: Math.round(val(dur, 'p(95)') || 0),
      p99: Math.round(val(dur, 'p(99)') || 0),
      max: Math.round(val(dur, 'max') || 0),
      avgWireKB: kb(val(wire, 'avg')),
      maxWireKB: kb(val(wire, 'max')),
      avgDecodedKB: kb(val(decoded, 'avg')),
      maxDecodedKB: kb(val(decoded, 'max')),
      uncompressedRate: val(noComp, 'rate'),
      noContentLengthRate: val(noCL, 'rate'),
    });
  }
  rows.sort((a, b) => b.p95 - a.p95);
  return rows;
}

/**
 * Latency per time bucket, and the first bucket at which p95 exceeds the
 * steady-state p95 by `factor`. That timestamp, read against the profile's
 * ramp, is the saturation point.
 */
function saturation(data, factor) {
  const series = [];
  for (let b = 0; b < MAX_BUCKETS; b++) {
    const m = metric(data, `http_req_duration{bucket:${b}}`);
    const count = val(m, 'count');
    if (!count) continue;
    series.push({
      bucket: b,
      atSecond: b * BUCKET_SECONDS,
      requests: count,
      p95: Math.round(val(m, 'p(95)') || 0),
      med: Math.round(val(m, 'med') || 0),
    });
  }

  if (series.length < 3) return { series: series, point: null };

  // Skip the first bucket: it carries TLS handshakes and cold starts.
  const baselineFrom = series.slice(1, 3).filter((x) => x.requests > 5);
  if (baselineFrom.length === 0) return { series: series, point: null };
  const baseline = Math.min.apply(null, baselineFrom.map((x) => x.p95));

  for (const point of series.slice(2)) {
    if (point.requests > 5 && point.p95 > baseline * factor) {
      return {
        series: series,
        point: { atSecond: point.atSecond, baselineP95: baseline, observedP95: point.p95 },
      };
    }
  }
  return { series: series, point: null };
}

export function buildReport(data, meta) {
  const sat = saturation(data, meta.collapseFactor);
  return {
    meta: meta,
    endpoints: endpointRows(data),
    saturation: sat.point,
    latencyOverTime: sat.series,
  };
}

export function renderMarkdown(report, data) {
  const m = report.meta;
  const L = [];
  const num = (x, d) => (x === null || x === undefined ? (d === undefined ? '-' : d) : x);

  L.push(`# k6 run: ${m.profile}`);
  L.push('');
  L.push(`- target: ${m.baseUrl}`);
  L.push(`- finished: ${m.startedAt}`);
  L.push(`- duration: ${Math.round((data.state.testRunDurationMs || 0) / 1000)}s`);
  L.push(`- writes enabled: ${m.writesEnabled}`);
  L.push(`- iterations: ${num(val(metric(data, 'iterations'), 'count'))}`);
  L.push(`- max VUs: ${num(val(metric(data, 'vus_max'), 'max'))}`);
  L.push('');

  L.push('## Thresholds');
  L.push('');
  L.push('| metric | target | observed | verdict |');
  L.push('| --- | --- | --- | --- |');

  const rows = [
    ['http_req_failed', '<1%', val(metric(data, 'http_req_failed'), 'rate'), (v) => v < 0.01, (v) => `${(v * 100).toFixed(2)}%`],
    ['read p95', '<500ms', val(metric(data, 'read_latency'), 'p(95)'), (v) => v < 500, (v) => `${Math.round(v)}ms`],
    ['read p99', '<1500ms', val(metric(data, 'read_latency'), 'p(99)'), (v) => v < 1500, (v) => `${Math.round(v)}ms`],
    ['mutation p95', '<800ms', val(metric(data, 'mutation_latency'), 'p(95)'), (v) => v < 800, (v) => `${Math.round(v)}ms`],
    ['mutation p99', '<1500ms', val(metric(data, 'mutation_latency'), 'p(99)'), (v) => v < 1500, (v) => `${Math.round(v)}ms`],
    ['overall p99', '<1500ms', val(metric(data, 'http_req_duration'), 'p(99)'), (v) => v < 1500, (v) => `${Math.round(v)}ms`],
    ['checks', '>99%', val(metric(data, 'checks'), 'rate'), (v) => v > 0.99, (v) => `${(v * 100).toFixed(2)}%`],
  ];
  for (const [label, target, v, pass, fmt] of rows) {
    if (v === null) continue;
    L.push(`| ${label} | ${target} | ${fmt(v)} | ${pass(v) ? 'PASS' : 'FAIL'} |`);
  }
  L.push('');

  L.push('## Saturation');
  L.push('');
  if (report.saturation) {
    L.push(
      `Latency began collapsing at **t+${report.saturation.atSecond}s**: p95 rose from ` +
        `${report.saturation.baselineP95}ms in steady state to ${report.saturation.observedP95}ms ` +
        `(more than ${m.collapseFactor}x). Read the VU count at that point off the profile's ramp ` +
        'to get the saturation level.'
    );
  } else {
    L.push(
      'No progressive latency collapse detected: p95 stayed within ' +
        `${m.collapseFactor}x of steady state for the whole run.`
    );
  }
  L.push('');
  L.push(`| t+s | requests | median | p95 |`);
  L.push('| --- | --- | --- | --- |');
  for (const p of report.latencyOverTime) {
    L.push(`| ${p.atSecond} | ${p.requests} | ${p.med} | ${p.p95} |`);
  }
  L.push('');

  L.push('## Per-endpoint');
  L.push('');
  L.push(
    '| endpoint | reqs | err | p50 | p95 | p99 | max | avg wire KB | max wire KB | ' +
      'avg decoded KB | max decoded KB | uncompressed >1KB | no Content-Length |'
  );
  L.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  const pct = (v) => (v === null || v === undefined ? '-' : (v * 100).toFixed(0) + '%');
  for (const r of report.endpoints) {
    L.push(
      `| ${r.endpoint} | ${r.requests} | ${pct(r.errorRate)} | ` +
        `${r.p50} | ${r.p95} | ${r.p99} | ${r.max} | ${num(r.avgWireKB)} | ${num(r.maxWireKB)} | ` +
        `${num(r.avgDecodedKB)} | ${num(r.maxDecodedKB)} | ${pct(r.uncompressedRate)} | ` +
        `${pct(r.noContentLengthRate)} |`
    );
  }
  L.push('');
  L.push(
    '`wire KB` comes from Content-Length, which is the compressed size when the ' +
      'origin compresses. `decoded KB` is the body after decoding. Where ' +
      '`no Content-Length` is high the response was chunked, the wire size could ' +
      'not be observed, and the wire column falls back to the decoded length - so ' +
      'read the `uncompressed >1KB` column, not the wire/decoded ratio, to judge ' +
      'whether compression is being applied.'
  );

  const noCompression = val(metric(data, 'responses_without_compression'), 'rate');
  if (noCompression !== null) {
    L.push('');
    L.push(
      `Overall: responses over 1 KB sent with no Content-Encoding: ` +
        `**${(noCompression * 100).toFixed(1)}%**.`
    );
  }
  const big = val(metric(data, 'payloads_over_256kb'), 'count');
  if (big) {
    L.push('');
    L.push(`Responses larger than 256 KB decoded: **${big}**.`);
  }
  L.push('');
  return L.join('\n');
}
