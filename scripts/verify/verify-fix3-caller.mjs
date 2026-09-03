// G8: dashboard must NOT trigger post-registration; confirm page stays sole caller.
import { read, assert, done } from './_util.mjs';
const dash = read('app/(dashboard)/dashboard/page.tsx');
const confirm = read('app/(auth)/confirm/page.tsx');

assert(!/fetch\(\s*['"`]\/api\/internal\/post-registration/.test(dash),
  'dashboard no longer fetches /api/internal/post-registration (positive control: this string existed at HEAD~)');
assert(!/triggerPostRegistration/.test(dash), 'no triggerPostRegistration call remains in dashboard');
assert(/Sentry/.test(dash), 'dashboard imports Sentry');
assert(/captureMessage|captureException/.test(dash), 'dashboard reports a warning instead of re-triggering');
assert(/demo_data_seeded/.test(dash), 'the warning is conditioned on demo_data_seeded');

assert(/fetch\(\s*['"`]\/api\/internal\/post-registration/.test(confirm),
  'confirm page remains the sole caller');
done('FIX3_CALLER_VERIFIED');
