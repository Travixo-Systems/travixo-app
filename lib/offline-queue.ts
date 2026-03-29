import Dexie, { type Table } from 'dexie'

export type ActionStatus = 'pending' | 'failed'

export interface PendingAction {
  id?: number
  endpoint: string
  method: string
  body: string // JSON-serialised request body
  timestamp: number
  retries: number
  status: ActionStatus
}

class OfflineQueueDB extends Dexie {
  pending_actions!: Table<PendingAction, number>

  constructor() {
    super('travixo_offline')
    this.version(1).stores({
      // id is auto-incremented primary key; index status for quick pending lookups
      pending_actions: '++id, status, timestamp',
    })
  }
}

// Singleton — safe to import multiple times in the same browser tab
export const db = new OfflineQueueDB()

/** Custom event name dispatched whenever the queue is mutated. */
export const QUEUE_UPDATED_EVENT = 'offline-queue-updated' as const

function notifyQueueUpdated(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(QUEUE_UPDATED_EVENT))
  }
}

/**
 * Add a write action to the queue.
 */
export async function enqueueAction(
  endpoint: string,
  method: string,
  body: unknown,
): Promise<number> {
  const id = await db.pending_actions.add({
    endpoint,
    method,
    body: JSON.stringify(body),
    timestamp: Date.now(),
    retries: 0,
    status: 'pending',
  })
  notifyQueueUpdated()
  return id
}

/**
 * Attempt to flush all pending actions.
 * Increments retries on failure; marks failed after 3 attempts (keeps record visible).
 */
export async function processQueue(): Promise<void> {
  const actions = await db.pending_actions
    .where('status')
    .equals('pending')
    .sortBy('timestamp')

  for (const action of actions) {
    try {
      const response = await fetch(action.endpoint, {
        method: action.method,
        headers: { 'Content-Type': 'application/json' },
        body: action.body,
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      // Success — remove the record
      await db.pending_actions.delete(action.id!)
    } catch {
      const nextRetries = action.retries + 1

      if (nextRetries >= 3) {
        // Max retries reached — mark failed, keep record for user visibility
        await db.pending_actions.update(action.id!, {
          status: 'failed',
          retries: nextRetries,
        })
      } else {
        await db.pending_actions.update(action.id!, { retries: nextRetries })
      }
    }
  }
  notifyQueueUpdated()
}

/**
 * Remove all successfully synced records that were explicitly marked for cleanup.
 * (Successful syncs are deleted immediately in processQueue; this clears any
 * lingering 'failed' records the user has acknowledged.)
 */
export async function clearCompleted(): Promise<void> {
  await db.pending_actions.where('status').equals('failed').delete()
}
