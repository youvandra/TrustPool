import type { Context, MiddlewareHandler } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { importSPKI, jwtVerify, type CryptoKey } from 'jose'

export type AuthEnv = { Variables: { user: string } }

/** A user id that is safe to store; Privy ids look like `did:privy:abc123`. */
const USER_ID = /^[\w:.-]{1,128}$/

/**
 * Resolves the user behind a request and stores it as `c.var.user`.
 *
 * With Privy configured, the request must carry `Authorization: Bearer <access token>`;
 * the token is verified locally against the app's verification key (ES256, issuer
 * `privy.io`, audience = app id) and `sub` becomes the user id. No network call.
 *
 * Without Privy (local demo), `X-Demo-User` names the user, default `demo`. Never run a
 * public deployment without Privy: anyone could act as anyone.
 */
export function auth(privy?: { appId: string; verificationKey: string }): MiddlewareHandler<AuthEnv> {
  let key: Promise<CryptoKey> | undefined
  return async (c, next) => {
    if (!privy) {
      const demo = c.req.header('x-demo-user') ?? 'demo'
      if (!USER_ID.test(demo)) throw new HTTPException(400, { message: 'bad X-Demo-User' })
      c.set('user', demo)
      return next()
    }
    const token = bearer(c)
    key ??= importSPKI(privy.verificationKey, 'ES256')
    try {
      const { payload } = await jwtVerify(token, await key, { issuer: 'privy.io', audience: privy.appId })
      if (!payload.sub || !USER_ID.test(payload.sub)) throw new Error('no subject')
      c.set('user', payload.sub)
    } catch {
      throw new HTTPException(401, { message: 'invalid or expired access token' })
    }
    return next()
  }
}

function bearer(c: Context): string {
  const h = c.req.header('authorization')
  const m = h?.match(/^Bearer\s+(.+)$/i)
  if (!m) throw new HTTPException(401, { message: 'sign in required' })
  return m[1]!
}
