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
//  2. Keep client-side navigation on this tab's slot prefix. Next's router
//     updates history without a full request, so a plain <Link href="/assets">
//     would drop /u/1 and the next RELOAD would resolve to slot 0. The guard
//     re-applies the prefix instead of rewriting 74 hrefs.
//
// Both are no-ops on slot 0, which is what a single-account user is on.
//
// Renders nothing.

import { useEffect } from 'react'
import {
  installAccountSlotFetch,
  installSlotHistoryGuard,
} from '@/lib/supabase/client'

export default function AccountSlotBootstrap() {
  useEffect(() => {
    installAccountSlotFetch()
    installSlotHistoryGuard()
  }, [])

  return null
}
