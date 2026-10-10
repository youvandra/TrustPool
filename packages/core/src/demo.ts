import type { Alert, Call, Caller, CallerRecord, Slash, Token } from './types'
import { returnBps } from './types'

/**
 * Fixed demo data shared by the web app and the API. Times are relative to
 * module load, so the countdowns always have something to count. Records are
 * derived from the calls, never written by hand, so the two cannot disagree.
 */

const H = 3_600_000
const D = 24 * H
const now = Date.now()

export const TOKENS: Token[] = [
  { address: '0x350035555E10d9AfAF1566AaebfCeD5BA6C27777', symbol: 'CHOG', name: 'Chog', hue: 268 },
  { address: '0x4f0a3b7C27E28A3c1A3B8Bd9F3E2D6C77b1E9a10', symbol: 'MOE', name: 'Moe', hue: 32 },
  { address: '0x8c2d6e8A1B7f0E3D4c5B6a79810F2e3D4C5b6A71', symbol: 'JAMES', name: 'James', hue: 196 },
  { address: '0x1b9E3f5A7c9D1e3F5a7B9c1D3e5F7a9B1c3D5e72', symbol: 'MOYAKI', name: 'Moyaki', hue: 146 },
  { address: '0x6D8f0A2c4E6a8C0e2A4c6E8a0C2e4A6c8E0a2C93', symbol: 'GMONAD', name: 'gMonad', hue: 340 },
]
const T = Object.fromEntries(TOKENS.map((t) => [t.symbol, t])) as Record<string, Token>

export const DEMO_ME = '0x7a3F19c0dE2B4a6e8C1f9D3b5A7e2C4d6F8a0B12'
const A = DEMO_ME
const B = '0xB41c5E7a9D2f4B6c8E0a1D3f5B7c9E1a3C5e7D90'
const C = '0x2Ce8a0B2c4D6e8F0a2B4c6D8e0F2a4B6c8D0e2F4'
const E = '0x9aF1c3E5a7C9e1A3c5E7a9C1e3A5c7E9a1C3e5A6'

const PROFILES: Record<string, Omit<Caller, 'address' | 'record' | 'slashHistory'>> = {
  [A]: { handle: 'olu', bio: 'Small caps on Monad, held for days. I size every call the same.', bond: 25, followers: 412, joinedAt: now - 60 * D },
  [B]: { handle: 'marisa', bio: 'Liquidity first. If the pool is thin I pass.', bond: 18, followers: 1_288, joinedAt: now - 90 * D },
  [C]: { handle: 'kenta', bio: 'Short locks, long notice.', bond: 10, followers: 97, joinedAt: now - 30 * D },
  [E]: { handle: 'ade', bio: 'Two calls a month at most.', bond: 40, followers: 2_031, joinedAt: now - 120 * D },
}

/** Deterministic wobble so sparklines look like prices without randomness between reloads. */
function series(entry: number, end: number, seed: number, n = 40): number[] {
  const out: number[] = []
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1)
    const wobble = Math.sin(i * 0.42 + seed) * 0.05 + Math.sin(i * 1.05 + seed * 1.7) * 0.014
    out.push(entry + (end - entry) * t + entry * wobble * Math.sin(t * Math.PI))
  }
  out[0] = entry
  out[n - 1] = end
  return out
}

interface Spec {
  id: number
  caller: string
  sym: string
  monIn: number
  price: number
  last: number // latest or exit price
  openedAgo: number
  lock: number
  notice: number
  state: Call['state']
  exitAt?: number
  thesis: string
  watchers: number
}

function make(s: Spec): Call {
  const settled = s.state === 'Settled'
  return {
    id: s.id,
    caller: s.caller,
    token: T[s.sym]!,
    monIn: s.monIn,
    tokens: s.monIn / s.price,
    openedAt: now - s.openedAgo,
    unlockAt: now - s.openedAgo + s.lock,
    notice: s.notice,
    // demo calls announce late enough that the notice decides the exit time
    announcedAt: s.exitAt !== undefined ? s.exitAt - s.notice : undefined,
    exitAt: s.exitAt,
    monOut: settled ? (s.monIn / s.price) * s.last : undefined,
    state: s.state,
    thesis: s.thesis,
    series: series(s.price, s.last, s.id + 1),
    watchers: s.watchers,
  }
}

