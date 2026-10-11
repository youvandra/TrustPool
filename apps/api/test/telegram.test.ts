import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import type { Call } from '@trustpool/core'
import { parseEther } from 'viem'
import { loadConfig } from '../src/config'
import { openDatabase, type Database } from '../src/db/client'
import { EventWriter } from '../src/indexer/writer'
import { TelegramFeed, telegramText } from '../src/live/telegram'
import { postgresStore } from '../src/store/postgres'
import { rulesArgs } from './fixtures'

const CALLER = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'
const TOKEN = '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9'
const T0 = 1_700_000_000_000
const at = (dt = 0) => ({ at: T0 + dt, tx: '0x1' })

const H = 3_600_000
const call: Call = {
  id: 7,
  caller: CALLER,
  token: { address: TOKEN, symbol: 'tCHOG', name: 'Chog', hue: 1 },
  tier: 0,
  rules: {
    windowEnd: T0 + H,
    buyDeadline: T0 + 3 * H,
    maxHold: 72 * H,
    takeProfitBps: 2500,
    stopLossBps: 1500,
    shareBps: 500,
    minCallerBps: 500,
    maxImpactBps: 200,
    sellToleranceBps: 200,
    keeperBps: 10,
    checkpointGap: 15 * 60_000,
    splitGrace: 6 * H,
    cap: 20,
    minPool: 0.05,
  },
  thesis: '',
  openedAt: T0,
  state: 'Holding',
  totalIn: 1,
  callerStake: 0.1,
  depositors: 3,
  tokens: 100,
  checkpoints: [],
  series: [],
  watchers: 0,
}

describe('telegramText', () => {
  test('one line per kind, then the link', () => {
    const caller = { handle: 'olu' } as never
    expect(telegramText('window_opened', call, caller)).toBe(
      'olu opened a pool on tCHOG with 0.10 MON of their own. Window closes in 1h. Rules: take-profit +25%, stop-loss −15%, max hold 3d 0h, 5% of profit to the caller.\nhttps://trustpool.web.id/app/calls/7',
    )
    expect(telegramText('window_closing', call, caller, undefined, T0 + 50 * 60_000)!.split('\n')[0]).toBe('The pool on tCHOG by olu closes in 10m. 1.00 MON in from 3 participants.')
    expect(telegramText('bought', call, caller)!.split('\n')[0]).toBe("olu's pool bought tCHOG with 1.00 MON from 3 participants, one price for all.")
    expect(telegramText('refunded', { ...call, state: 'Refunded', negligent: true }, caller)!.split('\n')[0]).toBe(
      'olu did not buy for the pool on tCHOG. Every deposit is refunded, and the record counts it as negligent.',
    )
    expect(telegramText('refunded', { ...call, state: 'Refunded', negligent: false }, caller)!.split('\n')[0]).toBe('The pool on tCHOG by olu did not go ahead. Every deposit is refunded.')
    expect(telegramText('split', call, caller)!.split('\n')[0]).toBe('The pool on tCHOG by olu could not be sold. Each participant takes their share of the tokens.')
  })

  test('a loss reads exactly like a gain', () => {
    const loss = telegramText('sold', { ...call, state: 'Settled', saleReason: 'stop_loss', netReturnBps: -1240 }, undefined)!
    const gain = telegramText('sold', { ...call, state: 'Settled', saleReason: 'take_profit', netReturnBps: 1240 }, undefined)!
    expect(loss.split('\n')[0]).toBe("0x3C44…93BC's pool on tCHOG sold on stop-loss. −12.4% for every participant, on the record.")
    expect(gain.split('\n')[0]).toBe("0x3C44…93BC's pool on tCHOG sold on take-profit. +12.4% for every participant, on the record.")
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
      await w.in(tx).callOpened({ id, caller: CALLER, token: TOKEN, tier: 0, rules: rulesArgs(T0 / 1000, { windowEnd: T0 / 1000 + 600 }), thesis: '' }, at())
      await w.in(tx).depositChanged(id, CALLER, parseEther('1'), parseEther('1'), at())
    })
    await w.windowsClosing(T0 + 500_000)
    await w.bought(id, parseEther('100'), BigInt(T0 / 1000 + 4000), at(700_000))
    await w.sold({ id, keeper: CALLER, reason: 2, gross: parseEther('0.9'), keeperReward: parseEther('0.0009'), fee: 0n, payout: parseEther('0.8991'), netReturnBps: -1009n }, at(1_000_000))
    await settle(leader.f, other.f)

    expect(other.posts).toEqual([])
    expect(leader.posts.map((p) => p.body.text.split('\n')[0])).toEqual([
      '0x3C44…93BC opened a pool on tCHOG with 1.00 MON of their own. Window closes in 10m. Rules: take-profit +25%, stop-loss −20%, max hold 1d 0h, 10% of profit to the caller.',
      'The pool on tCHOG by 0x3C44…93BC closes in 1m. 1.00 MON in from 1 participant.',
      "0x3C44…93BC's pool bought tCHOG with 1.00 MON from 1 participant, one price for all.",
      "0x3C44…93BC's pool on tCHOG sold on stop-loss. −10.1% for every participant, on the record.",
    ])
    expect(leader.posts[0]).toMatchObject({ url: 'https://api.telegram.org/botT/sendMessage', body: { chat_id: '@calls' } })

    // The same notification again (a replayed range) posts nothing new.
    await leader.f.receive(JSON.stringify({ userId: null, kind: 'sold', callId: 900 }))
    await settle(leader.f)
    expect(leader.posts).toHaveLength(4)
    await leader.f.close()
    await other.f.close()
  })

  test('waits rather than going over the per-minute limit, and moves on after a failure', async () => {
    const waits: number[] = []
    const { f, posts } = feed(true, { perMinute: 2, status: 500, sleep: async (ms) => void waits.push(ms) })
    for (const callId of [900, 901, 902]) await f.receive(JSON.stringify({ userId: null, kind: 'split', callId }))
    await f.idle()
    // 901 and 902 do not exist, so only 900 posts; send two more distinct events.
    await f.receive(JSON.stringify({ userId: null, kind: 'window_opened', callId: 900 }))
    await f.receive(JSON.stringify({ userId: null, kind: 'bought', callId: 900 }))
    await f.idle()
    expect(posts).toHaveLength(3)
    expect(waits).toHaveLength(1)
    expect(waits[0]).toBeGreaterThan(59_000)
  })

  test('ignores per-user notifications', async () => {
    const { f, posts } = feed(true)
    await f.receive(JSON.stringify({ userId: 'alice', kind: 'window_opened', callId: 900 }))
    await f.idle()
    expect(posts).toEqual([])
  })
})
