import type { Alert, Call, Caller, CallerRecord, CallRules, CallState, Participant, Position, SaleReason, Slash, Token } from './types'
import { settle, tierOf } from './types'

/**
 * Fixed demo data shared by the web app and the API. Times are relative to module load, so
 * the countdowns always have something to count. Records and participants are derived from
 * the calls, never written by hand, so none of them can disagree.
 */

const M = 60_000
const H = 60 * M
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
/** Joiners who are not callers. */
const J = [
  '0x5E1d3F5a7B9c1D3e5F7a9B1c3D5e7F9a1B3c5D10',
  '0x3A5c7E9a1C3e5A7c9E1a3C5e7A9c1E3a5C7e9A21',
  '0xC7e9A1c3E5a7C9e1A3c5E7a9C1e3A5c7E9a1C332',
  '0x1F3a5C7e9A1c3E5a7C9e1A3c5E7a9C1e3A5c7E43',
]

const PROFILES: Record<string, Omit<Caller, 'address' | 'record' | 'tier' | 'slashHistory'>> = {
  [A]: { handle: 'olu', bio: 'Small caps on Monad, held for days. I size every call the same.', bond: 75, followers: 412, joinedAt: now - 60 * D },
  [B]: { handle: 'marisa', bio: 'Liquidity first. If the pool is thin I pass.', bond: 90, followers: 1_288, joinedAt: now - 90 * D },
  [C]: { handle: 'kenta', bio: 'Short windows, tight stops.', bond: 30, followers: 97, joinedAt: now - 30 * D },
  [E]: { handle: 'ade', bio: 'Two calls a month at most.', bond: 120, followers: 2_031, joinedAt: now - 120 * D },
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
  state: CallState
  /** Caller's stake, then each joiner's deposit, in MON. */
  stake: number
  joins: [string, number][]
  price: number // entry, MON per token
  last: number // exit or latest price
  openedAgo: number
  window: number
  hold: number
  tp: number
  sl: number
  share: number
  tier: number
  bond: number
  reason?: SaleReason
  negligent?: boolean
  /** ms after the buy that the call closed. */
  closedAfter?: number
  thesis: string
  watchers: number
}

const DEFAULT_RULES = { minCallerBps: 500, maxImpactBps: 200, sellToleranceBps: 200, keeperBps: 10, checkpointGap: 15 * M, splitGrace: 6 * H, minPool: 50 }
const MULTIPLE = [2, 5, 10, 20]

const PARTS = new Map<number, Participant[]>()

function make(s: Spec): Call {
  const openedAt = now - s.openedAgo
  const rules: CallRules = {
    ...DEFAULT_RULES,
    windowEnd: openedAt + s.window,
    buyDeadline: openedAt + s.window + 2 * H,
    maxHold: s.hold,
    takeProfitBps: s.tp,
    stopLossBps: s.sl,
    shareBps: s.share,
    cap: s.bond * MULTIPLE[s.tier]!,
  }
  const totalIn = s.stake + s.joins.reduce((n, [, x]) => n + x, 0)
  const bought = s.state === 'Holding' || s.state === 'Settled' || s.state === 'Split'
  const boughtAt = bought ? rules.windowEnd + 4 * M : undefined
  const tokens = bought ? totalIn / s.price : undefined
  const call: Call = {
    id: s.id,
    caller: s.caller,
    token: T[s.sym]!,
    tier: s.tier,
    rules,
    thesis: s.thesis,
    openedAt,
    state: s.state,
    totalIn,
    callerStake: s.stake,
    depositors: 1 + s.joins.length,
    tokens,
    boughtAt,
    holdUntil: boughtAt !== undefined ? boughtAt + s.hold : undefined,
    checkpoints: [],
    series: bought ? series(s.price, s.last, s.id + 1) : [],
    watchers: s.watchers,
  }
  if (s.state === 'Open') call.liveCap = Math.min(rules.cap, 260)
  if (bought && tokens) {
    const v = tokens * s.last
    const at = s.state === 'Holding' ? now - 6 * M : boughtAt! + (s.closedAfter ?? s.hold)
    call.checkpoints = [
      { value: v * 0.996, at: at - rules.checkpointGap },
      { value: v, at },
    ]
  }
  if (s.state === 'Holding') {
    call.markedValue = tokens! * s.last
    call.markedAt = now - 2 * M
  }
  const closedAt = s.state === 'Refunded' ? rules.buyDeadline : bought && s.state !== 'Holding' ? boughtAt! + (s.closedAfter ?? s.hold + (s.state === 'Split' ? rules.splitGrace : 0)) : undefined
  call.closedAt = closedAt

  const people: [string, number][] = [[s.caller, s.stake], ...s.joins]
  let payout = 0
  let fee = 0
  if (s.state === 'Settled') {
    const gross = tokens! * s.last
    const r = settle(totalIn, gross, s.share)
    Object.assign(call, { saleReason: s.reason ?? 'max_hold', keeper: J[3], gross, ...r })
    payout = r.payout
    fee = r.fee
  }
  if (s.state === 'Refunded') call.negligent = !!s.negligent
  PARTS.set(
    s.id,
    people.map(([address, deposit]) => {
      const p: Participant = { address, deposit, isCaller: address === s.caller, claimed: s.state !== 'Holding' && s.state !== 'Open' && address !== A }
      if (s.state === 'Settled') p.claimMon = (payout * deposit) / totalIn + (address === s.caller ? fee : 0)
      if (s.state === 'Refunded') p.claimMon = deposit
      if (s.state === 'Split') p.claimTokens = (tokens! * deposit) / totalIn
      return p
    }),
  )
  return call
}

