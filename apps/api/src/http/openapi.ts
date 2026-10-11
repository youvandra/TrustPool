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
const png = { description: 'PNG', content: { 'image/png': { schema: { type: 'string', format: 'binary' } } } }
const html = { description: 'HTML', content: { 'text/html': { schema: { type: 'string' } } } }
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
      'Pooled calls: one buy and one sale for everyone, and the caller\'s record of every call. Public reads need no account. ' +
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
      Rules: {
        type: 'object',
        description: 'Every rule of a call, fixed when it opens. Nothing here can change afterwards.',
        required: ['windowEnd', 'buyDeadline', 'maxHold', 'takeProfitBps', 'stopLossBps', 'shareBps', 'minCallerBps', 'maxImpactBps', 'sellToleranceBps', 'keeperBps', 'checkpointGap', 'splitGrace', 'cap', 'minPool'],
        properties: {
          windowEnd: { ...ms, description: 'deposits and withdrawals until here' },
          buyDeadline: { ...ms, description: 'the caller must buy before this, or anyone can refund' },
          maxHold: { type: 'integer', description: 'ms after the buy when anyone may sell regardless of price' },
          takeProfitBps: { type: 'integer', description: 'above entry; 0 = none' },
          stopLossBps: { type: 'integer', description: 'below entry' },
          shareBps: { type: 'integer', description: "caller's share of profit only" },
          minCallerBps: { type: 'integer', description: "caller's least stake in the pool" },
          maxImpactBps: { type: 'integer', description: 'price impact limit of the buy' },
          sellToleranceBps: { type: 'integer', description: 'the sale may return this much less than the lower of its two checkpoints' },
          keeperBps: { type: 'integer', description: 'keeper reward, of gross proceeds' },
          checkpointGap: { type: 'integer', description: 'ms between checkpoints' },
          splitGrace: { type: 'integer', description: 'ms after max hold before an unsellable position is split' },
          cap: { type: 'number', description: 'MON; bond x tier multiple at open' },
          minPool: { type: 'number', description: 'MON; below this at window end the pool is refunded, no fault' },
        },
      },
      Call: {
        type: 'object',
        required: ['id', 'caller', 'token', 'tier', 'rules', 'thesis', 'openedAt', 'state', 'totalIn', 'callerStake', 'depositors', 'checkpoints', 'series', 'watchers'],
        properties: {
          id: { type: 'integer' },
          caller: address,
          token: ref('Token'),
          tier: { type: 'integer', minimum: 0, maximum: 3, description: "the caller's tier at open" },
          rules: ref('Rules'),
          thesis: { type: 'string', maxLength: 280 },
          openedAt: ms,
          state: { type: 'string', enum: ['Open', 'Holding', 'Settled', 'Refunded', 'Split'] },
          totalIn: { type: 'number', description: 'MON in the pool, caller included' },
          callerStake: { type: 'number', description: 'MON the caller has in the pool' },
          depositors: { type: 'integer' },
          liveCap: { type: 'number', description: "open windows: the contract's capOf, the lower of the bond cap and the impact limit" },
          tokens: { type: 'number', description: 'tokens the buy received, after any transfer fee' },
          boughtAt: ms,
          holdUntil: { ...ms, description: 'from here anyone may sell regardless of price' },
          checkpoints: {
            type: 'array',
            maxItems: 2,
            description: 'the last two, older first: MON the whole position would have sold for',
            items: { type: 'object', required: ['value', 'at'], properties: { value: { type: 'number' }, at: ms } },
          },
          saleReason: { type: 'string', enum: ['take_profit', 'stop_loss', 'max_hold'] },
          keeper: address,
          gross: { type: 'number', description: 'MON the sale returned, measured by the contract' },
          keeperReward: { type: 'number' },
          fee: { type: 'number', description: "caller's profit share; 0 without a profit" },
          payout: { type: 'number', description: 'shared pro rata by deposit, caller included' },
          netReturnBps: { type: 'integer', description: 'payout / totalIn - 1: the same for every participant, and what goes on the record' },
          negligent: { type: 'boolean', description: 'refunded because the caller never bought' },
          closedAt: ms,
          series: { type: 'array', items: { type: 'number' }, description: 'MON per token: entry, quotes since, and the exit' },
          watchers: { type: 'integer' },
          markedValue: { type: 'number', description: 'holding: what selling the whole position would return now (a quote)' },
          markedAt: ms,
        },
      },
      Participant: {
        type: 'object',
        required: ['address', 'deposit', 'isCaller', 'claimed'],
        properties: {
          address,
          deposit: { type: 'number', description: 'MON in the pool' },
          isCaller: { type: 'boolean' },
          claimed: { type: 'boolean' },
          claimMon: { type: 'number', description: 'what the claim paid, or will pay: after a sale (caller: plus the fee) or a refund' },
          claimTokens: { type: 'number', description: 'after a split' },
        },
      },
      Position: { allOf: [ref('Participant'), { type: 'object', required: ['callId'], properties: { callId: { type: 'integer' } } }] },
      CallerRecord: {
        type: 'object',
        required: ['settled', 'losses', 'negligent', 'refunded', 'split', 'slashes', 'active', 'sumNetBps', 'lastActive'],
        properties: {
          settled: { type: 'integer' },
          losses: { type: 'integer', description: 'settled with a negative net return' },
          negligent: { type: 'integer', description: 'refunded because the caller never bought' },
          refunded: { type: 'integer', description: 'refunded with no fault' },
          split: { type: 'integer', description: 'ended in a token split' },
          slashes: { type: 'integer' },
          active: { type: 'integer', description: 'open or holding' },
          sumNetBps: { type: 'integer', description: 'average = sumNetBps / settled' },
          lastActive: ms,
        },
      },
      Caller: {
        type: 'object',
        required: ['address', 'followers', 'joinedAt', 'bond', 'record', 'tier', 'slashHistory'],
        properties: {
          address,
          handle: { type: 'string', description: 'signed by the caller, or a short address' },
          bio: { type: 'string' },
          followers: { type: 'integer' },
          joinedAt: ms,
          bond: { type: 'number', description: 'MON' },
          record: ref('CallerRecord'),
          tier: { type: 'integer', minimum: 0, maximum: 3, description: 'sets the next call\'s cap (2, 5, 10, 20 x bond) and largest profit share (5, 10, 15, 20%)' },
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
          kind: { type: 'string', enum: ['window_opened', 'window_closing', 'bought', 'sold', 'refunded', 'split'] },
          callId: { type: 'integer' },
          at: ms,
          read: { type: 'boolean' },
        },
      },
      EarlyBuyers: {
        type: 'object',
        description: 'Wallets that received the token just before the pool bought it. Review input, never proof.',
        required: ['callId', 'fromBlock', 'toBlock', 'buyers', 'fundingChecked', 'note'],
        properties: {
          callId: { type: 'integer' },
          fromBlock: { type: 'integer' },
          toBlock: { type: 'integer' },
          fundingChecked: { type: 'boolean', description: 'whether fundedByCaller was checked for this call' },
          note: { type: 'string' },
          buyers: {
            type: 'array',
            items: {
              type: 'object',
              required: ['wallet', 'amount', 'firstBlock', 'transfers', 'isCaller', 'fundedByCaller'],
              properties: {
                wallet: address,
                amount: { type: 'number' },
                firstBlock: { type: 'integer' },
                transfers: { type: 'integer' },
                isCaller: { type: 'boolean' },
                fundedByCaller: { type: 'boolean', description: 'received MON in a transaction from the caller shortly before its first buy' },
              },
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
          { name: 'state', in: 'query', description: 'comma-separated states', schema: { type: 'string', example: 'Open,Holding' } },
          { name: 'caller', in: 'query', schema: address },
          ...page,
        ],
        responses: { 200: json({ type: 'array', items: ref('Call') }), 400: error('Bad filter') },
      },
    },
    '/calls/{id}': {
      get: { summary: 'One call', tags: ['public'], parameters: [pathId], responses: { 200: json(ref('Call')), 400: error('Bad id'), 404: error('No such call') } },
    },
    '/calls/{id}/participants': {
      get: {
        summary: 'Everyone with money in a call, caller first, and what each claim pays',
        tags: ['public'],
        parameters: [pathId],
        responses: { 200: json({ type: 'array', items: ref('Participant') }), 404: error('No such call') },
      },
    },
    '/calls/{id}/early-buyers': {
      get: {
        summary: 'Wallets that bought just before the pool did',
        tags: ['public'],
        parameters: [pathId],
        responses: { 200: json(ref('EarlyBuyers')), 404: error('No such call, or not bought yet'), 501: error('Demo mode') },
      },
    },
    '/accounts/{address}/positions': {
      get: {
        summary: "A wallet's part in every call it joined, newest first",
        description: 'Positions are public on chain, so this needs no account.',
        tags: ['public'],
        parameters: [pathAddress],
        responses: { 200: json({ type: 'array', items: ref('Position') }), 400: error('Not an address') },
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
    '/og/calls/{file}': {
      get: {
        summary: 'Share card for a call, 1200x630 PNG',
        tags: ['share'],
        parameters: [{ name: 'file', in: 'path', required: true, description: '`<id>.png`', schema: { type: 'string', example: '7.png' } }],
        responses: { 200: png, 404: error('No such call') },
      },
    },
    '/og/callers/{file}': {
      get: {
        summary: 'Share card for a caller, 1200x630 PNG',
        tags: ['share'],
        parameters: [{ name: 'file', in: 'path', required: true, description: '`<address>.png`', schema: { type: 'string' } }],
        responses: { 200: png, 404: error('Never bonded') },
      },
    },
    '/callers/{address}/badge.svg': {
      get: {
        summary: "A caller's record as a small SVG badge",
        description: 'For READMEs and bios: `![trustpool](https://trustpool.web.id/api/callers/<address>/badge.svg)`. Cached for 5 minutes.',
        tags: ['share'],
        parameters: [pathAddress],
        responses: { 200: { description: 'SVG', content: { 'image/svg+xml': { schema: { type: 'string' } } } }, 404: { description: 'Never bonded: a "no record" badge' } },
      },
    },
    '/share/calls/{id}': {
      get: { summary: 'Link preview page for a call: Open Graph tags, then a redirect to the app', tags: ['share'], parameters: [pathId], responses: { 200: html, 404: error('No such call') } },
    },
    '/share/callers/{address}': {
      get: { summary: 'Link preview page for a caller', tags: ['share'], parameters: [pathAddress], responses: { 200: html, 404: error('Never bonded') } },
    },
    '/tokens': { get: { summary: 'Tokens on the allow list (the ones a call can open on)', tags: ['public'], responses: { 200: json({ type: 'array', items: ref('Token') }) } } },
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
      put: { summary: 'Watch a call for its alerts', tags: ['me'], security: bearer, parameters: [pathId], responses: { 204: noContent, 404: error('No such call'), 409: error('At most 500 watches') } },
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
