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
  /** Received MON in a transaction sent by the caller's address shortly before its first buy. */
  fundedByCaller: boolean
}

export interface EarlyBuyerReport {
  callId: number
  fromBlock: number
  toBlock: number
  buyers: EarlyBuyer[]
  /** Whether `fundedByCaller` was checked; false when the RPC could not answer within budget. */
  fundingChecked: boolean
  note: string
}

const NOTE =
  'Wallets that received this token in the blocks before the call opened. Input for a manual review, never proof: ' +
  'anyone can buy a token, and a link to the caller has to be shown separately. "Funded by the caller" only sees MON ' +
  'sent directly from the caller\'s address, not through another wallet or a contract.'

/** Most historical nonce lookups one funding check makes before it falls back. */
const NONCE_BUDGET = 200
/** At most this many blocks fetched whole when historical nonces are unavailable. */
const BLOCK_BUDGET = 1500

/**
 * Lists wallets that received a call's token in the `windowBlocks` before the call opened.
 * Scanned once per call on first request and cached; a call's past cannot change.
 */
export class EarlyBuyers {
  private readonly inFlight = new Map<number, Promise<EarlyBuyerReport | undefined>>()

  constructor(
    private readonly db: Db,
    private readonly client: PublicClient,
    private readonly opts: { pool: string; windowBlocks: number; maxBlockRange: number; fundingWindowBlocks?: number },
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
    const buyers = rows.map((b) => ({
      wallet: b.wallet,
      amount: b.amount,
      firstBlock: b.firstBlock,
      transfers: b.transfers,
      isCaller: b.wallet === call?.caller,
      fundedByCaller: b.fundedByCaller,
    }))
    return { callId, fromBlock: scan.fromBlock, toBlock: scan.toBlock, buyers, fundingChecked: scan.fundingChecked, note: NOTE }
  }

  private async scan(callId: number): Promise<EarlyBuyerReport | undefined> {
    const [call] = await this.db
      .select({ token: calls.token, openBlock: calls.openBlock, adapter: calls.adapter, caller: calls.caller })
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

    const funded = await this.fundedByCaller(
      call.caller,
      [...totals].filter(([w]) => w !== call.caller).map(([wallet, t]) => ({ wallet, first: t.first })),
    )

    await this.db.transaction(async (tx) => {
      const rows = [...totals].map(([wallet, t]) => ({
        callId,
        wallet,
        amount: amount(t.raw, decimals),
        firstBlock: Number(t.first),
        transfers: t.n,
        fundedByCaller: funded?.has(wallet) ?? false,
      }))
      if (rows.length) await tx.insert(earlyBuyers).values(rows).onConflictDoNothing()
      await tx
        .insert(earlyBuyerScans)
        .values({ callId, fromBlock: Number(fromBlock), toBlock: Number(toBlock), at: Date.now(), fundingChecked: !!funded })
        .onConflictDoNothing()
    })
    log.info('early buyers scanned', { callId, fromBlock, toBlock, wallets: totals.size, funded: funded?.size ?? 'unchecked' })
    return this.cached(callId)
  }

  /**
   * Wallets that received MON in a transaction sent by the caller in the `fundingWindowBlocks`
   * up to their first buy. Traces are unavailable, so only the caller's own transactions are
   * read: the blocks where the caller's nonce moves are found by bisection, then fetched whole.
   * Without historical nonces it falls back to fetching every block, within a budget.
   * Undefined when neither fits.
   */
  private async fundedByCaller(caller: string, buyers: { wallet: string; first: bigint }[]): Promise<Set<string> | undefined> {
    const funded = new Set<string>()
    if (!buyers.length) return funded
    const window = BigInt(this.opts.fundingWindowBlocks ?? 1500)
    const last = buyers.reduce((m, b) => (b.first > m ? b.first : m), 0n)
    const lo = buyers.reduce((m, b) => (b.first < m ? b.first : m), last) - window
    const from = lo > 0n ? lo : 0n

    let blocks: bigint[] | undefined
    try {
      blocks = await this.senderBlocks(caller as `0x${string}`, from, last)
    } catch (err) {
      log.debug('nonce bisection unavailable, scanning blocks', { err: String(err) })
      const wanted = new Set<bigint>()
      for (const b of buyers) for (let n = b.first - window < from ? from : b.first - window; n <= b.first; n++) wanted.add(n)
      if (wanted.size > BLOCK_BUDGET) return undefined
      blocks = [...wanted]
    }

    try {
      const sent = new Map<string, bigint[]>() // recipient -> blocks the caller paid it in
      for (let i = 0; i < blocks.length; i += 10) {
        const got = await Promise.all(blocks.slice(i, i + 10).map((n) => this.client.getBlock({ blockNumber: n, includeTransactions: true })))
        for (const block of got)
          for (const tx of block.transactions)
            if (tx.from.toLowerCase() === caller.toLowerCase() && tx.to && tx.value > 0n) {
              const to = getAddress(tx.to)
              sent.set(to, [...(sent.get(to) ?? []), block.number!])
            }
      }
      for (const b of buyers) if (sent.get(b.wallet)?.some((n) => n <= b.first && n >= b.first - window)) funded.add(b.wallet)
      return funded
    } catch (err) {
      log.warn('funding check failed', { err: String(err) })
      return undefined
    }
  }

  /** Blocks in [from, to] where `address` sent a transaction, found by bisecting its nonce. */
  private async senderBlocks(address: `0x${string}`, from: bigint, to: bigint): Promise<bigint[]> {
    let lookups = 0
    const nonce = (b: bigint) => {
      if (++lookups > NONCE_BUDGET) throw new Error('nonce budget spent')
      return b < 0n ? Promise.resolve(0) : this.client.getTransactionCount({ address, blockNumber: b })
    }
    const out: bigint[] = []
    const go = async (lo: bigint, hi: bigint, before: number, after: number): Promise<void> => {
      if (before === after) return
      if (lo === hi) return void out.push(lo)
      const mid = (lo + hi) / 2n
      const atMid = await nonce(mid)
      await go(lo, mid, before, atMid)
      await go(mid + 1n, hi, atMid, after)
    }
    await go(from, to, await nonce(from - 1n), await nonce(to))
    return out
  }
}
