import { swapAdapterAbi, trustPoolAbi } from '@trustpool/core'
import { and, eq, gt, lt } from 'drizzle-orm'
import type { PublicClient } from 'viem'
import type { Db } from '../db/client'
import { calls, prices } from '../db/schema'
import { log } from '../log'
import { mon } from './units'

/**
 * Samples on a timer. For every holding call it asks the call's own adapter what selling the
 * whole position would return now: that one quote gives both the sparkline price and the
 * unrealised, marked-to-market value. For every open window it reads the contract's `capOf`,
 * the live cap a joiner can still fill. A quote is not a fill: the record only uses real fills.
 *
 * Samples older than `retainMs` are pruned; the sparkline only shows a thinned series anyway.
 */
export class PriceSampler {
  private timer?: ReturnType<typeof setInterval>

  constructor(
    private readonly db: Db,
    private readonly client: PublicClient,
    private readonly everyMs: number,
    private readonly opts: { pool?: `0x${string}`; concurrency?: number; retainMs?: number; isLeader?: () => boolean; now?: () => number } = {},
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

  async sample(now = this.opts.now?.() ?? Date.now()): Promise<number> {
    await this.sampleCaps(now)
    const open = (
      await this.db
        .select({ id: calls.id, token: calls.token, adapter: calls.adapter, tokensWei: calls.tokensWei, tokens: calls.tokens })
        .from(calls)
        .where(eq(calls.state, 'Holding'))
    ).map((c) => ({ ...c, tokensWei: c.tokensWei ?? '0', tokens: c.tokens ?? 0 }))
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

  /** Live caps of open windows, from the contract's own calculation. */
  async sampleCaps(now: number): Promise<number> {
    if (!this.opts.pool) return 0
    const open = await this.db
      .select({ id: calls.id })
      .from(calls)
      .where(and(eq(calls.state, 'Open'), gt(calls.windowEnd, now)))
    let done = 0
    for (const c of open) {
      try {
        const cap = await this.client.readContract({ address: this.opts.pool, abi: trustPoolAbi, functionName: 'capOf', args: [BigInt(c.id)] })
        await this.db.update(calls).set({ liveCap: mon(cap) }).where(eq(calls.id, c.id))
        done++
      } catch (err) {
        log.debug('capOf failed', { call: c.id, err })
      }
    }
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
