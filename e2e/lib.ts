/** Shared by the setup and the tests: the local stack's fixed coordinates. */
export const RPC = 'http://127.0.0.1:8545'
export const API = 'http://127.0.0.1:8788'
export const WEB = 'http://127.0.0.1:5290'
export const MNEMONIC = 'test test test test test test test test test test test junk'
/** anvil account 5: no bond, no calls, so the test starts from a new caller. */
export const CALLER_KEY = '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba'
export const CALLER = '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc'

export async function rpc<T = unknown>(method: string, params: unknown[] = []): Promise<T> {
  const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) })
  const body = (await r.json()) as { result: T; error?: { message: string } }
  if (body.error) throw new Error(`${method}: ${body.error.message}`)
  return body.result
}

/** Moves the chain forward and mines a block; returns the new chain time in ms. */
export async function warp(seconds: number): Promise<number> {
  await rpc('evm_increaseTime', [seconds])
  await rpc('evm_mine')
  return chainNow()
}

export async function chainNow(): Promise<number> {
  const block = await rpc<{ timestamp: string }>('eth_getBlockByNumber', ['latest', false])
  return Number(BigInt(block.timestamp)) * 1000
}

export async function api<T>(path: string): Promise<T> {
  const r = await fetch(`${API}/api${path}`)
  if (!r.ok) throw new Error(`${path}: ${r.status}`)
  return (await r.json()) as T
}
