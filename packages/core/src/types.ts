/** Mirrors contracts/src/TrustPool.sol. Amounts are converted from wei to MON for display. */

export type CallState = 'Locked' | 'Exiting' | 'Settled' | 'Released'

export interface Token {
  address: string
  symbol: string
  name: string
  /** Display hue 0-360 for the token chip; purely cosmetic. */
  hue: number
}

export interface Call {
  id: number
  caller: string
  token: Token
  monIn: number
  tokens: number
  openedAt: number // ms
  unlockAt: number // ms
  notice: number // ms
  announcedAt?: number // ms, when the exit was announced
  exitAt?: number // ms, earliest moment the exit can execute
  monOut?: number // set on settlement
  state: CallState
  thesis: string
  /** Price in MON per token since open, for the sparkline. Demo only until an indexer exists. */
  series: number[]
  /** Addresses watching this call for an exit alert. */
  watchers: number
}

export interface CallerRecord {
  settled: number
  losses: number
  released: number
  open: number
  slashes: number
  sumReturnBps: number
  lastActive: number // ms
}

export interface Slash {
  amount: number
  reason: string
  at: number
}

export interface Caller {
  address: string
  handle?: string // display name; ENS or similar later
  bio?: string
  followers: number
  joinedAt: number
  bond: number
  record: CallerRecord
  slashHistory: Slash[]
}

/** Entry price in MON per token. */
export const entryPrice = (c: Call) => c.monIn / c.tokens

/** Realised return in basis points; a release counts as −100%, as in the contract. */
export function returnBps(c: Call): number | undefined {
  if (c.state === 'Released') return -10_000
  if (c.state !== 'Settled' || c.monOut === undefined) return undefined
  return Math.trunc(((c.monOut - c.monIn) * 10_000) / c.monIn)
}

export const averageBps = (r: CallerRecord) => {
  const n = r.settled + r.released
  return n === 0 ? 0 : Math.trunc(r.sumReturnBps / n)
}

export type AlertKind = 'exit_announced' | 'exit_executable' | 'call_opened' | 'call_settled'

export interface Alert {
  id: string
  kind: AlertKind
  callId: number
  at: number
  read: boolean
}
