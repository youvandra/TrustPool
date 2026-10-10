import type { Call } from '@/lib/types'

const H = 3_600_000
const D = 24 * H
const t = Date.now()

const base: Call = {
  id: 12,
  caller: '0x7a3F19c0dE2B4a6e8C1f9D3b5A7e2C4d6F8a0B12',
  token: { address: '0x350035555E10d9AfAF1566AaebfCeD5BA6C27777', symbol: 'CHOG', name: 'Chog' },
  monIn: 120,
  tokens: 57_142,
  openedAt: t - D,
  unlockAt: t + 2 * D + 5 * H,
  notice: 12 * H,
  state: 'Locked',
  thesis: 'CHOG holds above its launch range.',
}

/** One call at three moments. The last one is a loss on purpose: the page has to read the same either way. */
export const HERO_STATES: Call[] = [
  base,
  { ...base, state: 'Exiting', announcedAt: t - 3 * H, exitAt: t + 9 * H },
  { ...base, state: 'Settled', announcedAt: t - 14 * H, exitAt: t - 2 * H, monOut: 105.12 },
]
