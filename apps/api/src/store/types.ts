import type { Alert, Call, Caller, CallState, Participant, Position, ProfileClaim, Token } from '@trustpool/core'

export interface CallFilter {
  state?: CallState[]
  caller?: string
  limit?: number
  offset?: number
}

/** Public data: calls, callers, tokens. Same shapes in demo and chain mode. */
export interface ReadStore {
  readonly source: 'demo' | 'chain'
  listCalls(filter?: CallFilter): Promise<Call[]>
  getCall(id: number): Promise<Call | undefined>
  /** Everyone who has money in a call, caller first, then by deposit. Undefined: no such call. */
  participants(id: number): Promise<Participant[] | undefined>
  /** A wallet's part in every call it joined, newest call first. Public, like the chain. */
  positions(address: string): Promise<Position[]>
  listCallers(page?: { limit?: number; offset?: number }): Promise<Caller[]>
  getCaller(address: string): Promise<Caller | undefined>
  listTokens(): Promise<Token[]>
  /**
   * Stores a verified claim. `taken`: another address has the handle. `stale`: an equal or
   * newer claim exists. `unknown`: the address has never bonded, so it is not a caller.
   */
  setProfile(claim: ProfileClaim): Promise<'ok' | 'taken' | 'stale' | 'unknown'>
}

/** Per-user state, keyed by the verified user id (the Privy `sub`). */
export interface UserStore {
  following(user: string): Promise<string[]>
  setFollow(user: string, caller: string, on: boolean): Promise<void>
  watching(user: string): Promise<number[]>
  setWatch(user: string, callId: number, on: boolean): Promise<void>
  alerts(user: string, limit?: number): Promise<Alert[]>
  markRead(user: string, ids: string[]): Promise<void>
}

export type Store = ReadStore & UserStore
