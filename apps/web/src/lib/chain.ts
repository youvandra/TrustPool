import { chainFor, DEFAULT_CHAIN_ID, deploymentFor, trustPoolAbi, type Deployment } from '@trustpool/core'
import { createPublicClient, defineChain, formatEther, http } from 'viem'

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
 * Where a token trades. On mainnet nad.fun holds the deepest pair for most Monad tokens
 * (docs/product.md). The testnet demo tokens trade only in the Uniswap v4 pools seeded by
 * DeployV4, so there the link opens the token on the explorer instead.
 */
export function dexUrl(token: string): string | undefined {
  if (CHAIN_ID === 143) return `https://nad.fun/tokens/${token}`
  if (CHAIN_ID === 10143) return `${info.explorer}/token/${token}`
  return undefined
}

/** True when `dexUrl` leads to a place to buy, false when it only shows the token. */
export const dexIsMarket = CHAIN_ID === 143

/** The contract's parameters for new calls, in MON and seconds. */
export interface PoolParams {
  minBond: number
  minPool: number
  minWindow: number
  maxWindow: number
  minHold: number
  maxHold: number
  minStopLossBps: number
  maxStopLossBps: number
  minCallerBps: number
  maxImpactBps: number
  checkpointGap: number
}

/** Production defaults from docs/product.md, for the demo and until the chain answers. */
export const DEFAULT_PARAMS: PoolParams = {
  minBond: 10,
  minPool: 50,
  minWindow: 30 * 60,
  maxWindow: 6 * 3600,
  minHold: 3600,
  maxHold: 72 * 3600,
  minStopLossBps: 100,
  maxStopLossBps: 9000,
  minCallerBps: 500,
  maxImpactBps: 200,
  checkpointGap: 15 * 60,
}

export async function readParams(): Promise<PoolParams> {
  if (!deployment) return DEFAULT_PARAMS
  const p = await publicClient.readContract({ address: deployment.trustPool, abi: trustPoolAbi, functionName: 'params' })
  return {
    minBond: Number(formatEther(p.minBond)),
    minPool: Number(formatEther(p.minPool)),
    minWindow: p.minWindow,
    maxWindow: p.maxWindow,
    minHold: p.minHold,
    maxHold: p.maxHold,
    minStopLossBps: p.minStopLossBps,
    maxStopLossBps: p.maxStopLossBps,
    minCallerBps: p.minCallerBps,
    maxImpactBps: p.maxImpactBps,
    checkpointGap: p.checkpointGap,
  }
}
