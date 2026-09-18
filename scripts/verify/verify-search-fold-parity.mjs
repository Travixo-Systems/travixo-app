// Parity gate: public.search_fold(text) must agree byte-for-byte with
// foldSearchValue() in lib/search/fold.ts.
//
// This is not a style check. The GIN trigram indexes are built on
// search_fold(col); the application folds the user's query with the
// TypeScript version and compares the two. If they disagree on any character,
// the index silently stops matching what the user typed, and nothing in the
// application can detect it.
//
// The interesting cases are characters with NO canonical decomposition --
// Ø, Ł, İ, ẞ, Æ, Œ, Ð, Þ. Accented Latin (é, ô, ü) is already ASCII by the
// time lower() sees it, so it cannot expose a collation difference. These
// characters can: under a C ctype lower('Ø') is 'Ø', under ICU it is 'ø'.
// search_fold pins COLLATE "und-x-icu" precisely so the answer does not
// depend on the database's ctype -- this gate proves the pin works.
//
//   node scripts/verify/verify-search-fold-parity.mjs                 # local stack
//   node scripts/verify/verify-search-fold-parity.mjs --container X   # named container
//
// Exit 0 = parity holds. Exit 1 = divergence, with the offending rows printed.

import { execFileSync } from 'node:child_process'

const argv = process.argv.slice(2)
const containerIdx = argv.indexOf('--container')
const CONTAINER =
  containerIdx !== -1 ? argv[containerIdx + 1] : 'supabase_db_feat-search-server-side'

/** The TypeScript fold, inlined so this gate has no build step or import alias. */
const foldSearchValue = (value) =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()

const CASES = [
  // No canonical decomposition -- these are the collation-sensitive ones.
  'Ø', 'Ł', 'İ', 'ẞ', 'Æ', 'Œ', 'Ð', 'Þ', 'İstanbul', 'ŁÓDŹ',
  // French, the app's primary locale.
  'Sécurité', 'SECURITE', 'Élévateur', 'Télescopique', 'Dépôt', 'Contrôle',
  'Norma Contrôle', 'Bouygues Île-de-France',
  // NFD vs NFKC divergence: NFKC would fold these and change which rows match.
  'Straße', 'ﬁche',
  // Whitespace: fold.ts trims, so search_fold must btrim.
  '  Sécurité  ', '\tGrue\t', 'Chariot  élévateur',
  // Special characters must survive folding untouched (escaping is a separate
  // concern, handled by search_escape_like).
  '100% Béton', 'TP_01', 'Dupont (SARL)', 'Martin, Jean',
  // Empty and whitespace-only.
  '', '   ',
]

function psql(sql) {
  return execFileSync(
    'docker',
    ['exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-t', '-A', '-F', '', '-c', sql],
    { encoding: 'utf8', stdio: 'pipe' }
  )
}

// One round trip: feed every case through search_fold and read back the pairs.
// Cases are passed as a VALUES list with dollar-quoting to avoid escaping games.
const valuesList = CASES.map((c, i) => `(${i}, $tok$${c}$tok$)`).join(',')
const sql = `SELECT i, public.search_fold(s) FROM (VALUES ${valuesList}) v(i, s) ORDER BY i;`

let rows
try {
  rows = psql(sql).trim().split('\n').filter(Boolean)
} catch (err) {
  console.error('Could not reach the database.')
  console.error(`Container: ${CONTAINER}`)
  console.error(String(err.stderr || err.message).trim())
  process.exit(1)
}

// Report the collation context. A passing run only means something when you
// know which ctype produced it -- that is the whole point of the Ø/Ł/İ/ẞ
// cases. datlocprovider is "char", hence the explicit cast.
try {
  const loc = psql(
    `SELECT datcollate || ' / ' || datctype || ' / provider=' || datlocprovider::text FROM pg_database WHERE datname = current_database();`
  ).trim()
  console.log(`database locale: ${loc}`)
} catch (err) {
  console.error('WARNING: could not read the database locale.')
  console.error(String(err.stderr || err.message).trim())
}

const failures = []
for (const row of rows) {
  const sep = row.indexOf('')
  const idx = Number(row.slice(0, sep))
  const sqlValue = row.slice(sep + 1)
  const input = CASES[idx]
  const tsValue = foldSearchValue(input)
  if (sqlValue !== tsValue) {
    failures.push({ input, sqlValue, tsValue })
  }
}

if (rows.length !== CASES.length) {
  console.error(`Expected ${CASES.length} rows back, got ${rows.length}.`)
  process.exit(1)
}

if (failures.length > 0) {
  console.error(`\nPARITY BROKEN -- ${failures.length} of ${CASES.length} case(s) diverge:\n`)
  for (const f of failures) {
    console.error(`  input : ${JSON.stringify(f.input)}`)
    console.error(`    SQL : ${JSON.stringify(f.sqlValue)}`)
    console.error(`    TS  : ${JSON.stringify(f.tsValue)}`)
  }
  console.error('\nThe trigram indexes are built on search_fold(). While these')
  console.error('disagree, searches for the affected characters silently return')
  console.error('nothing. Fix before shipping, then REINDEX.')
  process.exit(1)
}

console.log(`search_fold parity: ${CASES.length}/${CASES.length} cases identical to fold.ts`)
process.exit(0)
