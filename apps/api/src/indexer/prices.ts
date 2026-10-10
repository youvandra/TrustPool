import { swapAdapterAbi } from '@trustpool/core'
import { eq, inArray, lt } from 'drizzle-orm'
import type { PublicClient } from 'viem'
import type { Db } from '../db/client'
import { calls, prices } from '../db/schema'
import { log } from '../log'
import { mon } from './units'

/**
 * Samples every open call on a timer: asks the call's own adapter what selling the whole
 * position would return now. That one quote gives both the sparkline price and the
 * unrealised, marked-to-market value shown on open calls. A quote is not a fill: the
 * record only ever uses real fills.
 *
 * Samples older than `retainMs` are pruned; the sparkline only shows a thinned series anyway.
 */
export class PriceSampler {
  private timer?: ReturnType<typeof setInterval>

  constructor(
    private readonly db: Db,
    private readonly client: PublicClient,
    private readonly everyMs: number,
    private readonly opts: { concurrency?: number; retainMs?: number; isLeader?: () => boolean } = {},
  ) {}

  start() {
    const run = () => {
      // Only the indexing instance samples, so replicas never write duplicate prices.
      if (this.opts.isLeader && !this.opts.isLeader()) return
      this.sample().catch((err) => log.error('price sampling failed', { err }))
    }
    run()
    this.timer = setInterval(run, this.everyMs)
  }

  stop() {
    clearInterval(this.timer)
  }

  async sample(now = Date.now()): Promise<number> {
    const open = await this.db
      .select({ id: calls.id, token: calls.token, adapter: calls.adapter, tokensWei: calls.tokensWei, tokens: calls.tokens })
      .from(calls)
      .where(inArray(calls.state, ['Locked', 'Exiting']))
    const concurrency = this.opts.concurrency ?? 8
    let done = 0
    for (let i = 0; i < open.length; i += concurrency) {
      const quotes = (await Promise.all(open.slice(i, i + concurrency).map((c) => this.quote(c)))).filter((q) => q !== undefined)
      if (!quotes.length) continue
      await this.db.transaction(async (tx) => {
        await tx
          .insert(prices)
          .values(quotes.map((q) => ({ callId: q.id, at: now, price: q.value / q.tokens })))
          .onConflictDoNothing()
        for (const q of quotes) await tx.update(calls).set({ markedValue: q.value, markedAt: now }).where(eq(calls.id, q.id))
      })
      done += quotes.length
    }
    if (this.opts.retainMs) await this.db.delete(prices).where(lt(prices.at, now - this.opts.retainMs))
    if (open.length) log.debug('prices sampled', { open: open.length, quoted: done })
    return done
  }

  private async quote(c: { id: number; token: string; adapter: string; tokensWei: string; tokens: number }) {
    try {
      const out = await this.client.readContract({
        address: c.adapter as `0x${string}`,
        abi: swapAdapterAbi,
        functionName: 'quoteSell',
        args: [c.token as `0x${string}`, BigInt(c.tokensWei)],
      })
      return { id: c.id, value: mon(out), tokens: c.tokens }
    } catch (err) {
      // no liquidity, paused pair, adapter without quotes: skip this round, keep the last value
      log.debug('quote failed', { call: c.id, err })
      return undefined
    }
  }
}
