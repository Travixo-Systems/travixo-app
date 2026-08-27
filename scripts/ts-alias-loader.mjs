/**
 * ts-alias-loader.mjs
 *
 * A Node ESM resolve hook that teaches bare `node` the two things the
 * Next.js/TypeScript toolchain does for free but Node does not:
 *
 *   1. the `@/...` path alias from tsconfig.json
 *   2. extensionless relative specifiers ('./foo' -> './foo.ts')
 *
 * This lets scripts/verify-*.mjs import application modules directly, so
 * a check exercises the REAL implementation instead of a copy that can
 * drift from it. Node strips the type annotations natively.
 *
 * Usage:
 *   node --import ./scripts/ts-alias-loader.mjs scripts/verify-thing.mjs
 *
 * Verification only. Nothing in the app depends on this file.
 */

import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

// The hook body is registered into a separate module scope, so it is
// written as a data: URL rather than imported from disk.
const hook = `
import { existsSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, resolve as pathResolve } from 'node:path'

const ROOT = ${JSON.stringify(process.cwd())}
const EXTS = ['.ts', '.tsx', '.mjs', '.js', '.jsx']

function firstExisting(base) {
  if (existsSync(base) && !base.endsWith('/')) {
    // A real file with an extension already.
    for (const e of EXTS) if (base.endsWith(e)) return base
  }
  for (const e of EXTS) {
    const c = base + e
    if (existsSync(c)) return c
  }
  for (const e of EXTS) {
    const c = pathResolve(base, 'index' + e)
    if (existsSync(c)) return c
  }
  return null
}

export async function resolve(specifier, context, nextResolve) {
  // 1. tsconfig alias: '@/lib/x' -> '<root>/lib/x'
  if (specifier.startsWith('@/')) {
    const hit = firstExisting(pathResolve(ROOT, specifier.slice(2)))
    if (hit) return { url: pathToFileURL(hit).href, shortCircuit: true }
  }

  // 2. extensionless relative specifier: './x' -> './x.ts'
  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    const parentPath = context.parentURL?.startsWith('file:')
      ? dirname(fileURLToPath(context.parentURL))
      : ROOT
    const hit = firstExisting(pathResolve(parentPath, specifier))
    if (hit) return { url: pathToFileURL(hit).href, shortCircuit: true }
  }

  return nextResolve(specifier, context)
}
`

register(`data:text/javascript,${encodeURIComponent(hook)}`, pathToFileURL('./'))
