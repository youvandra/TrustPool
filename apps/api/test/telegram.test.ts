import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import type { Call } from '@trustpool/core'
import { parseEther } from 'viem'
import { loadConfig } from '../src/config'
import { openDatabase, type Database } from '../src/db/client'
import { EventWriter } from '../src/indexer/writer'
import { TelegramFeed, telegramText } from '../src/live/telegram'
import { postgresStore } from '../src/store/postgres'

const CALLER = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'
const TOKEN = '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9'
const T0 = 1_700_000_000_000
const at = (dt = 0) => ({ at: T0 + dt, tx: '0x1' })

const call: Call = {
  id: 7,
  caller: CALLER,
  token: { address: TOKEN, symbol: 'tCHOG', name: 'Chog', hue: 1 },
  monIn: 1,
  tokens: 100,
  openedAt: T0,
  unlockAt: T0 + 3 * 86_400_000,
  notice: 5 * 3_600_000,
  announcedAt: T0 + 4 * 86_400_000,
  exitAt: T0 + 4 * 86_400_000 + 5 * 3_600_000,
  state: 'Exiting',
  thesis: '',
  series: [],
  watchers: 0,
}

describe('telegramText', () => {
  test('one line per kind, then the link', () => {
    const caller = { handle: 'olu' } as never
    expect(telegramText('call_opened', call, caller)).toBe('olu opened a call on tCHOG with 1.00 MON. Locked for 3d 0h.\nhttps://trustpool.web.id/app/calls/7')
    expect(telegramText('exit_announced', call, caller)!.split('\n')[0]).toBe('olu announced an exit on tCHOG. Can sell in 5h.')
    expect(telegramText('call_released', call, caller)!.split('\n')[0]).toBe('olu took tCHOG unsold. −100.0% on the record.')
    expect(telegramText('call_stale', call, caller)!.split('\n')[0]).toBe("olu's call on tCHOG is past its max hold and marked stale.")
    expect(telegramText('exit_executable', call, caller)).toBeUndefined()
  })

  test('a loss reads exactly like a gain', () => {
    const loss = telegramText('call_settled', { ...call, state: 'Settled', monOut: 0.876 }, undefined)!
    const gain = telegramText('call_settled', { ...call, state: 'Settled', monOut: 1.124 }, undefined)!
    expect(loss.split('\n')[0]).toBe('0x3C44…93BC sold tCHOG. −12.4% on the record.')
    expect(gain.split('\n')[0]).toBe('0x3C44…93BC sold tCHOG. +12.4% on the record.')
  })
})

describe('config', () => {
  test('off unless both the token and the chat are set', () => {
    expect(loadConfig({}).telegram).toBeUndefined()
    expect(loadConfig({ TELEGRAM_BOT_TOKEN: 'x' }).telegram).toBeUndefined()
    expect(loadConfig({ TELEGRAM_BOT_TOKEN: 'x', TELEGRAM_CHAT_ID: '@c' }).telegram).toEqual({ botToken: 'x', chatId: '@c' })
  })
})

describe('TelegramFeed', () => {
  let database: Database
  let w: EventWriter

  beforeAll(async () => {
    database = await openDatabase(process.env.TEST_DATABASE_URL ?? '')
    w = new EventWriter(database.db)
    await w.upsertToken({ address: TOKEN, symbol: 'tCHOG', name: 'Chog', decimals: 18, hue: 1 })
    await w.tokenAllowed(TOKEN, true)
    await w.bondPosted(CALLER, parseEther('10'), at())
  })
  afterAll(() => database.close())

  const feed = (leader: boolean, opts: { perMinute?: number; sleep?: (ms: number) => Promise<void>; status?: number } = {}) => {
    const posts: { url: string; body: { chat_id: string; text: string } }[] = []
    const f = new TelegramFeed(postgresStore(database.db), {
      botToken: 'T',
      chatId: '@calls',
      isLeader: () => leader,
      perMinute: opts.perMinute,
      sleep: opts.sleep,
      fetch: (async (url: string, init: RequestInit) => {
        posts.push({ url, body: JSON.parse(String(init.body)) })
        return new Response('{}', { status: opts.status ?? 200 })
      }) as never,
    })
    return { f, posts }
  }

  const settle = async (...fs: TelegramFeed[]) => {
    await new Promise((r) => setTimeout(r, 300))
    for (const f of fs) await f.idle()
  }

  test('posts each call event once, from the indexing instance only, with no followers', async () => {
    const leader = feed(true)
    const other = feed(false)
    await leader.f.start(database)
    await other.f.start(database)

    const id = 900n
    await database.db.transaction(async (tx) => {
      await w.in(tx).callOpened({ id, caller: CALLER, token: TOKEN, adapter: TOKEN, monIn: parseEther('1'), tokens: parseEther('100'), unlockAt: BigInt((T0 + 600_000) / 1000), notice: 300, thesis: '' }, at())
    })
    await w.exitAnnounced(id, BigInt((T0 + 900_000) / 1000), at(600_000))
    await w.exitsNowExecutable(T0 + 2_000_000) // not posted
    await w.callSettled(id, CALLER, parseEther('0.9'), -1000n, at(1_000_000))
    await settle(leader.f, other.f)

    expect(other.posts).toEqual([])
    expect(leader.posts.map((p) => p.body.text.split('\n')[0])).toEqual([
      '0x3C44…93BC opened a call on tCHOG with 1.00 MON. Locked for 10m.',
      '0x3C44…93BC announced an exit on tCHOG. Can sell in 5m.',
      '0x3C44…93BC sold tCHOG. −10.0% on the record.',
    ])
    expect(leader.posts[0]).toMatchObject({ url: 'https://api.telegram.org/botT/sendMessage', body: { chat_id: '@calls' } })

    // The same notification again (a replayed range) posts nothing new.
    await leader.f.receive(JSON.stringify({ userId: null, kind: 'call_settled', callId: 900 }))
    await settle(leader.f)
    expect(leader.posts).toHaveLength(3)
    await leader.f.close()
    await other.f.close()
  })

  test('waits rather than going over the per-minute limit, and moves on after a failure', async () => {
    const waits: number[] = []
    const { f, posts } = feed(true, { perMinute: 2, status: 500, sleep: async (ms) => void waits.push(ms) })
    for (const callId of [900, 901, 902]) await f.receive(JSON.stringify({ userId: null, kind: 'call_stale', callId }))
    await f.idle()
    // 901 and 902 do not exist, so only 900 posts; send two more distinct events.
    await f.receive(JSON.stringify({ userId: null, kind: 'call_opened', callId: 900 }))
    await f.receive(JSON.stringify({ userId: null, kind: 'exit_announced', callId: 900 }))
    await f.idle()
    expect(posts).toHaveLength(3)
    expect(waits).toHaveLength(1)
    expect(waits[0]).toBeGreaterThan(59_000)
  })

  test('ignores per-user notifications', async () => {
    const { f, posts } = feed(true)
    await f.receive(JSON.stringify({ userId: 'alice', kind: 'call_opened', callId: 900 }))
    await f.idle()
    expect(posts).toEqual([])
  })
})
