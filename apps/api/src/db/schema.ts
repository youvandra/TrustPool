import { bigint, boolean, doublePrecision, index, integer, numeric, pgTable, primaryKey, serial, text, unique } from 'drizzle-orm/pg-core'

/**
 * The API's database. Chain data (tokens, callers, calls, deposits, claims, slashes, prices,
 * early buyers) is derived from TrustPool events and can always be rebuilt by indexing again
 * from the deployment block. User data (follows, watches, alerts, profiles) cannot: back it up.
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

/** One row per address that ever posted a bond; the record mirrors `TrustPool.recordOf`. */
export const callers = pgTable('callers', {
  address: text('address').primaryKey(),
  bondWei: wei('bond_wei').notNull().default('0'),
  bond: doublePrecision('bond').notNull().default(0),
  withdrawReadyAt: ms('withdraw_ready_at'),
  firstSeen: ms('first_seen').notNull(),
  settled: integer('settled').notNull().default(0),
  losses: integer('losses').notNull().default(0),
  negligent: integer('negligent').notNull().default(0),
  refunded: integer('refunded').notNull().default(0),
  split: integer('split').notNull().default(0),
  slashes: integer('slashes').notNull().default(0),
  active: integer('active').notNull().default(0),
  sumNetBps: bigint('sum_net_bps', { mode: 'number' }).notNull().default(0),
  lastActive: ms('last_active').notNull().default(0),
})

const CALL_STATES = ['Open', 'Holding', 'Settled', 'Refunded', 'Split'] as const
const SALE_REASONS = ['take_profit', 'stop_loss', 'max_hold'] as const

export const calls = pgTable(
  'calls',
  {
    id: integer('id').primaryKey(),
    caller: text('caller').notNull(),
    token: text('token').notNull(),
    adapter: text('adapter').notNull(),
    tier: integer('tier').notNull(),
    thesis: text('thesis').notNull(),
    openedAt: ms('opened_at').notNull(),
    state: text('state', { enum: CALL_STATES }).notNull(),
    // rules, fixed at open
    windowEnd: ms('window_end').notNull(),
    buyDeadline: ms('buy_deadline').notNull(),
    maxHold: ms('max_hold').notNull(),
    takeProfitBps: integer('take_profit_bps').notNull(),
    stopLossBps: integer('stop_loss_bps').notNull(),
    shareBps: integer('share_bps').notNull(),
    minCallerBps: integer('min_caller_bps').notNull(),
    maxImpactBps: integer('max_impact_bps').notNull(),
    sellToleranceBps: integer('sell_tolerance_bps').notNull(),
    keeperBps: integer('keeper_bps').notNull(),
    checkpointGap: ms('checkpoint_gap').notNull(),
    splitGrace: ms('split_grace').notNull(),
    capWei: wei('cap_wei').notNull(),
    cap: doublePrecision('cap').notNull(),
    minPoolWei: wei('min_pool_wei').notNull(),
    minPool: doublePrecision('min_pool').notNull(),
    // the pool
    totalInWei: wei('total_in_wei').notNull().default('0'),
    totalIn: doublePrecision('total_in').notNull().default(0),
    callerStakeWei: wei('caller_stake_wei').notNull().default('0'),
    callerStake: doublePrecision('caller_stake').notNull().default(0),
    depositors: integer('depositors').notNull().default(0),
    /** From `capOf`, sampled while the window is open. */
    liveCap: doublePrecision('live_cap'),
    /** The "window closing" alert went out; it is time-based, so it is sent once by flag. */
    closingAlerted: boolean('closing_alerted').notNull().default(false),
    // the buy
    tokensWei: wei('tokens_wei'),
    tokens: doublePrecision('tokens'),
    boughtAt: ms('bought_at'),
    holdUntil: ms('hold_until'),
    buyBlock: bigint('buy_block', { mode: 'number' }),
    // the last two checkpoints
    prevValue: doublePrecision('prev_value'),
    prevAt: ms('prev_at'),
    lastValueWei: wei('last_value_wei'),
    lastValue: doublePrecision('last_value'),
    lastAt: ms('last_at'),
    // the end
    saleReason: text('sale_reason', { enum: SALE_REASONS }),
    keeper: text('keeper'),
    grossWei: wei('gross_wei'),
    gross: doublePrecision('gross'),
    keeperReward: doublePrecision('keeper_reward'),
    feeWei: wei('fee_wei'),
    fee: doublePrecision('fee'),
    payoutWei: wei('payout_wei'),
    payout: doublePrecision('payout'),
    netReturnBps: integer('net_return_bps'),
    negligent: boolean('negligent'),
    closedAt: ms('closed_at'),
    markedValue: doublePrecision('marked_value'),
    markedAt: ms('marked_at'),
    openTx: text('open_tx').notNull(),
    openBlock: bigint('open_block', { mode: 'number' }),
  },
  (t) => [index('calls_caller').on(t.caller), index('calls_state').on(t.state)],
)

/** One row per wallet and call: what it has in, and whether it has claimed. */
export const deposits = pgTable(
  'deposits',
  {
    callId: integer('call_id')
      .notNull()
      .references(() => calls.id),
    account: text('account').notNull(),
    depositWei: wei('deposit_wei').notNull(),
    deposit: doublePrecision('deposit').notNull(),
    firstAt: ms('first_at').notNull(),
    lastAt: ms('last_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.callId, t.account] }), index('deposits_account').on(t.account)],
)

/** Each claim as the contract paid it: MON after a sale or refund, tokens after a split. */
export const claims = pgTable(
  'claims',
  {
    callId: integer('call_id')
      .notNull()
      .references(() => calls.id),
    account: text('account').notNull(),
    monWei: wei('mon_wei').notNull(),
    mon: doublePrecision('mon').notNull(),
    tokensWei: wei('tokens_wei').notNull(),
    tokens: doublePrecision('tokens').notNull(),
    at: ms('at').notNull(),
    tx: text('tx').notNull(),
  },
  (t) => [primaryKey({ columns: [t.callId, t.account] })],
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

/** Quotes of the whole position while holding, for the sparkline. Checkpoints land here too. */
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

/** Wallets that received a call's token just before the pool bought. Review input, never proof. */
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
    /** Received MON straight from the caller's address shortly before its first buy. */
    fundedByCaller: boolean('funded_by_caller').notNull().default(false),
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
  /** False when the funding check could not run (no historical state, or over its budget). */
  fundingChecked: boolean('funding_checked').notNull().default(false),
})
