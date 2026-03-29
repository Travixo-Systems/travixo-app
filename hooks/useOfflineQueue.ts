'use client'

import { useEffect, useState } from 'react'
import { db, processQueue, QUEUE_UPDATED_EVENT } from '@/lib/offline-queue'
import { registerSyncListener, unregisterSyncListener } from '@/lib/sync-manager'

interface UseOfflineQueueResult {
  isOnline: boolean
  pendingCount: number
}

/**
 * Dispatch the queue-updated event to trigger a count refresh in any mounted
 * useOfflineQueue hook. Call this after any external operation that changes
 * the queue (e.g. manual clearCompleted()).
 */
export function refreshPendingCount(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(QUEUE_UPDATED_EVENT))
  }
}

export function useOfflineQueue(): UseOfflineQueueResult {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  )
  const [pendingCount, setPendingCount] = useState<number>(0)

  // Re-read count from IndexedDB whenever the queue is mutated
  useEffect(() => {
    let cancelled = false

    async function refreshCount() {
      const count = await db.pending_actions
        .where('status')
        .equals('pending')
        .count()
      if (!cancelled) setPendingCount(count)
    }

    // Seed on mount
    refreshCount().catch(console.error)

    function handleQueueUpdate() {
      refreshCount().catch(console.error)
    }

    window.addEventListener(QUEUE_UPDATED_EVENT, handleQueueUpdate)

    return () => {
      cancelled = true
      window.removeEventListener(QUEUE_UPDATED_EVENT, handleQueueUpdate)
    }
  }, [])

  // Track online/offline state and trigger sync on reconnect
  useEffect(() => {
    registerSyncListener()

    function handleOnline() {
      setIsOnline(true)
      processQueue().catch(console.error)
    }

    function handleOffline() {
      setIsOnline(false)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      unregisterSyncListener()
    }
  }, [])

  return { isOnline, pendingCount }
}
