'use client'

import { useEffect, useState } from 'react'
import { db } from '@/lib/offline-queue'
import { registerSyncListener, unregisterSyncListener } from '@/lib/sync-manager'
import { processQueue } from '@/lib/offline-queue'

interface UseOfflineQueueResult {
  isOnline: boolean
  pendingCount: number
}

export function useOfflineQueue(): UseOfflineQueueResult {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  )
  const [pendingCount, setPendingCount] = useState<number>(0)

  // Sync pendingCount from IndexedDB
  useEffect(() => {
    let cancelled = false

    async function refreshCount() {
      const count = await db.pending_actions
        .where('status')
        .equals('pending')
        .count()
      if (!cancelled) setPendingCount(count)
    }

    refreshCount()

    // Re-read count whenever the table changes (Dexie liveQuery-lite via hook interval)
    const interval = setInterval(refreshCount, 5000)

    return () => {
      cancelled = true
      clearInterval(interval)
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
