'use client'

// app/(admin)/admin/orgs/[id]/AdminOrgActions.tsx
// Client island for the write controls on the org detail page:
//   - trial/pilot extend dropdown (7/14/30), DISABLED when extending
//     cannot achieve anything (see canExtend below)
//   - end-pilot control (read-only or locked), behind a typed confirmation
//   - feature-flag toggle list (from ALLOWED_FLAGS)
//
// Each write asks for confirmation, then calls a server action. The page
// is a server component and revalidates after the action, so values
// refresh on the next render.
//
// WHY EXTEND IS CONDITIONAL
//
// accessLevel() returns 'locked' once a pilot passes PILOT_LOCKOUT_DAYS,
// and that test runs BEFORE pilot_end_date is consulted. Extending such an
// org writes a future end date, reports success, and leaves the customer
// locked out -- the admin is told one thing and the customer lives
// another. Day 45 is a real deadline, so the org staying locked is
// correct; offering a button that cannot deliver is not. canExtendPilot()
// decides, and extendUnavailableReason() explains.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  ALLOWED_FLAGS,
  ALLOWED_EXTEND_DAYS,
  ALLOWED_END_MODES,
  END_MODE_LABELS,
  type EndMode,
  type ExtendDays,
} from '@/lib/admin/featureFlags'
import { extendTrial, toggleFeatureFlag, endPilot } from './actions'

interface Props {
  orgId: string
  orgName: string
  isPilot: boolean
  flags: Record<string, boolean>
  /** Whether extending can change anything (from canExtendPilot). */
  canExtend: boolean
  /** Why extending is unavailable; null when it is available. */
  extendReason: string | null
  /** Whether there is a running pilot to end (from canEndPilot). */
  canEnd: boolean
}

export default function AdminOrgActions({
  orgId,
  orgName,
  isPilot,
  flags,
  canExtend,
  extendReason,
  canEnd,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [days, setDays] = useState<ExtendDays>(ALLOWED_EXTEND_DAYS[0])
  const [endMode, setEndMode] = useState<EndMode>(ALLOWED_END_MODES[0])
  const [confirmText, setConfirmText] = useState('')
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(
    null
  )

  const target = isPilot ? 'pilot end date' : 'trial end date'

  function runExtend() {
    setMessage(null)
    if (!canExtend) return
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

  function runEndPilot() {
    setMessage(null)
    if (!canEnd) return
    // Typed confirmation: window.confirm is too weak for an action that
    // takes a customer's access away.
    if (confirmText.trim() !== orgName.trim()) {
      setMessage({
        kind: 'err',
        text: `Type the organization name exactly ("${orgName}") to confirm.`,
      })
      return
    }
    startTransition(async () => {
      const res = await endPilot(orgId, endMode)
      if (res.ok) {
        setMessage({
          kind: 'ok',
          text:
            endMode === 'locked'
              ? 'Pilot ended and organization locked out.'
              : 'Pilot ended. The organization is now read-only.',
        })
        setConfirmText('')
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

  const confirmMatches = confirmText.trim() === orgName.trim()

  return (
    <div className="space-y-6">
      {message && (
        <div
          role="status"
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

        {!canExtend && extendReason && (
          <div className="mb-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <span className="font-medium">Extension unavailable. </span>
            {extendReason}
          </div>
        )}

        <div className="flex items-center gap-3">
          <select
            value={days}
            disabled={isPending || !canExtend}
            onChange={(e) => setDays(Number(e.target.value) as ExtendDays)}
            className="rounded border border-gray-300 px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
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
            disabled={isPending || !canExtend}
            title={extendReason ?? undefined}
            className="rounded bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? 'Working…' : 'Extend'}
          </button>
        </div>
      </div>

      {/* End pilot (destructive) */}
      {canEnd && (
        <div className="rounded-lg border border-red-200 bg-white p-4">
          <h3 className="mb-1 text-sm font-semibold text-red-900">End pilot</h3>
          <p className="mb-3 text-xs text-gray-500">
            Ends the pilot immediately. This uses the same lifecycle a pilot
            reaches on its own — it does not create a special state, and it does
            not change how days are counted for any other organization.
          </p>

          <fieldset className="mb-3 space-y-2">
            <legend className="sr-only">End-pilot mode</legend>
            {ALLOWED_END_MODES.map((m) => (
              <label
                key={m}
                className="flex cursor-pointer items-start gap-2 rounded border border-gray-200 p-2 text-sm hover:bg-gray-50"
              >
                <input
                  type="radio"
                  name="end-mode"
                  value={m}
                  checked={endMode === m}
                  disabled={isPending}
                  onChange={() => setEndMode(m)}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-medium text-gray-900">
                    {END_MODE_LABELS[m].label}
                  </span>
                  <span className="block text-xs text-gray-500">
                    {END_MODE_LABELS[m].description}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>

          <label
            htmlFor="end-pilot-confirm"
            className="mb-1 block text-xs font-medium text-gray-700"
          >
            Type <span className="font-mono text-red-800">{orgName}</span> to
            confirm
          </label>
          <div className="flex items-center gap-3">
            <input
              id="end-pilot-confirm"
              type="text"
              value={confirmText}
              disabled={isPending}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={orgName}
              autoComplete="off"
              className="w-64 rounded border border-gray-300 px-3 py-1.5 text-sm"
            />
            <button
              type="button"
              onClick={runEndPilot}
              disabled={isPending || !confirmMatches}
              className="rounded bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? 'Working…' : 'End pilot'}
            </button>
          </div>
        </div>
      )}

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
                  aria-pressed={enabled}
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
