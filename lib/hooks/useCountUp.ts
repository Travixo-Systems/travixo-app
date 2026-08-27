'use client'

import { useEffect, useRef, useState } from 'react'

/** True when the viewer has asked the OS for reduced motion. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return reduced
}

/**
 * Count a figure up to `value` on mount and whenever it changes.
 *
 * Two rules this respects, because the figures it animates are compliance
 * counts rather than decoration:
 *
 *  - It always lands exactly on `value`. Easing never leaves a rounded-off
 *    number on screen, so a count of 298 never renders as 297.
 *  - Under `prefers-reduced-motion` it returns `value` immediately - no ramp,
 *    no timer. Vestibular triggers are a real accessibility concern, and a
 *    number that settles instantly loses nothing.
 *
 * Small deltas skip the animation too: watching 3 count to 4 is noise, not
 * feedback.
 */
export function useCountUp(value: number, durationMs = 650): number {
  const reduced = usePrefersReducedMotion()
  const [display, setDisplay] = useState(value)
  const frame = useRef<number | null>(null)
  const from = useRef(value)

  useEffect(() => {
    if (reduced || Math.abs(value - from.current) < 2) {
      from.current = value
      setDisplay(value)
      return
    }

    const start = performance.now()
    const origin = from.current
    const delta = value - origin

    // easeOutCubic: quick off the mark, settles gently - reads as "landing on"
    // a figure rather than ticking toward it.
    const ease = (t: number) => 1 - Math.pow(1 - t, 3)

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs)
      if (t >= 1) {
        setDisplay(value)          // exact, never an eased approximation
        from.current = value
        frame.current = null
        return
      }
      setDisplay(Math.round(origin + delta * ease(t)))
      frame.current = requestAnimationFrame(tick)
    }

    frame.current = requestAnimationFrame(tick)

    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current)
      // Leave the target in place if we unmount mid-run, so a remount does not
      // replay the ramp from a stale origin.
      from.current = value
    }
  }, [value, durationMs, reduced])

  return display
}
