// lib/search/useDebounce.ts
//
// The shared debounce for every search surface. Replaces the 300ms setTimeout
// that was copy-pasted into AssetsPageClient, VGPSchedulesManager and
// CheckoutOverlay, and was simply missing from the inspections, scans, audits
// and team surfaces.
//
// 300ms is the value the spec fixes (§26) and the value all three existing
// copies already used, so adopting it changes no current behaviour.

'use client'

import { useEffect, useState } from 'react'

/** The application-wide search debounce, in milliseconds. */
export const SEARCH_DEBOUNCE_MS = 300

/**
 * Returns `value` delayed by `delayMs`, resetting the timer on every change.
 *
 * Now that search hits the server on every keystroke, this is what keeps a
 * typed word from becoming one request per character.
 */
export function useDebounce<T>(value: T, delayMs: number = SEARCH_DEBOUNCE_MS): T {
  const [debounced, setDebounced] = useState<T>(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])

  return debounced
}