export const CALLS: Call[] = [
  make({ id: 0, caller: A, sym: 'MOE', state: 'Settled', stake: 15, joins: [[J[0]!, 60], [J[1]!, 45], [B, 30]], price: 0.048, last: 0.0566, openedAgo: 30 * D, window: 6 * H, hold: 72 * H, tp: 1500, sl: 1500, share: 500, tier: 0, bond: 75, reason: 'take_profit', closedAfter: 41 * H, thesis: 'MOE volume has held for two weeks after listing.', watchers: 38 }),
  make({ id: 1, caller: A, sym: 'CHOG', state: 'Settled', stake: 12, joins: [[J[2]!, 50], [E, 38]], price: 0.002, last: 0.00168, openedAgo: 22 * D, window: 4 * H, hold: 48 * H, tp: 4000, sl: 1500, share: 500, tier: 0, bond: 75, reason: 'stop_loss', closedAfter: 19 * H, thesis: 'CHOG holds above its launch range.', watchers: 51 }),
  make({ id: 2, caller: B, sym: 'JAMES', state: 'Settled', stake: 20, joins: [[J[0]!, 80], [A, 40], [J[3]!, 60]], price: 0.0031, last: 0.00329, openedAgo: 20 * D, window: 6 * H, hold: 72 * H, tp: 0, sl: 2000, share: 300, tier: 0, bond: 90, thesis: 'JAMES liquidity doubled this week.', watchers: 120 }),
  make({ id: 3, caller: B, sym: 'CHOG', state: 'Refunded', stake: 10, joins: [[J[1]!, 70], [A, 20]], price: 0.0024, last: 0.0024, openedAgo: 16 * D, window: 3 * H, hold: 24 * H, tp: 2000, sl: 1000, share: 300, tier: 0, bond: 90, negligent: true, thesis: 'Short hold on the CHOG listing.', watchers: 64 }),
  make({ id: 4, caller: C, sym: 'MOE', state: 'Settled', stake: 6, joins: [[J[2]!, 30], [J[3]!, 24]], price: 0.051, last: 0.0485, openedAgo: 12 * D, window: 2 * H, hold: 24 * H, tp: 2500, sl: 1500, share: 0, tier: 0, bond: 30, thesis: 'MOE retests the range it broke.', watchers: 9 }),
  make({ id: 5, caller: A, sym: 'JAMES', state: 'Settled', stake: 14, joins: [[J[0]!, 50], [B, 36], [J[1]!, 40]], price: 0.0028, last: 0.003136, openedAgo: 9 * D, window: 6 * H, hold: 72 * H, tp: 1000, sl: 2000, share: 500, tier: 0, bond: 75, reason: 'take_profit', closedAfter: 52 * H, thesis: 'JAMES: second leg after the pair moved to MON.', watchers: 44 }),
  make({ id: 6, caller: E, sym: 'GMONAD', state: 'Split', stake: 20, joins: [[J[3]!, 100], [A, 30], [J[2]!, 50]], price: 0.012, last: 0.0109, openedAgo: 8 * D, window: 6 * H, hold: 72 * H, tp: 2000, sl: 2500, share: 400, tier: 0, bond: 120, thesis: 'gMonad tracks staking inflows. Three days.', watchers: 310 }),
  make({ id: 7, caller: B, sym: 'MOE', state: 'Holding', stake: 18, joins: [[J[0]!, 70], [J[1]!, 52], [A, 25]], price: 0.052, last: 0.0561, openedAgo: 2 * D, window: 6 * H, hold: 72 * H, tp: 2000, sl: 1500, share: 300, tier: 0, bond: 90, thesis: 'MOE into the end of the month.', watchers: 233 }),
  make({ id: 8, caller: C, sym: 'CHOG', state: 'Holding', stake: 5, joins: [[J[2]!, 30], [J[3]!, 20]], price: 0.0022, last: 0.00207, openedAgo: 20 * H, window: 2 * H, hold: 24 * H, tp: 3000, sl: 1000, share: 0, tier: 0, bond: 30, thesis: 'One day on CHOG, nothing more.', watchers: 18 }),
  make({ id: 9, caller: A, sym: 'CHOG', state: 'Open', stake: 12, joins: [[J[1]!, 40], [J[3]!, 26]], price: 0.0021, last: 0.0021, openedAgo: 2 * H, window: 6 * H, hold: 72 * H, tp: 2500, sl: 2000, share: 1000, tier: 1, bond: 75, thesis: 'CHOG again, smaller size, same thesis.', watchers: 72 }),
  make({ id: 10, caller: E, sym: 'MOYAKI', state: 'Open', stake: 25, joins: [[J[0]!, 90], [B, 60], [J[2]!, 45]], price: 0.0074, last: 0.0074, openedAgo: 5 * H + 20 * M, window: 6 * H, hold: 72 * H, tp: 0, sl: 2000, share: 400, tier: 0, bond: 120, thesis: 'MOYAKI holders keep growing while the price sits still.', watchers: 402 }),
  make({ id: 11, caller: C, sym: 'JAMES', state: 'Refunded', stake: 4, joins: [[J[1]!, 20]], price: 0.0033, last: 0.0033, openedAgo: 3 * D, window: 2 * H, hold: 24 * H, tp: 2000, sl: 1000, share: 0, tier: 0, bond: 30, thesis: 'A week on JAMES while the pool is still deep.', watchers: 6 }),
]

