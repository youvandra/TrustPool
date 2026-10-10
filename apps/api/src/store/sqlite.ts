import type { Database } from 'bun:sqlite'
import type { Alert, AlertKind, Call, Caller, CallState, Slash, Token } from '@trustpool/core'
import type { CallFilter, Store } from './types'

interface CallRow {
  id: number
  caller: string
  token: string
  mon_in: number
  tokens: number
  mon_out: number | null
  opened_at: number
  unlock_at: number
  notice: number
  announced_at: number | null
  exit_at: number | null
  state: CallState
  stale: number
  thesis: string
  marked_value: number | null
  marked_at: number | null
  watchers: number
}

interface CallerRow {
  address: string
  bond: number
  first_seen: number
  settled: number
  losses: number
  released: number
  open: number
  slashes: number
  stale: number
  sum_return_bps: number
  last_active: number
  followers: number
}

/** Longest sparkline served; older samples are thinned evenly. */
const MAX_SERIES = 60

const CALL_SELECT = `
  SELECT c.*, (SELECT COUNT(*) FROM watches w WHERE w.call_id = c.id) AS watchers
  FROM calls c`

const CALLER_SELECT = `
  SELECT k.*, (SELECT COUNT(*) FROM follows f WHERE f.caller = k.address) AS followers
  FROM callers k`

export const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

