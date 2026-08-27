'use client'

// components/AccountSlotBootstrap.tsx
//
// Installs the per-tab account machinery. Mounted once from the root layout.
//
// Two jobs:
//
//  1. Wrap fetch() so every same-origin request carries this tab's slot
//     header. Done once, rather than editing the 35 hand-written
//     fetch('/api/...') call sites -- one missed call site would silently
//     talk to the wrong account.
//
//  2. Keep the navigation hint cookie pointing at the tab the user is
//     actually looking at. A link click sends no custom header, so the proxy
//     falls back to that cookie. The cookie is per-browser, so the ACTIVE tab
//     must own it: republish on mount, on focus, and on visibility change.
//
// Renders nothing.

import { useEffect } from 'react'
import {
  getCurrentSlot,
  installAccountSlotFetch,
  publishSlotHint,
} from '@/lib/supabase/client'

export default function AccountSlotBootstrap() {
  useEffect(() => {
    installAccountSlotFetch()

    const republish = () => publishSlotHint(getCurrentSlot())

    // Claim the hint immediately: this tab is mounting, so it is the one
    // whose navigations must resolve to its own slot.
    republish()

    // Reclaim it whenever this tab becomes the one in front. Without this,
    // the last tab to load would keep the hint forever and the other tab's
    // link clicks would resolve to the wrong account.
    const onVisibility = () => {
      if (document.visibilityState === 'visible') republish()
    }
    window.addEventListener('focus', republish)
    document.addEventListener('visibilitychange', onVisibility)

    // Also claim it just before a navigation leaves this tab, which covers
    // the case where the user never focused it (e.g. middle-click restore).
    window.addEventListener('pageshow', republish)

    return () => {
      window.removeEventListener('focus', republish)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pageshow', republish)
    }
  }, [])

  return null
}
