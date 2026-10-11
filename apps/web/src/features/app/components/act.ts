import { useState } from 'react'
import { toast } from '@/components/ui'
import { useSession } from '@/auth/session'
import { useTrustPool, type TrustPoolTx } from '@/lib/tx'

/**
 * Sends one transaction, says how it went, and bumps `version` once the indexer has had time
 * to see it, so the page reloads. In the demo there is no chain: `demo` applies the change
 * the contract would have made to the local store instead, when the action has one.
 */
export function useAct() {
  const tx = useTrustPool()
  const session = useSession()
  const [version, setVersion] = useState(0)

  async function act(label: string, fn: (t: TrustPoolTx) => Promise<unknown>, done: string, demo?: () => void): Promise<boolean> {
    if (!tx.enabled) {
      if (session.mode === 'demo' && demo) {
        demo()
        toast(`Demo: ${done}`)
        setVersion((v) => v + 1)
        return true
      }
      toast('Demo: transactions need a wallet and a deployment on this chain')
      return false
    }
    toast(`${label}… confirm in your wallet`)
    const r = await tx.run(label, fn)
    toast(r.ok ? done : r.error)
    if (r.ok) setTimeout(() => setVersion((v) => v + 1), 2_500)
    return r.ok
  }

  return { act, pending: tx.pending, enabled: tx.enabled, version }
}