export const CALLS: Call[] = [
  make({ id: 0, caller: A, sym: 'MOE', monIn: 150, price: 0.048, last: 0.05683, openedAgo: 30 * D, lock: 5 * D, notice: 12 * H, state: 'Settled', exitAt: now - 24 * D, thesis: 'MOE volume has held for two weeks after listing.', watchers: 38 }),
  make({ id: 1, caller: A, sym: 'CHOG', monIn: 100, price: 0.002, last: 0.0013986, openedAgo: 22 * D, lock: 3 * D, notice: 12 * H, state: 'Settled', exitAt: now - 18 * D, thesis: 'CHOG holds above its launch range.', watchers: 51 }),
  make({ id: 2, caller: B, sym: 'JAMES', monIn: 200, price: 0.0031, last: 0.0032922, openedAgo: 20 * D, lock: 4 * D, notice: D, state: 'Settled', exitAt: now - 15 * D, thesis: 'JAMES liquidity doubled this week.', watchers: 120 }),
  make({ id: 3, caller: B, sym: 'CHOG', monIn: 80, price: 0.0024, last: 0.0009, openedAgo: 16 * D, lock: 3 * D, notice: 12 * H, state: 'Released', exitAt: now - 12 * D, thesis: 'Short hold on the CHOG listing.', watchers: 64 }),
  make({ id: 4, caller: C, sym: 'MOE', monIn: 60, price: 0.051, last: 0.048501, openedAgo: 12 * D, lock: 2 * D, notice: 6 * H, state: 'Settled', exitAt: now - 9 * D, thesis: 'MOE retests the range it broke.', watchers: 9 }),
  make({ id: 5, caller: A, sym: 'JAMES', monIn: 90, price: 0.0028, last: 0.003136, openedAgo: 9 * D, lock: 3 * D, notice: 12 * H, state: 'Settled', exitAt: now - 5 * D, thesis: 'JAMES: second leg after the pair moved to MON.', watchers: 44 }),
  make({ id: 6, caller: E, sym: 'GMONAD', monIn: 400, price: 0.012, last: 0.01092, openedAgo: 8 * D, lock: 4 * D, notice: D, state: 'Settled', exitAt: now - 3 * D, thesis: 'gMonad tracks staking inflows. Four days.', watchers: 310 }),
  make({ id: 7, caller: B, sym: 'MOE', monIn: 300, price: 0.052, last: 0.0561, openedAgo: 4 * D, lock: 3 * D, notice: D, state: 'Exiting', exitAt: now + 9 * H, thesis: 'MOE into the end of the month.', watchers: 233 }),
  make({ id: 8, caller: C, sym: 'CHOG', monIn: 45, price: 0.0022, last: 0.00207, openedAgo: 2 * D, lock: D, notice: 6 * H, state: 'Exiting', exitAt: now + 2 * H + 14 * 60_000, thesis: 'One day on CHOG, nothing more.', watchers: 18 }),
  make({ id: 9, caller: A, sym: 'CHOG', monIn: 120, price: 0.0021, last: 0.00226, openedAgo: D, lock: 3 * D, notice: 12 * H, state: 'Locked', thesis: 'CHOG again, smaller size, same thesis.', watchers: 72 }),
  make({ id: 10, caller: E, sym: 'MOYAKI', monIn: 250, price: 0.0074, last: 0.00718, openedAgo: 14 * H, lock: 7 * D, notice: D, state: 'Locked', thesis: 'MOYAKI holders keep growing while the price sits still.', watchers: 402 }),
  make({ id: 11, caller: C, sym: 'JAMES', monIn: 40, price: 0.0033, last: 0.00341, openedAgo: 3 * H, lock: 7 * D, notice: 12 * H, state: 'Locked', thesis: 'A week on JAMES while the pool is still deep.', watchers: 6 }),
]

const SLASHES: Record<string, Slash[]> = {
  [B]: [{ amount: 2, reason: 'A wallet funded by this caller bought CHOG 40 minutes before call #3.', at: now - 11 * D }],
}

/** Built from the calls themselves, so the record and the call list can never disagree. */
export function recordOf(address: string, calls: Call[] = CALLS): CallerRecord {
  const mine = calls.filter((c) => c.caller.toLowerCase() === address.toLowerCase())
  const r: CallerRecord = { settled: 0, losses: 0, released: 0, open: 0, slashes: SLASHES[address]?.length ?? 0, sumReturnBps: 0, lastActive: 0 }
  for (const c of mine) {
    r.lastActive = Math.max(r.lastActive, c.openedAt)
    if (c.state === 'Locked' || c.state === 'Exiting') {
      r.open += 1
      continue
    }
    const bps = returnBps(c)!
    r.sumReturnBps += bps
    if (bps < 0) r.losses += 1
    if (c.state === 'Settled') r.settled += 1
    else r.released += 1
  }
  return r
}

export const CALLERS: Caller[] = Object.entries(PROFILES).map(([address, p]) => ({
  address,
  ...p,
  record: recordOf(address),
  slashHistory: SLASHES[address] ?? [],
}))

export const ALERTS: Alert[] = [
  { id: 'a1', kind: 'exit_announced', callId: 8, at: now - 4 * H, read: false },
  { id: 'a2', kind: 'exit_announced', callId: 7, at: now - 15 * H, read: false },
  { id: 'a3', kind: 'call_opened', callId: 10, at: now - 14 * H, read: true },
  { id: 'a4', kind: 'call_settled', callId: 6, at: now - 3 * D, read: true },
  { id: 'a5', kind: 'call_opened', callId: 9, at: now - D, read: true },
]

/** Callers the demo user follows. */
export const DEMO_FOLLOWING = [B, E]
