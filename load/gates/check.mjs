// load/gates/check.mjs
//
// Gate oracles for the Phase 1 ledger, as a script rather than inline `node -e`.
//
// Inline one-liners lost their regex backslashes when the gate runner passed
// them through cmd.exe, so gates failed for quoting reasons rather than for
// real defects. A file has no such problem.
//
// Usage: node load/gates/check.mjs <gateId>
// Prints exactly one line: "<ID>_PASS ..." or "<ID>_FAIL ...".

import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { execSync } from 'node:child_process'

const read = (p) => readFileSync(p, 'utf8')
const count = (s, re) => (s.match(re) || []).length

const checks = {
  // Item 1: dashboard reads issue together.
  G1() {
    const s = read('app/(dashboard)/dashboard/page.tsx')
    const serial = count(s, /await supabase/g)
    return /Promise\.all/.test(s) && serial <= 3
      ? `G1_PASS serial_awaits=${serial}`
      : `G1_FAIL serial_awaits=${serial}`
  },

  // Item 2: the protected-route decision is made before any getUser().
  G2() {
    const s = read('proxy.ts')
    const guard = s.indexOf('const isProtectedRoute')
    const call = s.indexOf('supabase.auth.getUser()')
    return guard > -1 && call > guard
      ? 'G2_PASS guard_before_getUser'
      : `G2_FAIL guardIdx=${guard} getUserIdx=${call}`
  },

  // Item 3: no query inside the audit-item loop. The loop itself may remain --
  // it is now a Map lookup preserving first-match ordering -- so this tests the
  // defect (a round trip per item), not the keyword.
  G3() {
    const s = read('app/scan/[qr_code]/page.tsx')
    const body = s.slice(
      s.indexOf('checkActiveAudit(assetId'),
      s.indexOf('handleVerifyInAudit')
    )
    const queryInLoop = /for \(const item of auditItems\)[\s\S]*?await supabase/.test(body)
    const batched = body.includes(".in('id', auditIds)")
    return !queryInLoop && batched
      ? 'G3_PASS no_query_in_loop'
      : `G3_FAIL queryInLoop=${queryInLoop} batched=${batched}`
  },

  // Item 4: public pricing shared-cacheable; gated reference data private only.
  G4() {
    const p = read('app/api/subscriptions/plans/route.ts')
    const e = read('app/api/vgp/equipment-types/route.ts')
    const imports = p.split('\n').filter((l) => l.trim().startsWith('import')).join('\n')
    const pub = p.includes('s-maxage=3600') && !imports.includes('@/lib/supabase/server')
    const priv = e.includes('private, max-age=3600')
    return pub && priv
      ? 'G4_PASS public_plans+private_gated'
      : `G4_FAIL plansPublic=${pub} typesPrivate=${priv}`
  },

  G5() {
    const s = read('app/(dashboard)/settings/theme/page.tsx')
    const noReload = !s.includes('window.location.reload')
    const rollback = s.includes('removeProperty')
    return noReload && rollback
      ? 'G5_PASS no_reload+rollback'
      : `G5_FAIL noReload=${noReload} rollback=${rollback}`
  },

  // Item 6: the idempotency claim precedes handler dispatch.
  G6() {
    const s = read('app/api/stripe/webhook/route.ts')
    const claim = s.indexOf('await claimBillingEvent(supabase, event)')
    const dispatch = s.indexOf('switch (event.type)')
    return claim > -1 && dispatch > -1 && claim < dispatch
      ? 'G6_PASS guard_first'
      : `G6_FAIL claimIdx=${claim} dispatchIdx=${dispatch}`
  },

  // Item 7: every Resend send bounded, and the cron declares a ceiling.
  G7() {
    const e = read('lib/email/email-service.ts')
    const total = count(e, /resend\.emails\.send\(/g)
    const wrapped = count(e, /withEmailTimeout\(resend\.emails\.send\(/g)
    const cron = read('app/api/cron/vgp-alerts/route.ts')
    const md = cron.includes('export const maxDuration')
    return total > 0 && total === wrapped && md
      ? `G7_PASS all_${total}_wrapped`
      : `G7_FAIL total=${total} wrapped=${wrapped} maxDuration=${md}`
  },

  // Item 8: the client notice is not inside the staff-email success branch.
  G8() {
    const s = read('app/api/cron/vgp-alerts/route.ts')
    const i = s.indexOf('notifyClientsOfRecall(orgName')
    if (i === -1) return 'G8_FAIL call_missing'
    const before = s.slice(0, i)
    const lastSuccess = before.lastIndexOf('if (sendResult.success)')
    const lastElse = before.lastIndexOf('} else {')
    return lastElse > lastSuccess ? 'G8_PASS hoisted' : 'G8_FAIL still_nested'
  },

  G9() {
    const s = read('app/api/assets/preview-import/route.ts')
    const auth = s.includes('requireWriteAccess')
    const cap = s.includes('MAX_UPLOAD_BYTES')
    return auth && cap ? 'G9_PASS auth+cap' : `G9_FAIL auth=${auth} cap=${cap}`
  },

  // Item 10: migration exists, reads real plan limits, refuses over cap,
  // and hardcodes no exemption list.
  G10() {
    const dir = 'supabase/migrations'
    const m = readdirSync(dir).filter((f) => f.includes('enforce_pilot_asset_limit'))
    if (!m.length) return 'G10_FAIL no_migration'
    const s = read(`${dir}/${m[0]}`)
    const wired = s.includes('subscription_plans') && s.includes('max_assets')
    const raises = s.includes('RAISE EXCEPTION')
    const isTrigger = s.includes('CREATE TRIGGER') && s.includes('BEFORE INSERT ON public.assets')
    // No org id may appear in the trigger migration: headroom is granted by
    // tier in a separate statement, never by an exemption inside the trigger.
    const noExemption = !/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/.test(s)
    return wired && raises && isTrigger && noExemption
      ? `G10_PASS ${m[0]}`
      : `G10_FAIL wired=${wired} raises=${raises} trigger=${isTrigger} noExemption=${noExemption}`
  },

  // Item 11: rename SQL, rotation checklist, and the harness pointed at it.
  G11() {
    const sql = existsSync('supabase/migrations/pending/20260831_rename_loadtest_orgs.sql')
    const chk = existsSync('docs/audit-followup/loadtest-credential-rotation.md')
    const cfg = read('load/lib/config.js')
    const pointed = cfg.includes('ZZ-LOADTEST-1') && cfg.includes('TARGET_ORG_ID')
    const used = read('load/lib/scenarios.js').includes('TARGET_ORG_ID')
    return sql && chk && pointed && used
      ? 'G11_PASS'
      : `G11_FAIL sql=${sql} checklist=${chk} pointed=${pointed} used=${used}`
  },

  G12() {
    const s = read('app/api/vgp/compliance-summary/route.ts')
    const todo = s.includes('TODO: REMOVE before live demo')
    const logs = count(s, /console\.log\('\[VGP\]/g)
    return !todo && logs === 0 ? 'G12_PASS clean' : `G12_FAIL todo=${todo} logs=${logs}`
  },

  G13() {
    const p = JSON.parse(read('package.json'))
    const dep = !!(p.dependencies && p.dependencies.papaparse)
    const types = !!(p.devDependencies && p.devDependencies['@types/papaparse'])
    return !dep && !types ? 'G13_PASS removed' : `G13_FAIL dep=${dep} types=${types}`
  },

  G14() {
    const s = read('next.config.ts')
    const hasRedirect = s.includes('async redirects()') && s.includes("'/login'")
    const pageGone = !existsSync('app/page.tsx')
    return hasRedirect && pageGone
      ? 'G14_PASS config_redirect'
      : `G14_FAIL redirect=${hasRedirect} pageRemoved=${pageGone}`
  },

  // Finding 04.5 / 03.5 / 03.6: both cron passes write their dedupe rows as a
  // single bulk insert rather than one per item.
  G15() {
    const s = read('app/api/cron/vgp-alerts/route.ts')
    const bulkAlerts = /vgp_alerts"\)\.insert\(\s*[\r\n]*\s*items\.map/.test(s)
    const bulkRecall = /client_recall_alerts"\)[\s\S]{0,40}\.insert\(\s*[\r\n]*\s*batch\.map/.test(s)
    return bulkAlerts && bulkRecall
      ? 'G15_PASS both_passes_bulk'
      : `G15_FAIL alerts=${bulkAlerts} recall=${bulkRecall}`
  },

  G16() {
    const s = read('app/api/cron/vgp-alerts/route.ts')
    const bad = /for \(const item of (batch|items)\)[\s\S]{0,300}?\.insert\(/.test(s)
    return !bad ? 'G16_PASS no_row_loops' : 'G16_FAIL loop_insert_present'
  },

  // Finding 04.10: swallowed failures reach Sentry in all three hot paths.
  G17() {
    const files = [
      'app/api/cron/vgp-alerts/route.ts',
      'app/api/stripe/webhook/route.ts',
      'lib/email/email-service.ts',
    ]
    const missing = files.filter((f) => {
      const s = read(f)
      return !s.includes('captureException') && !s.includes('captureMessage')
    })
    return missing.length === 0
      ? 'G17_PASS all_three'
      : `G17_FAIL missing=${missing.join(',')}`
  },

  G18() {
    const s = read('app/api/stripe/webhook/route.ts')
    const i = s.indexOf('export async function GET')
    if (i === -1) return 'G18_PASS removed'
    return s.slice(i, i + 600).includes('CRON_SECRET') ? 'G18_PASS gated' : 'G18_FAIL open'
  },

  // Decisive regression gate. Ignores stale generated validators under .next,
  // which reference routes from a previous build rather than current source.
  G19() {
    let out = ''
    try {
      out = execSync('npx tsc --noEmit', { encoding: 'utf8', stdio: 'pipe' })
    } catch (e) {
      out = `${e.stdout || ''}${e.stderr || ''}`
    }
    const real = out
      .split(/\r?\n/)
      .filter((l) => l.includes('error TS'))
      .filter((l) => !l.replace(/\\/g, '/').startsWith('.next/'))
    return real.length === 0 ? 'G19_TSC_CLEAN' : `G19_FAIL errors=${real.length} first=${real[0]}`
  },

  // Only files this phase is allowed to touch may differ from HEAD.
  G21() {
    const out = execSync('git status --porcelain', { encoding: 'utf8' })
      .split(/\r?\n/)
      .map((l) => l.slice(3).trim())
      .filter(Boolean)
    const allow = [
      /^docs\//, /^load\//, /^GATES-PERF/, /^package(-lock)?\.json$/,
      /^next\.config\.ts$/, /^proxy\.ts$/, /^supabase\/migrations\//,
      /^app\//, /^lib\/email\//, /^lib\/server\//, /^lib\/supabase\//,
      /^components\//,
      // Admin "record off-Stripe payment" work, added after the Phase 1 batch
      // at the user's request: the plan allowlist, the RPC type declaration,
      // and the load-test password rotation script.
      /^lib\/admin\//, /^types\//, /^scripts\//,
    ]
    const bad = out.filter((f) => !allow.some((r) => r.test(f)))
    return bad.length === 0
      ? `G21_PASS files=${out.length}`
      : `G21_FAIL unexpected=${bad.join(',')}`
  },
}

const id = process.argv[2]
const fn = checks[id]
if (!fn) {
  console.log(`UNKNOWN_GATE ${id}`)
  process.exit(1)
}
try {
  console.log(fn())
} catch (err) {
  console.log(`${id}_FAIL threw=${err.message}`)
}
