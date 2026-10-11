import type { AlertKind } from '@trustpool/core'
import { and, eq, gt, sql } from 'drizzle-orm'
import type { Executor } from '../db/client'
import { callers, calls, claims, deposits, prices, slashes, tokens } from '../db/schema'
import { amount, mon, ms } from './units'

/**
 * Postgres channel that carries every new alert as JSON `{ id, userId, kind, callId, at }`.
 * Each call event also sends one broadcast with `userId: null`, whether or not anyone
 * follows the caller, for channel-wide feeds such as Telegram.
 */
export const ALERT_CHANNEL = 'trustpool_alerts'

/** A window counts as closing in its last quarter, and at most its last 30 minutes. */
export const closingLead = (windowMs: number) => Math.min(30 * 60_000, Math.floor(windowMs / 4))

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

/** The `Rules` tuple of CallOpened, as viem decodes it. */
export interface RulesArgs {
  adapter: string
  windowEnd: number
  buyDeadline: number
  maxHold: number
  takeProfitBps: number
  stopLossBps: number
  shareBps: number
  minCallerBps: number
  maxImpactBps: number
  sellToleranceBps: number
  keeperBps: number
  checkpointGap: number
  splitGrace: number
  cap: bigint
  minPool: bigint
}

const REASONS = ['take_profit', 'stop_loss', 'max_hold'] as const

