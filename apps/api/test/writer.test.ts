import { describe, expect, test } from 'bun:test'
import { parseEther } from 'viem'
import { openDatabase } from '../src/db/database'
import { EventWriter } from '../src/indexer/writer'
import { sqliteStore } from '../src/store/sqlite'

const CALLER = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
const TOKEN = '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0'
const ADAPTER = '0x5FbDB2315678afecb367f032d93F642f64180aa3'
const T0 = 1_700_000_000_000
const at = (dt = 0) => ({ at: T0 + dt, tx: '0xabc' })

function setup() {
  const db = openDatabase(':memory:')
  const w = new EventWriter(db)
  const store = sqliteStore(db)
  w.upsertToken({ address: TOKEN, symbol: 'CHOG', name: 'Chog', decimals: 18, hue: 10 })
  w.bondPosted(CALLER, parseEther('10'), at())
  return { db, w, store }
}

function open(w: EventWriter, id: number, mon = '100') {
  w.callOpened(
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
    at(),
  )
}

describe('EventWriter', () => {
  test('converts units once: wei to MON, seconds to ms', () => {
    const { w, store } = setup()
    open(w, 0)
    const c = store.getCall(0)!
    expect(c.monIn).toBe(100)
    expect(c.tokens).toBe(50_000)
    expect(c.notice).toBe(43_200_000)
    expect(c.unlockAt).toBe(T0 + 3 * 86_400_000)
    expect(c.state).toBe('Locked')
    expect(c.series).toEqual([0.002, 0.002])
  })

  test('record mirrors the contract across gain, loss, release and stale', () => {
    const { w, store } = setup()
    for (const id of [0, 1, 2]) open(w, id)
    w.callSettled(0n, CALLER, parseEther('130'), 3000n, at(1))
    w.callSettled(1n, CALLER, parseEther('70'), -3000n, at(2))
    w.exitAnnounced(2n, BigInt(T0 / 1000 + 4 * 86400), at(3))
    w.callMarkedStale(2n, CALLER, at(4))
    w.callReleased(2n, CALLER, at(5))

    const r = store.getCaller(CALLER)!.record
    expect(r).toEqual({ settled: 2, losses: 2, released: 1, open: 0, slashes: 0, stale: 1, sumReturnBps: -10_000, lastActive: T0 + 5 })
    expect(store.getCall(0)!.series.at(-1)).toBeCloseTo(130 / 50_000)
    expect(store.getCall(2)!.stale).toBe(true)
    expect(store.listCalls({ state: ['Settled'] }).map((c) => c.id).sort()).toEqual([0, 1])
  })

  test('slash takes from the bond and keeps the reason', () => {
    const { w, store } = setup()
    w.slashed(CALLER, parseEther('4'), 'funded wallet bought first', at(9))
    const c = store.getCaller(CALLER)!
    expect(c.bond).toBe(6)
    expect(c.record.slashes).toBe(1)
    expect(c.slashHistory).toEqual([{ amount: 4, reason: 'funded wallet bought first', at: T0 + 9 }])
  })

  test('bond withdrawal clears the bond', () => {
    const { w, store } = setup()
    w.bondWithdrawRequested(CALLER, BigInt(T0 / 1000 + 7 * 86400))
    w.bondWithdrawn(CALLER)
    expect(store.getCaller(CALLER)!.bond).toBe(0)
  })

  test('alerts reach followers and watchers once each, and replays are harmless', () => {
    const { w, store } = setup()
    store.setFollow('alice', CALLER, true)
    open(w, 0)
    store.setWatch('bob', 0, true)
    store.setWatch('alice', 0, true) // follows and watches: still one alert per event
    w.exitAnnounced(0n, BigInt(T0 / 1000 + 3 * 86400), at(1))
    w.exitAnnounced(0n, BigInt(T0 / 1000 + 3 * 86400), at(1)) // replayed range

    expect(store.alerts('alice').map((a) => a.kind)).toEqual(['exit_announced', 'call_opened'])
    expect(store.alerts('bob').map((a) => a.kind)).toEqual(['exit_announced'])
    expect(store.alerts('carol')).toEqual([])

    expect(w.exitsNowExecutable(T0)).toBe(0)
    expect(w.exitsNowExecutable(T0 + 3 * 86_400_000)).toBe(1)
    w.exitsNowExecutable(T0 + 4 * 86_400_000)
    expect(store.alerts('bob').map((a) => a.kind)).toEqual(['exit_executable', 'exit_announced'])

    const id = store.alerts('bob')[0]!.id
    store.markRead('bob', [id, 'not-a-number'])
    expect(store.alerts('bob')[0]!.read).toBe(true)
    store.markRead('alice', [store.alerts('bob')[1]!.id]) // someone else's alert: untouched
    expect(store.alerts('bob')[1]!.read).toBe(false)
  })

  test('watchers and followers are counted', () => {
    const { w, store } = setup()
    open(w, 0)
    store.setWatch('a', 0, true)
    store.setWatch('b', 0, true)
    store.setWatch('b', 0, false)
    store.setFollow('a', CALLER.toLowerCase(), true)
    expect(store.getCall(0)!.watchers).toBe(1)
    expect(store.getCaller(CALLER)!.followers).toBe(1)
    expect(store.watching('a')).toEqual([0])
  })
})
