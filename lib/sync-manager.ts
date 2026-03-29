import { processQueue } from './offline-queue'

let registered = false

/**
 * Register a one-time window `online` event listener that triggers the queue
 * flush whenever the browser reconnects.
 *
 * Safe to call multiple times — only registers the listener once per session.
 * Must be called from a browser context (i.e. inside a useEffect).
 */
export function registerSyncListener(): void {
  if (registered || typeof window === 'undefined') return
  registered = true

  window.addEventListener('online', handleOnline)
}

/**
 * Remove the sync listener (call on unmount if needed).
 */
export function unregisterSyncListener(): void {
  if (typeof window === 'undefined') return
  window.removeEventListener('online', handleOnline)
  registered = false
}

function handleOnline(): void {
  processQueue().catch(console.error)
}
