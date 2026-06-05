'use client'

// app/(admin)/admin/orgs/[id]/AdminOrgActions.tsx
// Client island for the Phase 2 write controls on the org detail page:
//   - trial/pilot extend dropdown (7/14/30), label reflects is_pilot
//   - feature-flag toggle list (from ALLOWED_FLAGS)
// Each write asks for confirmation, then calls a server action. The page
// is a server component and revalidates after the action, so values
// refresh on the next render.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  ALLOWED_FLAGS,
  ALLOWED_EXTEND_DAYS,
  type ExtendDays,
} from '@/lib/admin/featureFlags'
import { extendTrial, toggleFeatureFlag } from './actions'

interface Props {
  orgId: string
  isPilot: boolean
  flags: Record<string, boolean>
}

export default function AdminOrgActions({ orgId, isPilot, flags }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [days, setDays] = useState<ExtendDays>(ALLOWED_EXTEND_DAYS[0])
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(
    null
  )

  const target = isPilot ? 'pilot end date' : 'trial end date'

  function runExtend() {
    setMessage(null)
    const ok = window.confirm(
      `Extend this organization's ${target} by ${days} days?`
    )
    if (!ok) return
    startTransition(async () => {
      const res = await extendTrial(orgId, days)
      if (res.ok) {
        setMessage({ kind: 'ok', text: `Extended ${target} by ${days} days.` })
        router.refresh()
      } else {
        setMessage({ kind: 'err', text: res.error ?? 'Failed.' })
      }
    })
  }

  function runToggle(flagKey: string, label: string, next: boolean) {
    setMessage(null)
    const ok = window.confirm(
      `${next ? 'Enable' : 'Disable'} "${label}" for this organization?`
    )
    if (!ok) return
    startTransition(async () => {
      const res = await toggleFeatureFlag(orgId, flagKey, next)
      if (res.ok) {
        setMessage({
          kind: 'ok',
          text: `${label} ${next ? 'enabled' : 'disabled'}.`,
        })
        router.refresh()
      } else {
        setMessage({ kind: 'err', text: res.error ?? 'Failed.' })
      }
    })
  }

  return (
    <div className="space-y-6">
      {message && (
        <div
          className={
            message.kind === 'ok'
              ? 'rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800'
              : 'rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800'
          }
        >
          {message.text}
        </div>
      )}

      {/* Extend trial / pilot */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="mb-1 text-sm font-semibold text-gray-900">
          Extend {isPilot ? 'pilot' : 'trial'}
        </h3>
        <p className="mb-3 text-xs text-gray-500">
          Moves the {target} forward. Never shortens an existing date.
        </p>
        <div className="flex items-center gap-3">
          <select
            value={days}
            disabled={isPending}
            onChange={(e) => setDays(Number(e.target.value) as ExtendDays)}
            className="rounded border border-gray-300 px-3 py-1.5 text-sm"
          >
            {ALLOWED_EXTEND_DAYS.map((d) => (
              <option key={d} value={d}>
                {d} days
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={runExtend}
            disabled={isPending}
            className="rounded bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {isPending ? 'Working…' : 'Extend'}
          </button>
        </div>
      </div>

      {/* Feature flags */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-gray-900">Feature flags</h3>
        <ul className="divide-y divide-gray-100">
          {ALLOWED_FLAGS.map((f) => {
            const enabled = flags[f.key] === true
            return (
              <li
                key={f.key}
                className="flex items-center justify-between gap-4 py-3"
              >
                <div>
                  <div className="text-sm font-medium text-gray-900">{f.label}</div>
                  <div className="text-xs text-gray-500">{f.description}</div>
                </div>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => runToggle(f.key, f.label, !enabled)}
                  className={
                    enabled
                      ? 'rounded border border-green-300 bg-green-50 px-3 py-1.5 text-sm font-medium text-green-800 hover:bg-green-100 disabled:opacity-50'
                      : 'rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50'
                  }
                >
                  {enabled ? 'Enabled' : 'Disabled'}
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
