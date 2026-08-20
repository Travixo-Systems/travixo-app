/**
 * Regression tests for category inference.
 *
 *   node scripts/test-category-inference.mjs
 *
 * Pure functions, no database and no network. Each case is a real naming
 * pattern taken from production data. Exits non-zero on failure.
 *
 * The ordering cases matter most: rules are first-match-wins, so inserting a
 * broad rule above a specific one silently reclassifies equipment. "Mixer
 * Truck" must be Transport, not Béton, and the "gen" abbreviation must not
 * fire on "Genie".
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'catinf-'))
// Compiling a single file standalone pulls in ambient @types that report
// unrelated module-resolution errors, so tsc's exit code is not meaningful
// here. What matters is whether the JS was emitted; the real typecheck is
// `tsc --noEmit` over the project.
try {
  execFileSync(process.execPath, [
    'node_modules/typescript/lib/tsc.js',
    'lib/import/categoryInference.ts',
    '--outDir', out, '--module', 'esnext', '--target', 'es2022',
  ], { stdio: 'pipe' })
} catch {
  // ignored -- emit is checked below
}

const emitted = path.join(out, 'categoryInference.js')
if (!fs.existsSync(emitted)) {
  console.error('FAIL: categoryInference.ts did not compile.')
  process.exit(1)
}

const { inferCategoryFromName, resolveCategoryColumn } =
  await import(pathToFileURL(emitted).href)

let failed = 0
const eq = (label, actual, expected) => {
  const ok = actual === expected
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `  (got ${actual}, want ${expected})`}`)
}

console.log('=== name inference ===')
const NAME_CASES = [
  ['Nacelle articulée Haulotte HA16RTJ', 'Nacelle'],
  ['Chariot télescopique Manitou MT1440', 'Chariot télescopique'],
  ['Chariot élévateur Toyota 8FD25', 'Chariot élévateur'],
  ['Groupe électrogène SDMO J110', 'Groupe électrogène'],
  ['Backhoe JCB 3CX', 'Engin de chantier'],
  ['Telehandler JLG', 'Chariot télescopique'],
  ['Tower Crane Potain', 'Équipement de levage'],
  ['Matériel Layher UNI-L 12m', 'Échafaudage'],
  ['Compressor Atlas Copco', 'Compresseur'],
  ['Welder Miller 350', 'Soudure'],
  ['Plaque vibrante Bomag BPR 35/60', 'Compactage'],
  ['Pompe Hydraulique Rexroth', 'Hydraulique'],
  // Ordering guards -- these are the ones that break when rules are reordered.
  ['Mixer Truck', 'Transport'],
  ['Concrete Mixer', 'Béton'],
  ['Genie Z-45/25J', 'Nacelle'],
  // Bare "Chariot <brand>" must be split by model line, not lumped into
  // forklifts: Manitou MT/MRT, Merlo and Bobcat TL are telehandlers.
  // 49 real assets were being mislabelled before these rules existed.
  ['Chariot Manitou MT1440', 'Chariot télescopique'],
  ['Chariot Manitou MT625', 'Chariot télescopique'],
  ['Chariot Merlo Roto 40.25', 'Chariot télescopique'],
  ['Chariot Linde H30D', 'Chariot élévateur'],
  ['Chariot Toyota 8FD25', 'Chariot élévateur'],
  ['Chariot Jungheinrich EFG 220', 'Chariot élévateur'],
  ['Chariot frontal Hyster H4.0FT', 'Chariot élévateur'],
  // Garbage must stay unmatched rather than being forced into a category.
  ['prururo', null],
  ['??', null],
  ['', null],
]
for (const [name, expected] of NAME_CASES) {
  eq(`"${name}"`, inferCategoryFromName(name).category, expected)
}

console.log('\n=== column resolution ===')
const COL_CASES = [
  ['explicit header', [{ Nom: 'X', 'Catégorie': 'Nacelle' }], 'Catégorie'],
  ['FR synonym', [{ Nom: 'X', Famille: 'Nacelle' }], 'Famille'],
  ['typo header', [{ Nom: 'X', Categori: 'Nacelle' }], 'Categori'],
  // Sniffing now requires the VALUES to look like equipment categories, not
  // just to repeat -- otherwise any low-cardinality column (location, owner,
  // "OUI/NON") gets mistaken for one. So the fixture uses real category names.
  [
    'sniffed, no header match',
    Array.from({ length: 30 }, (_, i) => ({
      Nom: `M${i}`, Serial: `SN-${i}`,
      Column4: ['Nacelle', 'Compresseur', 'Échafaudage'][i % 3],
    })),
    'Column4',
  ],
  // A location column has the same statistical shape as a category column;
  // it must be rejected on its values.
  [
    'location column rejected',
    Array.from({ length: 30 }, (_, i) => ({
      Nom: `M${i}`,
      Zone: ['Dépôt Rungis', 'Chantier Défense', 'Atelier maintenance'][i % 3],
    })),
    null,
  ],
  [
    'serial column rejected',
    Array.from({ length: 30 }, (_, i) => ({ Nom: `M${i}`, Serial: `SN-UNIQUE-${i}` })),
    null,
  ],
]
for (const [label, rows, expected] of COL_CASES) {
  eq(label, resolveCategoryColumn(rows).column, expected)
}

fs.rmSync(out, { recursive: true, force: true })
console.log(`\n${failed === 0 ? 'All tests passed.' : `${failed} test(s) failed.`}`)
process.exit(failed === 0 ? 0 : 1)
