import { bigint, boolean, doublePrecision, index, integer, numeric, pgTable, primaryKey, serial, text, unique } from 'drizzle-orm/pg-core'

/**
 * The API's database. Chain data (tokens, callers, calls, slashes, prices, early buyers) is
 * derived from TrustPool events and can always be rebuilt by indexing again from the
 * deployment block. User data (follows, watches, alerts, profiles) cannot: back it up.
 *
 * Conventions: amounts are kept twice, exact wei as numeric(78) (the source of truth) and
 * MON as double for reading; times are ms since epoch; addresses are EIP-55 checksummed,
 * so equality needs no case folding.
 */

const ms = (name: string) => bigint(name, { mode: 'number' })
const wei = (name: string) => numeric(name, { precision: 78, scale: 0 })

export const meta = pgTable('meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
})

export const tokens = pgTable('tokens', {
  address: text('address').primaryKey(),
  symbol: text('symbol').notNull(),
  name: text('name').notNull(),
  decimals: integer('decimals').notNull(),
  hue: integer('hue').notNull(),
  /** On TrustPool's allow list right now (TokenAllowed). Tokens of past calls stay listed in calls. */
  allowed: boolean('allowed').notNull().default(false),
})

export const callers = pgTable('callers', {
  address: text('address').primaryKey(),
  bondWei: wei('bond_wei').notNull().default('0'),
  bond: doublePrecision('bond').notNull().default(0),
  withdrawReadyAt: ms('withdraw_ready_at'),
  firstSeen: ms('first_seen').notNull(),
  settled: integer('settled').notNull().default(0),
  losses: integer('losses').notNull().default(0),
  released: integer('released').notNull().default(0),
  open: integer('open').notNull().default(0),
  slashes: integer('slashes').notNull().default(0),
  stale: integer('stale').notNull().default(0),
  sumReturnBps: bigint('sum_return_bps', { mode: 'number' }).notNull().default(0),
  lastActive: ms('last_active').notNull().default(0),
})

export const calls = pgTable(
  'calls',
  {
    id: integer('id').primaryKey(),
    caller: text('caller').notNull(),
    token: text('token').notNull(),
    adapter: text('adapter').notNull(),
    monInWei: wei('mon_in_wei').notNull(),
    tokensWei: wei('tokens_wei').notNull(),
    monOutWei: wei('mon_out_wei'),
    monIn: doublePrecision('mon_in').notNull(),
    tokens: doublePrecision('tokens').notNull(),
    monOut: doublePrecision('mon_out'),
    openedAt: ms('opened_at').notNull(),
    unlockAt: ms('unlock_at').notNull(),
    notice: ms('notice').notNull(),
    announcedAt: ms('announced_at'),
    exitAt: ms('exit_at'),
    closedAt: ms('closed_at'),
    state: text('state', { enum: ['Locked', 'Exiting', 'Settled', 'Released'] }).notNull(),
    stale: boolean('stale').notNull().default(false),
    returnBps: integer('return_bps'),
    thesis: text('thesis').notNull(),
    markedValue: doublePrecision('marked_value'),
    markedAt: ms('marked_at'),
    openTx: text('open_tx').notNull(),
    openBlock: bigint('open_block', { mode: 'number' }),
  },
  (t) => [index('calls_caller').on(t.caller), index('calls_state').on(t.state)],
)

export const slashes = pgTable(
  'slashes',
  {
    id: serial('id').primaryKey(),
    caller: text('caller').notNull(),
    amount: doublePrecision('amount').notNull(),
    reason: text('reason').notNull(),
    at: ms('at').notNull(),
    tx: text('tx').notNull(),
  },
  (t) => [index('slashes_caller').on(t.caller)],
)

export const prices = pgTable(
  'prices',
  {
    callId: integer('call_id')
      .notNull()
      .references(() => calls.id),
    at: ms('at').notNull(),
    price: doublePrecision('price').notNull(),
  },
  (t) => [primaryKey({ columns: [t.callId, t.at] })],
)

export const profiles = pgTable('profiles', {
  address: text('address').primaryKey(),
  handle: text('handle').notNull().unique(), // lowercase by HANDLE_PATTERN, so unique is case-safe
  bio: text('bio').notNull(),
  signedAt: ms('signed_at').notNull(),
})

export const follows = pgTable(
  'follows',
  {
    userId: text('user_id').notNull(),
    caller: text('caller').notNull(),
    at: ms('at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.caller] }), index('follows_caller').on(t.caller)],
)

export const watches = pgTable(
  'watches',
  {
    userId: text('user_id').notNull(),
    callId: integer('call_id').notNull(),
    at: ms('at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.callId] }), index('watches_call').on(t.callId)],
)

export const alerts = pgTable(
  'alerts',
  {
    id: serial('id').primaryKey(),
    userId: text('user_id').notNull(),
    kind: text('kind').notNull(),
    callId: integer('call_id').notNull(),
    at: ms('at').notNull(),
    read: boolean('read').notNull().default(false),
  },
  (t) => [unique('alerts_once').on(t.userId, t.kind, t.callId), index('alerts_user').on(t.userId, t.at)],
)

/** Wallets that received a call's token just before it opened. Review input, never proof. */
export const earlyBuyers = pgTable(
  'early_buyers',
  {
    callId: integer('call_id')
      .notNull()
      .references(() => calls.id),
    wallet: text('wallet').notNull(),
    amount: doublePrecision('amount').notNull(),
    firstBlock: bigint('first_block', { mode: 'number' }).notNull(),
    transfers: integer('transfers').notNull(),
  },
  (t) => [primaryKey({ columns: [t.callId, t.wallet] })],
)

export const earlyBuyerScans = pgTable('early_buyer_scans', {
  callId: integer('call_id')
    .primaryKey()
    .references(() => calls.id),
  fromBlock: bigint('from_block', { mode: 'number' }).notNull(),
  toBlock: bigint('to_block', { mode: 'number' }).notNull(),
  at: ms('at').notNull(),
})
