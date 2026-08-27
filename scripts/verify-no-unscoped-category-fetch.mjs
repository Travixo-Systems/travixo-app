#!/usr/bin/env node
/**
 * verify-no-unscoped-category-fetch.mjs
 *
 * Guards a specific UX regression introduced by enabling RLS on
 * public.asset_categories.
 *
 * The audits page used to fetch the org's categories and, when that returned
 * nothing, fall back to fetching EVERY category with no organization filter.
 * That fallback only ever "worked" because RLS was disabled -- it was reading
 * other tenants' category names. Once RLS is on, the fallback silently
 * returns nothing, so it must be removed rather than left to rot.
 *
 * This asserts that no `.from('asset_categories')` select in application code
 * is missing an organization_id scope.
 *
 * Prints "unscoped-fetch verification passed" only when every site is scoped.
 */

import { readFileSync } from 'fs'

// Files that query asset_categories from the browser/server with a user token.
// lib/seed/** and scripts/** run under the service role and are exempt.
const FILES = [
  'app/(dashboard)/audits/page.tsx',
  'components/assets/ImportAssetsModal.tsx',
]

let failures = 0
let checked = 0

for (const file of FILES) {
  let src
  try {
    src = readFileSync(file, 'utf8')
  } catch (err) {
    console.log(`FAIL  cannot read ${file}: ${err.message}`)
    failures++
    continue
  }

  const lines = src.split('\n')

  for (let i = 0; i < lines.length; i++) {
    if (!/\.from\(\s*['"]asset_categories['"]\s*\)/.test(lines[i])) continue

    checked++
    // Look ahead a few lines for the chained filter on this query.
    const window = lines.slice(i, i + 6).join('\n')

    const isInsert = /\.insert\s*\(/.test(window)
    const scoped = /\.eq\(\s*['"]organization_id['"]/.test(window)
    // An insert carries organization_id in its payload rather than a filter.
    const insertScoped = isInsert && /organization_id\s*:/.test(window)

    if (scoped || insertScoped) {
      console.log(`PASS  ${file}:${i + 1} asset_categories query is org-scoped`)
    } else {
      console.log(`FAIL  ${file}:${i + 1} asset_categories query has NO organization_id scope`)
      console.log(`      ${lines[i].trim()}`)
      failures++
    }
  }
}

if (checked === 0) {
  // Fail closed: if the pattern stopped matching, the guard is not proving
  // anything and must not report success.
  console.log('FAIL  no asset_categories queries found -- the guard matched nothing')
  process.exit(1)
}

console.log(`\n--- ${checked - failures}/${checked} query site(s) scoped ---`)

if (failures > 0) {
  console.log(`\n${failures} unscoped query site(s) remain.`)
  process.exit(1)
}

console.log('\nunscoped-fetch verification passed')
