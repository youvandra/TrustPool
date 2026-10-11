import { loadConfig } from './config'
import { openDatabase } from './db/client'
import { createApp } from './http/app'
import { chainClient, walletClient } from './indexer/chain'
import { EarlyBuyers } from './indexer/earlyBuyers'
import { Indexer } from './indexer/indexer'
import { PriceSampler } from './indexer/prices'
import { Keeper } from './keeper/keeper'
import { AlertHub } from './live/hub'
import { TelegramFeed } from './live/telegram'
import { log } from './log'
import { demoStore } from './store/demo'
import { postgresStore } from './store/postgres'

/**
 * Entry point. DATA=demo serves the fixed demo set; DATA=chain indexes a TrustPool
 * deployment into Postgres and serves the same routes from it. See apps/api/README.md.
 */
const cfg = loadConfig()
let app: ReturnType<typeof createApp>
let shutdown = async () => {}

if (cfg.chain) {
  if (!cfg.databaseUrl) log.warn('no DATABASE_URL: using an in-memory database, lost on restart')
  const database = await openDatabase(cfg.databaseUrl)
  const client = chainClient(cfg.chain.chainId, cfg.chain.rpcUrl)
  const indexer = await new Indexer(database, client, cfg.chain).init()
  const isLeader = () => indexer.status().leader
  const prices = new PriceSampler(database.db, client, cfg.chain.priceSampleMs, {
    pool: cfg.chain.deployment.trustPool,
    retainMs: cfg.chain.priceRetainMs,
    isLeader,
    now: () => indexer.now(),
  })
  const keeper =
    cfg.chain.keeperKey &&
    new Keeper(database.db, client, walletClient(cfg.chain.chainId, cfg.chain.rpcUrl, cfg.chain.keeperKey), {
      pool: cfg.chain.deployment.trustPool,
      everyMs: cfg.chain.keeperMs,
      isLeader,
    })
  if (!keeper) log.info('no KEEPER_PRIVATE_KEY: the keeper is off; anyone can still checkpoint, sell, refund and split')
  const early = new EarlyBuyers(database.db, client, {
    pool: cfg.chain.deployment.trustPool,
    windowBlocks: cfg.chain.earlyBuyerWindow,
    fundingWindowBlocks: cfg.chain.fundingWindow,
    maxBlockRange: cfg.chain.maxBlockRange,
  })
  const hub = new AlertHub()
  await hub.start(database)
  const store = postgresStore(database.db)
  const telegram = cfg.telegram && new TelegramFeed(store, { ...cfg.telegram, appUrl: cfg.publicUrl, isLeader })
  await telegram?.start(database)
  indexer.start()
  prices.start()
  keeper?.start()
  app = createApp({
    store,
    privy: cfg.privy,
    corsOrigins: cfg.corsOrigins,
    indexer: () => indexer.status(),
    earlyBuyers: (id) => early.report(id),
    verifySignature: (p) => client.verifyMessage(p),
    limits: cfg.limits,
    hub,
    publicUrl: cfg.publicUrl,
  })
  shutdown = async () => {
    await hub.close()
    await telegram?.close()
    indexer.stop()
    prices.stop()
    keeper?.stop()
    await database.close()
  }
} else {
  app = createApp({ store: demoStore(), privy: cfg.privy, corsOrigins: cfg.corsOrigins, limits: cfg.limits, publicUrl: cfg.publicUrl })
}

if (!cfg.privy) log.warn('no Privy keys: /me routes trust X-Demo-User. Local use only.')

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    log.info('shutting down', { sig })
    void shutdown().finally(() => process.exit(0))
  })
}

log.info('trustpool api', { port: cfg.port, data: cfg.data, chainId: cfg.chain?.chainId })
// Bun closes a connection after 10 idle seconds by default, which cut /me/stream before its
// first 25-second heartbeat, so alerts sent between reconnects were lost. Stay above the heartbeat.
export default { port: cfg.port, fetch: app.fetch, idleTimeout: 60 }
