#!/usr/bin/env node
/**
 * verify-main-sync.mjs
 *
 * Asserts the local checkout is on main, is identical to origin/main, has a
 * clean working tree, and that every security commit from the merge is
 * actually reachable from origin/main.
 *
 * Prints "main sync verification passed" only when all assertions hold.
 */

import { execFileSync } from 'child_process'

// The four commits that had to reach main. Verified by content, not by
// trusting a merge message.
const REQUIRED = [
  ['dd495a9', 'category import RLS verifier'],
  ['30c8f7f', 'asset_categories scoping + RPC lockdown'],
  ['9c53923', 'next 16.3.3 AVIF CVE patch'],
  ['d735ab4', 'motion/perceived-speed UI work'],
]

let failures = 0
let checks = 0
const pass = m => { checks++; console.log(`PASS  ${m}`) }
const fail = (m, d) => {
  checks++; failures++
  console.log(`FAIL  ${m}`)
  if (d) console.log(`      ${String(d).slice(0, 300)}`)
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim()
}

try {
  // --- on main? -------------------------------------------------
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'])
  if (branch === 'main') {
    pass('checked out on main')
  } else {
    fail(`not on main (on "${branch}") -- this verifies main, so the checkout must be main`)
  }

  // --- clean tree? ----------------------------------------------
  const status = git(['status', '--porcelain'])
  if (status === '') {
    pass('working tree is clean')
  } else {
    fail('working tree is dirty -- build/typecheck would not reflect main', status)
  }

  // --- identical to origin/main? --------------------------------
  const local = git(['rev-parse', 'HEAD'])
  const remote = git(['rev-parse', 'origin/main'])
  if (local === remote) {
    pass(`HEAD matches origin/main (${local.slice(0, 7)})`)
  } else {
    fail(`HEAD ${local.slice(0, 7)} != origin/main ${remote.slice(0, 7)}`)
  }

  const counts = git(['rev-list', '--left-right', '--count', 'origin/main...HEAD'])
  if (/^0\s+0$/.test(counts)) {
    pass('0 commits ahead, 0 behind origin/main')
  } else {
    fail(`diverged from origin/main (behind/ahead: ${counts})`)
  }

  // --- every security commit reachable from origin/main? --------
  for (const [sha, label] of REQUIRED) {
    let ok = false
    try {
      execFileSync('git', ['merge-base', '--is-ancestor', sha, 'origin/main'], {
        stdio: 'ignore',
      })
      ok = true
    } catch {
      ok = false
    }
    if (ok) pass(`${sha} reachable from origin/main -- ${label}`)
    else fail(`${sha} is NOT in origin/main -- ${label}`)
  }

  // --- the actual fix content is present, not just the sha ------
  // A commit can be reverted later and still be an ancestor, so assert on
  // the working-tree content that must be live.
  const pkgNext = JSON.parse(
    execFileSync('git', ['show', 'origin/main:package.json'], { encoding: 'utf8' })
  ).dependencies?.next
  if (pkgNext === '16.3.3') {
    pass(`origin/main pins next to ${pkgNext} (AVIF CVE patched)`)
  } else {
    fail(`origin/main pins next to "${pkgNext}", expected 16.3.3 -- CVE fix missing or reverted`)
  }

  const audits = execFileSync(
    'git',
    ['show', 'origin/main:app/(dashboard)/audits/page.tsx'],
    { encoding: 'utf8' }
  )
  // The removed fallback refetched categories with no org filter.
  const fallbackGone = !/const\s*\{\s*data:\s*allCategories\s*\}/.test(audits)
  if (fallbackGone) {
    pass('origin/main has the unscoped category fallback removed')
  } else {
    fail('origin/main still contains the unscoped cross-org category fallback')
  }
} catch (err) {
  fail(`git command failed: ${err?.message || err}`)
}

console.log(`\n--- ${checks - failures}/${checks} checks passed ---`)
if (failures > 0) {
  console.log(`\n${failures} check(s) failed.`)
  process.exit(1)
}
console.log('\nmain sync verification passed')
