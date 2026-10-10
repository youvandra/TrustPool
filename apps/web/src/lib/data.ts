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
}

export const source: DataSource = import.meta.env.VITE_DATA === 'api' ? api : demo
