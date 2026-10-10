import { trustPoolAbi } from '@trustpool/core'
import { getAddress, type PublicClient } from 'viem'
import type { ChainConfig } from '../config'
import { metaKv, type Database, type Db } from '../db/client'
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
  /** False on API instances that serve reads while another instance holds the indexer lock. */
  leader: boolean
}

/**
 * Follows TrustPool events into Postgres.
 *
 * Only the instance holding the indexer advisory lock indexes; the others retry the lock
 * every few polls, so a replacement takes over when the leader dies.
 *
 * Each tick reads the head, stays `confirmations` blocks behind it, and applies logs in
 * ranges of at most `maxBlockRange` blocks. A range is applied in one transaction together
 * with the cursor, so a crash replays at most one range and never applies half of it.
 * When the RPC rejects a range (too many logs, range cap), the range is halved and retried.
 */
export class Indexer {
  private readonly db: Db
  private readonly writer: EventWriter
  private readonly pool: `0x${string}`
  private range: number
  private timer?: ReturnType<typeof setTimeout>
  private running = false
  private leader = false
  private head = 0n
  private indexed = -1n
  private lastError?: string
  /** The adapter new calls use, tracked from AdapterSet so CallOpened needs no extra read. */
  private currentAdapter: string

  constructor(
    private readonly database: Database,
    private readonly client: PublicClient,
    private readonly cfg: ChainConfig,
  ) {
    this.db = database.db
    this.writer = new EventWriter(this.db)
    this.pool = getAddress(cfg.deployment.trustPool)
    this.range = cfg.maxBlockRange
    this.currentAdapter = cfg.deployment.adapter
  }

  /** Binds the database to this deployment and loads the saved state. Call once before ticking. */
  async init(): Promise<this> {
    const key = `${this.cfg.chainId}:${this.pool}`
    const bound = await metaKv.get(this.db, 'deployment')
    if (bound && bound !== key) throw new Error(`this database belongs to ${bound}, not ${key}: use another DATABASE_URL`)
    if (!bound) await metaKv.set(this.db, 'deployment', key)
    this.currentAdapter = (await metaKv.get(this.db, 'adapter')) ?? this.currentAdapter
    this.indexed = await this.cursor()
    return this
  }

  private async cursor(): Promise<bigint> {
    return BigInt((await metaKv.get(this.db, 'cursor')) ?? this.cfg.deployment.startBlock - 1)
  }

  status(): IndexerStatus {
    const indexed = Number(this.indexed)
    return {
      chainId: this.cfg.chainId,
      trustPool: this.pool,
      indexedBlock: indexed,
      headBlock: Number(this.head),
      lastError: this.lastError,
      caughtUp: this.head > 0n && indexed >= Number(this.head) - this.cfg.confirmations,
      leader: this.leader,
    }
  }

  start() {
    if (this.running) return
    this.running = true
    log.info('indexer starting', { chainId: this.cfg.chainId, trustPool: this.pool, from: this.indexed + 1n })
    let polls = 0
    const loop = async () => {
      let delay = this.cfg.pollMs
      try {
        if (!this.leader && polls++ % 10 === 0) {
          this.leader = await this.database.tryIndexerLock()
          if (this.leader) log.info('indexer lock taken: this instance indexes')
          else log.info('indexer lock held elsewhere: serving reads only')
        }
        if (!this.leader) {
          this.indexed = await this.cursor() // keep /health honest from the shared database
          if (this.running) this.timer = setTimeout(loop, delay)
          return
        }
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
    const from = this.indexed + 1n
    if (from > target) {
      await this.writer.exitsNowExecutable(chainNow)
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
    await this.writer.exitsNowExecutable(chainNow)
    return to < target
  }

  /**
   * Reads everything a batch needs from the chain first, then writes the events and the
   * new cursor in one transaction.
   */
  private async apply(logs: PoolLog[], to: bigint) {
    if (!logs.length) {
      await metaKv.set(this.db, 'cursor', to)
      this.indexed = to
      return
    }
    const sorted = [...logs].sort((a, b) => Number(a.blockNumber - b.blockNumber) || a.logIndex - b.logIndex)

    const times = new Map<bigint, number>()
    await Promise.all(
      [...new Set(sorted.map((l) => l.blockNumber))].map(async (n) => {
        const block = await this.client.getBlock({ blockNumber: n })
        times.set(n, Number(block.timestamp) * 1000)
      }),
    )
    const opened = [...new Set(sorted.flatMap((l) => (l.eventName === 'CallOpened' ? [getAddress(l.args.token)] : [])))]
    const known = await Promise.all(opened.map((t) => this.writer.hasToken(t)))
    const tokens = await Promise.all(opened.filter((_, i) => !known[i]).map((t) => readToken(this.client, t)))

    let adapter = this.currentAdapter
    await this.db.transaction(async (tx) => {
      const w = this.writer.in(tx)
      for (const t of tokens) await w.upsertToken(t)
      for (const l of sorted) {
        if (l.eventName === 'AdapterSet') {
          adapter = getAddress(l.args.adapter)
          await metaKv.set(tx, 'adapter', adapter)
          continue
        }
        await this.applyOne(w, l, { at: times.get(l.blockNumber)!, tx: l.transactionHash, block: l.blockNumber }, adapter)
      }
      await metaKv.set(tx, 'cursor', to)
    })
    // Only after the commit: a rolled-back range must not move the in-memory state.
    this.currentAdapter = adapter
    this.indexed = to
  }

  private async applyOne(w: EventWriter, l: PoolLog, at: At, adapter: string): Promise<void> {
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
            adapter,
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
      default:
        // admin bookkeeping (params, allow list, admin handover) is not served by the API
        log.debug('event not indexed', { event: l.eventName })
    }
  }
}
