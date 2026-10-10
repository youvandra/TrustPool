import { afterAll, describe, expect, test } from 'bun:test'
import { CALLS, DEMO_FOLLOWING } from '@trustpool/core'
import { exportSPKI, generateKeyPair, SignJWT } from 'jose'
import { createApp } from '../src/http/app'
import { demoStore } from '../src/store/demo'

const app = createApp({ store: demoStore(), requestLog: false })
const get = (path: string, init?: RequestInit) => app.request(`/api${path}`, init)

describe('public routes', () => {
  test('health reports the source', async () => {
    expect(await (await get('/health')).json()).toMatchObject({ ok: true, source: 'demo', auth: 'demo' })
  })

  test('calls are newest first and filter by state and caller', async () => {
    const all = (await (await get('/calls')).json()) as { id: number; openedAt: number }[]
    expect(all.length).toBe(CALLS.length)
    expect(all[0]!.openedAt).toBeGreaterThanOrEqual(all[1]!.openedAt)
    const open = (await (await get('/calls?state=Locked,Exiting')).json()) as { state: string }[]
    expect(open.every((c) => c.state === 'Locked' || c.state === 'Exiting')).toBe(true)
    const caller = CALLS[0]!.caller
    const mine = (await (await get(`/calls?caller=${caller.toLowerCase()}`)).json()) as { caller: string }[]
    expect(mine.length).toBeGreaterThan(0)
    expect(mine.every((c) => c.caller === caller)).toBe(true)
    expect(((await (await get('/calls?limit=2&offset=1')).json()) as unknown[]).length).toBe(2)
  })

  test('bad input is a 400, missing is a 404', async () => {
    expect((await get('/calls?state=Nope')).status).toBe(400)
    expect((await get('/calls?caller=bob')).status).toBe(400)
    expect((await get('/calls/-1')).status).toBe(400)
    expect((await get('/calls/9999')).status).toBe(404)
    expect((await get('/callers/0x0000000000000000000000000000000000000001')).status).toBe(404)
    expect((await get('/nowhere')).status).toBe(404)
  })
})

describe('per-user routes, demo auth', () => {
  const as = (user: string, init: RequestInit = {}) => ({ ...init, headers: { 'x-demo-user': user, 'content-type': 'application/json' } })

  test('follow and unfollow', async () => {
    const someone = '0x000000000000000000000000000000000000dEaD'
    expect(await (await get('/me/following', as('u1'))).json()).toEqual(DEMO_FOLLOWING)
    expect((await get(`/me/following/${someone}`, as('u1', { method: 'PUT' }))).status).toBe(204)
    expect(await (await get('/me/following', as('u1'))).json()).toContain(someone)
    await get(`/me/following/${someone}`, as('u1', { method: 'DELETE' }))
    expect(await (await get('/me/following', as('u1'))).json()).not.toContain(someone)
    expect(await (await get('/me/following', as('u2'))).json()).toEqual(DEMO_FOLLOWING) // users are separate
  })

  test('watching needs an existing call', async () => {
    expect((await get('/me/watching/3', as('u3', { method: 'PUT' }))).status).toBe(204)
    expect(await (await get('/me/watching', as('u3'))).json()).toContain(3)
    expect((await get('/me/watching/9999', as('u3', { method: 'PUT' }))).status).toBe(404)
  })

  test('mark alerts read', async () => {
    const res = await get('/me/alerts/read', as('u4', { method: 'POST', body: JSON.stringify({ ids: ['a1'] }) }))
    expect(res.status).toBe(204)
    const alerts = (await (await get('/me/alerts', as('u4'))).json()) as { id: string; read: boolean }[]
    expect(alerts.find((a) => a.id === 'a1')!.read).toBe(true)
    expect((await get('/me/alerts/read', as('u4', { method: 'POST', body: '{"ids": 3}' }))).status).toBe(400)
    expect((await get('/me/alerts/read', as('u4', { method: 'POST', body: 'nope' }))).status).toBe(400)
  })
})

