import type { AlertKind } from '@trustpool/core'
import { and, eq, lte, sql } from 'drizzle-orm'
import type { Executor } from '../db/client'
import { callers, calls, slashes, tokens } from '../db/schema'
import { amount, mon, ms } from './units'

/** Postgres channel that carries every new alert, as JSON: LiveAlert. */
export const ALERT_CHANNEL = 'trustpool_alerts'

export interface TokenInfo {
  address: string
  symbol: string
  name: string
  decimals: number
  hue: number
}

/** Where an event sits on chain, and when its block was made (ms). */
export interface At {
  at: number
  tx: string
  block?: bigint
}

/**
 * Turns TrustPool events into rows. Each method mirrors the contract function that emitted
 * the event, including the record arithmetic, so the database tracks `recordOf` exactly.
 * The indexer runs these inside one transaction per block range, so a batch lands whole or
 * not at all. Addresses arrive checksummed.
 */
export class EventWriter {
  constructor(private readonly db: Executor) {}

  /** The same writer bound to a transaction. */
  in(tx: Executor): EventWriter {
    return new EventWriter(tx)
  }

  async upsertToken(t: TokenInfo) {
    await this.db
      .insert(tokens)
      .values(t)
      .onConflictDoUpdate({ target: tokens.address, set: { symbol: t.symbol, name: t.name, decimals: t.decimals } })
  }

  async tokenAllowed(address: string, allowed: boolean) {
    await this.db.update(tokens).set({ allowed }).where(eq(tokens.address, address))
  }

  async hasToken(address: string): Promise<boolean> {
    const [row] = await this.db.select({ a: tokens.address }).from(tokens).where(eq(tokens.address, address))
    return !!row
  }

  // ------------------------------------------------------------ bond

  async bondPosted(caller: string, total: bigint, e: At) {
    await this.ensureCaller(caller, e.at)
    await this.db.update(callers).set({ bondWei: total.toString(), bond: mon(total), withdrawReadyAt: null }).where(eq(callers.address, caller))
  }

  async bondWithdrawRequested(caller: string, readyAt: bigint) {
    await this.db.update(callers).set({ withdrawReadyAt: ms(readyAt) }).where(eq(callers.address, caller))
  }

  async bondWithdrawn(caller: string) {
    await this.db.update(callers).set({ bondWei: '0', bond: 0, withdrawReadyAt: null }).where(eq(callers.address, caller))
  }

  async slashed(caller: string, slashedWei: bigint, reason: string, e: At) {
    await this.ensureCaller(caller, e.at)
    const [row] = await this.db.select({ bondWei: callers.bondWei }).from(callers).where(eq(callers.address, caller))
    const left = BigInt(row?.bondWei ?? '0') - slashedWei
    await this.db
      .update(callers)
      .set({ bondWei: left.toString(), bond: mon(left), slashes: sql`${callers.slashes} + 1` })
      .where(eq(callers.address, caller))
    await this.db.insert(slashes).values({ caller, amount: mon(slashedWei), reason, at: e.at, tx: e.tx })
  }

  // ------------------------------------------------------------ calls

  async callOpened(
    c: { id: bigint; caller: string; token: string; adapter: string; monIn: bigint; tokens: bigint; unlockAt: bigint; notice: number; thesis: string },
    e: At,
  ) {
    const [token] = await this.db.select({ decimals: tokens.decimals }).from(tokens).where(eq(tokens.address, c.token))
    await this.ensureCaller(c.caller, e.at)
    const id = Number(c.id)
    await this.db
      .insert(calls)
      .values({
        id,
        caller: c.caller,
        token: c.token,
        adapter: c.adapter,
        monInWei: c.monIn.toString(),
        tokensWei: c.tokens.toString(),
        monIn: mon(c.monIn),
        tokens: amount(c.tokens, token?.decimals ?? 18),
        openedAt: e.at,
        unlockAt: ms(c.unlockAt),
        notice: ms(c.notice),
        state: 'Locked',
        thesis: c.thesis,
        openTx: e.tx,
        openBlock: e.block === undefined ? null : Number(e.block),
      })
      .onConflictDoNothing()
    await this.db
      .update(callers)
      .set({ open: sql`${callers.open} + 1`, lastActive: e.at, withdrawReadyAt: null })
      .where(eq(callers.address, c.caller))
    await this.alert('call_opened', id, e.at)
  }

