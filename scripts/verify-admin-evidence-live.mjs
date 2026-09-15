#!/usr/bin/env node
/**
 * verify-admin-evidence-live.mjs
 *
 * GATES-ADMIN-EVIDENCE.md E6: run the REAL detector functions against live
 * production data and print their counts.
 *
 * This exists because "does this condition occur in real data" cannot be
 * answered by reading a query. It imports the same modules the page imports,
 * through scripts/ts-alias-loader.mjs, so a drift between what the page runs
 * and what this measures is impossible.
 *
 * Read-only: the detectors perform no writes, which verify-admin-evidence.mjs
 * asserts statically.
 */
import { pathToFileURL } from 'url'
import { resolve } from 'path'
import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

await import(pathToFileURL(resolve('scripts/ts-alias-loader.mjs')).href)

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] })
)

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const { detectAtomicDisagreement } = await import(pathToFileURL(resolve('lib/admin/evidence/atomicDisagreement.ts')).href)
const { detectDocumentaryGaps } = await import(pathToFileURL(resolve('lib/admin/evidence/documentaryGaps.ts')).href)
const { detectRentalExpiry } = await import(pathToFileURL(resolve('lib/admin/evidence/rentalExpiry.ts')).href)

const d1 = await detectAtomicDisagreement(db)
const d2 = await detectDocumentaryGaps(db)
const d3 = await detectRentalExpiry(db)

let failures = 0
const line = (ok, m) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${m}`); if (!ok) failures++ }

line(!d1.failed, `D1 ran (error: ${d1.error ?? 'none'})`)
console.log(`      D1 rows=${d1.rows.length} over ${d1.assetsInspected} inspected assets`)
const ruleA = d1.rows.filter(r => r.rule === 'failed_asset_in_service').length
const ruleB = d1.rows.filter(r => r.rule === 'failed_schedule_not_failed').length
console.log(`      D1 rule A (failed, still in service) = ${ruleA}`)
console.log(`      D1 rule B (failed, schedule disagrees) = ${ruleB}`)
for (const r of d1.rows.slice(0, 3)) console.log(`        ${r.rule} asset=${r.assetId.slice(0,8)} "${r.assetName}" status=${r.assetStatus} sched=${r.scheduleStatus} date=${r.inspectionDate}`)

line(!d2.failed, `D2 ran (error: ${d2.error ?? 'none'})`)
console.log(`      D2 rows=${d2.rows.length} of ${d2.inspectionsTotal} inspections; withCertificate=${d2.withCertificate}`)
const gapA = d2.rows.filter(r => r.kind === 'missing_certificate').length
const gapB = d2.rows.filter(r => r.kind === 'unresolvable_reference').length
console.log(`      D2 gap A (no certificate) = ${gapA}`)
console.log(`      D2 gap B (unresolvable reference) = ${gapB}`)

line(!d3.failed, `D3 ran (error: ${d3.error ?? 'none'})`)
console.log(`      D3 rows=${d3.rows.length} over ${d3.activeRentals} active rentals`)
console.log(`      D3 unscheduled (rented, no VGP schedule) = ${d3.unscheduled.length}`)
console.log(`      D3 without expected_return_date = ${d3.withoutReturnDate}`)
if (d3.worst) console.log(`      D3 worst = ${d3.worst.daysOverdueAtReturn}d asset=${d3.worst.assetId.slice(0,8)}`)
for (const u of d3.unscheduled.slice(0, 3)) console.log(`        unscheduled asset=${u.assetId.slice(0,8)} "${u.assetName}" client=${u.clientName}`)

console.log('')
if (failures > 0) { console.log(`${failures} detector(s) failed to run.`); process.exit(1) }
console.log('E6_LIVE_COUNTS_RECORDED')
