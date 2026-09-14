// I1: prove the defect is REAL on the deployed code before claiming a fix.
//
// The baseline is origin/main as it stood when this work began (.unlazy-baseline).
// If that route already wrote atomically there would be nothing to fix, and this
// gate would be a lie. So read the deployed blob and assert the three-step,
// swallow-two-failures shape the finding describes.
import { readFileSync } from 'node:fs';
import { assert, done, gitShow } from './_util.mjs';

const BASE = readFileSync('.unlazy-baseline', 'utf8').trim();
const ROUTE = 'app/api/vgp/inspections/route.ts';
const deployed = gitShow(BASE, ROUTE);

assert(deployed !== null, `deployed route is readable at ${BASE.slice(0, 7)}:${ROUTE}`);

// Narrow to POST, so a write in another handler cannot satisfy these.
const postAt = deployed.search(/export async function POST/);
assert(postAt !== -1, 'POST handler present in the deployed route');
const nextHandler = deployed.slice(postAt + 1).search(/export async function (GET|PATCH|DELETE|PUT)/);
const post = nextHandler === -1 ? deployed.slice(postAt) : deployed.slice(postAt, postAt + 1 + nextHandler);

// The three sequential writes.
assert(/\.from\(\s*['"`]vgp_inspections['"`]\s*\)[\s\S]{0,200}?\.insert\(/.test(post),
  'deployed POST inserts into vgp_inspections directly');
assert(/\.from\(\s*['"`]vgp_schedules['"`]\s*\)[\s\S]{0,200}?\.update\(/.test(post),
  'deployed POST updates vgp_schedules directly');
assert(/\.from\(\s*['"`]assets['"`]\s*\)[\s\S]{0,200}?\.update\(/.test(post),
  'deployed POST updates assets directly');

// The swallows. These are the defect: an error is logged and execution continues,
// so write 1 can land while write 3 does not.
const swallows = post.match(/Don't fail entire request/g) || [];
assert(swallows.length === 2,
  `deployed POST swallows exactly 2 write failures (found ${swallows.length})`);

// out_of_service is reached only on a failed result, which is the dangerous path.
assert(/out_of_service/.test(post), 'deployed POST sets out_of_service on a failed result');

// And it does NOT already call the RPC.
assert(!/record_inspection/.test(post),
  'deployed POST does NOT call record_inspection (positive control: it does after this fix)');

done('I1_DEFECT_CONFIRMED');
