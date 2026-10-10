import type { Database } from 'bun:sqlite'
import { trustPoolAbi } from '@trustpool/core'
import { getAddress, type PublicClient } from 'viem'
import type { ChainConfig } from '../config'
import { meta } from '../db/database'
import { log } from '../log'
import { readToken } from './tokens'
import { EventWriter, type At } from './writer'

type PoolLog = Awaited<ReturnType<typeof getPoolLogs>>[number]

function getPoolLogs(client: PublicClient, address: `0x${string}`, fromBlock: bigint, toBlock: bigint) {
  return client.getContractEvents({ address, abi: trustPoolAbi, fromBlock, toBlock, strict: true })
}

export interface IndexerStatus {
  chainId: number
  trustPool: string
  /** Last block fully applied to the database. */
  indexedBlock: number
  headBlock: number
  lastError?: string
  caughtUp: boolean
}

/**
 * Follows TrustPool events into SQLite.
 *
 * Each tick reads the head, stays `confirmations` blocks behind it, and applies logs in
 * ranges of at most `maxBlockRange` blocks. A range is applied in one transaction together
 * with the cursor, so a crash replays at most one range and never applies half of it.
 * When the RPC rejects a range (too many logs, range cap), the range is halved and retried.
 */
export class Indexer {
  private readonly writer: EventWriter
  private readonly pool: `0x${string}`
  private range: number
  private timer?: ReturnType<typeof setTimeout>
  private running = false
  private head = 0n
  private lastError?: string
  /** The adapter new calls use, tracked from AdapterSet so CallOpened needs no extra read. */
  private currentAdapter: string

  constructor(
    private readonly db: Database,
    private readonly client: PublicClient,
    private readonly cfg: ChainConfig,
  ) {
    this.writer = new EventWriter(db)
    this.pool = getAddress(cfg.deployment.trustPool)
    this.range = cfg.maxBlockRange
    this.bindDatabase()
    this.currentAdapter = meta.get(db, 'adapter') ?? cfg.deployment.adapter
  }

  get cursor(): bigint {
    return BigInt(meta.get(this.db, 'cursor') ?? this.cfg.deployment.startBlock - 1)
  }

  status(): IndexerStatus {
    const indexed = Number(this.cursor)
    return {
      chainId: this.cfg.chainId,
      trustPool: this.pool,
      indexedBlock: indexed,
      headBlock: Number(this.head),
      lastError: this.lastError,
      caughtUp: this.head > 0n && indexed >= Number(this.head) - this.cfg.confirmations,
    }
  }

  start() {
    if (this.running) return
    this.running = true
    log.info('indexer starting', { chainId: this.cfg.chainId, trustPool: this.pool, from: this.cursor + 1n })
    const loop = async () => {
      let delay = this.cfg.pollMs
      try {
        const busy = await this.tick()
        if (busy) delay = 0 // still catching up: go again straight away
        this.lastError = undefined
      } catch (err) {
        this.lastError = err instanceof Error ? err.message : String(err)
        log.error('indexer tick failed', { err })
        delay = Math.min(this.cfg.pollMs * 5, 30_000)
      }
      if (this.running) this.timer = setTimeout(loop, delay)
    }
    void loop()
  }

  stop() {
    this.running = false
    clearTimeout(this.timer)
  }

  /** Applies at most one block range. Returns true while there is more to catch up on. */
  async tick(): Promise<boolean> {
    // Chain time, not wall time: exits become executable by block timestamp.
    const latest = await this.client.getBlock({ blockTag: 'latest' })
    this.head = latest.number
    const chainNow = Number(latest.timestamp) * 1000
    const target = this.head - BigInt(this.cfg.confirmations)
    const from = this.cursor + 1n
    if (from > target) {
      this.writer.exitsNowExecutable(chainNow)
      return false
    }
    const to = from + BigInt(this.range) - 1n < target ? from + BigInt(this.range) - 1n : target

    let logs: PoolLog[]
    try {
      logs = await getPoolLogs(this.client, this.pool, from, to)
    } catch (err) {
      if (this.range > 1) {
        this.range = Math.max(1, Math.floor(this.range / 2))
        log.warn('log range rejected, shrinking', { from, to, range: this.range, err })
        return true
      }
      throw err
    }
    await this.apply(logs, to)
    if (this.range < this.cfg.maxBlockRange) this.range = Math.min(this.cfg.maxBlockRange, this.range * 2)
    if (logs.length) log.info('indexed', { from, to, events: logs.length })
    this.writer.exitsNowExecutable(chainNow)
    return to < target
  }