  async exitAnnounced(id: bigint, exitAt: bigint, e: At) {
    await this.db.update(calls).set({ state: 'Exiting', announcedAt: e.at, exitAt: ms(exitAt) }).where(eq(calls.id, Number(id)))
    await this.alert('exit_announced', Number(id), e.at)
  }

  async callSettled(id: bigint, caller: string, monOut: bigint, returnBps: bigint, e: At) {
    const bps = Number(returnBps)
    await this.db
      .update(calls)
      .set({ state: 'Settled', monOutWei: monOut.toString(), monOut: mon(monOut), returnBps: bps, closedAt: e.at })
      .where(eq(calls.id, Number(id)))
    await this.db
      .update(callers)
      .set({
        open: sql`${callers.open} - 1`,
        settled: sql`${callers.settled} + 1`,
        losses: sql`${callers.losses} + ${bps < 0 ? 1 : 0}`,
        sumReturnBps: sql`${callers.sumReturnBps} + ${bps}`,
        lastActive: e.at,
      })
      .where(eq(callers.address, caller))
    await this.alert('call_settled', Number(id), e.at)
  }

  async callReleased(id: bigint, caller: string, e: At) {
    await this.db.update(calls).set({ state: 'Released', returnBps: -10_000, closedAt: e.at }).where(eq(calls.id, Number(id)))
    await this.db
      .update(callers)
      .set({
        open: sql`${callers.open} - 1`,
        released: sql`${callers.released} + 1`,
        losses: sql`${callers.losses} + 1`,
        sumReturnBps: sql`${callers.sumReturnBps} - 10000`,
        lastActive: e.at,
      })
      .where(eq(callers.address, caller))
    await this.alert('call_released', Number(id), e.at)
  }

  async callMarkedStale(id: bigint, caller: string, e: At) {
    await this.db.update(calls).set({ stale: true }).where(eq(calls.id, Number(id)))
    await this.db.update(callers).set({ stale: sql`${callers.stale} + 1` }).where(eq(callers.address, caller))
    await this.alert('call_stale', Number(id), e.at)
  }

  async callAdapterMoved(id: bigint, adapter: string) {
    await this.db.update(calls).set({ adapter }).where(eq(calls.id, Number(id)))
  }

  // ------------------------------------------------------------ time-based alerts

  /** Alerts for exits whose notice has run out. Idempotent: one per user and call. */
  async exitsNowExecutable(now: number): Promise<number> {
    const due = await this.db
      .select({ id: calls.id, exitAt: calls.exitAt })
      .from(calls)
      .where(and(eq(calls.state, 'Exiting'), lte(calls.exitAt, now)))
    for (const c of due) await this.alert('exit_executable', c.id, c.exitAt!)
    return due.length
  }

  // ------------------------------------------------------------ internal

  /**
   * One alert per follower of the caller and per watcher of the call. A user who both
   * follows and watches gets one. The unique key makes a replayed event harmless.
   * Each new alert is announced on ALERT_CHANNEL; Postgres delivers it only if the
   * surrounding transaction commits, so a rolled-back range never reaches a browser.
   */
  private async alert(kind: AlertKind, callId: number, at: number) {
    await this.db.execute(sql`
      WITH inserted AS (
        INSERT INTO alerts (user_id, kind, call_id, at)
        SELECT user_id, ${kind}, ${callId}, ${at} FROM (
          SELECT f.user_id FROM follows f JOIN calls c ON c.caller = f.caller WHERE c.id = ${callId}
          UNION
          SELECT w.user_id FROM watches w WHERE w.call_id = ${callId}
        ) AS recipients
        ON CONFLICT ON CONSTRAINT alerts_once DO NOTHING
        RETURNING id, user_id, kind, call_id, at
      )
      SELECT pg_notify(${ALERT_CHANNEL}, json_build_object('id', id::text, 'userId', user_id, 'kind', kind, 'callId', call_id, 'at', at)::text)
      FROM inserted`)
  }

  private async ensureCaller(address: string, at: number) {
    await this.db.insert(callers).values({ address, firstSeen: at }).onConflictDoNothing()
  }
}
