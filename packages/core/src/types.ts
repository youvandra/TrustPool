/** Mirrors contracts/src/TrustPool.sol. Amounts are converted from wei to MON, times to ms. */

export type CallState = 'Open' | 'Holding' | 'Settled' | 'Refunded' | 'Split'

export interface Token {
  address: string
  symbol: string
  name: string
  /** Display hue 0-360 for the token chip; purely cosmetic. */
  hue: number
  /** Logo URL, when one is known. Without it the app draws a blockie from the address. */
  logo?: string
}

/** Every rule of a call, fixed when it opens. Nothing here can change afterwards. */
export interface CallRules {
  /** ms; deposits and withdrawals until here. */
  windowEnd: number
  /** ms; the caller must buy before this, or anyone can refund the pool. */
  buyDeadline: number
  /** ms after the buy when anyone may sell regardless of price. */
  maxHold: number
  /** Above entry; 0 = none. */
  takeProfitBps: number
  /** Below entry. */
  stopLossBps: number
  /** Caller's share of profit only. */
  shareBps: number
  /** Caller's least stake in the pool. */
  minCallerBps: number
  /** Price impact limit of the buy. */
  maxImpactBps: number
  /** The sale may return this much less than the lower of its two checkpoints. */
  sellToleranceBps: number
  /** Keeper reward, of gross proceeds. */
  keeperBps: number
  /** ms between checkpoints. */
  checkpointGap: number
  /** ms after max hold before a position nobody could sell is split. */
  splitGrace: number
  /** MON; bond x tier multiple at open. */
  cap: number
  /** MON; a pool below this at window end is refunded with no fault. */
  minPool: number
}

export interface Checkpoint {
  /** MON that selling the whole position would have returned, quoted. */
  value: number
  at: number // ms
}

/** Why a sale happened, as the contract records it. */
export type SaleReason = 'take_profit' | 'stop_loss' | 'max_hold'

export interface Call {
  id: number
  caller: string
  token: Token
  /** The caller's tier when the call opened; it set the cap and the largest profit share. */
  tier: number
  rules: CallRules
  thesis: string
  openedAt: number // ms
  state: CallState
  /** MON in the pool, every participant, caller included. */
  totalIn: number
  /** MON the caller has in the pool. */
  callerStake: number
  /** Participants with a deposit. */
  depositors: number
  /** Live cap for an open window: the lower of the bond cap and the most a buy can take
   * within the impact limit, read from the contract's `capOf`. */
  liveCap?: number
  // ---- after the buy
  tokens?: number
  boughtAt?: number // ms
  holdUntil?: number // ms
  /** The last two checkpoints, older first. */
  checkpoints: Checkpoint[]
  // ---- after the sale
  saleReason?: SaleReason
  keeper?: string
  /** MON the sale returned, measured by the contract. */
  gross?: number
  keeperReward?: number
  /** Caller's profit share; 0 unless participants made a profit. */
  fee?: number
  /** Shared pro rata by deposit, caller included. */
  payout?: number
  /** payout / totalIn - 1: what goes on the caller's record. */
  netReturnBps?: number
  /** Refunded because the caller never bought (not when the pool was too small). */
  negligent?: boolean
  closedAt?: number // ms
  /** Price in MON per token: entry, quotes since, and the exit. */
  series: number[]
  /** Addresses watching this call for alerts. */
  watchers: number
  /** Unrealised: what selling the whole position would return now, in MON. Holding only. */
  markedValue?: number
  markedAt?: number // ms
}

/** One wallet's part of one call. */
export interface Participant {
  address: string
  /** MON deposited and still in. */
  deposit: number
  isCaller: boolean
  claimed: boolean
  /** What the claim paid (or will pay): MON after a sale or refund, tokens after a split. */
  claimMon?: number
  claimTokens?: number
}

/** A wallet's part of a call, with the call, for a portfolio. */
export interface Position extends Participant {
  callId: number
}

export interface CallerRecord {
  settled: number
  /** Settled with a negative net return. */
  losses: number
  /** Refunded because the caller never bought. */
  negligent: number
  /** Refunded with no fault: pool below its minimum, or the token delisted. */
  refunded: number
  /** Ended in a token split because the position could not be sold. */
  split: number
  slashes: number
  /** Calls Open or Holding. */
  active: number
  /** Over settled calls; average = sumNetBps / settled. */
  sumNetBps: number
  lastActive: number // ms
}

export interface Slash {
  amount: number
  reason: string
  at: number
}

export interface Caller {
  address: string
  handle?: string
  bio?: string
  followers: number
  joinedAt: number
  bond: number
  record: CallerRecord
  /** 0 to 3, from the record; sets the next call's cap and largest profit share. */
  tier: number
  slashHistory: Slash[]
}

// ---------------------------------------------------------------- tiers (TrustPool.tierOf)

export interface Tier {
  tier: number
  /** Settled calls needed, with a positive average and no slash. */
  settled: number
  /** Pool cap as a multiple of bond. */
  multiple: number
  maxShareBps: number
}

export const TIERS: readonly Tier[] = [
  { tier: 0, settled: 0, multiple: 2, maxShareBps: 500 },
  { tier: 1, settled: 3, multiple: 5, maxShareBps: 1000 },
  { tier: 2, settled: 10, multiple: 10, maxShareBps: 1500 },
  { tier: 3, settled: 25, multiple: 20, maxShareBps: 2000 },
]

/** Same rule as the contract: any slash or a non-positive average keeps a caller at tier 0. */
export function tierOf(r: CallerRecord): number {
  if (r.slashes !== 0 || r.settled < 3 || r.sumNetBps <= 0) return 0
  if (r.settled >= 25) return 3
  if (r.settled >= 10) return 2
  return 1
}

// ---------------------------------------------------------------- derived numbers

/** Entry price in MON per token, once bought. */
export const entryPrice = (c: Call) => (c.tokens ? c.totalIn / c.tokens : undefined)

/** Net return to participants in bps, once sold. The same number for every participant. */
export const returnBps = (c: Call): number | undefined => (c.state === 'Settled' ? c.netReturnBps : undefined)

/** Unrealised return from the latest quote, while holding. Before keeper reward and fee. */
export function markedBps(c: Call): number | undefined {
  if (c.state !== 'Holding' || c.markedValue === undefined || !c.totalIn) return undefined
  return Math.trunc(((c.markedValue - c.totalIn) * 10_000) / c.totalIn)
}

/** Caller's share of the pool in bps. */
export const callerShareBps = (c: Call) => (c.totalIn ? Math.floor((c.callerStake * 10_000) / c.totalIn) : 0)

export const averageBps = (r: CallerRecord) => (r.settled === 0 ? 0 : Math.trunc(r.sumNetBps / r.settled))

/**
 * The contract's settlement arithmetic, for previews and the demo set:
 * net = gross - keeper reward; fee = share of profit only; payout = net - fee.
 */
export function settle(totalIn: number, gross: number, shareBps: number, keeperBps = 10) {
  const keeperReward = (gross * keeperBps) / 10_000
  const net = gross - keeperReward
  const fee = net > totalIn ? ((net - totalIn) * shareBps) / 10_000 : 0
  const payout = net - fee
  return { keeperReward, fee, payout, netReturnBps: Math.trunc(((payout - totalIn) * 10_000) / totalIn) }
}

export type AlertKind = 'window_opened' | 'window_closing' | 'bought' | 'sold' | 'refunded' | 'split'

export interface Alert {
  id: string
  kind: AlertKind
  callId: number
  at: number
  read: boolean
}
