import type { Database } from 'bun:sqlite'
import { getAddress, parseAbiItem, type PublicClient } from 'viem'
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
    private readonly db: Database,
    private readonly client: PublicClient,
    private readonly opts: { pool: string; windowBlocks: number; maxBlockRange: number },
  ) {}

  report(callId: number): Promise<EarlyBuyerReport | undefined> {
    const cached = this.cached(callId)
    if (cached) return Promise.resolve(cached)
    let p = this.inFlight.get(callId)
    if (!p) {
      p = this.scan(callId).finally(() => this.inFlight.delete(callId))
      this.inFlight.set(callId, p)
    }
    return p
  }

  private cached(callId: number): EarlyBuyerReport | undefined {
    const scan = this.db
      .query<{ from_block: number; to_block: number }, [number]>('SELECT from_block, to_block FROM early_buyer_scans WHERE call_id = ?')
      .get(callId)
    if (!scan) return undefined
    const caller = this.db.query<{ caller: string }, [number]>('SELECT caller FROM calls WHERE id = ?').get(callId)!.caller
    const buyers = this.db
      .query<{ wallet: string; amount: number; first_block: number; transfers: number }, [number]>(
        'SELECT wallet, amount, first_block, transfers FROM early_buyers WHERE call_id = ? ORDER BY amount DESC',
      )
      .all(callId)
      .map((b) => ({ wallet: b.wallet, amount: b.amount, firstBlock: b.first_block, transfers: b.transfers, isCaller: b.wallet.toLowerCase() === caller.toLowerCase() }))
    return { callId, fromBlock: scan.from_block, toBlock: scan.to_block, buyers, note: NOTE }
  }

  private async scan(callId: number): Promise<EarlyBuyerReport | undefined> {
    const call = this.db
      .query<{ token: `0x${string}`; open_block: number | null; adapter: string }, [number]>('SELECT token, open_block, adapter FROM calls WHERE id = ?')
      .get(callId)
    if (!call || call.open_block === null) return undefined
    const decimals = this.db.query<{ decimals: number }, [string]>('SELECT decimals FROM tokens WHERE address = ?').get(call.token)?.decimals ?? 18

    // The window ends one block before the open, so the call's own buy is never listed.
    const toBlock = BigInt(call.open_block) - 1n
    const fromBlock = toBlock - BigInt(this.opts.windowBlocks) + 1n > 0n ? toBlock - BigInt(this.opts.windowBlocks) + 1n : 0n
    const skip = new Set([ZERO, this.opts.pool.toLowerCase(), call.adapter.toLowerCase()])
    const totals = new Map<string, { raw: bigint; first: bigint; n: number }>()

    for (let from = fromBlock; from <= toBlock; from += BigInt(this.opts.maxBlockRange)) {
      const to = from + BigInt(this.opts.maxBlockRange) - 1n < toBlock ? from + BigInt(this.opts.maxBlockRange) - 1n : toBlock
      const logs = await this.client.getLogs({ address: call.token, event: TRANSFER, fromBlock: from, toBlock: to, strict: true })
      for (const l of logs) {
        const wallet = getAddress(l.args.to)
        if (skip.has(wallet.toLowerCase())) continue
        const t = totals.get(wallet) ?? { raw: 0n, first: l.blockNumber, n: 0 }
        t.raw += l.args.value
        t.n += 1
        totals.set(wallet, t)
      }
    }

    this.db.transaction(() => {
      for (const [wallet, t] of totals) {
        this.db
          .query('INSERT OR REPLACE INTO early_buyers (call_id, wallet, amount, first_block, transfers) VALUES (?, ?, ?, ?, ?)')
          .run(callId, wallet, amount(t.raw, decimals), Number(t.first), t.n)
      }
      this.db
        .query('INSERT OR REPLACE INTO early_buyer_scans (call_id, from_block, to_block, at) VALUES (?, ?, ?, ?)')
        .run(callId, Number(fromBlock), Number(toBlock), Date.now())
    })()
    log.info('early buyers scanned', { callId, fromBlock, toBlock, wallets: totals.size })
    return this.cached(callId)
  }
}
