import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { sql } from 'drizzle-orm'
import { parseEther } from 'viem'
import { openDatabase, type Database } from '../src/db/client'
import { closingLead, EventWriter, type RulesArgs } from '../src/indexer/writer'
import { postgresStore } from '../src/store/postgres'

const CALLER = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
const OTHER = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'
const TOKEN = '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0'
const ADAPTER = '0x5FbDB2315678afecb367f032d93F642f64180aa3'
const T0 = 1_700_000_000_000
const at = (dt = 0) => ({ at: T0 + dt, tx: '0xabc' })

// One embedded Postgres for the file; every test starts from empty tables.
let database: Database
beforeAll(async () => {
  database = await openDatabase(process.env.TEST_DATABASE_URL ?? '')
})
afterAll(() => database.close())

let w: EventWriter
let store: ReturnType<typeof postgresStore>
beforeEach(async () => {
  await database.db.execute(
    sql`TRUNCATE alerts, follows, watches, profiles, early_buyers, early_buyer_scans, prices, claims, deposits, slashes, calls, callers, tokens, meta RESTART IDENTITY CASCADE`,
  )
  w = new EventWriter(database.db)
  store = postgresStore(database.db)
  await w.upsertToken({ address: TOKEN, symbol: 'CHOG', name: 'Chog', decimals: 18, hue: 10 })
  await w.bondPosted(CALLER, parseEther('10'), at())
})

const J1 = '0x90F79bf6EB2c4f870365E785982E1f101E93b906'
const J2 = '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65'
const S = T0 / 1000 // the chain's seconds
const H = 3600
const HM = H * 1000
const rules = (o: Partial<RulesArgs> = {}): RulesArgs => ({
  adapter: ADAPTER,
  windowEnd: S + H,
  buyDeadline: S + 3 * H,
  maxHold: 24 * H,
  takeProfitBps: 2500,
  stopLossBps: 2000,
  shareBps: 1000,
  minCallerBps: 500,
  maxImpactBps: 200,
  sellToleranceBps: 200,
  keeperBps: 10,
  checkpointGap: 900,
  splitGrace: 6 * H,
  cap: parseEther('1000'),
  minPool: parseEther('50'),
  ...o,
})

/** Opens with the caller's stake and the joiners' deposits, as the contract emits them. */
async function open(id: number, stake = '100', joins: [string, string][] = [], o: Partial<RulesArgs> = {}) {
  await w.callOpened({ id: BigInt(id), caller: CALLER, token: TOKEN, tier: 1, rules: rules(o), thesis: 'CHOG holds' }, { ...at(), block: 42n })
  let total = parseEther(stake)
  await w.depositChanged(BigInt(id), CALLER, total, total, at())
  for (const [who, mon] of joins) {
    total += parseEther(mon)
    await w.depositChanged(BigInt(id), who, parseEther(mon), total, at(1))
  }
}

async function buyAndSell(id: number, tokens: string, gross: string, netReturnBps: bigint, payout: string, fee = '0', reason = 1) {
  await w.bought(BigInt(id), parseEther(tokens), BigInt(S + 2 * H + 24 * H), { ...at(2 * HM), block: 50n })
  await w.sold(
    { id: BigInt(id), keeper: OTHER, reason, gross: parseEther(gross), keeperReward: parseEther(gross) / 1000n, fee: parseEther(fee), payout: parseEther(payout), netReturnBps },
    at(3 * HM),
  )
}

