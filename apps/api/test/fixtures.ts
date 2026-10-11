import { parseEther } from 'viem'
import type { RulesArgs } from '../src/indexer/writer'

/** The `Rules` of a CallOpened event: a one-hour window, a day's hold, from `start` (seconds). */
export function rulesArgs(start: number, o: Partial<RulesArgs> = {}): RulesArgs {
  return {
    adapter: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
    windowEnd: start + 3600,
    buyDeadline: start + 3 * 3600,
    maxHold: 24 * 3600,
    takeProfitBps: 2500,
    stopLossBps: 2000,
    shareBps: 1000,
    minCallerBps: 500,
    maxImpactBps: 200,
    sellToleranceBps: 200,
    keeperBps: 10,
    checkpointGap: 900,
    splitGrace: 6 * 3600,
    cap: parseEther('1000'),
    minPool: parseEther('50'),
    ...o,
  }
}