/** Reads the indexed chain data and keeps per-user state, all in one SQLite file. */
export function sqliteStore(db: Database): Store {
  const tokenMap = () => new Map(listTokens().map((t) => [t.address.toLowerCase(), t]))

  function listTokens(): Token[] {
    return db.query<Token, []>('SELECT address, symbol, name, hue FROM tokens ORDER BY symbol').all()
  }

  function seriesFor(rows: CallRow[]): Map<number, number[]> {
    const out = new Map<number, number[]>()
    if (!rows.length) return out
    const ids = rows.map((r) => r.id)
    const samples = db
      .query<{ call_id: number; price: number }, number[]>(
        `SELECT call_id, price FROM prices WHERE call_id IN (${ids.map(() => '?').join(',')}) ORDER BY call_id, at`,
      )
      .all(...ids)
    for (const s of samples) {
      const list = out.get(s.call_id) ?? []
      list.push(s.price)
      out.set(s.call_id, list)
    }
    for (const r of rows) {
      const entry = r.mon_in / r.tokens
      const series = [entry, ...thin(out.get(r.id) ?? [], MAX_SERIES - 2)]
      if (r.state === 'Settled' && r.mon_out !== null) series.push(r.mon_out / r.tokens)
      if (series.length === 1) series.push(entry) // a sparkline needs two points
      out.set(r.id, series)
    }
    return out
  }

  function toCalls(rows: CallRow[]): Call[] {
    const tokens = tokenMap()
    const series = seriesFor(rows)
    return rows.map((r) => {
      const token = tokens.get(r.token.toLowerCase()) ?? { address: r.token, symbol: '?', name: 'Unknown token', hue: 0 }
      const open = r.state === 'Locked' || r.state === 'Exiting'
      return {
        id: r.id,
        caller: r.caller,
        token,
        monIn: r.mon_in,
        tokens: r.tokens,
        openedAt: r.opened_at,
        unlockAt: r.unlock_at,
        notice: r.notice,
        announcedAt: r.announced_at ?? undefined,
        exitAt: r.exit_at ?? undefined,
        monOut: r.mon_out ?? undefined,
        state: r.state,
        thesis: r.thesis,
        series: series.get(r.id)!,
        watchers: r.watchers,
        stale: r.stale === 1,
        markedValue: open ? (r.marked_value ?? undefined) : undefined,
        markedAt: open ? (r.marked_at ?? undefined) : undefined,
      }
    })
  }

  function toCaller(r: CallerRow): Caller {
    const slashHistory = db
      .query<Slash, [string]>('SELECT amount, reason, at FROM slashes WHERE caller = ? ORDER BY at DESC')
      .all(r.address)
    return {
      address: r.address,
      handle: shortAddress(r.address),
      followers: r.followers,
      joinedAt: r.first_seen,
      bond: r.bond,
      record: {
        settled: r.settled,
        losses: r.losses,
        released: r.released,
        open: r.open,
        slashes: r.slashes,
        stale: r.stale,
        sumReturnBps: r.sum_return_bps,
        lastActive: r.last_active,
      },
      slashHistory,
    }
  }

  return {
    source: 'chain',

    listCalls(f: CallFilter = {}) {
      const where: string[] = []
      const args: (string | number)[] = []
      if (f.state?.length) {
        where.push(`c.state IN (${f.state.map(() => '?').join(',')})`)
        args.push(...f.state)
      }
      if (f.caller) {
        where.push('c.caller = ?')
        args.push(f.caller)
      }
      const sql = `${CALL_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY c.opened_at DESC, c.id DESC LIMIT ? OFFSET ?`
      args.push(f.limit ?? -1, f.offset ?? 0)
      return toCalls(db.query<CallRow, (string | number)[]>(sql).all(...args))
    },

    getCall(id) {
      const row = db.query<CallRow, [number]>(`${CALL_SELECT} WHERE c.id = ?`).get(id)
      return row ? toCalls([row])[0] : undefined
    },

    listCallers() {
      return db.query<CallerRow, []>(`${CALLER_SELECT} ORDER BY k.last_active DESC`).all().map(toCaller)
    },

    getCaller(address) {
      const row = db.query<CallerRow, [string]>(`${CALLER_SELECT} WHERE k.address = ?`).get(address)
      return row ? toCaller(row) : undefined
    },

    listTokens,

    following(user) {
      return db
        .query<{ caller: string }, [string]>('SELECT caller FROM follows WHERE user_id = ? ORDER BY at')
        .all(user)
        .map((r) => r.caller)
    },

    setFollow(user, caller, on) {
      if (on) db.query('INSERT OR IGNORE INTO follows (user_id, caller, at) VALUES (?, ?, ?)').run(user, caller, Date.now())
      else db.query('DELETE FROM follows WHERE user_id = ? AND caller = ?').run(user, caller)
    },

    watching(user) {
      return db
        .query<{ call_id: number }, [string]>('SELECT call_id FROM watches WHERE user_id = ? ORDER BY at')
        .all(user)
        .map((r) => r.call_id)
    },

    setWatch(user, callId, on) {
      if (on) db.query('INSERT OR IGNORE INTO watches (user_id, call_id, at) VALUES (?, ?, ?)').run(user, callId, Date.now())
      else db.query('DELETE FROM watches WHERE user_id = ? AND call_id = ?').run(user, callId)
    },

    alerts(user, limit = 100): Alert[] {
      return db
        .query<{ id: number; kind: AlertKind; call_id: number; at: number; read: number }, [string, number]>(
          'SELECT id, kind, call_id, at, read FROM alerts WHERE user_id = ? ORDER BY at DESC, id DESC LIMIT ?',
        )
        .all(user, limit)
        .map((a) => ({ id: String(a.id), kind: a.kind, callId: a.call_id, at: a.at, read: a.read === 1 }))
    },

    markRead(user, ids) {
      const numeric = ids.map(Number).filter(Number.isInteger)
      if (!numeric.length) return
      db.query(`UPDATE alerts SET read = 1 WHERE user_id = ? AND id IN (${numeric.map(() => '?').join(',')})`).run(user, ...numeric)
    },
  }
}

/** Keeps at most `n` points, evenly spaced, always including the newest. */
export function thin<T>(xs: T[], n: number): T[] {
  if (xs.length <= n) return xs
  const out: T[] = []
  const step = (xs.length - 1) / (n - 1)
  for (let i = 0; i < n; i++) out.push(xs[Math.round(i * step)]!)
  return out
}
