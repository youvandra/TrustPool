import type { Context, MiddlewareHandler } from 'hono'

export interface RateLimitOptions {
  /** Requests allowed in a burst. */
  burst: number
  /** Requests added back per second. */
  perSecond: number
  /** Read the client IP from X-Forwarded-For; only behind a proxy you control. */
  trustProxy?: boolean
  /** Buckets kept in memory before the oldest are dropped. */
  maxClients?: number
  now?: () => number
}

/**
 * Token bucket per client IP, in memory. Each API instance limits on its own; behind a
 * load balancer the effective limit is per instance, which is enough to stop one client
 * from starving the rest. Answers 429 with Retry-After.
 */
export function rateLimit(o: RateLimitOptions): MiddlewareHandler {
  const buckets = new Map<string, { tokens: number; at: number }>()
  const now = o.now ?? Date.now
  const max = o.maxClients ?? 50_000

  return async (c, next) => {
    const key = clientIp(c, o.trustProxy)
    const t = now()
    const b = buckets.get(key) ?? { tokens: o.burst, at: t }
    b.tokens = Math.min(o.burst, b.tokens + ((t - b.at) / 1000) * o.perSecond)
    b.at = t
    buckets.delete(key) // re-insert to keep the map in least-recently-used order
    buckets.set(key, b)
    if (buckets.size > max) buckets.delete(buckets.keys().next().value!)

    if (b.tokens < 1) {
      const wait = Math.ceil((1 - b.tokens) / o.perSecond)
      return c.json({ error: 'too many requests' }, 429, { 'Retry-After': String(wait) })
    }
    b.tokens -= 1
    return next()
  }
}

function clientIp(c: Context, trustProxy?: boolean): string {
  if (trustProxy) {
    const fwd = c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
    if (fwd) return fwd
  }
  // Bun exposes the socket address through the env Hono receives from Bun.serve.
  const server = c.env as { requestIP?: (r: Request) => { address: string } | null } | undefined
  return server?.requestIP?.(c.req.raw)?.address ?? c.req.header('x-real-ip') ?? 'unknown'
}
