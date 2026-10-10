import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { sql } from 'drizzle-orm'
import { parseEther } from 'viem'
import { openDatabase, type Database } from '../src/db/client'
import { EventWriter } from '../src/indexer/writer'
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
    sql`TRUNCATE alerts, follows, watches, profiles, early_buyers, early_buyer_scans, prices, slashes, calls, callers, tokens, meta RESTART IDENTITY CASCADE`,
  )
  w = new EventWriter(database.db)
  store = postgresStore(database.db)
  await w.upsertToken({ address: TOKEN, symbol: 'CHOG', name: 'Chog', decimals: 18, hue: 10 })
  await w.bondPosted(CALLER, parseEther('10'), at())
})

function open(id: number, mon = '100') {
  return w.callOpened(
    {
      id: BigInt(id),
      caller: CALLER,
      token: TOKEN,
      adapter: ADAPTER,
      monIn: parseEther(mon),
      tokens: parseEther('50000'),
      unlockAt: BigInt(T0 / 1000 + 3 * 86400),
      notice: 43200,
      thesis: 'CHOG holds',
    },
    { ...at(), block: 42n },
  )
}

describe('EventWriter on Postgres', () => {
  test('converts units once: wei to MON, seconds to ms', async () => {
    await open(0)
    const c = (await store.getCall(0))!
    expect(c).toMatchObject({ monIn: 100, tokens: 50_000, notice: 43_200_000, unlockAt: T0 + 3 * 86_400_000, state: 'Locked' })
    expect(c.series).toEqual([0.002, 0.002])
  })

  test('record mirrors the contract across gain, loss, release and stale', async () => {
    for (const id of [0, 1, 2]) await open(id)
    await w.callSettled(0n, CALLER, parseEther('130'), 3000n, at(1))
    await w.callSettled(1n, CALLER, parseEther('70'), -3000n, at(2))
    await w.exitAnnounced(2n, BigInt(T0 / 1000 + 4 * 86400), at(3))
    await w.callMarkedStale(2n, CALLER, at(4))
    await w.callReleased(2n, CALLER, at(5))

    const r = (await store.getCaller(CALLER))!.record
    expect(r).toEqual({ settled: 2, losses: 2, released: 1, open: 0, slashes: 0, stale: 1, sumReturnBps: -10_000, lastActive: T0 + 5 })
    expect((await store.getCall(0))!.series.at(-1)).toBeCloseTo(130 / 50_000)
    expect((await store.getCall(2))!.stale).toBe(true)
    expect((await store.listCalls({ state: ['Settled'] })).map((c) => c.id).sort()).toEqual([0, 1])
    expect((await store.listCalls({ caller: CALLER.toLowerCase(), limit: 2 })).length).toBe(2)
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
    await w.exitAnnounced(0n, BigInt(T0 / 1000 + 3 * 86400), at(1))
    await w.exitAnnounced(0n, BigInt(T0 / 1000 + 3 * 86400), at(1)) // replayed range

    expect((await store.alerts('alice')).map((a) => a.kind)).toEqual(['exit_announced', 'call_opened'])
    expect((await store.alerts('bob')).map((a) => a.kind)).toEqual(['exit_announced'])
    expect(await store.alerts('carol')).toEqual([])

    expect(await w.exitsNowExecutable(T0)).toBe(0)
    expect(await w.exitsNowExecutable(T0 + 3 * 86_400_000)).toBe(1)
    await w.exitsNowExecutable(T0 + 4 * 86_400_000)
    expect((await store.alerts('bob')).map((a) => a.kind)).toEqual(['exit_executable', 'exit_announced'])

    const [first, second] = await store.alerts('bob')
    await store.markRead('bob', [first!.id, 'not-a-number'])
    expect((await store.alerts('bob'))[0]!.read).toBe(true)
    await store.markRead('alice', [second!.id]) // someone else's alert: untouched
    expect((await store.alerts('bob'))[1]!.read).toBe(false)
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
    await w.callOpened({ id: 1n, caller: OTHER, token: TOKEN, adapter: ADAPTER, monIn: 1n, tokens: 1n, unlockAt: 1n, notice: 1, thesis: '' }, at(99))
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
