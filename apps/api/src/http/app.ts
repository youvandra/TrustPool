import { checkProfile, PROFILE_MAX_AGE, profileMessage, type CallState } from '@trustpool/core'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import { logger } from 'hono/logger'
import { secureHeaders } from 'hono/secure-headers'
import { getAddress, isAddress, verifyMessage, type Hex } from 'viem'
import type { EarlyBuyerReport } from '../indexer/earlyBuyers'
import type { IndexerStatus } from '../indexer/indexer'
import { log } from '../log'
import type { Store } from '../store/types'
import { auth, type AuthEnv } from './auth'
import { rateLimit, type RateLimitOptions } from './rateLimit'

export interface AppDeps {
  store: Store
  privy?: { appId: string; verificationKey: string }
  corsOrigins?: string[]
  /** Present in chain mode; reported by /health. */
  indexer?: () => IndexerStatus
  /** Present in chain mode: wallets that received a call's token just before it opened. */
  earlyBuyers?: (callId: number) => Promise<EarlyBuyerReport | undefined>
  /** Checks a wallet signature. Chain mode passes the RPC client's, which also accepts smart wallets. */
  verifySignature?: (p: { address: `0x${string}`; message: string; signature: Hex }) => Promise<boolean>
  /** Per-IP limits; omit to turn limiting off (tests). */
  limits?: { read: RateLimitOptions; write: RateLimitOptions }
  /** Request log lines; off in tests. */
  requestLog?: boolean
}

const STATES: CallState[] = ['Locked', 'Exiting', 'Settled', 'Released']
const MAX_PAGE = 500
/** Per user; enough for anyone reading records, small enough to stop a script filling the table. */
const MAX_FOLLOWS = 500
const MAX_WATCHES = 500

/**
 * The HTTP surface. Route shapes are fixed: apps/web consumes them (VITE_DATA=api).
 * Public reads need no account; everything under /me needs a verified user.
 */
