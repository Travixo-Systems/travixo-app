'use client'

// components/SlotProbe.tsx
//
// TEMPORARY DIAGNOSTIC -- REMOVE BEFORE MERGE.
//
// Instruments the per-tab account machinery so a two-tab sign-out can be
// observed rather than inferred. Prints, per tab:
//
//   - the resolved slot (and where it came from: URL prefix or sessionStorage)
//   - the storageKey / BroadcastChannel name the Supabase client is using
//   - every auth cookie name currently in the jar
//   - every onAuthStateChange event this tab receives, with the slot the
//     event's session actually belongs to
//   - every raw BroadcastChannel message on EVERY slot's channel, so a
//     cross-slot delivery is visible even if this tab's own client ignores it
//
// Every line is prefixed [PROBE s<slot>] so two tabs can be told apart when
// their consoles are pasted side by side.

import { useEffect } from 'react'
import { createClient, getCurrentSlot } from '@/lib/supabase/client'
import {
  MAX_ACCOUNT_SLOTS,
  SLOT_STORAGE_KEY,
  cookieNameForSlot,
  splitSlotPath,
} from '@/lib/supabase/account-slot'

function authCookieNames(): string[] {
  if (typeof document === 'undefined') return []
  const all = document.cookie
    .split('; ')
    .map((c) => c.split('=')[0])
    .filter(Boolean)
  return all.filter((n) => n.startsWith('travixo-auth'))
}

/**
 * A STABLE, NON-IDENTIFYING label for whose session an event carries.
 *
 * This runs on a preview deployment that may point at production data, so the
 * console must never carry PII or credentials. Deliberately emitted:
 *
 *   - the first 8 chars of the `sub` UUID -- enough to tell two accounts
 *     apart in a paste, not enough to identify anyone
 *   - the email's DOMAIN only, never the local part
 *
 * Never emitted: the access token, the refresh token, any full JWT, any
 * cookie VALUE, or a full email address. Distinguishing two tabs only needs
 * "are these the same subject or not", which the truncated sub answers.
 */
function subjectOf(session: unknown): string {
  try {
    const token = (session as { access_token?: string } | null)?.access_token
    if (!token) return '(no session)'
    const payload = JSON.parse(atob(token.split('.')[1]))
    const sub = typeof payload.sub === 'string' ? payload.sub.slice(0, 8) : '?'
    const domain =
      typeof payload.email === 'string' && payload.email.includes('@')
        ? `@${payload.email.split('@')[1]}`
        : '(no email claim)'
    return `${sub} ${domain}`
  } catch {
    return '(unparseable)'
  }
}

export default function SlotProbe() {
  useEffect(() => {
    const slot = getCurrentSlot()
    const tag = `[PROBE s${slot}]`
    const urlSlot = splitSlotPath(window.location.pathname).slot
    let ssSlot: string | null | undefined
    try {
      ssSlot = window.sessionStorage.getItem(SLOT_STORAGE_KEY)
    } catch {
      ssSlot = '(threw)'
    }

    // @supabase/ssr sets auth.storageKey = cookieOptions.name, and auth-js
    // names its BroadcastChannel after storageKey. So the channel name IS the
    // cookie name for this slot.
    const storageKey = cookieNameForSlot(slot)

    console.log(`${tag} ---------- tab boot ----------`)
    console.log(`${tag} href              = ${window.location.href}`)
    console.log(`${tag} resolvedSlot      = ${slot}`)
    console.log(`${tag}   from URL prefix = ${urlSlot}`)
    console.log(`${tag}   from sessionStg = ${String(ssSlot)}`)
    console.log(`${tag} storageKey        = ${storageKey}`)
    console.log(`${tag} broadcastChannel  = ${storageKey}`)
    console.log(`${tag} authCookies       = ${JSON.stringify(authCookieNames())}`)

    // This tab's own client, and its own listener -- the one that actually
    // drives the navigation in LanguageContext.
    const supabase = createClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log(
          `${tag} onAuthStateChange event=${event} ` +
            `sessionSubject=${subjectOf(session)} ` +
            `cookiesNow=${JSON.stringify(authCookieNames())}`
        )
      }
    )

    // Listen on EVERY slot's channel, not just this tab's. If a SIGNED_OUT
    // from another slot is somehow delivered here, this is what shows it.
    const channels: BroadcastChannel[] = []
    if (typeof BroadcastChannel !== 'undefined') {
      for (let s = 0; s < MAX_ACCOUNT_SLOTS; s++) {
        const name = cookieNameForSlot(s)
        try {
          const ch = new BroadcastChannel(name)
          ch.addEventListener('message', (e: MessageEvent) => {
            console.log(
              `${tag} BROADCAST on "${name}" (mine=${name === storageKey}) ` +
                `event=${(e.data as { event?: string })?.event} ` +
                `subject=${subjectOf((e.data as { session?: unknown })?.session)}`
            )
          })
          channels.push(ch)
        } catch {
          // channel unavailable; nothing to observe here
        }
      }
    }

    // A cookie disappearing is the other half of the story: poll so the exact
    // moment a jar entry is removed is timestamped next to the events.
    let previous = authCookieNames().join(',')
    const poll = window.setInterval(() => {
      const now = authCookieNames()
      const joined = now.join(',')
      if (joined !== previous) {
        console.log(`${tag} COOKIES CHANGED ${previous || '(none)'} -> ${joined || '(none)'}`)
        previous = joined
      }
    }, 250)

    return () => {
      subscription.unsubscribe()
      channels.forEach((c) => c.close())
      window.clearInterval(poll)
    }
  }, [])

  return null
}
