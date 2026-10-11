import { CHAINS } from '@trustpool/core'
import { createPublicClient, createWalletClient, defineChain, http, type Account, type PublicClient, type WalletClient } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

function chainOf(chainId: number, rpcUrl: string) {
  return defineChain({
    id: chainId,
    name: CHAINS[chainId]?.name ?? `chain ${chainId}`,
    nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  })
}

const transport = (rpcUrl: string) => http(rpcUrl, { retryCount: 3, retryDelay: 250, timeout: 15_000 })

export function chainClient(chainId: number, rpcUrl: string): PublicClient {
  return createPublicClient({ chain: chainOf(chainId, rpcUrl), transport: transport(rpcUrl) })
}

/** Signs and sends with one key: the keeper's. */
export function walletClient(chainId: number, rpcUrl: string, key: `0x${string}`): WalletClient & { account: Account } {
  return createWalletClient({ account: privateKeyToAccount(key), chain: chainOf(chainId, rpcUrl), transport: transport(rpcUrl) })
}