export function createApp({ store, privy, corsOrigins = ['*'], indexer, earlyBuyers, verifySignature = verifyMessage, limits, requestLog = true }: AppDeps) {
  const app = new Hono<AuthEnv>().basePath('/api')
  if (requestLog) app.use('*', logger())
  app.use('*', secureHeaders())
  app.use('*', cors({ origin: corsOrigins.includes('*') ? '*' : corsOrigins, allowHeaders: ['Authorization', 'Content-Type', 'X-Demo-User'] }))

  if (limits) {
    const read = rateLimit(limits.read)
    const write = rateLimit(limits.write)
    app.use('*', (c, next) => (c.req.method === 'GET' || c.req.method === 'OPTIONS' ? read(c, next) : write(c, next)))
  }

  // Every body this API takes is a few hundred bytes.
  app.use('*', bodyLimit({ maxSize: 16 * 1024, onError: (c) => c.json({ error: 'body too large' }, 413) }))

  app.onError((err, c) => {
    if (err instanceof HTTPException) return c.json({ error: err.message }, err.status)
    log.error('request failed', { path: c.req.path, err })
    return c.json({ error: 'internal error' }, 500)
  })
  app.notFound((c) => c.json({ error: 'not found' }, 404))

  // ---------------------------------------------------------------- public

  app.get('/health', (c) => {
    const status = indexer?.()
    return c.json({ ok: !status?.lastError, source: store.source, auth: privy ? 'privy' : 'demo', indexer: status })
  })

  app.get('/calls', async (c) => {
    const state = c.req.query('state')?.split(',').filter(Boolean)
    if (state?.some((s) => !STATES.includes(s as CallState))) throw new HTTPException(400, { message: `state must be in ${STATES.join(',')}` })
    const caller = c.req.query('caller')
    if (caller !== undefined && !isAddress(caller, { strict: false })) throw new HTTPException(400, { message: 'caller must be an address' })
    return c.json(
      await store.listCalls({
        state: state as CallState[] | undefined,
        caller,
        limit: intQuery(c.req.query('limit'), MAX_PAGE, MAX_PAGE),
        offset: intQuery(c.req.query('offset'), 0),
      }),
    )
  })

  app.get('/calls/:id', async (c) => {
    const id = intParam(c.req.param('id'))
    const call = await store.getCall(id)
    return call ? c.json(call) : c.json({ error: 'not found' }, 404)
  })

  app.get('/calls/:id/early-buyers', async (c) => {
    const id = intParam(c.req.param('id'))
    if (!earlyBuyers) throw new HTTPException(501, { message: 'early buyers need chain mode' })
    if (!(await store.getCall(id))) return c.json({ error: 'not found' }, 404)
    const report = await earlyBuyers(id)
    return report ? c.json(report) : c.json({ error: 'this call was indexed before block numbers were kept' }, 404)
  })

  app.get('/callers', async (c) =>
    c.json(await store.listCallers({ limit: intQuery(c.req.query('limit'), MAX_PAGE, MAX_PAGE), offset: intQuery(c.req.query('offset'), 0) })),
  )

  app.get('/callers/:address', async (c) => {
    const a = addressParam(c.req.param('address'))
    const caller = await store.getCaller(a)
    return caller ? c.json(caller) : c.json({ error: 'not found' }, 404)
  })

  /** A handle and bio, signed by the caller's own wallet. No account needed: the signature is the proof. */
  app.put('/callers/:address/profile', async (c) => {
    const address = getAddress(addressParam(c.req.param('address')))
    const body = await json<{ handle?: unknown; bio?: unknown; signedAt?: unknown; signature?: unknown }>(c.req.raw)
    if (typeof body.handle !== 'string' || typeof body.bio !== 'string' || typeof body.signedAt !== 'number' || typeof body.signature !== 'string') {
      throw new HTTPException(400, { message: 'expected { handle, bio, signedAt, signature }' })
    }
    const claim = { address, handle: body.handle, bio: body.bio.trim(), signedAt: body.signedAt }
    const problem = checkProfile(claim)
    if (problem) throw new HTTPException(400, { message: problem })
    if (Math.abs(Date.now() - claim.signedAt) > PROFILE_MAX_AGE) throw new HTTPException(400, { message: 'signature too old; sign again' })
    const ok = await verifySignature({ address, message: profileMessage(claim), signature: body.signature as Hex }).catch(() => false)
    if (!ok) throw new HTTPException(401, { message: 'signature does not match this address' })
    const result = await store.setProfile(claim)
    if (result === 'taken') throw new HTTPException(409, { message: 'handle taken' })
    if (result === 'stale') throw new HTTPException(409, { message: 'a newer profile is already stored' })
    if (result === 'unknown') throw new HTTPException(403, { message: 'only an address that has posted a bond can name itself' })
    return c.body(null, 204)
  })

  app.get('/tokens', async (c) => c.json(await store.listTokens()))

  // ---------------------------------------------------------------- per user

  const me = new Hono<AuthEnv>()
  me.use('*', auth(privy))

  me.get('/alerts', async (c) => c.json(await store.alerts(c.var.user, intQuery(c.req.query('limit'), 100, 500))))
  me.post('/alerts/read', async (c) => {
    const body = await json<{ ids?: unknown }>(c.req.raw)
    if (!Array.isArray(body.ids) || body.ids.length > 1000 || !body.ids.every((x) => typeof x === 'string')) {
      throw new HTTPException(400, { message: 'ids must be a list of alert ids' })
    }
    await store.markRead(c.var.user, body.ids as string[])
    return c.body(null, 204)
  })

  me.get('/following', async (c) => c.json(await store.following(c.var.user)))
  me.put('/following/:address', async (c) => {
    if ((await store.following(c.var.user)).length >= MAX_FOLLOWS) throw new HTTPException(409, { message: `at most ${MAX_FOLLOWS} follows` })
    await store.setFollow(c.var.user, addressParam(c.req.param('address')), true)
    return c.body(null, 204)
  })
  me.delete('/following/:address', async (c) => {
    await store.setFollow(c.var.user, addressParam(c.req.param('address')), false)
    return c.body(null, 204)
  })

  me.get('/watching', async (c) => c.json(await store.watching(c.var.user)))
  me.put('/watching/:id', async (c) => {
    const id = intParam(c.req.param('id'))
    if (!(await store.getCall(id))) throw new HTTPException(404, { message: 'no such call' })
    if ((await store.watching(c.var.user)).length >= MAX_WATCHES) throw new HTTPException(409, { message: `at most ${MAX_WATCHES} watches` })
    await store.setWatch(c.var.user, id, true)
    return c.body(null, 204)
  })
  me.delete('/watching/:id', async (c) => {
    await store.setWatch(c.var.user, intParam(c.req.param('id')), false)
    return c.body(null, 204)
  })

  app.route('/me', me)
  return app
}

function intParam(v: string): number {
  const n = Number(v)
  if (!Number.isSafeInteger(n) || n < 0) throw new HTTPException(400, { message: 'id must be a non-negative integer' })
  return n
}

function intQuery(v: string | undefined, fallback: number, max = Number.MAX_SAFE_INTEGER): number {
  if (v === undefined) return fallback
  return Math.min(intParam(v), max)
}

function addressParam(v: string): string {
  if (!isAddress(v, { strict: false })) throw new HTTPException(400, { message: 'not an address' })
  return v
}

async function json<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T
  } catch {
    throw new HTTPException(400, { message: 'body must be JSON' })
  }
}
