// N5: subject-line accuracy. Executes the real SUBJECT_LINES builders.
//
// The defect being fixed is a wrong FACT in the subject: reminder_1day covers
// days 0-6 but said "demain", and reminder_7day covers 7-14 but said "dans 7
// jours". Someone planning from the subject planned around the wrong date.
import { read, assert, done } from './_util.mjs';

// SUBJECT_LINES is module-private, so evaluate the declaration directly rather
// than exporting it purely for the test.
const src = read('lib/email/email-service.ts');

const dpStart = src.indexOf('function duePhrase');
const dpEnd = src.indexOf('\n}', dpStart) + 2;
assert(dpStart !== -1, 'duePhrase helper located');

const slStart = src.indexOf('const SUBJECT_LINES');
const slEnd = src.indexOf('\n};', slStart) + 3;
assert(slStart !== -1, 'SUBJECT_LINES located');

// Strip types with the real TypeScript compiler rather than by regex - a
// hand-rolled stripper mangles the generic in `Record<VGPAlertType, (...)>`.
const { createRequire } = await import('node:module');
const ts = createRequire(import.meta.url)('typescript');

const snippet =
  src.slice(dpStart, dpEnd) + '\n' +
  src.slice(slStart, slEnd) + '\n' +
  'globalThis.__SUBJECTS = SUBJECT_LINES;';

const js = ts.transpileModule(snippet, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

// eslint-disable-next-line no-new-func
new Function(js)();
const S = globalThis.__SUBJECTS;
assert(S && typeof S.reminder_1day === 'function', 'SUBJECT_LINES evaluated');

// --- reminder_1day: covers days 0-6 ---
assert(S.reminder_1day(1, 'Org', 0).includes("aujourd'hui"), `day 0 says aujourd'hui`);
assert(S.reminder_1day(1, 'Org', 1).includes('demain'), 'day 1 says demain');
assert(S.reminder_1day(1, 'Org', 4).includes('dans 4 jours'), 'day 4 says dans 4 jours');
assert(S.reminder_1day(1, 'Org', 6).includes('dans 6 jours'), 'day 6 says dans 6 jours');
// The exact defect: 4 days out must NOT claim tomorrow.
assert(!S.reminder_1day(1, 'Org', 4).includes('demain'), 'day 4 does NOT say demain (the reported defect)');
assert(!S.reminder_1day(1, 'Org', 0).includes('demain'), 'day 0 does NOT say demain');

// --- reminder_7day: covers days 7-14 ---
assert(S.reminder_7day(1, 'Org', 7).includes('dans 7 jours'), 'day 7 says dans 7 jours');
assert(S.reminder_7day(1, 'Org', 14).includes('dans 14 jours'), 'day 14 says dans 14 jours');
assert(!S.reminder_7day(1, 'Org', 14).includes('dans 7 jours'), 'day 14 does NOT claim 7 (the reported defect)');

// --- 15-day band reports its real span too ---
assert(S.reminder_15day(1, 'Org', 22).includes('dans 22 jours'), 'day 22 in the attention band reports 22');

// --- Unchanged families ---
assert(S.reminder_30day(3, 'Org') === '[TraviXO] 3 inspections VGP a planifier - Org',
  '30-day subject unchanged');
assert(S.overdue(2, 'Org') === "[TraviXO] EN RETARD : 2 inspections VGP - Risque d'amende - Org",
  'overdue subject unchanged');

// --- Pluralisation and prefixes survive ---
assert(S.reminder_7day(1, 'Org', 9).startsWith('[TraviXO] URGENT :'), 'URGENT prefix kept');
assert(S.reminder_1day(1, 'Org', 3).startsWith('[TraviXO] CRITIQUE :'), 'CRITIQUE prefix kept');
assert(S.reminder_7day(2, 'Org', 9).includes('2 inspections'), 'plural noun for count > 1');
assert(S.reminder_7day(1, 'Org', 9).includes('1 inspection VGP'), 'singular noun for count 1');
assert(S.reminder_1day(2, 'Org', 2).includes('dues'), 'reminder_1day pluralises "due" for count > 1');

// --- Omitted days falls back to the nominal figure (no crash, no NaN) ---
for (const k of Object.keys(S)) {
  const out = S[k](1, 'Org');
  assert(typeof out === 'string' && !out.includes('NaN') && !out.includes('undefined'),
    `${k} renders safely without an explicit day count`);
}

// --- Digest subjects, exact per the brief ---
const svc = read('lib/email/email-service.ts');
assert(svc.includes('`[TraviXO] Résumé VGP quotidien - ${count} inspection${count > 1 ? \'s\' : \'\'} - ${orgName}`'),
  'daily digest subject matches the specified format exactly');
assert(/weeklyDigestSubject/.test(svc), 'weekly digest subject builder exists');

done('N5_SUBJECTS_VERIFIED');
