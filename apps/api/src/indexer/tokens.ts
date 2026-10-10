import { erc20Abi, getAddress, type PublicClient } from 'viem'
import { log } from '../log'
import { hueOf } from './units'
import type { TokenInfo } from './writer'

/** Reads a token's metadata. Tokens that break the ERC-20 metadata rules still index. */
export async function readToken(client: PublicClient, address: `0x${string}`): Promise<TokenInfo> {
  const read = <T>(functionName: 'symbol' | 'name' | 'decimals', fallback: T) =>
    client.readContract({ address, abi: erc20Abi, functionName }).then(
      (v) => v as T,
      (err) => {
        log.warn('token metadata unreadable', { address, functionName, err })
        return fallback
      },
    )
  const [symbol, name, decimals] = await Promise.all([read('symbol', '?'), read('name', 'Unknown token'), read('decimals', 18)])
  return { address: getAddress(address), symbol, name, decimals: Number(decimals), hue: hueOf(address) }
}
