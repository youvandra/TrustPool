import type { Call, Caller, CallerRecord, Slash, Token } from './types'
import { returnBps } from './types'

/**
 * The app reads through this interface only. `demoSource` below serves fixed
 * demo data; the chain source (viem reads of TrustPool + its events) replaces
 * it without touching any page. See NEXT.md.
 */
export interface DataSource {
  readonly live: boolean
  listCalls(): Promise<Call[]>
  getCall(id: number): Promise<Call | undefined>
  getCaller(address: string): Promise<Caller | undefined>
  listTokens(): Promise<Token[]>
}

const H = 3_600_000
const D = 24 * H
const now = Date.now()

const TOKENS: Record<string, Token> = {
  CHOG: { address: '0x350035555E10d9AfAF1566AaebfCeD5BA6C27777', symbol: 'CHOG', name: 'Chog' },
  MOE: { address: '0x4f0a3b7C27E28A3c1A3B8Bd9F3E2D6C77b1E9a10', symbol: 'MOE', name: 'Moe' },
  JAMES: { address: '0x8c2d6e8A1B7f0E3D4c5B6a79810F2e3D4C5b6A71', symbol: 'JAMES', name: 'James' },
}

const A = '0x7a3F19c0dE2B4a6e8C1f9D3b5A7e2C4d6F8a0B12'
const B = '0xB41c5E7a9D2f4B6c8E0a1D3f5B7c9E1a3C5e7D90'
const C = '0x2Ce8a0B2c4D6e8F0a2B4c6D8e0F2a4B6c8D0e2F4'

const HANDLES: Record<string, string> = { [A]: 'olu', [B]: 'marisa', [C]: 'kenta' }

function call(
  id: number,
  caller: string,
  sym: keyof typeof TOKENS,
  monIn: number,
  price: number,
  openedAgo: number,
  lock: number,
  notice: number,
  rest: Partial<Call> & Pick<Call, 'state' | 'thesis'>,
): Call {
  return {
    id,
    caller,
    token: TOKENS[sym]!,
    monIn,
    tokens: monIn / price,
    openedAt: now - openedAgo,
    unlockAt: now - openedAgo + lock,
    notice,
    // demo calls announce late enough that the notice decides the exit time
    announcedAt: rest.exitAt !== undefined ? rest.exitAt - notice : undefined,
    ...rest,
  }
}

const CALLS: Call[] = [
  call(0, A, 'MOE', 150, 0.048, 30 * D, 5 * D, 12 * H, { state: 'Settled', monOut: 177.6, exitAt: now - 24 * D, thesis: 'MOE volume has held for two weeks after listing.' }),
  call(1, A, 'CHOG', 100, 0.002, 22 * D, 3 * D, 12 * H, { state: 'Settled', monOut: 69.93, exitAt: now - 18 * D, thesis: 'CHOG holds above its launch range.' }),
  call(2, B, 'JAMES', 200, 0.0031, 20 * D, 4 * D, D, { state: 'Settled', monOut: 212.4, exitAt: now - 15 * D, thesis: 'JAMES liquidity doubled this week.' }),
  call(3, B, 'CHOG', 80, 0.0024, 16 * D, 3 * D, 12 * H, { state: 'Released', exitAt: now - 12 * D, thesis: 'Short hold on the CHOG listing.' }),
  call(4, C, 'MOE', 60, 0.051, 12 * D, 2 * D, 6 * H, { state: 'Settled', monOut: 57.06, exitAt: now - 9 * D, thesis: 'MOE retests the range it broke.' }),
  call(5, A, 'JAMES', 90, 0.0028, 9 * D, 3 * D, 12 * H, { state: 'Settled', monOut: 100.8, exitAt: now - 5 * D, thesis: 'JAMES: second leg after the pair moved to MON.' }),
  call(6, B, 'MOE', 300, 0.052, 4 * D, 3 * D, D, { state: 'Exiting', exitAt: now + 9 * H, thesis: 'MOE into the end of the month.' }),
  call(7, C, 'CHOG', 45, 0.0022, 2 * D, D, 6 * H, { state: 'Exiting', exitAt: now + 2 * H, thesis: 'One day on CHOG, nothing more.' }),
  call(8, A, 'CHOG', 120, 0.0021, D, 3 * D, 12 * H, { state: 'Locked', thesis: 'CHOG again, smaller size, same thesis.' }),
  call(9, C, 'JAMES', 40, 0.0033, 3 * H, 7 * D, 12 * H, { state: 'Locked', thesis: 'A week on JAMES while the pool is still deep.' }),
]

const SLASHES: Record<string, Slash[]> = {
  [B]: [{ amount: 2, reason: 'A wallet funded by this caller bought CHOG 40 minutes before call #3.', at: now - 11 * D }],
}

const BONDS: Record<string, number> = { [A]: 25, [B]: 18, [C]: 10 }

/** Built from the calls themselves, so the record and the call list can never disagree. */
function recordOf(address: string): CallerRecord {
  const mine = CALLS.filter((c) => c.caller === address)
  const r: CallerRecord = { settled: 0, losses: 0, released: 0, open: 0, slashes: SLASHES[address]?.length ?? 0, sumReturnBps: 0, lastActive: 0 }
  for (const c of mine) {
    r.lastActive = Math.max(r.lastActive, c.openedAt)
    if (c.state === 'Locked' || c.state === 'Exiting') {
      r.open += 1
      continue
    }
    const bps = returnBps(c)!
    r.sumReturnBps += bps
    if (bps < 0) r.losses += 1
    if (c.state === 'Settled') r.settled += 1
    else r.released += 1
  }
  return r
}

export const demoSource: DataSource = {
  live: false,
  async listCalls() {
    return [...CALLS].sort((a, b) => b.openedAt - a.openedAt)
  },
  async getCall(id) {
    return CALLS.find((c) => c.id === id)
  },
  async getCaller(address) {
    const key = Object.keys(BONDS).find((k) => k.toLowerCase() === address.toLowerCase())
    if (!key) return undefined
    return { address: key, handle: HANDLES[key], bond: BONDS[key]!, record: recordOf(key), slashHistory: SLASHES[key] ?? [] }
  },
  async listTokens() {
    return Object.values(TOKENS)
  },
}

export const source: DataSource = demoSource
