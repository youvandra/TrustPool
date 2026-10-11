import { describe, expect, test } from 'bun:test'
import { CALLERS, CALLS } from '@trustpool/core'
import { createApp } from '../src/http/app'
import { badgeText } from '../src/share/badge'
import { callCardSvg } from '../src/share/cards'
import { demoStore } from '../src/store/demo'

const app = createApp({ store: demoStore(), requestLog: false, publicUrl: 'https://example.test' })
const get = (path: string) => app.request(`/api${path}`)
const PNG = [0x89, 0x50, 0x4e, 0x47]

describe('share cards', () => {
  test('a call card is a 1200x630 PNG anyone can embed', async () => {
    const res = await get('/og/calls/1.png')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(res.headers.get('cross-origin-resource-policy')).toBe('cross-origin')
    const bytes = new Uint8Array(await res.arrayBuffer())
    expect([...bytes.slice(0, 4)]).toEqual(PNG)
    const view = new DataView(bytes.buffer)
    expect([view.getUint32(16), view.getUint32(20)]).toEqual([1200, 630])
  })

  test('a caller card renders, and unknown or malformed ids are not found', async () => {
    expect((await get(`/og/callers/${CALLERS[0]!.address}.png`)).status).toBe(200)
    expect((await get('/og/calls/9999.png')).status).toBe(404)
    expect((await get('/og/calls/x.png')).status).toBe(400)
    expect((await get('/og/callers/0x0000000000000000000000000000000000000001.png')).status).toBe(404)
  })

  test('a settled loss is drawn like a gain: signed, same place, own colour', () => {
    const loss = CALLS.find((c) => c.state === 'Settled' && c.netReturnBps! < 0)!
    const gain = CALLS.find((c) => c.state === 'Settled' && c.netReturnBps! > 0)!
    const at = (svg: string) => svg.match(/<text x="1088" y="250" font-size="84"[^>]*fill="(#\w+)"[^>]*>([^<]+)</)!
    expect(at(callCardSvg(loss))[2]).toStartWith('−')
    expect(at(callCardSvg(gain))[2]).toStartWith('+')
    expect(at(callCardSvg(loss))[1]).toBe('#D23A2F')
    expect(at(callCardSvg(gain))[1]).toBe('#0A8A5F')
  })

  test('share pages carry Open Graph tags and send people to the app', async () => {
    const res = await get('/share/calls/1')
    expect(res.headers.get('content-type')).toContain('text/html')
    const html = await res.text()
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />')
    expect(html).toMatch(/<meta property="og:image" content="https:\/\/example\.test\/api\/og\/calls\/1\.png\?v=[0-9a-f]{10}" \/>/)
    expect(html).toContain('content="0; url=https://example.test/app/calls/1"')

    const caller = CALLERS[0]!
    const page = await (await get(`/share/callers/${caller.address}`)).text()
    expect(page).toContain(`https://example.test/app/callers/${caller.address}`)
    expect(page).toContain(`og:title" content="${caller.handle}`)
    expect((await get('/share/calls/9999')).status).toBe(404)
  })

  test('the image link changes when the call does, so previews refresh', async () => {
    const v = async () => (await (await get('/share/calls/1')).text()).match(/\?v=(\w+)/)![1]
    const first = await v()
    expect(await v()).toBe(first)
    const other = createApp({ store: { ...demoStore(), getCall: async (id: number) => ({ ...CALLS.find((c) => c.id === id)!, totalIn: 999 }) }, requestLog: false })
    const changed = (await (await other.request('/api/share/calls/1')).text()).match(/\?v=(\w+)/)![1]
    expect(changed).not.toBe(first)
  })
})

describe('badge', () => {
  test("reads the caller's record, losses and unbought pools included", async () => {
    const caller = CALLERS[0]!
    const res = await get(`/callers/${caller.address}/badge.svg`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('image/svg+xml')
    expect(res.headers.get('cache-control')).toBe('public, max-age=300')
    expect(res.headers.get('cross-origin-resource-policy')).toBe('cross-origin')
    const r = caller.record
    const svg = await res.text()
    expect(svg).toContain(`${r.settled} settled · ${r.losses} loss`)
    expect(badgeText({ ...caller, bond: 10, tier: 0, record: { ...r, settled: 7, losses: 4, sumNetBps: -2170, negligent: 2 } })).toBe(
      '7 settled · 4 losses · avg −3.1% · 2 not bought · tier 0 · 10 MON bond',
    )
  })

  test('an address with no record gets a 404 badge, not a broken image', async () => {
    const res = await get('/callers/0x0000000000000000000000000000000000000001/badge.svg')
    expect(res.status).toBe(404)
    expect(await res.text()).toContain('no record')
  })
})
