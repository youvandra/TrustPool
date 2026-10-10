import { describe, expect, test } from 'bun:test'
import { Hono } from 'hono'
import { rateLimit } from '../src/http/rateLimit'

function setup() {
  let t = 0
  const app = new Hono()
  app.use('*', rateLimit({ burst: 3, perSecond: 1, trustProxy: true, now: () => t }))
  app.get('/', (c) => c.text('ok'))
  const hit = (ip = '1.1.1.1') => app.request('/', { headers: { 'x-forwarded-for': ip } })
  return { hit, tick: (ms: number) => (t += ms) }
}

describe('rateLimit', () => {
  test('allows a burst, then answers 429 with Retry-After', async () => {
    const { hit } = setup()
    for (let i = 0; i < 3; i++) expect((await hit()).status).toBe(200)
    const res = await hit()
    expect(res.status).toBe(429)
    expect(res.headers.get('retry-after')).toBe('1')
  })

  test('refills over time', async () => {
    const { hit, tick } = setup()
    for (let i = 0; i < 3; i++) await hit()
    expect((await hit()).status).toBe(429)
    tick(1000)
    expect((await hit()).status).toBe(200)
  })

  test('limits each client on its own', async () => {
    const { hit } = setup()
    for (let i = 0; i < 4; i++) await hit('1.1.1.1')
    expect((await hit('2.2.2.2')).status).toBe(200)
  })
})
