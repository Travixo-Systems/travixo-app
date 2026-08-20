/**
 * Category inference for messy asset imports.
 *
 * The premise of the importer is that a loueur can drop in whatever
 * spreadsheet they already keep. In practice that file often has NO usable
 * category column at all -- but the category is almost always sitting in the
 * asset name, because that is how equipment gets written down in this trade
 * ("Chariot élévateur Toyota 8FD25", "Nacelle articulée Haulotte HA16RTJ").
 *
 * Three deterministic layers, cheapest first. No network calls, no API cost,
 * same input always gives the same output:
 *
 *   1. resolveCategoryColumn  -- find the category column even when the header
 *                                is odd, including by sniffing VALUES when no
 *                                header matches.
 *   2. inferCategoryFromName  -- keyword + brand/model rules over the name.
 *   3. (caller) confirmation  -- every inference is surfaced in the UI with a
 *                                confidence level before anything is written.
 *
 * Nothing here writes to the database or auto-applies silently. A wrong guess
 * that reaches VGP scheduling is a compliance problem, so the caller is
 * expected to show inferences and let a human correct them.
 */

/** Lowercase, strip accents, collapse whitespace. */
export function norm(v: string): string {
  return v
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export type Confidence = 'high' | 'medium' | 'low'

export interface CategoryGuess {
  category: string | null
  confidence: Confidence
  /** Short, user-facing reason. Shown in the confirmation step. */
  reason: string
}

/* ------------------------------------------------------------------ *
 * Layer 2: infer a category from the asset name
 * ------------------------------------------------------------------ */

/**
 * Rules are ordered: the FIRST match wins, so more specific patterns must come
 * before broader ones ("chariot telescopique" before bare "chariot").
 *
 * `any` = match if any term appears. `all` = every term must appear.
 * Terms are matched against the accent-stripped, lowercased name.
 *
 * Both French and English terms are included: real fleet exports in this
 * dataset are roughly half English ("Backhoe JCB 3CX", "Telehandler JLG").
 */
interface Rule {
  category: string
  all?: string[]
  any?: string[]
  confidence?: Confidence
}

const RULES: Rule[] = [
  // --- Nacelles / aerial work platforms -----------------------------
  { category: 'Nacelle', any: ['nacelle', 'aerial platform', 'mobile platform', 'boom lift', 'scissor lift', 'cherry picker', 'pemp'] },

  // --- Chariots: telescopic before plain forklift -------------------
  { category: 'Chariot télescopique', all: ['chariot', 'telescopique'] },
  { category: 'Chariot télescopique', any: ['telehandler', 'telescopic handler'] },
  { category: 'Chariot élévateur', any: ['chariot elevateur', 'chariot frontal', 'forklift', 'fork lift', 'transpalette', 'gerbeur'] },

  // Bare "Chariot <brand> <model>" is genuinely ambiguous: in this dataset
  // "Chariot Manitou MT1440" and "Chariot Merlo Roto 40.25" are TELESCOPIC
  // handlers, while "Chariot Linde H30D" and "Chariot Toyota 8FD25" are
  // counterbalance forklifts. The model code disambiguates, so check it
  // before falling back to the generic guess.
  //
  // Manitou MT/MRT and Merlo are telehandler lines; Bobcat TL likewise.
  { category: 'Chariot télescopique', all: ['chariot', 'manitou mt'] },
  { category: 'Chariot télescopique', all: ['chariot', 'manitou mrt'] },
  { category: 'Chariot télescopique', all: ['chariot', 'merlo'] },
  { category: 'Chariot télescopique', all: ['chariot', 'bobcat tl'] },
  // Linde H / Toyota 8F / Jungheinrich EFG / Hyster H are forklift lines.
  { category: 'Chariot élévateur', all: ['chariot', 'linde h'] },
  { category: 'Chariot élévateur', all: ['chariot', 'toyota 8f'] },
  { category: 'Chariot élévateur', all: ['chariot', 'jungheinrich'] },
  { category: 'Chariot élévateur', all: ['chariot', 'hyster'] },
  { category: 'Chariot élévateur', all: ['chariot', 'komatsu fd'] },
  { category: 'Chariot élévateur', all: ['chariot', 'yale'] },

  // Still-unresolved bare "chariot": forklift is the commoner case, but flag
  // it as uncertain so the confirmation step surfaces it for checking.
  { category: 'Chariot élévateur', any: ['chariot'], confidence: 'medium' },

  // --- Groupes électrogènes / generators ----------------------------
  { category: 'Groupe électrogène', any: ['groupe electrogene', 'generator', 'generatrice', 'genset', 'kva'] },

  // --- Compresseurs -------------------------------------------------
  { category: 'Compresseur', any: ['compresseur', 'compressor', 'aircompressor'] },

  // --- Engins de chantier / earthmoving -----------------------------
  { category: 'Engin de chantier', any: [
    'mini-pelle', 'minipelle', 'pelle', 'excavator', 'excavatrice', 'backhoe', 'bulldozer', 'dozer',
    'chargeuse', 'wheel loader', 'loader', 'tractopelle', 'engin',
  ] },

  // --- Compactage ---------------------------------------------------
  { category: 'Compactage', any: ['plaque vibrante', 'compacteur', 'rouleau', 'roller', 'compactor', 'pilonneuse'] },

  // --- Levage / cranes ----------------------------------------------
  { category: 'Équipement de levage', any: ['grue', 'crane', 'tower crane', 'mobile crane', 'palan', 'treuil', 'hoist'] },

  // --- Échafaudage --------------------------------------------------
  { category: 'Échafaudage', any: ['echafaudage', 'scaffold', 'scaffolding', 'layher'] },

  // --- Soudure ------------------------------------------------------
  { category: 'Soudure', any: ['soudure', 'soudeuse', 'welder', 'welding', 'poste a souder'] },

  // --- Outillage / power tools --------------------------------------
  { category: 'Outillage', any: ['perforateur', 'marteau', 'hammer', 'hilti', 'meuleuse', 'scie', 'saw', 'drill', 'perceuse'] },

  // --- Mesure / diagnostic ------------------------------------------
  { category: 'Diagnostic', any: [
    'analyseur', 'appareil mesure', 'mesure pression', 'diagnostic', 'testeur',
    'multimetre', 'oscilloscope', 'camera thermique', 'detecteur', 'thermique flir',
  ] },

  // --- Transport / remorques ----------------------------------------
  { category: 'Transport', any: ['dump truck', 'mixer truck', 'camion', 'remorque', 'trailer', 'benne'] },

  // --- Béton --------------------------------------------------------
  { category: 'Béton', any: ['concrete mixer', 'concretemix', 'betonniere', 'mixer', 'malaxeur', 'aiguille vibrante'] },

  // --- Nettoyage ----------------------------------------------------
  { category: 'Nettoyage', any: ['pressure washer', 'nettoyeur', 'karcher', 'haute pression'] },

  // --- Hydraulique / pompes -----------------------------------------
  { category: 'Hydraulique', any: ['pompe', 'pump', 'verin', 'presse', 'enerpac', 'hydraulique', 'hydac'] },

  // --- Terrassement fin ---------------------------------------------
  { category: 'Engin de chantier', any: ['grader', 'niveleuse', 'manipulateur'] },

  // --- Ponçage / finition (grouped with outillage) ------------------
  { category: 'Outillage', any: ['ponceuse', 'sander', 'festool'] },

  // --- EPI ----------------------------------------------------------
  { category: 'EPI', any: ['masque', 'mask de respiration', 'harnais', 'casque', 'epi'] },
]

/**
 * Brand/model families that imply a category on their own. Checked only when
 * no keyword rule matched -- a name like "Kubota KX080-4" carries no category
 * word but is unambiguous to anyone in the trade.
 *
 * Deliberately conservative: only manufacturers whose product line in rental
 * fleets is narrow enough to be safe. Caterpillar and Manitou are omitted --
 * they make both earthmoving and handling equipment, so the brand alone does
 * not determine the category.
 */
const BRAND_HINTS: { terms: string[]; category: string }[] = [
  { terms: ['haulotte', 'skyjack', 'genie z-', 'genie s-', 'klubb'], category: 'Nacelle' },
  { terms: ['jungheinrich', 'linde h', 'toyota 8f', 'hyster'], category: 'Chariot élévateur' },
  { terms: ['sdmo', 'pramac', 'himoinsa', 'fg wilson'], category: 'Groupe électrogène' },
  { terms: ['kaeser', 'atlas copco xas'], category: 'Compresseur' },
  { terms: ['kubota kx', 'bobcat', 'takeuchi', 'volvo ec', 'wacker neuson', 'jcb 3cx'], category: 'Engin de chantier' },
  { terms: ['bomag'], category: 'Compactage' },
  { terms: ['potain'], category: 'Équipement de levage' },
  { terms: ['layher'], category: 'Échafaudage' },
  { terms: ['miller 350'], category: 'Soudure' },
  { terms: ['securitank'], category: 'Stockage' },
  { terms: ['fluke', 'metrix', 'flir', 'msa altair'], category: 'Diagnostic' },
  { terms: ['rexroth', 'parker', 'enerpac'], category: 'Hydraulique' },
  { terms: ['jcb th'], category: 'Chariot télescopique' },
]

/**
 * Truncated / mangled tokens seen in real exports ("gen", "comp", "weldMach").
 * Matched only as a WHOLE normalised name, never as a substring -- "gen" must
 * not fire on "Genie Z-45". Deliberately low confidence: these are guesses
 * from an abbreviation and the user should eyeball them.
 */
const ABBREVIATIONS: Record<string, string> = {
  gen: 'Groupe électrogène',
  comp: 'Compresseur',
  wldmachine: 'Soudure',
  weldmach: 'Soudure',
  excavtor: 'Engin de chantier',
  crain: 'Équipement de levage',
}

/**
 * Guess a category from an asset name.
 * Returns category: null when nothing matches -- the caller should leave those
 * uncategorised rather than forcing a guess.
 */
export function inferCategoryFromName(rawName: string): CategoryGuess {
  const name = norm(rawName || '')
  if (!name || name === '??') {
    return { category: null, confidence: 'low', reason: 'no usable name' }
  }

  for (const rule of RULES) {
    const hit =
      (rule.all && rule.all.every(t => name.includes(t))) ||
      (rule.any && rule.any.some(t => name.includes(t)))
    if (hit) {
      const matched = rule.all
        ? rule.all.join(' + ')
        : rule.any!.find(t => name.includes(t))!
      return {
        category: rule.category,
        confidence: rule.confidence ?? 'high',
        reason: `name contains "${matched}"`,
      }
    }
  }

  for (const hint of BRAND_HINTS) {
    const term = hint.terms.find(t => name.includes(t))
    if (term) {
      return {
        category: hint.category,
        confidence: 'medium',
        reason: `recognised model "${term}"`,
      }
    }
  }

  // Whole-name abbreviations only (see ABBREVIATIONS).
  const compact = name.replace(/[^a-z]/g, '')
  if (ABBREVIATIONS[compact]) {
    return {
      category: ABBREVIATIONS[compact],
      confidence: 'low',
      reason: `abbreviation "${name}"`,
    }
  }

  return { category: null, confidence: 'low', reason: 'no match' }
}

/* ------------------------------------------------------------------ *
 * Layer 1: find the category column
 * ------------------------------------------------------------------ */

const HEADER_TERMS = [
  'categorie', 'category', 'famille', 'family', 'type', 'materiel', 'material',
  'genre', 'classe', 'class', 'rubrique', 'groupe', 'segment',
]

/** Levenshtein distance, used for near-miss headers ("catgorie", "categorie."). */
function editDistance(a: string, b: string): number {
  const m = a.length, n = b.length
  if (!m) return n
  if (!n) return m
  let prev = Array.from({ length: n + 1 }, (_, i) => i)
  for (let i = 1; i <= m; i++) {
    const cur = [i]
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      )
    }
    prev = cur
  }
  return prev[n]
}

