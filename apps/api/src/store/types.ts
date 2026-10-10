import type { Alert, Call, Caller, CallState, Token } from '@trustpool/core'

export interface CallFilter {
  state?: CallState[]
  caller?: string
  limit?: number
  offset?: number
}

/** Public data: calls, callers, tokens. Same shapes in demo and chain mode. */
export interface ReadStore {
  readonly source: 'demo' | 'chain'
  listCalls(filter?: CallFilter): Call[]
  getCall(id: number): Call | undefined
  listCallers(): Caller[]
  getCaller(address: string): Caller | undefined
  listTokens(): Token[]
}

/** Per-user state, keyed by the verified user id (the Privy `sub`). */
export interface UserStore {
  following(user: string): string[]
  setFollow(user: string, caller: string, on: boolean): void
  watching(user: string): number[]
  setWatch(user: string, callId: number, on: boolean): void
  alerts(user: string, limit?: number): Alert[]
  markRead(user: string, ids: string[]): void
}

export type Store = ReadStore & UserStore
