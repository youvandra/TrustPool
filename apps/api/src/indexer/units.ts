import { formatUnits } from 'viem'

/**
 * The one place chain units become display units (NEXT.md: "convert in the indexer,
 * nowhere else"). The contract speaks wei and seconds; @trustpool/core speaks MON and ms.
 */
export const mon = (wei: bigint): number => Number(formatUnits(wei, 18))
export const amount = (raw: bigint, decimals: number): number => Number(formatUnits(raw, decimals))
export const ms = (seconds: bigint | number): number => Number(seconds) * 1000

/** Stable display hue for a token, from its address. Purely cosmetic. */
export function hueOf(address: string): number {
  let h = 0
  for (const ch of address.toLowerCase().slice(2)) h = (h * 31 + parseInt(ch, 16)) % 360
  return h
}