/** Everyone in a call, caller first. */
export function participantsOf(callId: number): Participant[] {
  return PARTS.get(callId) ?? []
}

/** A wallet's part in every call it joined, newest call first. */
export function positionsOf(address: string, calls: Call[] = CALLS): Position[] {
  const a = address.toLowerCase()
  return [...calls]
    .sort((x, y) => y.openedAt - x.openedAt)
    .flatMap((c) => participantsOf(c.id).filter((p) => p.address.toLowerCase() === a).map((p) => ({ ...p, callId: c.id })))
}

const SLASHES: Record<string, Slash[]> = {
  [B]: [{ amount: 2, reason: 'A wallet funded by this caller bought CHOG 40 minutes before call #3 bought.', at: now - 11 * D }],
}

/** Built from the calls themselves, so the record and the call list can never disagree. */
export function recordOf(address: string, calls: Call[] = CALLS): CallerRecord {
  const mine = calls.filter((c) => c.caller.toLowerCase() === address.toLowerCase())
  const r: CallerRecord = { settled: 0, losses: 0, negligent: 0, refunded: 0, split: 0, active: 0, slashes: SLASHES[address]?.length ?? 0, sumNetBps: 0, lastActive: 0 }
  for (const c of mine) {
    r.lastActive = Math.max(r.lastActive, c.closedAt ?? c.boughtAt ?? c.openedAt)
    if (c.state === 'Open' || c.state === 'Holding') r.active += 1
    else if (c.state === 'Settled') {
      r.settled += 1
      r.sumNetBps += c.netReturnBps!
      if (c.netReturnBps! < 0) r.losses += 1
    } else if (c.state === 'Refunded') {
      if (c.negligent) r.negligent += 1
      else r.refunded += 1
    } else r.split += 1
  }
  return r
}

export const CALLERS: Caller[] = Object.entries(PROFILES).map(([address, p]) => {
  const record = recordOf(address)
  return { address, ...p, record, tier: tierOf(record), slashHistory: SLASHES[address] ?? [] }
})

export const ALERTS: Alert[] = [
  { id: 'a1', kind: 'window_closing', callId: 10, at: now - 10 * M, read: false },
  { id: 'a2', kind: 'window_opened', callId: 9, at: now - 2 * H, read: false },
  { id: 'a3', kind: 'bought', callId: 8, at: now - 18 * H, read: true },
  { id: 'a4', kind: 'sold', callId: 5, at: now - 6 * D, read: true },
  { id: 'a5', kind: 'split', callId: 6, at: now - 4 * D, read: true },
]

/** Callers the demo user follows. */
export const DEMO_FOLLOWING = [B, E]