describe('EventWriter on Postgres', () => {
  test('converts units once: wei to MON, seconds to ms, rules fixed at open', async () => {
    await open(0, '100', [[J1, '300']])
    const c = (await store.getCall(0))!
    expect(c).toMatchObject({ state: 'Open', tier: 1, totalIn: 400, callerStake: 100, depositors: 2, checkpoints: [], series: [] })
    expect(c.rules).toEqual({
      windowEnd: T0 + 3_600_000,
      buyDeadline: T0 + 3 * 3_600_000,
      maxHold: 24 * 3_600_000,
      takeProfitBps: 2500,
      stopLossBps: 2000,
      shareBps: 1000,
      minCallerBps: 500,
      maxImpactBps: 200,
      sellToleranceBps: 200,
      keeperBps: 10,
      checkpointGap: 900_000,
      splitGrace: 6 * 3_600_000,
      cap: 1000,
      minPool: 50,
    })
    expect(c.tokens).toBeUndefined()
  })

  test('deposits and withdrawals track each wallet and the pool', async () => {
    await open(0, '100', [[J1, '300'], [J2, '50']])
    await w.depositChanged(0n, J2, 0n, parseEther('400'), at(5)) // J2 leaves
    await w.depositChanged(0n, J1, parseEther('350'), parseEther('450'), at(6)) // J1 adds 50
    const c = (await store.getCall(0))!
    expect(c).toMatchObject({ totalIn: 450, depositors: 2, callerStake: 100 })
    expect((await store.participants(0))!.map((p) => [p.address, p.deposit, p.isCaller])).toEqual([
      [CALLER, 100, true],
      [J1, 350, false],
    ])
    expect(await store.participants(9)).toBeUndefined()
  })

  test("the PM's worked example lands as the contract emits it, claims included", async () => {
    await open(0, '100', [[J1, '300'], [J2, '400'], [OTHER, '200']])
    await w.bought(0n, parseEther('1000'), BigInt(S + 2 * H + 24 * H), { ...at(2 * HM), block: 50n })
    await w.checkpointed(0n, parseEther('1290'), BigInt(S + 3 * H))
    await w.checkpointed(0n, parseEther('1300'), BigInt(S + 3 * H + 900))
    const holding = (await store.getCall(0))!
    expect(holding).toMatchObject({ state: 'Holding', tokens: 1000, boughtAt: T0 + 2 * 3_600_000 })
    expect(holding.checkpoints).toEqual([
      { value: 1290, at: T0 + 3 * 3_600_000 },
      { value: 1300, at: T0 + 3 * 3_600_000 + 900_000 },
    ])
    expect(holding.series).toEqual([1, 1.29, 1.3])

    await w.sold(
      { id: 0n, keeper: OTHER, reason: 1, gross: parseEther('1300'), keeperReward: parseEther('1.3'), fee: parseEther('29.87'), payout: parseEther('1268.83'), netReturnBps: 2688n },
      at(4 * HM),
    )
    const c = (await store.getCall(0))!
    expect(c).toMatchObject({ state: 'Settled', saleReason: 'take_profit', keeper: OTHER, gross: 1300, fee: 29.87, payout: 1268.83, netReturnBps: 2688 })
    const owed = Object.fromEntries((await store.participants(0))!.map((p) => [p.address, Math.round(p.claimMon! * 100) / 100]))
    expect(owed).toEqual({ [CALLER]: 156.75, [J1]: 380.65, [J2]: 507.53, [OTHER]: 253.77 })

    await w.claimed(0n, J1, parseEther('380.649'), 0n, at(5 * HM))
    const [mine] = await store.positions(J1)
    expect(mine).toMatchObject({ callId: 0, deposit: 300, claimed: true, claimMon: 380.649 })
    expect(await store.positions(J1.toLowerCase())).toHaveLength(1)
  })

  test('record mirrors the contract across gain, loss, refunds and split', async () => {
    for (const id of [0, 1, 2, 3, 4]) await open(id, '100')
    await buyAndSell(0, '100', '130', 2987n, '129.87')
    await buyAndSell(1, '100', '70', -3007n, '69.93', '0', 2)
    await w.refunded(2n, true, at(4 * HM))
    await w.refunded(3n, false, at(4 * HM))
    await w.bought(4n, parseEther('100'), BigInt(S + 26 * H), at(2 * HM))
    await w.splitStarted(4n, at(40 * HM))
    await w.claimed(4n, CALLER, 0n, parseEther('100'), at(41 * HM))

    const r = (await store.getCaller(CALLER))!
    expect(r.record).toEqual({ settled: 2, losses: 1, negligent: 1, refunded: 1, split: 1, slashes: 0, active: 0, sumNetBps: -20, lastActive: T0 + 40 * HM })
    expect(r.tier).toBe(0)
    expect((await store.getCall(2))!.negligent).toBe(true)
    expect((await store.getCall(3))!.negligent).toBe(false)
    expect((await store.participants(4))![0]).toMatchObject({ claimed: true, claimTokens: 100 })
    expect((await store.listCalls({ state: ['Settled'] })).map((c) => c.id).sort()).toEqual([0, 1])
    expect((await store.listCalls({ caller: CALLER.toLowerCase(), limit: 2 })).length).toBe(2)
  })

  test('three settled calls with a positive average reach tier 1; a slash drops it', async () => {
    for (const id of [0, 1, 2]) {
      await open(id, '100')
      await buyAndSell(id, '100', '120', 1988n, '119.88')
    }
    expect((await store.getCaller(CALLER))!.tier).toBe(1)
    await w.slashed(CALLER, parseEther('1'), 'test', at(9))
    expect((await store.getCaller(CALLER))!.tier).toBe(0)
  })

  test('slash takes from the bond and keeps the reason', async () => {
    await w.slashed(CALLER, parseEther('4'), 'funded wallet bought first', at(9))
    const c = (await store.getCaller(CALLER))!
    expect(c.bond).toBe(6)
    expect(c.record.slashes).toBe(1)
    expect(c.slashHistory).toEqual([{ amount: 4, reason: 'funded wallet bought first', at: T0 + 9 }])
  })

  test('bond withdrawal clears the bond', async () => {
    await w.bondWithdrawRequested(CALLER, BigInt(T0 / 1000 + 7 * 86400))
    await w.bondWithdrawn(CALLER)
    expect((await store.getCaller(CALLER))!.bond).toBe(0)
  })

  test('alerts reach followers and watchers once each, and replays are harmless', async () => {
    await store.setFollow('alice', CALLER, true)
    await open(0)
    await store.setWatch('bob', 0, true)
    await store.setWatch('alice', 0, true) // follows and watches: still one alert per event
    await w.bought(0n, parseEther('100'), BigInt(S + 26 * H), at(2 * HM))
    await w.bought(0n, parseEther('100'), BigInt(S + 26 * H), at(2 * HM)) // replayed range

    expect((await store.alerts('alice')).map((a) => a.kind)).toEqual(['bought', 'window_opened'])
    expect((await store.alerts('bob')).map((a) => a.kind)).toEqual(['bought'])
    expect(await store.alerts('carol')).toEqual([])

    const [first] = await store.alerts('alice')
    await store.markRead('alice', [first!.id, 'not-a-number'])
    expect((await store.alerts('alice'))[0]!.read).toBe(true)
    await store.markRead('bob', [(await store.alerts('alice'))[1]!.id]) // someone else's alert: untouched
    expect((await store.alerts('alice'))[1]!.read).toBe(false)
  })

  test('"window closing" goes out once, in the last stretch of an open window', async () => {
    await store.setWatch('bob', 0, true)
    await open(0) // a one-hour window: the last 15 minutes count as closing
    expect(closingLead(3_600_000)).toBe(900_000)
    expect(await w.windowsClosing(T0 + 40 * 60_000)).toBe(0)
    expect(await w.windowsClosing(T0 + 50 * 60_000)).toBe(1)
    expect(await w.windowsClosing(T0 + 55 * 60_000)).toBe(0)
    expect((await store.alerts('bob')).map((a) => a.kind)).toEqual(['window_closing', 'window_opened'])
    expect(await w.windowsClosing(T0 + 70 * 60_000)).toBe(0) // closed: nothing more
  })

  test('watchers and followers are counted, addresses in any case', async () => {
    await open(0)
    await store.setWatch('a', 0, true)
    await store.setWatch('b', 0, true)
    await store.setWatch('b', 0, false)
    await store.setFollow('a', CALLER.toLowerCase(), true)
    expect((await store.getCall(0))!.watchers).toBe(1)
    expect((await store.getCaller(CALLER.toLowerCase()))!.followers).toBe(1)
    expect(await store.watching('a')).toEqual([0])
    expect(await store.following('a')).toEqual([CALLER])
  })

  test('a stored profile names the caller; without one the address stands in', async () => {
    expect((await store.getCaller(CALLER))!.handle).toBe('0x7099…79C8')
    expect(await store.setProfile({ address: CALLER, handle: 'olu', bio: 'Small caps.', signedAt: 2 })).toBe('ok')
    expect(await store.getCaller(CALLER)).toMatchObject({ handle: 'olu', bio: 'Small caps.' })
    expect(await store.setProfile({ address: CALLER, handle: 'older', bio: '', signedAt: 1 })).toBe('stale')
    expect(await store.setProfile({ address: OTHER, handle: 'olu', bio: '', signedAt: 3 })).toBe('unknown') // never bonded
    await w.bondPosted(OTHER, parseEther('10'), at())
    expect(await store.setProfile({ address: OTHER, handle: 'olu', bio: '', signedAt: 3 })).toBe('taken')
  })

  test('callers page newest-active first', async () => {
    await w.bondPosted(OTHER, parseEther('20'), at(50))
    await open(0) // CALLER active at T0
    await w.callOpened({ id: 1n, caller: OTHER, token: TOKEN, tier: 0, rules: rules(), thesis: '' }, at(99))
    expect((await store.listCallers()).map((c) => c.address)).toEqual([OTHER, CALLER])
    expect((await store.listCallers({ limit: 1, offset: 1 })).map((c) => c.address)).toEqual([CALLER])
  })
})

describe('indexer lock', () => {
  test('one holder at a time per connection', async () => {
    expect(await database.tryIndexerLock()).toBe(true)
    expect(await database.tryIndexerLock()).toBe(true) // re-entrant on the same session
  })
})

describe('allow list', () => {
  test('lists only the tokens the contract would accept a call on', async () => {
    expect(await store.listTokens()).toEqual([])
    await w.tokenAllowed(TOKEN, true)
    expect((await store.listTokens()).map((t) => t.symbol)).toEqual(['CHOG'])
    await w.tokenAllowed(TOKEN, false)
    expect(await store.listTokens()).toEqual([])
  })
})
