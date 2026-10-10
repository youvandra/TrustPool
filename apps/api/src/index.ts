import { loadConfig } from './config'
import { openDatabase } from './db/client'
import { createApp } from './http/app'
import { chainClient } from './indexer/chain'
import { EarlyBuyers } from './indexer/earlyBuyers'
import { Indexer } from './indexer/indexer'
import { PriceSampler } from './indexer/prices'
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
  const prices = new PriceSampler(database.db, client, cfg.chain.priceSampleMs, {
    retainMs: cfg.chain.priceRetainMs,
    isLeader: () => indexer.status().leader,
  })
  const early = new EarlyBuyers(database.db, client, {
    pool: cfg.chain.deployment.trustPool,
    windowBlocks: cfg.chain.earlyBuyerWindow,
    maxBlockRange: cfg.chain.maxBlockRange,
  })
  indexer.start()
  prices.start()
  app = createApp({
    store: postgresStore(database.db),
    privy: cfg.privy,
    corsOrigins: cfg.corsOrigins,
    indexer: () => indexer.status(),
    earlyBuyers: (id) => early.report(id),
    verifySignature: (p) => client.verifyMessage(p),
  })
  shutdown = async () => {
    indexer.stop()
    prices.stop()
    await database.close()
  }
} else {
  app = createApp({ store: demoStore(), privy: cfg.privy, corsOrigins: cfg.corsOrigins })
}

if (!cfg.privy) log.warn('no Privy keys: /me routes trust X-Demo-User. Local use only.')

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    log.info('shutting down', { sig })
    void shutdown().finally(() => process.exit(0))
  })
}

log.info('trustpool api', { port: cfg.port, data: cfg.data, chainId: cfg.chain?.chainId })
export default { port: cfg.port, fetch: app.fetch }
