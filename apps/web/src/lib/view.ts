import type { Call } from '@trustpool/core'
import { useStore } from './store'

/** Applies demo-only actions (an exit announced from Portfolio) on top of the source data. */
export function applyLocal(call: Call, announced: Record<number, number>): Call {
  const at = announced[call.id]
  if (at === undefined || call.state !== 'Locked') return call
  return { ...call, state: 'Exiting', announcedAt: at, exitAt: Math.max(call.unlockAt, at + call.notice) }
}

export function useLocalCalls(calls: Call[] | undefined | null): Call[] | undefined {
  const announced = useStore((s) => s.announced)
  return calls ? calls.map((c) => applyLocal(c, announced)) : undefined
}
