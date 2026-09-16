#!/usr/bin/env node
/**
 * verify-slot-claim.mjs
 *
 * Slot ACQUISITION, which is what actually failed in production.
 *
 * On 2026-09-15 two tabs on app.travixosystems.com both logged
 * `resolvedSlot = 0`, shared one cookie and one BroadcastChannel, and tab 1
 * VISIBLY BECAME tab 2's account. The cause was not event routing, which the
 * existing gates already cover. It was this:
 *
 *   - orphan `travixo-auth-1` / `travixo-auth-2` cookies filled the 3-slot pool
 *   - occupiedSlots() reported every slot taken
 *   - claimSlotForNewLogin() returned null
 *   - the callers fell back to getCurrentSlot() -> 0 and overwrote the session
 *
 * verify-multiaccount.mjs passes 23/23 against exactly that, because its
 * section 4 is static text-matching plus pure-function algebra. It asserts the
 * source contains the right tokens. This asserts BEHAVIOUR: it drives the real
 * claim logic over a simulated cookie jar and checks that a new sign-in never
 * lands on a slot that already holds a DIFFERENT live session.
 *
 * Usage:
 *   node scripts/verify-slot-claim.mjs                    the claim property
 *   node scripts/verify-slot-claim.mjs --chunked          chunked occupancy
 *   node scripts/verify-slot-claim.mjs --negative-control prove it can fail
 */

import { pathToFileURL } from 'url'
import { existsSync } from 'fs'
import { resolve } from 'path'

const MODE = process.argv.includes('--chunked')
  ? 'chunked'
  : process.argv.includes('--negative-control')
    ? 'negative'
    : 'claim'

let failures = 0
let checks = 0
const pass = (m) => { checks++; console.log(`PASS  ${m}`) }
const fail = (m, d) => {
  checks++; failures++
  console.log(`FAIL  ${m}`)
  if (d) console.log(`      ${String(d).slice(0, 400)}`)
}

// ---------------------------------------------------------------------
// Load the REAL modules.
//
// Deliberately not a local copy of the logic: verify-multiaccount.mjs 4b
// re-implements clearSlotCookie() inside the test, so it cannot catch a change
// to the real helper. These checks import what the browser runs.
// ---------------------------------------------------------------------
const AS = 'lib/supabase/account-slot.ts'
const CL = 'lib/supabase/client.ts'
for (const f of [AS, CL]) {
  if (!existsSync(f)) {
    console.log(`FAIL  ${f} missing`)
    process.exit(1)
  }
}

let accountSlot
let client
try {
  await import(pathToFileURL(resolve('scripts/ts-alias-loader.mjs')).href)
  accountSlot = await import(pathToFileURL(resolve(AS)).href)
  client = await import(pathToFileURL(resolve(CL)).href)
} catch (err) {
  console.log(`FAIL  cannot import the slot modules: ${err?.message}`)
  process.exit(1)
}

const { MAX_ACCOUNT_SLOTS, DEFAULT_SLOT, cookieNameForSlot } = accountSlot
const { slotHasSession, occupiedSlots, claimSlotForNewLogin } = client

// ---------------------------------------------------------------------
// A cookie jar and a location, so the real browser helpers can run in Node.
// ---------------------------------------------------------------------
function install({ jar = '', pathname = '/dashboard' } = {}) {
  globalThis.document = { cookie: jar }
  globalThis.window = {
    location: { pathname, protocol: 'https:', href: `https://x${pathname}` },
    sessionStorage: {
      _v: null,
      getItem() { return this._v },
      setItem(_k, v) { this._v = v },
    },
  }
}
function uninstall() {
  delete globalThis.document
  delete globalThis.window
}

const named = (names) => names.map((n) => `${n}=tokenvalue`).join('; ')

// ---------------------------------------------------------------------
// MODE: chunked occupancy
// ---------------------------------------------------------------------
if (MODE === 'chunked') {
  const name1 = cookieNameForSlot(1)

  install({ jar: named([`${name1}.0`, `${name1}.1`]) })
  const chunkedOccupied = slotHasSession(1)
  uninstall()

  if (chunkedOccupied) {
    pass(`a slot holding only chunks (${name1}.0/.1) is reported OCCUPIED`)
  } else {
    fail(
      `a slot holding only chunks (${name1}.0/.1) is reported FREE`,
      'a new sign-in would be handed this slot and overwrite a live session'
    )
  }

  install({ jar: named([name1]) })
  const bareOccupied = slotHasSession(1)
  uninstall()
  if (bareOccupied) pass('a slot holding a bare cookie is still reported occupied')
  else fail('a bare cookie no longer counts as occupied -- regression')

  // An empty value is a husk, not a session.
  install({ jar: `${name1}=` })
  const huskOccupied = slotHasSession(1)
  uninstall()
  if (!huskOccupied) pass('an empty-valued cookie does NOT count as a session')
  else fail('an empty-valued cookie counts as a session -- would strand a slot')

  // Negative control: an unrelated cookie sharing the prefix must not count.
  // `travixo-auth-1` starts with `travixo-auth`, so a prefix test would bleed.
  install({ jar: named([cookieNameForSlot(1)]) })
  const slot0Bleed = slotHasSession(0)
  uninstall()
  if (!slot0Bleed) {
    pass(`negative control: ${cookieNameForSlot(1)} does not make slot 0 look occupied`)
  } else {
    fail(`${cookieNameForSlot(1)} makes slot 0 look occupied -- prefix bleed`)
  }

  console.log('')
  if (failures > 0) {
    console.log(`${failures} of ${checks} checks FAILED`)
    process.exit(1)
  }
  console.log(`all ${checks} checks passed`)
  console.log('chunked-occupancy verification passed')
  process.exit(0)
}