/**
 * Turns TrustPool events into rows. Each method mirrors the contract function that emitted
 * the event, including the record arithmetic, so the database tracks `recordOf` exactly.
 * Amounts that events carry as totals (deposit, pool total) are written as totals, so a
 * replayed event lands on the same row. The indexer runs these inside one transaction per
 * block range, so a batch lands whole or not at all. Addresses arrive checksummed.
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

  async callOpened(c: { id: bigint; caller: string; token: string; tier: number; rules: RulesArgs; thesis: string }, e: At) {
    const r = c.rules
    await this.ensureCaller(c.caller, e.at)
    const id = Number(c.id)
    await this.db
      .insert(calls)
      .values({
        id,
        caller: c.caller,
        token: c.token,
        adapter: r.adapter,
        tier: c.tier,
        thesis: c.thesis,
        openedAt: e.at,
        state: 'Open',
        windowEnd: ms(r.windowEnd),
        buyDeadline: ms(r.buyDeadline),
        maxHold: ms(r.maxHold),
        takeProfitBps: r.takeProfitBps,
        stopLossBps: r.stopLossBps,
        shareBps: r.shareBps,
        minCallerBps: r.minCallerBps,
        maxImpactBps: r.maxImpactBps,
        sellToleranceBps: r.sellToleranceBps,
        keeperBps: r.keeperBps,
        checkpointGap: ms(r.checkpointGap),
        splitGrace: ms(r.splitGrace),
        capWei: r.cap.toString(),
        cap: mon(r.cap),
        minPoolWei: r.minPool.toString(),
        minPool: mon(r.minPool),
        openTx: e.tx,
        openBlock: e.block === undefined ? null : Number(e.block),
      })
      .onConflictDoNothing()
    await this.db
      .update(callers)
      .set({ active: sql`${callers.active} + 1`, lastActive: e.at, withdrawReadyAt: null })
      .where(eq(callers.address, c.caller))
    await this.alert('window_opened', id, e.at)
  }

  /** Deposited and Withdrawn both carry the account's new deposit and the pool's new total. */
  async depositChanged(id: bigint, account: string, depositWei: bigint, totalWei: bigint, e: At) {
    const callId = Number(id)
    await this.db
      .insert(deposits)
      .values({ callId, account, depositWei: depositWei.toString(), deposit: mon(depositWei), firstAt: e.at, lastAt: e.at })
      .onConflictDoUpdate({
        target: [deposits.callId, deposits.account],
        set: { depositWei: depositWei.toString(), deposit: mon(depositWei), lastAt: e.at },
      })
    const [call] = await this.db.select({ caller: calls.caller }).from(calls).where(eq(calls.id, callId))
    const stake = call?.caller === account ? { callerStakeWei: depositWei.toString(), callerStake: mon(depositWei) } : {}
    await this.db
      .update(calls)
      .set({
        ...stake,
        totalInWei: totalWei.toString(),
        totalIn: mon(totalWei),
        depositors: sql`(SELECT COUNT(*)::int FROM ${deposits} WHERE ${deposits.callId} = ${callId} AND ${deposits.depositWei} > 0)`,
      })
      .where(eq(calls.id, callId))
  }

  async bought(id: bigint, tokensWei: bigint, holdUntil: bigint, e: At) {
    const callId = Number(id)
    const [row] = await this.db
      .select({ caller: calls.caller, decimals: tokens.decimals, totalIn: calls.totalIn })
      .from(calls)
      .leftJoin(tokens, eq(tokens.address, calls.token))
      .where(eq(calls.id, callId))
    if (!row) return
    const t = amount(tokensWei, row.decimals ?? 18)
    await this.db
      .update(calls)
      .set({
        state: 'Holding',
        tokensWei: tokensWei.toString(),
        tokens: t,
        boughtAt: e.at,
        holdUntil: ms(holdUntil),
        buyBlock: e.block === undefined ? null : Number(e.block),
        liveCap: null,
      })
      .where(eq(calls.id, callId))
    await this.db.update(callers).set({ lastActive: e.at }).where(eq(callers.address, row.caller))
    await this.alert('bought', callId, e.at)
  }

  async checkpointed(id: bigint, valueWei: bigint, atSec: bigint) {
    const callId = Number(id)
    const at = ms(atSec)
    const value = mon(valueWei)
    await this.db
      .update(calls)
      .set({ prevValue: sql`${calls.lastValue}`, prevAt: sql`${calls.lastAt}`, lastValueWei: valueWei.toString(), lastValue: value, lastAt: at })
      .where(and(eq(calls.id, callId), sql`${calls.lastAt} IS DISTINCT FROM ${at}`))
    const [row] = await this.db.select({ tokens: calls.tokens }).from(calls).where(eq(calls.id, callId))
    if (row?.tokens) await this.db.insert(prices).values({ callId, at, price: value / row.tokens }).onConflictDoNothing()
  }

  async sold(
    s: { id: bigint; keeper: string; reason: number; gross: bigint; keeperReward: bigint; fee: bigint; payout: bigint; netReturnBps: bigint },
    e: At,
  ) {
    const callId = Number(s.id)
    const bps = Number(s.netReturnBps)
    const [row] = await this.db.select({ caller: calls.caller }).from(calls).where(eq(calls.id, callId))
    if (!row) return
    await this.db
      .update(calls)
      .set({
        state: 'Settled',
        saleReason: REASONS[s.reason - 1] ?? 'max_hold',
        keeper: s.keeper,
        grossWei: s.gross.toString(),
        gross: mon(s.gross),
        keeperReward: mon(s.keeperReward),
        feeWei: s.fee.toString(),
        fee: mon(s.fee),
        payoutWei: s.payout.toString(),
        payout: mon(s.payout),
        netReturnBps: bps,
        closedAt: e.at,
        markedValue: null,
        markedAt: null,
      })
      .where(eq(calls.id, callId))
    await this.db
      .update(callers)
      .set({
        active: sql`${callers.active} - 1`,
        settled: sql`${callers.settled} + 1`,
        losses: sql`${callers.losses} + ${bps < 0 ? 1 : 0}`,
        sumNetBps: sql`${callers.sumNetBps} + ${bps}`,
        lastActive: e.at,
      })
      .where(eq(callers.address, row.caller))
    await this.alert('sold', callId, e.at)
  }

  async refunded(id: bigint, negligent: boolean, e: At) {
    const callId = Number(id)
    const [row] = await this.db.select({ caller: calls.caller }).from(calls).where(eq(calls.id, callId))
    if (!row) return
    await this.db.update(calls).set({ state: 'Refunded', negligent, closedAt: e.at, liveCap: null }).where(eq(calls.id, callId))
    await this.db
      .update(callers)
      .set({
        active: sql`${callers.active} - 1`,
        negligent: sql`${callers.negligent} + ${negligent ? 1 : 0}`,
        refunded: sql`${callers.refunded} + ${negligent ? 0 : 1}`,
      })
      .where(eq(callers.address, row.caller))
    await this.alert('refunded', callId, e.at)
  }

  async splitStarted(id: bigint, e: At) {
    const callId = Number(id)
    const [row] = await this.db.select({ caller: calls.caller }).from(calls).where(eq(calls.id, callId))
    if (!row) return
    await this.db.update(calls).set({ state: 'Split', closedAt: e.at, markedValue: null, markedAt: null }).where(eq(calls.id, callId))
    await this.db
      .update(callers)
      .set({ active: sql`${callers.active} - 1`, split: sql`${callers.split} + 1`, lastActive: e.at })
      .where(eq(callers.address, row.caller))
    await this.alert('split', callId, e.at)
  }

  async claimed(id: bigint, account: string, monWei: bigint, tokensWei: bigint, e: At) {
    const callId = Number(id)
    const [row] = await this.db
      .select({ decimals: tokens.decimals })
      .from(calls)
      .leftJoin(tokens, eq(tokens.address, calls.token))
      .where(eq(calls.id, callId))
    await this.db
      .insert(claims)
      .values({
        callId,
        account,
        monWei: monWei.toString(),
        mon: mon(monWei),
        tokensWei: tokensWei.toString(),
        tokens: amount(tokensWei, row?.decimals ?? 18),
        at: e.at,
        tx: e.tx,
      })
      .onConflictDoNothing()
  }

  // ------------------------------------------------------------ time-based alerts

  /** "Window closing" for open windows in their last stretch. Sent once per call, by flag. */
  async windowsClosing(now: number): Promise<number> {
    const due = await this.db
      .select({ id: calls.id, openedAt: calls.openedAt, windowEnd: calls.windowEnd })
      .from(calls)
      .where(and(eq(calls.state, 'Open'), eq(calls.closingAlerted, false), gt(calls.windowEnd, now)))
    let n = 0
    for (const c of due) {
      if (c.windowEnd - now > closingLead(c.windowEnd - c.openedAt)) continue
      await this.db.update(calls).set({ closingAlerted: true }).where(eq(calls.id, c.id))
      await this.alert('window_closing', c.id, now)
      n++
    }
    return n
  }

  // ------------------------------------------------------------ internal

  /**
   * One alert per follower of the caller and per watcher of the call. A user who both
   * follows and watches gets one. The unique key makes a replayed event harmless.
   * Each new alert is announced on ALERT_CHANNEL; Postgres delivers it only if the
   * surrounding transaction commits, so a rolled-back range never reaches a browser.
   * Every kind also goes out once as a broadcast, for channel feeds.
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
    await this.db.execute(
      sql`SELECT pg_notify(${ALERT_CHANNEL}, json_build_object('id', NULL, 'userId', NULL, 'kind', ${kind}::text, 'callId', ${callId}::int, 'at', ${at}::bigint)::text)`,
    )
  }

  private async ensureCaller(address: string, at: number) {
    await this.db.insert(callers).values({ address, firstSeen: at }).onConflictDoNothing()
  }
}
