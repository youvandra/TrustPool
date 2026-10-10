import type { Alert } from '@trustpool/core'
import type { Database } from '../db/client'
import { ALERT_CHANNEL } from '../indexer/writer'
import { log } from '../log'

type Listener = (alert: Alert) => void

/**
 * Routes new alerts to the open streams of their users. Fed by Postgres LISTEN, so an alert
 * written by whichever instance indexes reaches a browser connected to any instance.
 */
export class AlertHub {
  private readonly listeners = new Map<string, Set<Listener>>()
  private stop?: () => Promise<void>

  async start(database: Pick<Database, 'listen'>) {
    this.stop = await database.listen(ALERT_CHANNEL, (payload) => this.deliver(payload))
  }

  async close() {
    await this.stop?.()
    this.listeners.clear()
  }

  /** Subscribes one stream; returns the unsubscribe. */
  subscribe(user: string, fn: Listener): () => void {
    let set = this.listeners.get(user)
    if (!set) this.listeners.set(user, (set = new Set()))
    set.add(fn)
    return () => {
      set.delete(fn)
      if (!set.size) this.listeners.delete(user)
    }
  }

  get streams(): number {
    let n = 0
    for (const s of this.listeners.values()) n += s.size
    return n
  }

  private deliver(payload: string) {
    let a: { id: string; userId: string; kind: Alert['kind']; callId: number; at: number }
    try {
      a = JSON.parse(payload)
    } catch {
      return log.warn('unreadable alert notification', { payload })
    }
    const alert: Alert = { id: a.id, kind: a.kind, callId: a.callId, at: Number(a.at), read: false }
    for (const fn of this.listeners.get(a.userId) ?? []) fn(alert)
  }
}
