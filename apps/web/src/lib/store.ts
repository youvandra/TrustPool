import { useSyncExternalStore } from 'react'
import { DEMO_FOLLOWING } from '@trustpool/core'

/**
 * Small client store for what the user toggles: callers followed, calls watched
 * for an exit, and demo-only state changes (an exit announced from Portfolio).
 * Persisted per browser. Moves to the API once accounts exist (NEXT.md).
 */
interface State {
  following: string[]
  watching: number[]
  announced: Record<number, number> // call id -> announcedAt (demo actions)
  read: string[] // alert ids marked read
}

const KEY = 'trustpool:v1'
const initial: State = { following: DEMO_FOLLOWING, watching: [7, 9], announced: {}, read: [] }

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

export const actions = {
  toggleFollow(address: string) {
    const has = state.following.some((a) => lower(a) === lower(address))
    set({ following: has ? state.following.filter((a) => lower(a) !== lower(address)) : [...state.following, address] })
    return !has
  },
  toggleWatch(id: number) {
    const has = state.watching.includes(id)
    set({ watching: has ? state.watching.filter((x) => x !== id) : [...state.watching, id] })
    return !has
  },
  announce(id: number) {
    set({ announced: { ...state.announced, [id]: Date.now() } })
  },
  markRead(ids: string[]) {
    set({ read: [...new Set([...state.read, ...ids])] })
  },
}

export const isFollowing = (s: State, a: string) => s.following.some((x) => lower(x) === lower(a))
