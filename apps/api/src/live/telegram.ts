import { returnBps, type AlertKind, type Call, type Caller } from '@trustpool/core'
import type { Database } from '../db/client'
import { duration, mon, shortAddress, signedPct } from '../format'
import { ALERT_CHANNEL } from '../indexer/writer'
import { log } from '../log'
import type { ReadStore } from '../store/types'

const KINDS: readonly AlertKind[] = ['call_opened', 'exit_announced', 'call_settled', 'call_released', 'call_stale']
const APP_URL = 'https://trustpool.web.id'

export interface TelegramOptions {
  botToken: string
  chatId: string
  /** Only the instance holding the indexer lock posts, so two instances never double-post. */
  isLeader: () => boolean
  appUrl?: string
  /** Telegram allows about 20 messages a minute in one group or channel. */
  perMinute?: number
  fetch?: typeof fetch
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}

/** One line per call event, then the call's link. A loss reads exactly like a gain. */
export function telegramText(kind: AlertKind, call: Call, caller: Caller | undefined, appUrl = APP_URL): string | undefined {
  const who = caller?.handle ?? shortAddress(call.caller)
  const sym = call.token.symbol
  let line: string
  switch (kind) {
    case 'call_opened':
      line = `${who} opened a call on ${sym} with ${mon(call.monIn)}. Locked for ${duration(call.unlockAt - call.openedAt)}.`
      break
    case 'exit_announced':
      line = `${who} announced an exit on ${sym}. Can sell in ${duration((call.exitAt ?? 0) - (call.announcedAt ?? 0))}.`
      break
    case 'call_settled':
      line = `${who} sold ${sym}. ${signedPct(returnBps(call) ?? 0)} on the record.`
      break
    case 'call_released':
      line = `${who} took ${sym} unsold. ${signedPct(-10_000)} on the record.`
      break
    case 'call_stale':
      line = `${who}'s call on ${sym} is past its max hold and marked stale.`
      break
    default:
      return undefined
  }
  return `${line}\n${appUrl}/app/calls/${call.id}`
}

/**
 * Posts call events to one Telegram chat through the Bot API. Listens on the same channel
 * as AlertHub, but takes the broadcasts (`userId: null`), so a call reaches the channel
 * whether or not anyone follows the caller yet. A failed post is logged and dropped.
 */
export class TelegramFeed {
  private readonly queue: string[] = []
  private readonly seen = new Set<string>()
  private readonly sent: number[] = []
  private draining?: Promise<void>
  private stop?: () => Promise<void>
  private readonly fetch: typeof fetch
  private readonly now: () => number
  private readonly sleep: (ms: number) => Promise<void>

  constructor(
    private readonly store: Pick<ReadStore, 'getCall' | 'getCaller'>,
    private readonly opts: TelegramOptions,
  ) {
    this.fetch = opts.fetch ?? fetch
    this.now = opts.now ?? Date.now
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)))
  }

  async start(database: Pick<Database, 'listen'>) {
    this.stop = await database.listen(ALERT_CHANNEL, (payload) => void this.receive(payload))
  }

  async close() {
    await this.stop?.()
  }

  /** Resolves once every queued message has been posted or dropped. */
  async idle() {
    while (this.draining) await this.draining
  }

  async receive(payload: string) {
    let a: { userId: string | null; kind: AlertKind; callId: number }
    try {
      a = JSON.parse(payload)
    } catch {
      return
    }
    if (a.userId !== null || !KINDS.includes(a.kind) || !this.opts.isLeader()) return
    const key = `${a.kind}:${a.callId}`
    if (this.seen.has(key)) return
    this.seen.add(key)
    if (this.seen.size > 5000) this.seen.delete(this.seen.values().next().value!)

    try {
      const call = await this.store.getCall(a.callId)
      if (!call) return log.warn('telegram: call not found', { callId: a.callId })
      const text = telegramText(a.kind, call, await this.store.getCaller(call.caller), this.opts.appUrl)
      if (!text) return
      this.queue.push(text)
      this.kick()
    } catch (err) {
      log.warn('telegram: could not build a message', { callId: a.callId, err: String(err) })
    }
  }

  private kick() {
    if (this.draining) return
    this.draining = this.drain().finally(() => {
      this.draining = undefined
      if (this.queue.length) this.kick() // pushed while the last post was finishing
    })
  }

  private async drain() {
    const limit = this.opts.perMinute ?? 20
    for (let text = this.queue.shift(); text !== undefined; text = this.queue.shift()) {
      while (this.sent.length && this.sent[0]! <= this.now() - 60_000) this.sent.shift()
      if (this.sent.length >= limit) await this.sleep(this.sent[0]! + 60_000 - this.now())
      this.sent.push(this.now())
      await this.post(text)
    }
  }

  private async post(text: string) {
    try {
      const res = await this.fetch(`https://api.telegram.org/bot${this.opts.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: this.opts.chatId, text }),
      })
      if (!res.ok) log.warn('telegram: post failed', { status: res.status, body: (await res.text()).slice(0, 200) })
    } catch (err) {
      log.warn('telegram: post failed', { err: String(err) })
    }
  }
}
