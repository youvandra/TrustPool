import { desc, eq } from 'drizzle-orm'
import { getAddress, parseAbiItem, type PublicClient } from 'viem'
import type { Db } from '../db/client'
import { calls, earlyBuyerScans, earlyBuyers, tokens } from '../db/schema'
import { log } from '../log'
import { amount } from './units'

const TRANSFER = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)')
const ZERO = '0x0000000000000000000000000000000000000000'

export interface EarlyBuyer {
  wallet: string
  /** Tokens received in the window, in token units. */
  amount: number
  firstBlock: number
  transfers: number
  /** The caller's own address, listed so nothing is hidden. */
  isCaller: boolean
}

export interface EarlyBuyerReport {
  callId: number
  fromBlock: number
  toBlock: number
  buyers: EarlyBuyer[]
  note: string
}

const NOTE =
  'Wallets that received this token in the blocks before the call opened. Input for a manual review, never proof: ' +
  'anyone can buy a token, and a link to the caller has to be shown separately.'

/**
 * Lists wallets that received a call's token in the `windowBlocks` before the call opened.
 * Scanned once per call on first request and cached; a call's past cannot change.
 */
export class EarlyBuyers {
  private readonly inFlight = new Map<number, Promise<EarlyBuyerReport | undefined>>()

  constructor(
    private readonly db: Db,
    private readonly client: PublicClient,
    private readonly opts: { pool: string; windowBlocks: number; maxBlockRange: number },
  ) {}

  async report(callId: number): Promise<EarlyBuyerReport | undefined> {
    const cached = await this.cached(callId)
    if (cached) return cached
    let p = this.inFlight.get(callId)
    if (!p) {
      p = this.scan(callId).finally(() => this.inFlight.delete(callId))
      this.inFlight.set(callId, p)
    }
    return p
  }

  private async cached(callId: number): Promise<EarlyBuyerReport | undefined> {
    const [scan] = await this.db.select().from(earlyBuyerScans).where(eq(earlyBuyerScans.callId, callId))
    if (!scan) return undefined
    const [call] = await this.db.select({ caller: calls.caller }).from(calls).where(eq(calls.id, callId))
    const rows = await this.db.select().from(earlyBuyers).where(eq(earlyBuyers.callId, callId)).orderBy(desc(earlyBuyers.amount))
    const buyers = rows.map((b) => ({ wallet: b.wallet, amount: b.amount, firstBlock: b.firstBlock, transfers: b.transfers, isCaller: b.wallet === call?.caller }))
    return { callId, fromBlock: scan.fromBlock, toBlock: scan.toBlock, buyers, note: NOTE }
  }

  private async scan(callId: number): Promise<EarlyBuyerReport | undefined> {
    const [call] = await this.db
      .select({ token: calls.token, openBlock: calls.openBlock, adapter: calls.adapter })
      .from(calls)
      .where(eq(calls.id, callId))
    if (!call || call.openBlock === null) return undefined
    const [token] = await this.db.select({ decimals: tokens.decimals }).from(tokens).where(eq(tokens.address, call.token))
    const decimals = token?.decimals ?? 18

    // The window ends one block before the open, so the call's own buy is never listed.
    const toBlock = BigInt(call.openBlock) - 1n
    const fromBlock = toBlock - BigInt(this.opts.windowBlocks) + 1n > 0n ? toBlock - BigInt(this.opts.windowBlocks) + 1n : 0n
    const skip = new Set([ZERO, this.opts.pool.toLowerCase(), call.adapter.toLowerCase()])
    const totals = new Map<string, { raw: bigint; first: bigint; n: number }>()

    for (let from = fromBlock; from <= toBlock; from += BigInt(this.opts.maxBlockRange)) {
      const to = from + BigInt(this.opts.maxBlockRange) - 1n < toBlock ? from + BigInt(this.opts.maxBlockRange) - 1n : toBlock
      const logs = await this.client.getLogs({ address: call.token as `0x${string}`, event: TRANSFER, fromBlock: from, toBlock: to, strict: true })
      for (const l of logs) {
        const wallet = getAddress(l.args.to)
        if (skip.has(wallet.toLowerCase())) continue
        const t = totals.get(wallet) ?? { raw: 0n, first: l.blockNumber, n: 0 }
        t.raw += l.args.value
        t.n += 1
        totals.set(wallet, t)
      }
    }

    await this.db.transaction(async (tx) => {
      const rows = [...totals].map(([wallet, t]) => ({ callId, wallet, amount: amount(t.raw, decimals), firstBlock: Number(t.first), transfers: t.n }))
      if (rows.length) await tx.insert(earlyBuyers).values(rows).onConflictDoNothing()
      await tx
        .insert(earlyBuyerScans)
        .values({ callId, fromBlock: Number(fromBlock), toBlock: Number(toBlock), at: Date.now() })
        .onConflictDoNothing()
    })
    log.info('early buyers scanned', { callId, fromBlock, toBlock, wallets: totals.size })
    return this.cached(callId)
  }
}
