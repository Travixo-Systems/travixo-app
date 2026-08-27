#!/usr/bin/env node
/**
 * verify-build-clean.mjs
 *
 * Runs the production build and asserts it completed without errors.
 * Prints "build verification passed" only when the build exits zero and its
 * output contains no error lines.
 */

import { spawnSync } from 'child_process'

const isWin = process.platform === 'win32'
const res = spawnSync(isWin ? 'npm.cmd' : 'npm', ['run', 'build'], {
  encoding: 'utf8',
  maxBuffer: 32 * 1024 * 1024,
  shell: isWin,
})

const out = `${res.stdout || ''}\n${res.stderr || ''}`

if (res.error) {
  console.log(`FAIL  could not start build: ${res.error.message}`)
  process.exit(1)
}

if (res.status !== 0) {
  console.log(`FAIL  build exited ${res.status}`)
  console.log(out.slice(-3000))
  process.exit(1)
}

// Next prints "Failed to compile" / "Type error:" on a broken build even in
// some zero-exit configurations, so assert on content as well as exit code.
const badPatterns = [
  /Failed to compile/i,
  /^\s*Type error:/im,
  /^\s*Error:/im,
]

const hits = badPatterns.filter(p => p.test(out))
if (hits.length > 0) {
  console.log('FAIL  build output contains error markers')
  console.log(out.slice(-3000))
  process.exit(1)
}

if (!/Compiled successfully|Generating static pages|Route \(app\)/i.test(out)) {
  console.log('FAIL  build output missing success markers -- did the build actually run?')
  console.log(out.slice(-2000))
  process.exit(1)
}

console.log('build verification passed')
