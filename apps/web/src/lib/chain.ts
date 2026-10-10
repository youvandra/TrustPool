import { chainFor, DEFAULT_CHAIN_ID, deploymentFor, type Deployment } from '@trustpool/core'
import { createPublicClient, defineChain, http } from 'viem'

/**
 * The chain this build talks to, and the TrustPool deployment on it. Addresses come from
 * @trustpool/core (contracts/deployments via `npm run sync:contracts`), never from here.
 */
export const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID ?? DEFAULT_CHAIN_ID)
const info = chainFor(CHAIN_ID)
const rpcUrl = import.meta.env.VITE_RPC_URL || info.rpcUrl

export const chain = defineChain({
  id: info.id,
  name: info.name,
  nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
  blockExplorers: info.explorer ? { default: { name: 'Explorer', url: info.explorer } } : undefined,
  testnet: info.testnet,
})

export const deployment: Deployment | undefined = deploymentFor(CHAIN_ID)

export const publicClient = createPublicClient({ chain, transport: http(rpcUrl) })

export const explorerTx = (hash: string) => (info.explorer ? `${info.explorer}/tx/${hash}` : undefined)

/**
 * Where a follower buys on their own. nad.fun holds the deepest pair for most Monad
 * tokens (docs/product.md); one place to change if that moves.
 */
export function dexUrl(token: string): string | undefined {
  if (CHAIN_ID === 143) return `https://nad.fun/tokens/${token}`
  if (CHAIN_ID === 10143) return `https://testnet.nad.fun/tokens/${token}`
  return undefined
}
