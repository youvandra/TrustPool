import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import type { Alert } from '@trustpool/core'
import { parseEther } from 'viem'
import { openDatabase, type Database } from '../src/db/client'
import { createApp } from '../src/http/app'
import { EventWriter } from '../src/indexer/writer'
import { AlertHub } from '../src/live/hub'
import { postgresStore } from '../src/store/postgres'
import { rulesArgs } from './fixtures'

const CALLER = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
const TOKEN = '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0'
const at = { at: 1_700_000_000_000, tx: '0x1' }

let database: Database
let hub: AlertHub
let w: EventWriter
const store = () => postgresStore(database.db)

beforeAll(async () => {
  database = await openDatabase(process.env.TEST_DATABASE_URL ?? '')
  hub = new AlertHub()
  await hub.start(database)
  w = new EventWriter(database.db)
  await w.upsertToken({ address: TOKEN, symbol: 'CHOG', name: 'Chog', decimals: 18, hue: 1 })
  await w.bondPosted(CALLER, parseEther('10'), at)
})
afterAll(async () => {
  await hub.close()
  await database.close()
})

const open = (id: number) =>
  w.callOpened({ id: BigInt(id), caller: CALLER, token: TOKEN, tier: 0, rules: rulesArgs(at.at / 1000), thesis: '' }, at)

const until = async (cond: () => boolean, ms = 3000) => {
  for (let t = 0; t < ms && !cond(); t += 20) await new Promise((r) => setTimeout(r, 20))
}

describe('live alerts', () => {
  test('a committed alert reaches its user, and only them', async () => {
    const mine: Alert[] = []
    const theirs: Alert[] = []
    const stop = hub.subscribe('live-alice', (a) => mine.push(a))
    hub.subscribe('live-bob', (a) => theirs.push(a))
    await store().setFollow('live-alice', CALLER, true)
    await database.db.transaction(async (tx) => w.in(tx).callOpened({ id: 100n, caller: CALLER, token: TOKEN, tier: 0, rules: rulesArgs(at.at / 1000), thesis: '' }, at))
    await until(() => mine.length > 0)
    expect(mine).toMatchObject([{ kind: 'window_opened', callId: 100, read: false }])
    expect(theirs).toEqual([])
    stop()
  })

  test('a rolled-back range announces nothing', async () => {
    const got: Alert[] = []
    hub.subscribe('live-carol', (a) => got.push(a))
    await store().setFollow('live-carol', CALLER, true)
    await database.db
      .transaction(async (tx) => {
        await w.in(tx).callOpened({ id: 101n, caller: CALLER, token: TOKEN, tier: 0, rules: rulesArgs(at.at / 1000), thesis: '' }, at)
        throw new Error('rpc failed mid-range')
      })
      .catch(() => {})
    await new Promise((r) => setTimeout(r, 300))
    expect(got).toEqual([])
  })

  test('/me/stream sends ready, then the alerts of its user as SSE', async () => {
    const app = createApp({ store: store(), hub, requestLog: false, heartbeatSec: 60 })
    const res = await app.request('/api/me/stream', { headers: { 'x-demo-user': 'live-dave' } })
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    const reader = res.body!.getReader()
    const read = async () => new TextDecoder().decode((await reader.read()).value)
    expect(await read()).toContain('event: ready')

    await store().setWatch('live-dave', 102, true)
    await open(102)
    await w.bought(102n, parseEther('1'), 2n, at)
    let text = ''
    while (!text.includes('"bought"')) text += await read()
    // One SSE message per blank-line-separated block: `event:`, `data:` and `id:` lines.
    const alerts = text
      .split('\n\n')
      .map((block) => Object.fromEntries(block.split('\n').map((l) => [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 2)])))
      .filter((m) => m.event === 'alert')
      .map((m) => JSON.parse(m.data!) as Alert)
    // The watch came before the open, so this user hears both, in order.
    expect(alerts.map((a) => [a.kind, a.callId])).toEqual([
      ['window_opened', 102],
      ['bought', 102],
    ])
    await reader.cancel()
  })
})
