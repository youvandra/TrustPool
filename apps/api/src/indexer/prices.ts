import type { Database } from 'bun:sqlite'
import { swapAdapterAbi } from '@trustpool/core'
import type { PublicClient } from 'viem'
import { log } from '../log'
import { mon } from './units'

interface OpenCall {
  id: number
  token: `0x${string}`
  adapter: `0x${string}`
  tokens_wei: string
  tokens: number
}

/**
 * Samples every open call on a timer: asks the call's own adapter what selling the whole
 * position would return now. That one quote gives both the sparkline price and the
 * unrealised, marked-to-market value shown on open calls. A quote is not a fill: the
 * record only ever uses real fills.
 */
export class PriceSampler {
  private timer?: ReturnType<typeof setInterval>

  constructor(
    private readonly db: Database,
    private readonly client: PublicClient,
    private readonly everyMs: number,
    private readonly concurrency = 8,
  ) {}

  start() {
    void this.sample()
    this.timer = setInterval(() => void this.sample(), this.everyMs)
  }

  stop() {
    clearInterval(this.timer)
  }

  async sample(now = Date.now()): Promise<number> {
    const open = this.db
      .query<OpenCall, []>(`SELECT id, token, adapter, tokens_wei, tokens FROM calls WHERE state IN ('Locked', 'Exiting')`)
      .all()
    let done = 0
    for (let i = 0; i < open.length; i += this.concurrency) {
      const quotes = await Promise.all(open.slice(i, i + this.concurrency).map((c) => this.quote(c)))
      this.db.transaction(() => {
        for (const q of quotes) {
          if (!q) continue
          this.db.query('INSERT OR REPLACE INTO prices (call_id, at, price) VALUES (?, ?, ?)').run(q.id, now, q.value / q.tokens)
          this.db.query('UPDATE calls SET marked_value = ?, marked_at = ? WHERE id = ?').run(q.value, now, q.id)
          done++
        }
      })()
    }
    if (open.length) log.debug('prices sampled', { open: open.length, quoted: done })
    return done
  }

  private async quote(c: OpenCall) {
    try {
      const out = await this.client.readContract({
        address: c.adapter,
        abi: swapAdapterAbi,
        functionName: 'quoteSell',
        args: [c.token, BigInt(c.tokens_wei)],
      })
      return { id: c.id, value: mon(out), tokens: c.tokens }
    } catch (err) {
      // no liquidity, paused pair, adapter without quotes: skip this round, keep the last value
      log.debug('quote failed', { call: c.id, err })
      return undefined
    }
  }
}