export interface ColumnResolution {
  column: string | null
  confidence: Confidence
  reason: string
}

/**
 * Find the column holding categories.
 *
 * a) exact/substring header match
 * b) fuzzy header match (typos, punctuation)
 * c) value sniffing -- a column whose values repeat across many rows with few
 *    distinct values behaves like a category, even if its header is useless
 *    ("Column4", "Divers"). Serial numbers and names look the opposite: almost
 *    every value distinct.
 */
export function resolveCategoryColumn(
  rows: Record<string, unknown>[],
  alreadyMapped: string[] = []
): ColumnResolution {
  if (!rows.length) return { column: null, confidence: 'low', reason: 'no rows' }

  const keys = Object.keys(rows[0]).filter(k => !alreadyMapped.includes(k))

  // (a) direct header match
  for (const key of keys) {
    const k = norm(key)
    if (HEADER_TERMS.some(t => k === t || k.includes(t))) {
      return { column: key, confidence: 'high', reason: `header "${key}"` }
    }
  }

  // (b) fuzzy header match
  for (const key of keys) {
    const k = norm(key).replace(/[^a-z]/g, '')
    for (const term of HEADER_TERMS) {
      if (k.length >= 4 && editDistance(k, term) <= 2) {
        return { column: key, confidence: 'medium', reason: `header "${key}" ≈ "${term}"` }
      }
    }
  }

  // (c) value sniffing
  //
  // Dangerous step: a location column looks statistically identical to a
  // category one (few values, repeating, labelish). Picking it silently
  // categorises a whole fleet as "Dépôt Rungis". So before trusting shape
  // alone, reject columns whose VALUES look like places, people or dates,
  // and require some positive evidence that the values look like equipment
  // categories.
  const PLACE_WORDS = [
    'depot', 'chantier', 'atelier', 'entrepot', 'agence', 'site', 'parc',
    'warehouse', 'workshop', 'yard', 'hangar', 'magasin', 'zone', 'quai',
    'rue', 'avenue', 'boulevard', 'hopital', 'usine',
  ]
  const looksLikePlace = (values: string[]) => {
    const n = values.filter(v => PLACE_WORDS.some(w => norm(v).includes(w))).length
    return n >= Math.max(2, values.length * 0.25)
  }

  const sample = rows.slice(0, 200)
  let best: { key: string; distinct: number; coverage: number } | null = null

  for (const key of keys) {
    const values = sample
      .map(r => (r[key] == null ? '' : String(r[key]).trim()))
      .filter(Boolean)
    if (values.length < sample.length * 0.6) continue // too sparse to be a category

    const distinct = new Set(values.map(norm)).size
    if (distinct < 2 || distinct > 40) continue        // 1 value = constant; too many = an id
    if (distinct > values.length * 0.5) continue       // mostly unique = not a category

    // Values should look like labels, not numbers or dates.
    const labelish = values.filter(v => /[a-zA-ZÀ-ÿ]/.test(v) && v.length <= 40).length
    if (labelish < values.length * 0.8) continue

    // Reject location-like columns outright.
    if (looksLikePlace(values)) continue

    // Require positive evidence: at least some values must themselves read as
    // equipment categories. Without this, any low-cardinality text column
    // (owner, supplier, contract, "OUI/NON") can be mistaken for a category.
    //
    // CAUTION: this test also matches the NAME column, because equipment names
    // are exactly what the rules are built to recognise. Callers must pass the
    // already-mapped columns (name, serial, location...) in `alreadyMapped` so
    // they are excluded before we get here -- otherwise a sheet with a small
    // number of repeated model names gets its own names read back as
    // categories.
    const distinctValues = [...new Set(values.map(v => v.trim()))]
    const recognised = distinctValues.filter(v => inferCategoryFromName(v).category).length
    if (recognised < Math.max(1, distinctValues.length * 0.5)) continue

    // A category label is short ("Nacelle"); a full equipment name is not
    // ("Nacelle articulée Haulotte HA16RTJ"). Reject columns whose values
    // read like full names rather than labels.
    const avgWords =
      distinctValues.reduce((s, v) => s + v.split(/\s+/).length, 0) / distinctValues.length
    if (avgWords > 3) continue

    const coverage = values.length / sample.length
    if (!best || distinct < best.distinct) best = { key, distinct, coverage }
  }

  if (best) {
    return {
      column: best.key,
      confidence: 'low',
      reason: `column "${best.key}" has ${best.distinct} repeating values`,
    }
  }

  return { column: null, confidence: 'low', reason: 'no category column found' }
}

