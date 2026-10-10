import { checkProfile, PROFILE_MAX_AGE, profileMessage, type CallState } from '@trustpool/core'
import { Hono } from 'hono'
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
  /** Request log lines; off in tests. */
  requestLog?: boolean
}

const STATES: CallState[] = ['Locked', 'Exiting', 'Settled', 'Released']
const MAX_PAGE = 500

/**
 * The HTTP surface. Route shapes are fixed: apps/web consumes them (VITE_DATA=api).
 * Public reads need no account; everything under /me needs a verified user.
 */
export function createApp({ store, privy, corsOrigins = ['*'], indexer, earlyBuyers, verifySignature = verifyMessage, requestLog = true }: AppDeps) {
  const app = new Hono<AuthEnv>().basePath('/api')
  if (requestLog) app.use('*', logger())
  app.use('*', secureHeaders())
  app.use('*', cors({ origin: corsOrigins.includes('*') ? '*' : corsOrigins, allowHeaders: ['Authorization', 'Content-Type', 'X-Demo-User'] }))

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

  app.get('/calls', (c) => {
    const state = c.req.query('state')?.split(',').filter(Boolean)
    if (state?.some((s) => !STATES.includes(s as CallState))) throw new HTTPException(400, { message: `state must be in ${STATES.join(',')}` })
    const caller = c.req.query('caller')
    if (caller !== undefined && !isAddress(caller, { strict: false })) throw new HTTPException(400, { message: 'caller must be an address' })
    return c.json(
      store.listCalls({
        state: state as CallState[] | undefined,
        caller,
        limit: intQuery(c.req.query('limit'), MAX_PAGE, MAX_PAGE),
        offset: intQuery(c.req.query('offset'), 0),
      }),
    )
  })

  app.get('/calls/:id', (c) => {
    const id = intParam(c.req.param('id'))
    const call = store.getCall(id)
    return call ? c.json(call) : c.json({ error: 'not found' }, 404)
  })

  app.get('/calls/:id/early-buyers', async (c) => {
    const id = intParam(c.req.param('id'))
    if (!earlyBuyers) throw new HTTPException(501, { message: 'early buyers need chain mode' })
    if (!store.getCall(id)) return c.json({ error: 'not found' }, 404)
    const report = await earlyBuyers(id)
    return report ? c.json(report) : c.json({ error: 'this call was indexed before block numbers were kept' }, 404)
  })

  app.get('/callers', (c) => c.json(store.listCallers()))

  app.get('/callers/:address', (c) => {
    const a = addressParam(c.req.param('address'))
    const caller = store.getCaller(a)
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
    const result = store.setProfile(claim)
    if (result === 'taken') throw new HTTPException(409, { message: 'handle taken' })
    if (result === 'stale') throw new HTTPException(409, { message: 'a newer profile is already stored' })
    return c.body(null, 204)
  })

  app.get('/tokens', (c) => c.json(store.listTokens()))

  // ---------------------------------------------------------------- per user

  const me = new Hono<AuthEnv>()
  me.use('*', auth(privy))

  me.get('/alerts', (c) => c.json(store.alerts(c.var.user, intQuery(c.req.query('limit'), 100, 500))))
  me.post('/alerts/read', async (c) => {
    const body = await json<{ ids?: unknown }>(c.req.raw)
    if (!Array.isArray(body.ids) || body.ids.length > 1000 || !body.ids.every((x) => typeof x === 'string')) {
      throw new HTTPException(400, { message: 'ids must be a list of alert ids' })
    }
    store.markRead(c.var.user, body.ids as string[])
    return c.body(null, 204)
  })

  me.get('/following', (c) => c.json(store.following(c.var.user)))
  me.put('/following/:address', (c) => {
    store.setFollow(c.var.user, addressParam(c.req.param('address')), true)
    return c.body(null, 204)
  })
  me.delete('/following/:address', (c) => {
    store.setFollow(c.var.user, addressParam(c.req.param('address')), false)
    return c.body(null, 204)
  })

  me.get('/watching', (c) => c.json(store.watching(c.var.user)))
  me.put('/watching/:id', (c) => {
    const id = intParam(c.req.param('id'))
    if (!store.getCall(id)) throw new HTTPException(404, { message: 'no such call' })
    store.setWatch(c.var.user, id, true)
    return c.body(null, 204)
  })
  me.delete('/watching/:id', (c) => {
    store.setWatch(c.var.user, intParam(c.req.param('id')), false)
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