// ---------------------------------------------------------------------
// MODE: negative control
//
// Runs the PRE-FIX logic against the same scenarios. It must FAIL, or a
// passing G1/G2 proves nothing about the fix.
// ---------------------------------------------------------------------
if (MODE === 'negative') {
  // Verbatim pre-fix implementations, kept ONLY as a control.
  const preFixHasSession = (jar, slot) => {
    const name = cookieNameForSlot(slot)
    return jar.split('; ').some((c) => c.startsWith(`${name}=`) && c.length > name.length + 1)
  }
  const preFixClaim = (jar, current) => {
    const listSlots = () => Array.from({ length: MAX_ACCOUNT_SLOTS }, (_, i) => i)
    const taken = listSlots().filter((s) => preFixHasSession(jar, s))
    if (taken.length === 0) return DEFAULT_SLOT
    if (taken.includes(current)) {
      const free = listSlots().find((s) => !taken.includes(s))
      return free ?? null
    }
    return current
  }

  // Control 1: the exhaustion case from production.
  const full = named(Array.from({ length: MAX_ACCOUNT_SLOTS }, (_, i) => cookieNameForSlot(i)))
  const claimed = preFixClaim(full, 0)
  if (claimed === null) {
    pass('pre-fix claim returns null when the pool is full (the production bug)')
  } else {
    fail(`pre-fix claim returned ${claimed}, expected null -- control is wrong`)
  }

  // Control 2: the chunked blind spot.
  const n1 = cookieNameForSlot(1)
  const chunkedJar = named([`${n1}.0`, `${n1}.1`])
  if (preFixHasSession(chunkedJar, 1) === false) {
    pass('pre-fix occupancy MISSES a chunked session (the second swap path)')
  } else {
    fail('pre-fix occupancy already saw chunked cookies -- control is wrong')
  }

  // Control 3: the fixed logic must DIFFER on that same input, or the fix is
  // a no-op dressed up as a change.
  install({ jar: chunkedJar })
  const fixedSeesChunked = slotHasSession(1)
  uninstall()
  if (fixedSeesChunked === true) {
    pass('fixed occupancy SEES the chunked session -- behaviour actually changed')
  } else {
    fail('fixed occupancy still misses chunked cookies -- the fix does nothing')
  }

  console.log('')
  if (failures > 0) {
    console.log(`${failures} of ${checks} checks FAILED`)
    process.exit(1)
  }
  console.log(`all ${checks} checks passed`)
  console.log('negative control passed')
  process.exit(0)
}

// ---------------------------------------------------------------------
// MODE: claim (default)
// ---------------------------------------------------------------------

// 1. The production scenario: every slot cookie present, tab on a bare path.
//    The claim must NOT be a slot that holds a different live session.
const allNames = Array.from({ length: MAX_ACCOUNT_SLOTS }, (_, i) => cookieNameForSlot(i))
install({ jar: named(allNames), pathname: '/dashboard' })
const exhausted = claimSlotForNewLogin()
const occupiedWhenFull = occupiedSlots()
uninstall()

if (exhausted === null) {
  fail(
    'claimSlotForNewLogin() still returns null when every slot is occupied',
    'callers fall back to getCurrentSlot() -> 0 and overwrite a live session'
  )
} else if (occupiedWhenFull.includes(exhausted)) {
  fail(
    `claim returned occupied slot ${exhausted} -- would overwrite a live session`,
    `occupied = [${occupiedWhenFull.join(', ')}]`
  )
} else {
  pass(`a full pool yields slot ${exhausted}, which holds no live session`)
}

// 2. The ordinary case must be untouched: nothing signed in -> slot 0, so a
//    single-account user keeps a clean URL.
install({ jar: '', pathname: '/login' })
const empty = claimSlotForNewLogin()
uninstall()
if (empty === DEFAULT_SLOT) pass(`an empty jar still claims slot ${DEFAULT_SLOT}`)
else fail(`an empty jar claimed ${empty}, expected ${DEFAULT_SLOT}`)

// 3. One account signed in, second tab -> a DIFFERENT, free slot.
install({ jar: named([cookieNameForSlot(0)]), pathname: '/login' })
const second = claimSlotForNewLogin()
uninstall()
if (second !== 0 && second !== null) {
  pass(`with slot 0 taken, a new sign-in claims slot ${second}`)
} else {
  fail(`with slot 0 taken, a new sign-in claimed ${second} -- overwrites account 1`)
}

// 4. A tab pinned by its URL keeps its slot: re-authenticating that account,
//    not adding another.
install({ jar: named([cookieNameForSlot(1)]), pathname: '/u/1/login' })
const pinned = claimSlotForNewLogin()
uninstall()
if (pinned === 1) pass('a tab on /u/1 keeps slot 1 when re-authenticating')
else fail(`a tab on /u/1 claimed ${pinned}, expected 1`)

// 5. The claim is always a valid slot. A value outside the range would mint a
//    cookie name the scheme does not own.
install({ jar: named(allNames), pathname: '/dashboard' })
const claimedSlot = claimSlotForNewLogin()
uninstall()
if (claimedSlot !== null && Number.isInteger(claimedSlot) && claimedSlot >= 0 && claimedSlot < MAX_ACCOUNT_SLOTS) {
  pass(`the claim is a valid slot in [0, ${MAX_ACCOUNT_SLOTS})`)
} else {
  fail(`the claim ${claimedSlot} is not a valid slot`)
}

console.log('')
if (failures > 0) {
  console.log(`${failures} of ${checks} checks FAILED`)
  process.exit(1)
}
console.log(`all ${checks} checks passed`)
console.log('slot-claim verification passed')
