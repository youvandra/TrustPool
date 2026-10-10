import { ALERTS, CALLERS, CALLS, DEMO_FOLLOWING, TOKENS } from '@trustpool/core'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'

/**
 * Read API for the web app. Today it serves the demo set from @trustpool/core.
 * Next step (NEXT.md): an indexer that follows TrustPool events into SQLite
 * (bun:sqlite) and answers the same routes from there. Route shapes stay fixed.
 */
const app = new Hono().basePath('/api')
app.use('*', logger())
app.use('*', cors())

app.get('/health', (c) => c.json({ ok: true, source: 'demo' }))

app.get('/calls', (c) => {
  const state = c.req.query('state')
  const caller = c.req.query('caller')?.toLowerCase()
  let out = [...CALLS].sort((a, b) => b.openedAt - a.openedAt)
  if (state) out = out.filter((x) => state.split(',').includes(x.state))
  if (caller) out = out.filter((x) => x.caller.toLowerCase() === caller)
  return c.json(out)
})

app.get('/calls/:id', (c) => {
  const call = CALLS.find((x) => x.id === Number(c.req.param('id')))
  return call ? c.json(call) : c.json({ error: 'not found' }, 404)
})

app.get('/callers', (c) => c.json(CALLERS))

app.get('/callers/:address', (c) => {
  const a = c.req.param('address').toLowerCase()
  const caller = CALLERS.find((x) => x.address.toLowerCase() === a)
  return caller ? c.json(caller) : c.json({ error: 'not found' }, 404)
})

app.get('/tokens', (c) => c.json(TOKENS))

// Per-user routes. Auth (a Privy access token checked server side) comes with the indexer.
app.get('/me/alerts', (c) => c.json(ALERTS))
app.get('/me/following', (c) => c.json(DEMO_FOLLOWING))

const port = Number(process.env.PORT ?? 8787)
export default { port, fetch: app.fetch }
console.log(`trustpool api on :${port}`)
