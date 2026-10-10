/**
 * OpenAPI 3.1 description of the HTTP surface, served at /api/openapi.json and rendered at
 * /api/docs. test/openapi.test.ts fails when a route exists without an entry here.
 */
const address = { type: 'string', pattern: '^0x[0-9a-fA-F]{40}$', description: 'EIP-55 address' }
const ms = { type: 'integer', description: 'ms since epoch' }
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` })
const json = (schema: object, description = 'OK') => ({ description, content: { 'application/json': { schema } } })
const error = (description: string) => json(ref('Error'), description)
const noContent = { description: 'Done' }
const bearer = [{ privy: [] }]
const pathId = { name: 'id', in: 'path', required: true, schema: { type: 'integer', minimum: 0 } }
const pathAddress = { name: 'address', in: 'path', required: true, schema: address }
const page = [
  { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 0, maximum: 500 } },
  { name: 'offset', in: 'query', schema: { type: 'integer', minimum: 0 } },
]

export const openapi = {
  openapi: '3.1.0',
  info: {
    title: 'trustpool API',
    version: '1.0.0',
    description:
      'Records of callers who put their own money in first. Public reads need no account. ' +
      'Everything under /me needs a Privy access token. Amounts are MON, times are ms. ' +
      'The contract is the source of truth; this API is an index of it.',
  },
  servers: [{ url: '/api' }],
  components: {
    securitySchemes: { privy: { type: 'http', scheme: 'bearer', bearerFormat: 'Privy access token (ES256 JWT)' } },
    schemas: {
      Error: { type: 'object', required: ['error'], properties: { error: { type: 'string' } } },
      Token: {
        type: 'object',
        required: ['address', 'symbol', 'name', 'hue'],
        properties: { address, symbol: { type: 'string' }, name: { type: 'string' }, hue: { type: 'integer', minimum: 0, maximum: 359 } },
      },
      Call: {
        type: 'object',
        required: ['id', 'caller', 'token', 'monIn', 'tokens', 'openedAt', 'unlockAt', 'notice', 'state', 'thesis', 'series', 'watchers'],
        properties: {
          id: { type: 'integer' },
          caller: address,
          token: ref('Token'),
          monIn: { type: 'number', description: 'MON the caller spent on entry' },
          tokens: { type: 'number', description: 'tokens that arrived, after any transfer fee' },
          openedAt: ms,
          unlockAt: { ...ms, description: 'earliest moment an exit can execute' },
          notice: { type: 'integer', description: 'ms between announcing and executing an exit' },
          announcedAt: ms,
          exitAt: { ...ms, description: 'earliest moment the announced exit can execute' },
          monOut: { type: 'number', description: 'MON the sale returned, measured by the contract' },
          state: { type: 'string', enum: ['Locked', 'Exiting', 'Settled', 'Released'] },
          thesis: { type: 'string', maxLength: 280 },
          series: { type: 'array', items: { type: 'number' }, description: 'MON per token: entry, quotes since, and the exit fill' },
          watchers: { type: 'integer' },
          stale: { type: 'boolean', description: 'left open past its max hold; permanent' },
          markedValue: { type: 'number', description: 'unrealised: what selling the whole position would return now (open calls)' },
          markedAt: ms,
        },
      },
      CallerRecord: {
        type: 'object',
        required: ['settled', 'losses', 'released', 'open', 'slashes', 'stale', 'sumReturnBps', 'lastActive'],
        properties: {
          settled: { type: 'integer' },
          losses: { type: 'integer', description: 'settled below entry, plus every release' },
          released: { type: 'integer', description: 'taken unsold, counted as -100%' },
          open: { type: 'integer' },
          slashes: { type: 'integer' },
          stale: { type: 'integer' },
          sumReturnBps: { type: 'integer', description: 'average = sumReturnBps / (settled + released)' },
          lastActive: ms,
        },
      },
      Caller: {
        type: 'object',
        required: ['address', 'followers', 'joinedAt', 'bond', 'record', 'slashHistory'],
        properties: {
          address,
          handle: { type: 'string', description: 'signed by the caller, or a short address' },
          bio: { type: 'string' },
          followers: { type: 'integer' },
          joinedAt: ms,
          bond: { type: 'number', description: 'MON' },
          record: ref('CallerRecord'),
          slashHistory: {
            type: 'array',
            items: { type: 'object', required: ['amount', 'reason', 'at'], properties: { amount: { type: 'number' }, reason: { type: 'string' }, at: ms } },
          },
        },
      },
      Alert: {
        type: 'object',
        required: ['id', 'kind', 'callId', 'at', 'read'],
        properties: {
          id: { type: 'string' },
          kind: { type: 'string', enum: ['exit_announced', 'exit_executable', 'call_opened', 'call_settled', 'call_released', 'call_stale'] },
          callId: { type: 'integer' },
          at: ms,
          read: { type: 'boolean' },
        },
      },
      EarlyBuyers: {
        type: 'object',
        description: 'Wallets that received the token just before the call opened. Review input, never proof.',
        required: ['callId', 'fromBlock', 'toBlock', 'buyers', 'note'],
        properties: {
          callId: { type: 'integer' },
          fromBlock: { type: 'integer' },
          toBlock: { type: 'integer' },
          note: { type: 'string' },
          buyers: {
            type: 'array',
            items: {
              type: 'object',
              required: ['wallet', 'amount', 'firstBlock', 'transfers', 'isCaller'],
              properties: { wallet: address, amount: { type: 'number' }, firstBlock: { type: 'integer' }, transfers: { type: 'integer' }, isCaller: { type: 'boolean' } },
            },
          },
        },
      },
    },
  },
  paths: {
    '/health': {
      get: { summary: 'Service and indexer status', tags: ['meta'], responses: { 200: json({ type: 'object' }) } },
    },
    '/openapi.json': { get: { summary: 'This document', tags: ['meta'], responses: { 200: json({ type: 'object' }) } } },
    '/docs': { get: { summary: 'This document, rendered', tags: ['meta'], responses: { 200: { description: 'HTML' } } } },
    '/calls': {
      get: {
        summary: 'Calls, newest first',
        tags: ['public'],
        parameters: [
          { name: 'state', in: 'query', description: 'comma-separated states', schema: { type: 'string', example: 'Locked,Exiting' } },
          { name: 'caller', in: 'query', schema: address },
          ...page,
        ],
        responses: { 200: json({ type: 'array', items: ref('Call') }), 400: error('Bad filter') },
      },
    },
    '/calls/{id}': {
      get: { summary: 'One call', tags: ['public'], parameters: [pathId], responses: { 200: json(ref('Call')), 400: error('Bad id'), 404: error('No such call') } },
    },
    '/calls/{id}/early-buyers': {
      get: {
        summary: 'Wallets that bought just before the call opened',
        tags: ['public'],
        parameters: [pathId],
        responses: { 200: json(ref('EarlyBuyers')), 404: error('No such call'), 501: error('Demo mode') },
      },
    },
    '/callers': {
      get: { summary: 'Callers, most recently active first', tags: ['public'], parameters: page, responses: { 200: json({ type: 'array', items: ref('Caller') }) } },
    },
    '/callers/{address}': {
      get: { summary: "One caller's whole record", tags: ['public'], parameters: [pathAddress], responses: { 200: json(ref('Caller')), 404: error('Never bonded') } },
    },
    '/callers/{address}/profile': {
      put: {
        summary: 'Set a handle and bio, signed by the caller wallet',
        description: 'Sign `profileMessage` from @trustpool/core with the address itself. No account needed: the signature is the proof.',
        tags: ['public'],
        parameters: [pathAddress],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['handle', 'bio', 'signedAt', 'signature'],
                properties: {
                  handle: { type: 'string', pattern: '^[a-z0-9_]{3,20}$' },
                  bio: { type: 'string', maxLength: 160 },
                  signedAt: { ...ms, description: 'within 10 minutes of now' },
                  signature: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { 204: noContent, 400: error('Bad fields or old signature'), 401: error('Wrong signer'), 403: error('Never bonded'), 409: error('Handle taken or newer claim stored') },
      },
    },
    '/tokens': { get: { summary: 'Tokens seen in calls', tags: ['public'], responses: { 200: json({ type: 'array', items: ref('Token') }) } } },
    '/me/alerts': {
      get: {
        summary: 'Your alerts, newest first',
        tags: ['me'],
        security: bearer,
        parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer', maximum: 500 } }],
        responses: { 200: json({ type: 'array', items: ref('Alert') }), 401: error('Sign in') },
      },
    },
    '/me/alerts/read': {
      post: {
        summary: 'Mark alerts read',
        tags: ['me'],
        security: bearer,
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['ids'], properties: { ids: { type: 'array', items: { type: 'string' }, maxItems: 1000 } } } } },
        },
        responses: { 204: noContent, 400: error('Bad body'), 401: error('Sign in') },
      },
    },
    '/me/stream': {
      get: {
        summary: 'Live alerts (server-sent events)',
        description: 'Events: `ready`, then `alert` (data: Alert) per new alert, and `ping` as a heartbeat. Read with fetch so the token travels in a header.',
        tags: ['me'],
        security: bearer,
        responses: { 200: { description: 'text/event-stream', content: { 'text/event-stream': { schema: { type: 'string' } } } }, 401: error('Sign in') },
      },
    },
    '/me/following': {
      get: { summary: 'Callers you follow', tags: ['me'], security: bearer, responses: { 200: json({ type: 'array', items: address }), 401: error('Sign in') } },
    },
    '/me/following/{address}': {
      put: { summary: 'Follow a caller', tags: ['me'], security: bearer, parameters: [pathAddress], responses: { 204: noContent, 409: error('At most 500 follows') } },
      delete: { summary: 'Unfollow a caller', tags: ['me'], security: bearer, parameters: [pathAddress], responses: { 204: noContent } },
    },
    '/me/watching': {
      get: { summary: 'Calls you watch', tags: ['me'], security: bearer, responses: { 200: json({ type: 'array', items: { type: 'integer' } }), 401: error('Sign in') } },
    },
    '/me/watching/{id}': {
      put: { summary: 'Watch a call for its exit', tags: ['me'], security: bearer, parameters: [pathId], responses: { 204: noContent, 404: error('No such call'), 409: error('At most 500 watches') } },
      delete: { summary: 'Stop watching a call', tags: ['me'], security: bearer, parameters: [pathId], responses: { 204: noContent } },
    },
  },
} as const

/** A small page that renders the spec; the renderer is pinned and loaded from jsDelivr. */
export const docsPage = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>trustpool API</title>
  </head>
  <body>
    <script id="api-reference" data-url="/api/openapi.json"></script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.25.130/dist/browser/standalone.js"></script>
  </body>
</html>`