/* ------------------------------------------------------------------ *
 * Orchestration
 * ------------------------------------------------------------------ */

export interface ResolvedRow {
  category: string | null
  confidence: Confidence
  reason: string
  source: 'column' | 'name' | 'none'
}

/**
 * Decide a category for one row: an explicit column value wins over any
 * inference from the name.
 */
export function resolveRowCategory(
  row: Record<string, unknown>,
  categoryColumn: string | null
): ResolvedRow {
  if (categoryColumn) {
    const raw = row[categoryColumn]
    const value = raw == null ? '' : String(raw).trim()
    if (value && norm(value) !== 'n/a' && norm(value) !== '-') {
      return { category: value, confidence: 'high', reason: 'from file', source: 'column' }
    }
  }

  // Fall back to the name. Try the most name-like field available.
  const nameField =
    row.__assetName ??
    row.name ??
    Object.values(row).find(v => typeof v === 'string' && v.length > 3)

  const guess = inferCategoryFromName(String(nameField ?? ''))
  return {
    category: guess.category,
    confidence: guess.confidence,
    reason: guess.reason,
    source: guess.category ? 'name' : 'none',
  }
}

/** Summary for the confirmation UI. */
export interface InferenceSummary {
  fromColumn: number
  inferred: number
  unmatched: number
  byCategory: { category: string; count: number; confidence: Confidence }[]
}

export function summarise(rows: ResolvedRow[]): InferenceSummary {
  const counts = new Map<string, { count: number; confidence: Confidence }>()
  let fromColumn = 0, inferred = 0, unmatched = 0

  for (const r of rows) {
    if (r.source === 'column') fromColumn++
    else if (r.source === 'name') inferred++
    else unmatched++

    if (r.category) {
      const key = norm(r.category)
      const prev = counts.get(key)
      // Report the weakest confidence seen for that category, so the UI
      // never overstates how sure we are.
      const rank = { high: 3, medium: 2, low: 1 } as const
      counts.set(key, {
        count: (prev?.count ?? 0) + 1,
        confidence: prev && rank[prev.confidence] < rank[r.confidence] ? prev.confidence : r.confidence,
      })
    }
  }

  const display = new Map<string, string>()
  for (const r of rows) if (r.category) display.set(norm(r.category), r.category)

  return {
    fromColumn,
    inferred,
    unmatched,
    byCategory: [...counts.entries()]
      .map(([k, v]) => ({ category: display.get(k)!, count: v.count, confidence: v.confidence }))
      .sort((a, b) => b.count - a.count),
  }
}
