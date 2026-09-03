// N10: settings UI section, and every label it uses resolving in fr AND en.
import { existsSync } from 'node:fs';
import { read, assert, done } from './_util.mjs';
import { loadTs } from './_load-ts.mjs';

const C = 'components/settings/MyVGPAlertPreferences.tsx';
assert(existsSync(C), 'per-user preferences component exists');
const c = read(C);

// Mounted on the settings page.
const page = read('app/(dashboard)/settings/notifications/page.tsx');
assert(/MyVGPAlertPreferences/.test(page), 'component is imported by the settings page');
assert(/<MyVGPAlertPreferences \/>/.test(page), 'component is rendered');

// Four frequency radios, five threshold checkboxes.
assert(/type="radio"/.test(c), 'renders radio inputs for frequency');
assert(/VGP_FREQUENCIES\.map/.test(c), 'radios are driven by the shared frequency list');
assert(/type="checkbox"/.test(c), 'renders checkboxes for thresholds');
const thresholdValues = [...c.matchAll(/\{\s*value:\s*(\d+),\s*key:/g)].map((m) => Number(m[1]));
assert(thresholdValues.length === 5,
  `exactly 5 threshold checkboxes (got ${thresholdValues.length}: ${thresholdValues.join(',')})`);
assert(JSON.stringify(thresholdValues) === JSON.stringify([30, 15, 7, 1, 0]),
  'thresholds are 30/15/7/1/overdue in order');

// Saves through the new endpoint.
assert(/'\/api\/settings\/notifications\/preferences'/.test(c), 'targets the per-user endpoint');
assert(/method:\s*'PATCH'/.test(c), 'saves via PATCH');
assert(/is_user_override/.test(c), 'distinguishes inherited org defaults from a user override');

// --- Every translation key used here must resolve in BOTH languages ---
const i18n = await loadTs('lib/i18n.ts');
const keys = [...c.matchAll(/t\('([^']+)'\)/g)].map((m) => m[1]);
const dynamic = [...c.matchAll(/key:\s*'([^']+)'/g)].map((m) => m[1]);
const labelKeys = [...c.matchAll(/(?:label|help):\s*'([^']+)'/g)].map((m) => m[1]);
const all = [...new Set([...keys, ...dynamic, ...labelKeys])].filter((k) => k.includes('.'));

assert(all.length >= 15, `collected the component's translation keys (${all.length})`);

for (const key of all) {
  for (const lang of ['fr', 'en']) {
    const value = i18n.getTranslation(key, lang);
    // getTranslation returns the key itself when it cannot resolve.
    assert(value !== key, `${key} resolves in ${lang} (got ${JSON.stringify(value)})`);
    assert(typeof value === 'string' && value.trim().length > 0, `${key} is non-empty in ${lang}`);
  }
}

// Positive control: a key that does not exist must be reported as unresolved,
// proving the check above is not vacuously passing.
assert(i18n.getTranslation('notifications.thisKeyDoesNotExist', 'fr') === 'notifications.thisKeyDoesNotExist',
  'control: a missing key is detectably unresolved');

// French copy required by the brief.
assert(i18n.getTranslation('settings.notifications.myVgpTitle', 'fr') === 'Alertes VGP', 'heading is "Alertes VGP" in French');
assert(i18n.getTranslation('settings.notifications.myVgpFreqImmediate', 'fr') === 'Immédiat', 'Immédiat');
assert(i18n.getTranslation('settings.notifications.myVgpFreqDaily', 'fr') === 'Résumé quotidien', 'Résumé quotidien');
assert(i18n.getTranslation('settings.notifications.myVgpFreqWeekly', 'fr') === 'Résumé hebdomadaire', 'Résumé hebdomadaire');
assert(i18n.getTranslation('settings.notifications.myVgpFreqOff', 'fr') === 'Désactivé', 'Désactivé');
assert(i18n.getTranslation('settings.notifications.myVgpThreshold0', 'fr') === 'En retard', 'En retard');

done('N10_UI_VERIFIED');
