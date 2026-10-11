import { swapAdapterAbi, trustPoolAbi } from '@trustpool/core'
import { inArray } from 'drizzle-orm'
import { BaseError, ContractFunctionRevertedError, type Account, type Hex, type PublicClient, type WalletClient } from 'viem'
import type { Db } from '../db/client'
import { calls } from '../db/schema'
import { log } from '../log'

export type KeeperAction = 'checkpoint' | 'sell' | 'refund' | 'split'

export interface KeeperOptions {
  pool: `0x${string}`
  everyMs: number
  /** Only the instance holding the indexer lock keeps, so two instances never race. */
  isLeader?: () => boolean
}

type Row = Pick<
  typeof calls.$inferSelect,
  | 'id'
  | 'state'
  | 'token'
  | 'adapter'
  | 'totalInWei'
  | 'tokensWei'
  | 'windowEnd'
  | 'buyDeadline'
  | 'minPoolWei'
  | 'holdUntil'
  | 'splitGrace'
  | 'checkpointGap'
  | 'takeProfitBps'
  | 'stopLossBps'
  | 'lastAt'
  | 'lastValueWei'
>

/**
 * Does what anyone may do on a call, so nothing waits for a person: records checkpoints,
 * sells when a rule is met, refunds a pool that was never bought, splits a position nobody
 * could sell. The contract decides every time: each transaction is simulated first and only
 * sent if it would succeed, so the keeper can never sell early or at a price the rules forbid.
 * It earns the keeper reward on sales; it needs gas MON on its own key.
 *
 * Checkpoints cost gas, so they are taken only when they can lead somewhere: when the price
 * now meets take-profit or stop-loss (by a quote, before spending anything), when the last
 * checkpoint met one, or from one gap before max hold, to set up the two checkpoints a
 * max-hold sale needs. The database says which calls to look at; the chain says what is allowed.
 */
export class Keeper {
  private timer?: ReturnType<typeof setTimeout>
  private running = false
  private busy = false

  constructor(
    private readonly db: Db,
    private readonly client: PublicClient,
    private readonly wallet: WalletClient & { account: Account },
    private readonly opts: KeeperOptions,
  ) {}

  get address() {
    return this.wallet.account.address
  }

  start() {
    if (this.running) return
    this.running = true
    log.info('keeper starting', { address: this.address, everyMs: this.opts.everyMs })
    const loop = async () => {
      if (this.opts.isLeader?.() !== false) await this.tick().catch((err) => log.error('keeper tick failed', { err }))
      if (this.running) this.timer = setTimeout(loop, this.opts.everyMs)
    }
    void loop()
  }

  stop() {
    this.running = false
    clearTimeout(this.timer)
  }

  /** One pass over every open and holding call. Returns what it did, in order. */
  async tick(): Promise<{ id: number; action: KeeperAction; tx: Hex }[]> {
    if (this.busy) return []
    this.busy = true
    const done: { id: number; action: KeeperAction; tx: Hex }[] = []
    try {
      const block = await this.client.getBlock({ blockTag: 'latest' })
      const now = Number(block.timestamp) * 1000
      const rows: Row[] = await this.db
        .select({
          id: calls.id,
          state: calls.state,
          token: calls.token,
          adapter: calls.adapter,
          totalInWei: calls.totalInWei,
          tokensWei: calls.tokensWei,
          windowEnd: calls.windowEnd,
          buyDeadline: calls.buyDeadline,
          minPoolWei: calls.minPoolWei,
          holdUntil: calls.holdUntil,
          splitGrace: calls.splitGrace,
          checkpointGap: calls.checkpointGap,
          takeProfitBps: calls.takeProfitBps,
          stopLossBps: calls.stopLossBps,
          lastAt: calls.lastAt,
          lastValueWei: calls.lastValueWei,
        })
        .from(calls)
        .where(inArray(calls.state, ['Open', 'Holding']))
      for (const c of rows) {
        for (const action of await this.due(c, now)) {
          const tx = await this.send(c.id, action)
          if (tx) done.push({ id: c.id, action, tx })
          if (!tx) break // the contract said no: the next step for this call cannot follow
        }
      }
    } finally {
      this.busy = false
    }
    return done
  }

  /** What may be worth sending for one call now, in order. The contract still has the last word. */
  async due(c: Row, now: number): Promise<KeeperAction[]> {
    if (c.state === 'Open') {
      const small = BigInt(c.totalInWei) < BigInt(c.minPoolWei)
      return now >= (small ? c.windowEnd : c.buyDeadline) ? ['refund'] : []
    }
    if (c.holdUntil === null || c.tokensWei === null) return []
    if (now >= c.holdUntil + c.splitGrace) return ['split']

    const gapPassed = c.lastAt === null || now >= c.lastAt + c.checkpointGap
    const fresh = c.lastAt !== null && now <= c.lastAt + c.checkpointGap
    const nearHold = now >= c.holdUntil - c.checkpointGap
    const totalIn = BigInt(c.totalInWei)
    const meets = (value: bigint) =>
      (c.takeProfitBps !== 0 && value * 10_000n >= totalIn * BigInt(10_000 + c.takeProfitBps)) ||
      value * 10_000n <= totalIn * BigInt(10_000 - c.stopLossBps)
    const lastMeets = c.lastValueWei !== null && meets(BigInt(c.lastValueWei))

    const out: KeeperAction[] = []
    if (gapPassed) {
      let quoteMeets = false
      if (!nearHold && !lastMeets) {
        const quote = await this.client
          .readContract({ address: c.adapter as `0x${string}`, abi: swapAdapterAbi, functionName: 'quoteSell', args: [c.token as `0x${string}`, BigInt(c.tokensWei)] })
          .catch(() => undefined)
        quoteMeets = quote !== undefined && meets(quote)
      }
      if (nearHold || lastMeets || quoteMeets) out.push('checkpoint')
    }
    if (out.length || fresh) out.push('sell')
    return out
  }

  /** Simulates, then sends and waits. Undefined when the contract would revert. */
  private async send(id: number, action: KeeperAction): Promise<Hex | undefined> {
    try {
      const { request } = await this.client.simulateContract({
        account: this.wallet.account,
        address: this.opts.pool,
        abi: trustPoolAbi,
        functionName: action,
        args: [BigInt(id)],
      })
      const tx = await this.wallet.writeContract({ ...request, chain: this.wallet.chain })
      const receipt = await this.client.waitForTransactionReceipt({ hash: tx })
      if (receipt.status !== 'success') {
        log.warn('keeper transaction reverted', { id, action, tx })
        return undefined
      }
      log.info('keeper', { id, action, tx })
      return tx
    } catch (err) {
      const reason = revertName(err)
      if (reason) log.debug('keeper: not allowed yet', { id, action, reason })
      else log.warn('keeper: send failed', { id, action, err: String(err) })
      return undefined
    }
  }
}

/** The contract's custom error name, when a simulation reverted with one. */
function revertName(err: unknown): string | undefined {
  if (!(err instanceof BaseError)) return undefined
  const revert = err.walk((e) => e instanceof ContractFunctionRevertedError)
  return revert instanceof ContractFunctionRevertedError ? (revert.data?.errorName ?? revert.reason ?? 'reverted') : undefined
}