describe('per-user routes, Privy auth', async () => {
  const appId = 'app-test'
  const { publicKey, privateKey } = await generateKeyPair('ES256')
  const privy = { appId, verificationKey: await exportSPKI(publicKey) }
  const secured = createApp({ store: demoStore(), privy, requestLog: false })
  const sign = (claims: { iss?: string; aud?: string; sub?: string; exp?: string } = {}) =>
    new SignJWT({})
      .setProtectedHeader({ alg: 'ES256' })
      .setIssuer(claims.iss ?? 'privy.io')
      .setAudience(claims.aud ?? appId)
      .setSubject(claims.sub ?? 'did:privy:alice')
      .setIssuedAt()
      .setExpirationTime(claims.exp ?? '1h')
      .sign(privateKey)
  const call = async (token?: string) =>
    secured.request('/api/me/following', { headers: token ? { authorization: `Bearer ${token}` } : {} })

  test('accepts a valid token', async () => {
    expect((await call(await sign())).status).toBe(200)
  })

  test('rejects a missing, foreign or expired token', async () => {
    expect((await call()).status).toBe(401)
    expect((await call(await sign({ aud: 'other-app' }))).status).toBe(401)
    expect((await call(await sign({ iss: 'evil.io' }))).status).toBe(401)
    expect((await call(await sign({ exp: '-1m' }))).status).toBe(401)
    const other = await generateKeyPair('ES256')
    const forged = await new SignJWT({}).setProtectedHeader({ alg: 'ES256' }).setIssuer('privy.io').setAudience(appId).setSubject('x').setExpirationTime('1h').sign(other.privateKey)
    expect((await call(forged)).status).toBe(401)
  })

  test('ignores X-Demo-User once Privy is on', async () => {
    const res = await secured.request('/api/me/following', { headers: { 'x-demo-user': 'demo' } })
    expect(res.status).toBe(401)
  })

  test('public routes stay open', async () => {
    expect((await secured.request('/api/calls')).status).toBe(200)
  })
})

describe('profiles', async () => {
  const { generatePrivateKey, privateKeyToAccount } = await import('viem/accounts')
  const { profileMessage } = await import('@trustpool/core')
  const { openDatabase } = await import('../src/db/client')
  const { EventWriter } = await import('../src/indexer/writer')
  const { postgresStore } = await import('../src/store/postgres')

  const database = await openDatabase('')
  afterAll(() => database.close())
  const account = privateKeyToAccount(generatePrivateKey())
  const rival = privateKeyToAccount(generatePrivateKey())
  const stranger = privateKeyToAccount(generatePrivateKey())
  const w = new EventWriter(database.db)
  for (const a of [account, rival]) await w.bondPosted(a.address, 10n ** 19n, { at: 1, tx: '0x' })
  const app = createApp({ store: postgresStore(database.db), requestLog: false })

  const put = async (address: string, handle: string, signer = account, signedAt = Date.now(), bio = 'Small caps.') => {
    const signature = await signer.signMessage({ message: profileMessage({ address, handle, bio, signedAt }) })
    return app.request(`/api/callers/${address}/profile`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ handle, bio, signedAt, signature }),
    })
  }

  test('the wallet that signs names itself', async () => {
    expect((await put(account.address, 'new_caller')).status).toBe(204)
    expect((await (await app.request(`/api/callers/${account.address}`)).json()) as object).toMatchObject({ handle: 'new_caller' })
  })

  test('someone else cannot name an address', async () => {
    expect((await put(rival.address, 'hijack', account)).status).toBe(401)
  })

  test('an address that never bonded cannot take a name', async () => {
    expect((await put(stranger.address, 'squatter', stranger)).status).toBe(403)
  })

  test('a handle in use is refused, a bad one is a 400, an old signature is refused', async () => {
    expect((await put(rival.address, 'new_caller', rival)).status).toBe(409)
    expect((await put(account.address, 'No Spaces')).status).toBe(400)
    expect((await put(account.address, 'later', account, Date.now() - 11 * 60_000)).status).toBe(400)
  })

  test('an older claim cannot overwrite a newer one', async () => {
    const t = Date.now()
    expect((await put(account.address, 'second', account, t)).status).toBe(204)
    expect((await put(account.address, 'first', account, t - 1000)).status).toBe(409)
  })
})

describe('abuse limits', () => {
  const app = createApp({ store: demoStore(), requestLog: false })
  const as = { 'x-demo-user': 'heavy', 'content-type': 'application/json' }

  test('a huge body is refused before parsing', async () => {
    const body = JSON.stringify({ ids: ['x'.repeat(20_000)] })
    const res = await app.request('/api/me/alerts/read', { method: 'POST', headers: { ...as, 'content-length': String(body.length) }, body })
    expect(res.status).toBe(413)
    // Without a length (chunked), the limit trips while reading and the request still fails.
    expect((await app.request('/api/me/alerts/read', { method: 'POST', headers: as, body })).status).toBeGreaterThanOrEqual(400)
  })

  test('follows are capped per user', async () => {
    for (let i = 0; i < 500; i++) {
      const a = `0x${(i + 1).toString(16).padStart(40, '0')}`
      if ((await app.request(`/api/me/following/${a}`, { method: 'PUT', headers: as })).status === 409) break
    }
    const res = await app.request('/api/me/following/0x000000000000000000000000000000000000ffff', { method: 'PUT', headers: as })
    expect(res.status).toBe(409)
  })
})
