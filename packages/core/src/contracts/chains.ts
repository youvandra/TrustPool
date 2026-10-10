import { DEPLOYMENTS } from './deployments'
import type { ChainInfo, Deployment } from './types'

/**
 * Chains trustpool knows about. Public RPCs are rate limited; set your own in the
 * environment of the API and the web app for anything beyond a demo.
 * Addresses from docs.monad.xyz; check them again before a mainnet deploy.
 */
export const CHAINS: Record<number, ChainInfo> = {
  10143: {
    id: 10143,
    name: 'Monad Testnet',
    rpcUrl: 'https://testnet-rpc.monad.xyz',
    explorer: 'https://testnet.monadexplorer.com',
    wmon: '0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701',
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

/** Known Uniswap V2 routers, for Deploy.s.sol's V2_ROUTER. */
export const V2_ROUTERS: Record<number, `0x${string}`> = {
  10143: '0xfB8e1C3b833f9E67a71C859a132cf783b645e436',
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
