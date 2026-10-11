import { DEMO_ME, participantsOf, type Call, type Participant } from '@trustpool/core'
import { useStore } from './store'

/**
 * The demo set is fixed, so demo-only actions (a deposit, a withdrawal, a claim by the demo
 * user) are kept in the store and laid over it here. With the API source the chain holds
 * them and these overlays find nothing to apply.
 */
export function applyLocal(call: Call, joined: Record<number, number>): Call {
  const add = joined[call.id]
  if (!add || call.state !== 'Open') return call
  const had = participantsOf(call.id).find((p) => p.address === DEMO_ME)?.deposit ?? 0
  const now = had + add
  return {
    ...call,
    totalIn: call.totalIn + add,
    depositors: call.depositors + (had === 0 && now > 0 ? 1 : had > 0 && now <= 0 ? -1 : 0),
    callerStake: call.caller === DEMO_ME ? call.callerStake + add : call.callerStake,
  }
}

export function useLocalCalls(calls: Call[] | undefined | null): Call[] | undefined {
  const joined = useStore((s) => s.joined)
  return calls ? calls.map((c) => applyLocal(c, joined)) : undefined
}

/** The demo user's own row, with any demo deposit, withdrawal or claim applied. */
export function applyLocalParticipants(call: Call, ps: Participant[], joined: Record<number, number>, claimed: number[], me?: string): Participant[] {
  if (!me) return ps
  const add = call.state === 'Open' ? (joined[call.id] ?? 0) : 0
  const mine = ps.find((p) => p.address.toLowerCase() === me.toLowerCase())
  let out = ps
  if (add) {
    const deposit = (mine?.deposit ?? 0) + add
    const rest = ps.filter((p) => p !== mine)
    out = deposit > 0 ? [...rest, { ...(mine ?? { address: me, isCaller: false, claimed: false }), deposit }] : rest
  }
  if (claimed.includes(call.id)) out = out.map((p) => (p.address.toLowerCase() === me.toLowerCase() ? { ...p, claimed: true } : p))
  return out
}
