import { ALERTS, CALLERS, CALLS, DEMO_FOLLOWING, TOKENS, type Alert } from '@trustpool/core'
import type { CallFilter, Store } from './types'

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

/** The fixed demo set from @trustpool/core, with per-user state kept in memory. */
export function demoStore(): Store {
  const users = new Map<string, { following: string[]; watching: number[]; read: Set<string> }>()
  const user = (id: string) => {
    let u = users.get(id)
    if (!u) users.set(id, (u = { following: [...DEMO_FOLLOWING], watching: [7, 9], read: new Set() }))
    return u
  }

  return {
    source: 'demo',
    listCalls(f: CallFilter = {}) {
      let out = [...CALLS].sort((a, b) => b.openedAt - a.openedAt)
      if (f.state?.length) out = out.filter((c) => f.state!.includes(c.state))
      if (f.caller) out = out.filter((c) => same(c.caller, f.caller!))
      return out.slice(f.offset ?? 0, (f.offset ?? 0) + (f.limit ?? out.length))
    },
    getCall: (id) => CALLS.find((c) => c.id === id),
    listCallers: () => CALLERS,
    getCaller: (a) => CALLERS.find((c) => same(c.address, a)),
    listTokens: () => TOKENS,

    following: (u) => user(u).following,
    setFollow(u, caller, on) {
      const s = user(u)
      s.following = s.following.filter((a) => !same(a, caller))
      if (on) s.following.push(caller)
    },
    watching: (u) => user(u).watching,
    setWatch(u, id, on) {
      const s = user(u)
      s.watching = s.watching.filter((x) => x !== id)
      if (on) s.watching.push(id)
    },
    alerts: (u, limit = 100): Alert[] => ALERTS.slice(0, limit).map((a) => ({ ...a, read: a.read || user(u).read.has(a.id) })),
    markRead(u, ids) {
      ids.forEach((id) => user(u).read.add(id))
    },
  }
}
