import type { Alert, AlertKind, Call, Caller, Token } from '@trustpool/core'
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import { getAddress } from 'viem'
import type { Db } from '../db/client'
import { alerts, callers, calls, follows, prices, profiles, slashes, tokens, watches } from '../db/schema'
import type { CallFilter, Store } from './types'

/** Longest sparkline served; older samples are thinned evenly. */
const MAX_SERIES = 60

export const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

type CallRow = typeof calls.$inferSelect & { watchers: number }
type CallerRow = typeof callers.$inferSelect & { followers: number; handle: string | null; bio: string | null }

/** Reads the indexed chain data and keeps per-user state, in Postgres. */
export function postgresStore(db: Db): Store {
  const watcherCount = sql<number>`(SELECT COUNT(*)::int FROM ${watches} WHERE ${watches.callId} = ${calls.id})`.as('watchers')
  const followerCount = sql<number>`(SELECT COUNT(*)::int FROM ${follows} WHERE ${follows.caller} = ${callers.address})`.as('followers')

  const selectCalls = () => db.select({ c: calls, watchers: watcherCount }).from(calls)
  const selectCallers = () =>
    db
      .select({ k: callers, followers: followerCount, handle: profiles.handle, bio: profiles.bio })
      .from(callers)
      .leftJoin(profiles, eq(profiles.address, callers.address))

  async function listTokens(): Promise<Token[]> {
    return db.select({ address: tokens.address, symbol: tokens.symbol, name: tokens.name, hue: tokens.hue }).from(tokens).orderBy(asc(tokens.symbol))
  }

  async function toCalls(rows: CallRow[]): Promise<Call[]> {
    if (!rows.length) return []
    const tokenMap = new Map((await listTokens()).map((t) => [t.address, t]))
    const ids = rows.map((r) => r.id)
    const samples = await db
      .select({ callId: prices.callId, price: prices.price })
      .from(prices)
      .where(inArray(prices.callId, ids))
      .orderBy(asc(prices.callId), asc(prices.at))
    const byCall = new Map<number, number[]>()
    for (const s of samples) byCall.set(s.callId, [...(byCall.get(s.callId) ?? []), s.price])

    return rows.map((r) => {
      const entry = r.monIn / r.tokens
      const series = [entry, ...thin(byCall.get(r.id) ?? [], MAX_SERIES - 2)]
      if (r.state === 'Settled' && r.monOut !== null) series.push(r.monOut / r.tokens)
      if (series.length === 1) series.push(entry) // a sparkline needs two points
      const open = r.state === 'Locked' || r.state === 'Exiting'
      return {
        id: r.id,
        caller: r.caller,
        token: tokenMap.get(r.token) ?? { address: r.token, symbol: '?', name: 'Unknown token', hue: 0 },
        monIn: r.monIn,
        tokens: r.tokens,
        openedAt: r.openedAt,
        unlockAt: r.unlockAt,
        notice: r.notice,
        announcedAt: r.announcedAt ?? undefined,
        exitAt: r.exitAt ?? undefined,
        monOut: r.monOut ?? undefined,
        state: r.state,
        thesis: r.thesis,
        series,
        watchers: r.watchers,
        stale: r.stale,
        markedValue: open ? (r.markedValue ?? undefined) : undefined,
        markedAt: open ? (r.markedAt ?? undefined) : undefined,
      }
    })
  }

  async function toCallers(rows: CallerRow[]): Promise<Caller[]> {
    if (!rows.length) return []
    const history = await db
      .select({ caller: slashes.caller, amount: slashes.amount, reason: slashes.reason, at: slashes.at })
      .from(slashes)
      .where(inArray(slashes.caller, rows.map((r) => r.address)))
      .orderBy(desc(slashes.at))
    return rows.map((r) => ({
      address: r.address,
      handle: r.handle ?? shortAddress(r.address),
      bio: r.bio ?? undefined,
      followers: r.followers,
      joinedAt: r.firstSeen,
      bond: r.bond,
      record: {
        settled: r.settled,
        losses: r.losses,
        released: r.released,
        open: r.open,
        slashes: r.slashes,
        stale: r.stale,
        sumReturnBps: r.sumReturnBps,
        lastActive: r.lastActive,
      },
      slashHistory: history.filter((s) => s.caller === r.address).map(({ amount, reason, at }) => ({ amount, reason, at })),
    }))
  }

  const flatCalls = (rows: { c: typeof calls.$inferSelect; watchers: number }[]) => rows.map((r) => ({ ...r.c, watchers: r.watchers }))
  const flatCallers = (rows: { k: typeof callers.$inferSelect; followers: number; handle: string | null; bio: string | null }[]) =>
    rows.map((r) => ({ ...r.k, followers: r.followers, handle: r.handle, bio: r.bio }))

  return {
    source: 'chain',

    async listCalls(f: CallFilter = {}) {
      const where = and(
        f.state?.length ? inArray(calls.state, f.state) : undefined,
        f.caller ? eq(calls.caller, getAddress(f.caller)) : undefined,
      )
      const q = selectCalls().where(where).orderBy(desc(calls.openedAt), desc(calls.id)).offset(f.offset ?? 0)
      return toCalls(flatCalls(await (f.limit !== undefined ? q.limit(f.limit) : q)))
    },

    async getCall(id) {
      return (await toCalls(flatCalls(await selectCalls().where(eq(calls.id, id)))))[0]
    },

    async listCallers(page = {}) {
      const q = selectCallers().orderBy(desc(callers.lastActive)).offset(page.offset ?? 0)
      return toCallers(flatCallers(await (page.limit !== undefined ? q.limit(page.limit) : q)))
    },

    async getCaller(address) {
      return (await toCallers(flatCallers(await selectCallers().where(eq(callers.address, getAddress(address))))))[0]
    },

    listTokens,

    async setProfile(claim) {
      const address = getAddress(claim.address)
      return db.transaction(async (tx) => {
        const [prev] = await tx.select({ signedAt: profiles.signedAt }).from(profiles).where(eq(profiles.address, address))
        if (prev && prev.signedAt >= claim.signedAt) return 'stale' as const
        const [owner] = await tx.select({ address: profiles.address }).from(profiles).where(eq(profiles.handle, claim.handle))
        if (owner && owner.address !== address) return 'taken' as const
        await tx
          .insert(profiles)
          .values({ address, handle: claim.handle, bio: claim.bio, signedAt: claim.signedAt })
          .onConflictDoUpdate({ target: profiles.address, set: { handle: claim.handle, bio: claim.bio, signedAt: claim.signedAt } })
        return 'ok' as const
      })
    },

    async following(user) {
      const rows = await db.select({ caller: follows.caller }).from(follows).where(eq(follows.userId, user)).orderBy(asc(follows.at))
      return rows.map((r) => r.caller)
    },

    async setFollow(user, caller, on) {
      const address = getAddress(caller)
      if (on) await db.insert(follows).values({ userId: user, caller: address, at: Date.now() }).onConflictDoNothing()
      else await db.delete(follows).where(and(eq(follows.userId, user), eq(follows.caller, address)))
    },

    async watching(user) {
      const rows = await db.select({ callId: watches.callId }).from(watches).where(eq(watches.userId, user)).orderBy(asc(watches.at))
      return rows.map((r) => r.callId)
    },

    async setWatch(user, callId, on) {
      if (on) await db.insert(watches).values({ userId: user, callId, at: Date.now() }).onConflictDoNothing()
      else await db.delete(watches).where(and(eq(watches.userId, user), eq(watches.callId, callId)))
    },

    async alerts(user, limit = 100): Promise<Alert[]> {
      const rows = await db
        .select({ id: alerts.id, kind: alerts.kind, callId: alerts.callId, at: alerts.at, read: alerts.read })
        .from(alerts)
        .where(eq(alerts.userId, user))
        .orderBy(desc(alerts.at), desc(alerts.id))
        .limit(limit)
      return rows.map((a) => ({ id: String(a.id), kind: a.kind as AlertKind, callId: a.callId, at: a.at, read: a.read }))
    },

    async markRead(user, ids) {
      const numeric = ids.map(Number).filter(Number.isSafeInteger)
      if (!numeric.length) return
      await db.update(alerts).set({ read: true }).where(and(eq(alerts.userId, user), inArray(alerts.id, numeric)))
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
