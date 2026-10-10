import { ALERTS, CALLERS, CALLS, DEMO_FOLLOWING, TOKENS, type Alert, type Call, type Caller, type CallState, type Token } from '@trustpool/core'

/**
 * Every page reads through this interface. `demo` serves @trustpool/core in the
 * browser; `api` asks the Bun API (apps/api). A chain-backed source slots in
 * here later without touching any page. Pick with VITE_DATA.
 */
export interface DataSource {
  readonly kind: 'demo' | 'api'
  listCalls(filter?: { state?: CallState[]; caller?: string }): Promise<Call[]>
  getCall(id: number): Promise<Call | undefined>
  listCallers(): Promise<Caller[]>
  getCaller(address: string): Promise<Caller | undefined>
  listTokens(): Promise<Token[]>
  alerts(): Promise<Alert[]>
  following(): Promise<string[]>
  watching(): Promise<number[]>
  /** Wallets that received the token just before the call opened. API source only. */
  earlyBuyers(id: number): Promise<EarlyBuyerReport | undefined>
}

export interface EarlyBuyerReport {
  callId: number
  fromBlock: number
  toBlock: number
  buyers: { wallet: string; amount: number; firstBlock: number; transfers: number; isCaller: boolean }[]
  note: string
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()
const wait = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 120))

const demo: DataSource = {
  kind: 'demo',
  async listCalls(f) {
    let out = [...CALLS].sort((a, b) => b.openedAt - a.openedAt)
    if (f?.state) out = out.filter((c) => f.state!.includes(c.state))
    if (f?.caller) out = out.filter((c) => same(c.caller, f.caller!))
    return wait(out)
  },
  getCall: async (id) => wait(CALLS.find((c) => c.id === id)),
  listCallers: async () => wait(CALLERS),
  getCaller: async (a) => wait(CALLERS.find((c) => same(c.address, a))),
  listTokens: async () => wait(TOKENS),
  alerts: async () => wait(ALERTS),
  following: async () => wait(DEMO_FOLLOWING),
  watching: async () => wait([7, 9]),
  earlyBuyers: async () => undefined,
}

/** Supplies the Privy access token for /me routes; set by the session. */
let authToken: (() => Promise<string | null>) | undefined
export function setAuth(getter: typeof authToken) {
  authToken = getter
}

async function headers(): Promise<HeadersInit> {
  const token = await authToken?.()
  return token ? { authorization: `Bearer ${token}` } : {}
}

async function get<T>(path: string): Promise<T | undefined> {
  const r = await fetch(`/api${path}`, { headers: path.startsWith('/me') ? await headers() : {} })
  if (r.status === 404) return undefined
  if (!r.ok) throw new Error(`${path}: ${r.status}`)
  return (await r.json()) as T
}

/** Stores a signed profile claim. The signature is the auth: no session token needed. */
export async function saveProfile(address: string, body: { handle: string; bio: string; signedAt: number; signature: string }): Promise<void> {
  const r = await fetch(`/api/callers/${address}/profile`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? `profile: ${r.status}`)
}

/** Writes per-user state. Only the API source has a server to write to. */
export async function send(method: 'PUT' | 'DELETE' | 'POST', path: string, body?: unknown): Promise<void> {
  const r = await fetch(`/api${path}`, {
    method,
    headers: { ...(await headers()), ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!r.ok) throw new Error(`${method} ${path}: ${r.status}`)
}

const api: DataSource = {
  kind: 'api',
  async listCalls(f) {
    const q = new URLSearchParams()
    if (f?.state) q.set('state', f.state.join(','))
    if (f?.caller) q.set('caller', f.caller)
    return (await get<Call[]>(`/calls?${q}`)) ?? []
  },
  getCall: (id) => get<Call>(`/calls/${id}`),
  listCallers: async () => (await get<Caller[]>('/callers')) ?? [],
  getCaller: (a) => get<Caller>(`/callers/${a}`),
  listTokens: async () => (await get<Token[]>('/tokens')) ?? [],
  alerts: async () => (await get<Alert[]>('/me/alerts')) ?? [],
  following: async () => (await get<string[]>('/me/following')) ?? [],
  watching: async () => (await get<number[]>('/me/watching')) ?? [],
  earlyBuyers: (id) => get<EarlyBuyerReport>(`/calls/${id}/early-buyers`).catch(() => undefined),
}

export const source: DataSource = import.meta.env.VITE_DATA === 'api' ? api : demo
