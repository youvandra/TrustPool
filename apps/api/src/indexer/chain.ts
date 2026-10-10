import { CHAINS } from '@trustpool/core'
import { createPublicClient, defineChain, http, type PublicClient } from 'viem'

export function chainClient(chainId: number, rpcUrl: string): PublicClient {
  const known = CHAINS[chainId]
  const chain = defineChain({
    id: chainId,
    name: known?.name ?? `chain ${chainId}`,
    nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  })
  return createPublicClient({ chain, transport: http(rpcUrl, { retryCount: 3, retryDelay: 250, timeout: 15_000 }) })
}
