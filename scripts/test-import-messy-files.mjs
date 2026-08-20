/**
 * End-to-end test of the messy-file import path.
 *
 *   node scripts/test-import-messy-files.mjs
 *
 * Builds real .xlsx files in memory, parses them with the SAME XLSX call the
 * import modal uses, then runs the same column-detection + category-resolution
 * pipeline. This tests the thing a customer actually does -- drop in whatever
 * spreadsheet they already keep -- rather than testing the inference functions
 * in isolation.
 *
 * Fixtures cover: French headers, English headers, no category column at all,
 * junk headers, mixed FR/EN in one sheet, accents present and absent, and
 * blank/garbage cells.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import XLSX from 'xlsx'

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'import-e2e-'))
try {
  execFileSync(process.execPath, [
    'node_modules/typescript/lib/tsc.js',
    'lib/import/categoryInference.ts',
    '--outDir', out, '--module', 'esnext', '--target', 'es2022',
  ], { stdio: 'pipe' })
} catch { /* ambient @types noise; emit is checked below */ }

const emitted = path.join(out, 'categoryInference.js')
if (!fs.existsSync(emitted)) {
  console.error('FAIL: categoryInference.ts did not compile.')
  process.exit(1)
}
const { resolveCategoryColumn, resolveRowCategory, summarise } =
  await import(pathToFileURL(emitted).href)

/* ---- mirror of the modal's detectColumns (keep in sync) ------------ */
function detectColumns(firstRow) {
  const mapping = {}
  for (const key of Object.keys(firstRow)) {
    const lower = key.toLowerCase().trim()
    if (!mapping.name && (lower.includes('name') || lower.includes('equipment') || lower.includes('item') || lower.includes('asset') || lower.includes('nom') || lower.includes('equipement') || lower.includes('désignation') || lower.includes('designation') || lower.includes('libellé') || lower.includes('libelle') || lower.includes('machine') || lower.includes('matériel') || lower.includes('materiel'))) mapping.name = key
    if (!mapping.serial_number && (lower.includes('serial') || lower.includes('sn') || lower.includes('s/n') || lower.includes('serie') || lower.includes('numéro'))) mapping.serial_number = key
    if (!mapping.current_location && (lower.includes('location') || lower.includes('site') || lower.includes('depot') || lower.includes('dépôt') || lower.includes('warehouse') || lower.includes('emplacement') || lower.includes('entrepot') || lower.includes('lieu') || lower.includes('chantier') || lower.includes('agence') || lower.includes('adresse') || lower.includes('parc'))) mapping.current_location = key
    if (!mapping.status && (lower.includes('status') || lower.includes('state') || lower.includes('condition') || lower.includes('statut') || lower.includes('etat'))) mapping.status = key
    if (!mapping.description && (lower.includes('description') || lower.includes('desc') || lower.includes('notes') || lower.includes('detail'))) mapping.description = key
    if (!mapping.purchase_date && ((lower.includes('purchase') && lower.includes('date')) || lower.includes('acquired') || lower.includes('achat'))) mapping.purchase_date = key
    if (!mapping.purchase_price && (lower.includes('cost') || lower.includes('price') || lower.includes('value') || lower.includes('prix') || lower.includes('cout') || lower.includes('valeur'))) mapping.purchase_price = key
  }
  return mapping
}

/** Run the real import pipeline over a sheet-shaped array of objects. */
function runImport(rows) {
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

  // From here on: exactly what the modal does with an uploaded file.
  const parsed = XLSX.read(buf)
  const data = XLSX.utils.sheet_to_json(parsed.Sheets[parsed.SheetNames[0]])
  const mapping = detectColumns(data[0])
  const catCol = resolveCategoryColumn(data, Object.values(mapping))
  const resolutions = data.map(row =>
    resolveRowCategory({ ...row, __assetName: mapping.name ? row[mapping.name] : undefined }, catCol.column)
  )
  return { data, mapping, catCol, resolutions, summary: summarise(resolutions) }
}

