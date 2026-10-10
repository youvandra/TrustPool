import type { Database } from 'bun:sqlite'
import type { AlertKind } from '@trustpool/core'
import { amount, mon, ms } from './units'

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
}

/**
 * Turns TrustPool events into rows. Each method mirrors the contract function that emitted
 * the event, including the record arithmetic, so the database tracks `recordOf` exactly.
 * Callers run these inside one transaction per block range (see Indexer), so a batch lands
 * whole or not at all.
 */
export class EventWriter {
  constructor(private readonly db: Database) {}

  upsertToken(t: TokenInfo) {
    this.db
      .query(
        `INSERT INTO tokens (address, symbol, name, decimals, hue) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (address) DO UPDATE SET symbol = excluded.symbol, name = excluded.name, decimals = excluded.decimals`,
      )
      .run(t.address, t.symbol, t.name, t.decimals, t.hue)
  }

  hasToken(address: string): boolean {
    return this.db.query('SELECT 1 FROM tokens WHERE address = ?').get(address) !== null
  }

  // ------------------------------------------------------------ bond

  bondPosted(caller: string, total: bigint, e: At) {
    this.ensureCaller(caller, e.at)
    this.db.query('UPDATE callers SET bond_wei = ?, bond = ?, withdraw_ready_at = NULL WHERE address = ?').run(total.toString(), mon(total), caller)
  }

  bondWithdrawRequested(caller: string, readyAt: bigint) {
    this.db.query('UPDATE callers SET withdraw_ready_at = ? WHERE address = ?').run(ms(readyAt), caller)
  }

  bondWithdrawn(caller: string) {
    this.db.query(`UPDATE callers SET bond_wei = '0', bond = 0, withdraw_ready_at = NULL WHERE address = ?`).run(caller)
  }

  slashed(caller: string, slashedWei: bigint, reason: string, e: At) {
    this.ensureCaller(caller, e.at)
    const left = this.bondWei(caller) - slashedWei
    this.db
      .query('UPDATE callers SET bond_wei = ?, bond = ?, slashes = slashes + 1 WHERE address = ?')
      .run(left.toString(), mon(left), caller)
    this.db.query('INSERT INTO slashes (caller, amount, reason, at, tx) VALUES (?, ?, ?, ?, ?)').run(caller, mon(slashedWei), reason, e.at, e.tx)
  }

  // ------------------------------------------------------------ calls

  callOpened(
    c: { id: bigint; caller: string; token: string; adapter: string; monIn: bigint; tokens: bigint; unlockAt: bigint; notice: number; thesis: string },
    e: At,
  ) {
    const decimals = this.db.query<{ decimals: number }, [string]>('SELECT decimals FROM tokens WHERE address = ?').get(c.token)?.decimals ?? 18
    this.ensureCaller(c.caller, e.at)
    this.db
      .query(
        `INSERT OR IGNORE INTO calls (id, caller, token, adapter, mon_in_wei, tokens_wei, mon_in, tokens, opened_at, unlock_at, notice, state, thesis, open_tx)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Locked', ?, ?)`,
      )
      .run(
        Number(c.id), c.caller, c.token, c.adapter, c.monIn.toString(), c.tokens.toString(), mon(c.monIn),
        amount(c.tokens, decimals), e.at, ms(c.unlockAt), ms(c.notice), c.thesis, e.tx,
      )
    this.db.query('UPDATE callers SET open = open + 1, last_active = ?, withdraw_ready_at = NULL WHERE address = ?').run(e.at, c.caller)
    this.alert('call_opened', Number(c.id), e.at)
  }

  exitAnnounced(id: bigint, exitAt: bigint, e: At) {
    this.db.query(`UPDATE calls SET state = 'Exiting', announced_at = ?, exit_at = ? WHERE id = ?`).run(e.at, ms(exitAt), Number(id))
    this.alert('exit_announced', Number(id), e.at)
  }

  callSettled(id: bigint, caller: string, monOut: bigint, returnBps: bigint, e: At) {
    const bps = Number(returnBps)
    this.db
      .query(`UPDATE calls SET state = 'Settled', mon_out_wei = ?, mon_out = ?, return_bps = ?, closed_at = ? WHERE id = ?`)
      .run(monOut.toString(), mon(monOut), bps, e.at, Number(id))
    this.db
      .query(
        `UPDATE callers SET open = open - 1, settled = settled + 1, losses = losses + ?, sum_return_bps = sum_return_bps + ?, last_active = ?
         WHERE address = ?`,
      )
      .run(bps < 0 ? 1 : 0, bps, e.at, caller)
    this.alert('call_settled', Number(id), e.at)
  }

  callReleased(id: bigint, caller: string, e: At) {
    this.db.query(`UPDATE calls SET state = 'Released', return_bps = -10000, closed_at = ? WHERE id = ?`).run(e.at, Number(id))
    this.db
      .query(
        `UPDATE callers SET open = open - 1, released = released + 1, losses = losses + 1, sum_return_bps = sum_return_bps - 10000, last_active = ?
         WHERE address = ?`,
      )
      .run(e.at, caller)
    this.alert('call_released', Number(id), e.at)
  }

  callMarkedStale(id: bigint, caller: string, e: At) {
    this.db.query('UPDATE calls SET stale = 1 WHERE id = ?').run(Number(id))
    this.db.query('UPDATE callers SET stale = stale + 1 WHERE address = ?').run(caller)
    this.alert('call_stale', Number(id), e.at)
  }

  callAdapterMoved(id: bigint, adapter: string) {
    this.db.query('UPDATE calls SET adapter = ? WHERE id = ?').run(adapter, Number(id))
  }

  // ------------------------------------------------------------ time-based alerts

  /** Alerts for exits whose notice has run out. Idempotent: one per user and call. */
  exitsNowExecutable(now: number): number {
    const due = this.db
      .query<{ id: number; exit_at: number }, [number]>(`SELECT id, exit_at FROM calls WHERE state = 'Exiting' AND exit_at <= ?`)
      .all(now)
    for (const c of due) this.alert('exit_executable', c.id, c.exit_at)
    return due.length
  }

  // ------------------------------------------------------------ internal

  /**
   * One alert per follower of the caller and per watcher of the call. A user who both
   * follows and watches gets one. The unique key makes a replayed event harmless.
   */
  private alert(kind: AlertKind, callId: number, at: number) {
    this.db
      .query(
        `INSERT OR IGNORE INTO alerts (user_id, kind, call_id, at)
         SELECT user_id, ?1, ?2, ?3 FROM (
           SELECT f.user_id FROM follows f JOIN calls c ON c.caller = f.caller WHERE c.id = ?2
           UNION
           SELECT w.user_id FROM watches w WHERE w.call_id = ?2
         )`,
      )
      .run(kind, callId, at)
  }

  private ensureCaller(address: string, at: number) {
    this.db.query('INSERT OR IGNORE INTO callers (address, first_seen) VALUES (?, ?)').run(address, at)
  }

  private bondWei(caller: string): bigint {
    return BigInt(this.db.query<{ bond_wei: string }, [string]>('SELECT bond_wei FROM callers WHERE address = ?').get(caller)?.bond_wei ?? '0')
  }
}