  /**
   * Reads everything a batch needs from the chain first, then writes the events and the
   * new cursor in one transaction.
   */
  private async apply(logs: PoolLog[], to: bigint) {
    if (!logs.length) return meta.set(this.db, 'cursor', to)
    const sorted = [...logs].sort((a, b) => Number(a.blockNumber - b.blockNumber) || a.logIndex - b.logIndex)

    const times = new Map<bigint, number>()
    await Promise.all(
      [...new Set(sorted.map((l) => l.blockNumber))].map(async (n) => {
        const block = await this.client.getBlock({ blockNumber: n })
        times.set(n, Number(block.timestamp) * 1000)
      }),
    )
    const newTokens = [
      ...new Set(sorted.flatMap((l) => (l.eventName === 'CallOpened' ? [getAddress(l.args.token)] : [])).filter((t) => !this.writer.hasToken(t))),
    ]
    const tokens = await Promise.all(newTokens.map((t) => readToken(this.client, t)))

    this.db.transaction(() => {
      tokens.forEach((t) => this.writer.upsertToken(t))
      for (const l of sorted) this.applyOne(l, { at: times.get(l.blockNumber)!, tx: l.transactionHash })
      meta.set(this.db, 'cursor', to)
    })()
  }

  private applyOne(l: PoolLog, at: At) {
    const w = this.writer
    switch (l.eventName) {
      case 'BondPosted':
        return w.bondPosted(getAddress(l.args.caller), l.args.total, at)
      case 'BondWithdrawRequested':
        return w.bondWithdrawRequested(getAddress(l.args.caller), BigInt(l.args.readyAt))
      case 'BondWithdrawn':
        return w.bondWithdrawn(getAddress(l.args.caller))
      case 'Slashed':
        return w.slashed(getAddress(l.args.caller), l.args.amount, l.args.reason, at)
      case 'CallOpened':
        return w.callOpened(
          {
            id: l.args.id,
            caller: getAddress(l.args.caller),
            token: getAddress(l.args.token),
            adapter: this.currentAdapter,
            monIn: l.args.monIn,
            tokens: l.args.tokens,
            unlockAt: BigInt(l.args.unlockAt),
            notice: l.args.notice,
            thesis: l.args.thesis,
          },
          at,
        )
      case 'ExitAnnounced':
        return w.exitAnnounced(l.args.id, BigInt(l.args.exitAt), at)
      case 'CallSettled':
        return w.callSettled(l.args.id, getAddress(l.args.caller), l.args.monOut, l.args.returnBps, at)
      case 'CallReleased':
        return w.callReleased(l.args.id, getAddress(l.args.caller), at)
      case 'CallMarkedStale':
        return w.callMarkedStale(l.args.id, getAddress(l.args.caller), at)
      case 'CallAdapterMoved':
        return w.callAdapterMoved(l.args.id, getAddress(l.args.adapter))
      case 'AdapterSet':
        this.currentAdapter = getAddress(l.args.adapter)
        meta.set(this.db, 'adapter', this.currentAdapter)
        return
      default:
        // admin bookkeeping (params, allow list, admin handover) is not served by the API
        log.debug('event not indexed', { event: l.eventName })
    }
  }

  /** Refuses to mix two deployments in one database file. */
  private bindDatabase() {
    const key = `${this.cfg.chainId}:${this.pool}`
    const bound = meta.get(this.db, 'deployment')
    if (bound && bound !== key) {
      throw new Error(`database ${this.cfg.dbPath} belongs to ${bound}, not ${key}: use another DB_PATH`)
    }
    if (!bound) meta.set(this.db, 'deployment', key)
  }
}