let failed = 0
const check = (label, ok, detail) => {
  if (!ok) failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` -- ${detail}` : ''}`)
}

/* ------------------------------------------------------------------ */
console.log('=== FIXTURE 1: French headers, explicit category column ===')
{
  const r = runImport([
    { "Nom de l'équipement": 'Nacelle articulée Haulotte HA16RTJ', 'N° de série': 'NAC-001', 'Catégorie': 'Nacelle', 'Emplacement': 'Dépôt Gennevilliers' },
    { "Nom de l'équipement": 'Chariot Manitou MT1440', 'N° de série': 'CHA-002', 'Catégorie': 'Chariot télescopique', 'Emplacement': 'Chantier Saclay' },
    { "Nom de l'équipement": 'Groupe électrogène SDMO J110', 'N° de série': 'GE-003', 'Catégorie': 'Groupe électrogène', 'Emplacement': 'Dépôt Rungis' },
  ])
  check('name column found', r.mapping.name === "Nom de l'équipement", r.mapping.name)
  check('category column found', r.catCol.column === 'Catégorie', r.catCol.reason)
  check('all 3 from file, none guessed', r.summary.fromColumn === 3 && r.summary.inferred === 0)
}

console.log('\n=== FIXTURE 2: English headers, explicit category column ===')
{
  const r = runImport([
    { 'Equipment Name': 'Backhoe JCB 3CX', 'Serial Number': 'EX-001', 'Category': 'Earthmoving', 'Location': 'Depot North' },
    { 'Equipment Name': 'Telehandler JLG', 'Serial Number': 'TH-002', 'Category': 'Handling', 'Location': 'Site B' },
  ])
  check('name column found', r.mapping.name === 'Equipment Name', r.mapping.name)
  check('category column found', r.catCol.column === 'Category', r.catCol.reason)
  check('customer category names preserved', r.resolutions[0].category === 'Earthmoving')
}

console.log('\n=== FIXTURE 3: NO category column, FRENCH names ===')
{
  const r = runImport([
    { 'Nom': 'Nacelle articulée Haulotte HA16RTJ', 'Série': 'N-1' },
    { 'Nom': 'Chariot Manitou MT1440', 'Série': 'N-2' },
    { 'Nom': 'Chariot Linde H30D', 'Série': 'N-3' },
    { 'Nom': 'Groupe électrogène SDMO J110', 'Série': 'N-4' },
    { 'Nom': 'Mini-pelle Kubota KX080-4', 'Série': 'N-5' },
    { 'Nom': 'Plaque vibrante Bomag BPR 35/60', 'Série': 'N-6' },
  ])
  check('no category column (correct)', r.catCol.column === null, r.catCol.reason)
  check('all 6 inferred from names', r.summary.inferred === 6, `inferred=${r.summary.inferred} unmatched=${r.summary.unmatched}`)
  check('Manitou MT -> télescopique', r.resolutions[1].category === 'Chariot télescopique', r.resolutions[1].category)
  check('Linde H -> élévateur', r.resolutions[2].category === 'Chariot élévateur', r.resolutions[2].category)
  console.log('        ' + r.summary.byCategory.map(c => `${c.category}=${c.count}`).join(', '))
}

console.log('\n=== FIXTURE 4: NO category column, ENGLISH names ===')
{
  const r = runImport([
    { 'Asset': 'Backhoe JCB 3CX', 'SN': 'E-1' },
    { 'Asset': 'Telehandler JLG', 'SN': 'E-2' },
    { 'Asset': 'Forklift Toyota 5T', 'SN': 'E-3' },
    { 'Asset': 'Scaffold Tower 8m', 'SN': 'E-4' },
    { 'Asset': 'Welder Miller 350', 'SN': 'E-5' },
    { 'Asset': 'Tower Crane Potain', 'SN': 'E-6' },
  ])
  check('no category column (correct)', r.catCol.column === null, r.catCol.reason)
  check('all 6 inferred from names', r.summary.inferred === 6, `inferred=${r.summary.inferred} unmatched=${r.summary.unmatched}`)
  console.log('        ' + r.summary.byCategory.map(c => `${c.category}=${c.count}`).join(', '))
}

console.log('\n=== FIXTURE 5: junk header, category values present ===')
{
  const rows = Array.from({ length: 24 }, (_, i) => ({
    'Column1': `Machine ${i}`,
    'Column2': `SN-${i}`,
    'Column3': ['Nacelle', 'Chariot télescopique', 'Compresseur'][i % 3],
  }))
  const r = runImport(rows)
  check('sniffed the category column', r.catCol.column === 'Column3', r.catCol.reason)
  check('no serial column stolen', r.catCol.column !== 'Column2')
}

console.log('\n=== FIXTURE 5b: location column must NOT be read as category ===')
{
  // Regression: a "Lieu" column has exactly the same statistical shape as a
  // category column (few values, repeating, text). Before the place-word and
  // recognised-value guards, this categorised 459 of 500 real assets as
  // "Dépôt Rungis" / "Chantier Défense".
  const depots = ['Dépôt Rungis', 'Dépôt Gennevilliers', 'Chantier Défense', 'Atelier maintenance']
  const rows = Array.from({ length: 40 }, (_, i) => ({
    'DESIGNATION ': ['Nacelle Haulotte HA16', 'Chariot Manitou MT1440', 'Groupe électrogène SDMO'][i % 3],
    'Ref.': `R-${i}`,
    'Lieu': depots[i % depots.length],
  }))
  const r = runImport(rows)
  check('location column claimed by mapping', r.mapping.current_location === 'Lieu', String(r.mapping.current_location))
  check('category column NOT sniffed from Lieu', r.catCol.column !== 'Lieu', r.catCol.reason)
  check('categories came from names instead', r.summary.inferred === 40, `inferred=${r.summary.inferred}`)
  check('no depot names leaked in as categories',
    !r.summary.byCategory.some(c => /dépôt|chantier|atelier/i.test(c.category)),
    r.summary.byCategory.map(c => c.category).join(', '))
}

console.log('\n=== FIXTURE 6: mixed FR/EN, accents missing, junk rows ===')
{
  const r = runImport([
    { 'Designation': 'CHARIOT ELEVATEUR TOYOTA 8FD25', 'Ref': 'M-1' },
    { 'Designation': 'nacelle articulee haulotte', 'Ref': 'M-2' },
    { 'Designation': 'Backhoe JCB 3CX', 'Ref': 'M-3' },
    { 'Designation': 'GROUPE ELECTROGENE SDMO', 'Ref': 'M-4' },
    { 'Designation': 'Echafaudage Layher', 'Ref': 'M-5' },
    { 'Designation': '???', 'Ref': 'M-6' },
    { 'Designation': '', 'Ref': 'M-7' },
  ])
  check('UPPERCASE no-accent FR matched', r.resolutions[0].category === 'Chariot élévateur', r.resolutions[0].category)
  check('lowercase no-accent FR matched', r.resolutions[1].category === 'Nacelle', r.resolutions[1].category)
  check('English row matched', r.resolutions[2].category === 'Engin de chantier', r.resolutions[2].category)
  check('no-accent "ELECTROGENE" matched', r.resolutions[3].category === 'Groupe électrogène', r.resolutions[3].category)
  check('junk left uncategorised', r.resolutions[5].category === null && r.resolutions[6].category === null)
}

console.log('\n=== FIXTURE 7: category column exists but half empty ===')
{
  const r = runImport([
    { 'Nom': 'Nacelle Haulotte HA16', 'Catégorie': 'Nacelle' },
    { 'Nom': 'Chariot Merlo Roto 40.25', 'Catégorie': '' },
    { 'Nom': 'Compresseur Kaeser M27', 'Catégorie': 'N/A' },
    { 'Nom': 'Groupe électrogène Pramac', 'Catégorie': 'Groupe électrogène' },
  ])
  check('filled cells used from file', r.summary.fromColumn === 2, `fromColumn=${r.summary.fromColumn}`)
  check('blank cell falls back to name', r.resolutions[1].category === 'Chariot télescopique', r.resolutions[1].category)
  check('"N/A" treated as empty', r.resolutions[2].source === 'name', r.resolutions[2].source)
}

fs.rmSync(out, { recursive: true, force: true })
console.log(`\n${failed === 0 ? 'All import fixtures passed.' : `${failed} check(s) failed.`}`)
process.exit(failed === 0 ? 0 : 1)
