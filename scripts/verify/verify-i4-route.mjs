// I4: the route actually calls the RPC, and the swallowed direct writes are gone.
//
// A live atomic function that nothing calls is exactly the state this work
// started in, so text assertions here are the ones that prove the fix reaches
// the deployed app.
import { read, assert, done } from './_util.mjs';

const ROUTE = 'app/api/vgp/inspections/route.ts';
const src = read(ROUTE);

// Narrow to POST so a read in GET cannot satisfy the "no direct write" checks.
const postAt = src.search(/export async function POST/);
assert(postAt !== -1, 'POST handler present');
const nextAt = src.slice(postAt + 1).search(/export async function (GET|PATCH|DELETE|PUT)/);
const post = nextAt === -1 ? src.slice(postAt) : src.slice(postAt, postAt + 1 + nextAt);

assert(/\.rpc\(\s*['"`]record_inspection['"`]/.test(post), 'POST calls record_inspection via rpc()');

// No direct writes remain. Reads are fine: the handler still validates first.
assert(!/\.from\(\s*['"`]vgp_inspections['"`]\s*\)[\s\S]{0,200}?\.insert\(/.test(post),
  'no direct insert into vgp_inspections remains');
assert(!/\.from\(\s*['"`]vgp_schedules['"`]\s*\)[\s\S]{0,200}?\.update\(/.test(post),
  'no direct update of vgp_schedules remains');
assert(!/\.from\(\s*['"`]assets['"`]\s*\)[\s\S]{0,200}?\.update\(/.test(post),
  'no direct update of assets remains');
assert(!/Don't fail entire request/.test(post),
  'all swallowed-failure comments are gone (positive control: 2 existed at baseline)');

// Every parameter the function needs is passed.
for (const p of ['p_asset_id', 'p_inspection_date', 'p_inspector_name', 'p_result',
                 'p_certificate_url', 'p_schedule_id', 'p_interval_months']) {
  assert(new RegExp(`${p}\\s*:`).test(post), `passes ${p}`);
}

// Gating must still precede the write.
const gateW = post.search(/requireWriteAccess/);
const gateV = post.search(/requireVGPWriteAccess/);
const rpcAt = post.search(/\.rpc\(\s*['"`]record_inspection/);
assert(gateW !== -1 && gateW < rpcAt, 'requireWriteAccess fires before the RPC');
assert(gateV !== -1 && gateV < rpcAt, 'requireVGPWriteAccess fires before the RPC');

// A failure must reach the inspector, not vanish into a generic 500.
assert(/mapInspectionError/.test(post), 'errors are mapped to an actionable message');
assert(/inspectionErrorStatus/.test(post), 'errors carry a real status code');
assert(/Sentry\.captureException/.test(post), 'unexpected failures reach Sentry');
for (const code of ['certificate_required', 'asset_not_found', 'no_organization', 'invalid_result']) {
  assert(new RegExp(code).test(src), `maps ${code}`);
}

done('I4_ROUTE_VERIFIED');
