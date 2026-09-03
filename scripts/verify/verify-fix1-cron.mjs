// G1: cron must exclude demo assets at BOTH layers and log the skip count.
import { read, assert, done } from './_util.mjs';
const src = read('app/api/cron/vgp-alerts/route.ts');

assert(/is_demo_data/.test(src), 'cron references is_demo_data');
assert(/assets!inner|assets\s*!\s*inner/.test(src),
  'schedule embed uses !inner so the nested filter actually constrains parent rows');
assert(/\.eq\(\s*["']assets\.is_demo_data["']\s*,\s*false\s*\)/.test(src),
  'query-level .eq("assets.is_demo_data", false) present');
assert(/isDemoSchedule/.test(src), 'post-fetch safety net calls isDemoSchedule');
assert(/from\s+["']@\/lib\/vgp\/demo-exclusion["']/.test(src),
  'safety-net predicate imported from the shared module (single source of truth)');
assert(/demo_schedules_skipped|demoSkipped/.test(src), 'skipped demo count is tracked');
assert(/\[VGP-CRON\][^\n]*demo/i.test(src) || /demo[^\n]*skipp/i.test(src),
  'skipped demo count is logged');

// is_demo_data must be SELECTed, or the safety net reads undefined for every row.
const selectBlock = src.slice(src.indexOf('.from("vgp_schedules")'), src.indexOf('.eq("status", "active")'));
assert(/is_demo_data/.test(selectBlock), 'is_demo_data is inside the select() column list');

done('FIX1_CRON_VERIFIED');
