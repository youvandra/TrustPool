import { useEffect, useSyncExternalStore } from 'react'
import { DEMO_FOLLOWING } from '@trustpool/core'
import { send, source } from './data'
import { toast } from '@/components/ui/Toast'

/**
 * Small client store for what the user toggles: callers followed, calls watched
 * for an exit, and demo-only state changes (an exit announced from Portfolio).
 *
 * With the API source the server owns follows, watches and read alerts (the indexer
 * alerts from them): the store loads them on sign-in, applies toggles at once and
 * writes them through, rolling back if the write fails. In the demo it is all local.
 */
interface State {
  following: string[]
  watching: number[]
  announced: Record<number, number> // call id -> announcedAt (demo actions)
  read: string[] // alert ids marked read
}

const remote = source.kind === 'api'
const KEY = `trustpool:v1:${source.kind}`
const initial: State = remote ? { following: [], watching: [], announced: {}, read: [] } : { following: DEMO_FOLLOWING, watching: [7, 9], announced: {}, read: [] }

function load(): State {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...initial, ...(JSON.parse(raw) as Partial<State>) } : initial
  } catch {
    return initial
  }
}

let state = load()
const subs = new Set<() => void>()

function set(next: Partial<State>) {
  state = { ...state, ...next }
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    // storage blocked: keep the in-memory copy
  }
  subs.forEach((f) => f())
}

export function useStore<T>(pick: (s: State) => T): T {
  return useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => subs.delete(f)
    },
    () => pick(state),
  )
}

const lower = (a: string) => a.toLowerCase()

/** Applies a change now and writes it to the API; restores the previous state if the write fails. */
function writeThrough(next: Partial<State>, write: () => Promise<void>) {
  const before = state
  set(next)
  if (!remote) return
  write().catch((err) => {
    console.warn('could not save', err)
    toast('Could not save that. Try again.')
    set({ following: before.following, watching: before.watching, read: before.read })
  })
}

/** Loads the signed-in user's follows and watches from the API. No-op in the demo. */
export function useServerState(authenticated: boolean) {
  useEffect(() => {
    if (!remote || !authenticated) return
    let live = true
    Promise.all([source.following(), source.watching()])
      .then(([following, watching]) => live && set({ following, watching }))
      .catch((err) => console.warn('could not load your follows', err))
    return () => {
      live = false
    }
  }, [authenticated])
}

export const actions = {
  toggleFollow(address: string) {
    const has = state.following.some((a) => lower(a) === lower(address))
    writeThrough(
      { following: has ? state.following.filter((a) => lower(a) !== lower(address)) : [...state.following, address] },
      () => send(has ? 'DELETE' : 'PUT', `/me/following/${address}`),
    )
    return !has
  },
  toggleWatch(id: number) {
    const has = state.watching.includes(id)
    writeThrough({ watching: has ? state.watching.filter((x) => x !== id) : [...state.watching, id] }, () =>
      send(has ? 'DELETE' : 'PUT', `/me/watching/${id}`),
    )
    return !has
  },
  announce(id: number) {
    set({ announced: { ...state.announced, [id]: Date.now() } })
  },
  markRead(ids: string[]) {
    writeThrough({ read: [...new Set([...state.read, ...ids])] }, () => send('POST', '/me/alerts/read', { ids }))
  },
}

export const isFollowing = (s: State, a: string) => s.following.some((x) => lower(x) === lower(a))
