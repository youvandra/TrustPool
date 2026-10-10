// @ts-expect-error plain ESM module without types
export { API, CALLER, RPC, rpc, warp, WEB } from '../scripts/local-stack.mjs'
// @ts-expect-error plain ESM module without types
import { API, rpc } from '../scripts/local-stack.mjs'

export async function chainNow(): Promise<number> {
  const block = (await rpc('eth_getBlockByNumber', ['latest', false])) as { timestamp: string }
  return Number(BigInt(block.timestamp)) * 1000
}

export async function api<T>(path: string): Promise<T> {
  const r = await fetch(`${API}/api${path}`)
  if (!r.ok) throw new Error(`${path}: ${r.status}`)
  return (await r.json()) as T
}
