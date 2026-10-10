import { DEPLOYMENTS } from './deployments'
import type { ChainInfo, Deployment } from './types'

/**
 * Chains trustpool knows about. Public RPCs are rate limited; set your own in the
 * environment of the API and the web app for anything beyond a demo.
 * Addresses from docs.monad.xyz; check them again before a mainnet deploy.
 * The testnet was regenesised on 16 Dec 2025: addresses from before that date (the old
 * WMON, Uniswap V2 router, nad.fun routers) have no code any more. Each testnet address
 * below was checked for code on 11 Oct 2026.
 */
export const CHAINS: Record<number, ChainInfo> = {
  10143: {
    id: 10143,
    name: 'Monad Testnet',
    rpcUrl: 'https://testnet-rpc.monad.xyz',
    explorer: 'https://testnet.monadscan.com',
    testnet: true,
  },
  143: {
    id: 143,
    name: 'Monad',
    rpcUrl: 'https://rpc.monad.xyz',
    explorer: 'https://monadvision.com',
    wmon: '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A',
    testnet: false,
  },
  31337: { id: 31337, name: 'Anvil', rpcUrl: 'http://127.0.0.1:8545', testnet: true },
}

/** Known Uniswap V2 routers, for Deploy.s.sol's V2_ROUTER. None is live on the current testnet. */
export const V2_ROUTERS: Record<number, `0x${string}`> = {}

/**
 * Uniswap v4 core, for script/DeployV4.s.sol and UniswapV4Adapter. Testnet from the
 * monad-crypto/protocols registry, verified on chain and by the fork test on 11 Oct 2026.
 */
export const UNISWAP_V4: Record<number, { poolManager: `0x${string}`; stateView: `0x${string}`; universalRouter: `0x${string}` }> = {
  10143: {
    poolManager: '0x451D64ab3b650040d2aE1886602b97ed6eDc643d',
    stateView: '0xB639209539c61BaF67AC04876315786F8D0b153c',
    universalRouter: '0x1b7bfCd2870329b987191910D85c22C7287f3c22',
  },
}

/**
 * nad.fun v3 contracts, for Deploy.s.sol's NADFUN_* variables. Mainnet from the official
 * github.com/Naddotfun/contract-v3-abi; the testnet set is not published there yet.
 */
export const NADFUN: Record<number, { lens: `0x${string}`; curveRouter: `0x${string}`; dexRouter: `0x${string}` }> = {
  143: {
    lens: '0x7e78A8DE94f21804F7a17F4E8BF9EC2c872187ea',
    curveRouter: '0x6F6B8F1a20703309951a5127c45B49b1CD981A22',
    dexRouter: '0x0B79d71AE99528D1dB24A4148b5f4F865cc2b137',
  },
}

export const DEFAULT_CHAIN_ID = 10143

export function deploymentFor(chainId: number): Deployment | undefined {
  return DEPLOYMENTS[chainId]
}

export function chainFor(chainId: number): ChainInfo {
  const c = CHAINS[chainId]
  if (!c) throw new Error(`unknown chain ${chainId}`)
  return c
}
