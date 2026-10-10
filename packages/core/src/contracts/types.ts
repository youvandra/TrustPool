/** What contracts/script/Deploy.s.sol writes to contracts/deployments/<chainId>.json. */
export interface Deployment {
  chainId: number
  /** Block the deployment started at; the indexer begins here. */
  startBlock: number
  trustPool: `0x${string}`
  adapter: `0x${string}`
  adapterKind: 'nadfun' | 'uniswap-v2' | 'uniswap-v4' | 'mock' | 'existing' | (string & {})
  admin: `0x${string}`
  treasury: `0x${string}`
  tokens: `0x${string}`[]
}

export interface ChainInfo {
  id: number
  name: string
  rpcUrl: string
  explorer?: string
  /** Wrapped MON on this chain, if any. */
  wmon?: `0x${string}`
  testnet: boolean
}
