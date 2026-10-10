import { loadConfig } from './config'
import { openDatabase } from './db/database'
import { createApp } from './http/app'
import { chainClient } from './indexer/chain'
import { Indexer } from './indexer/indexer'
import { PriceSampler } from './indexer/prices'
import { log } from './log'
import { demoStore } from './store/demo'
import { sqliteStore } from './store/sqlite'

/**
 * Entry point. DATA=demo serves the fixed demo set; DATA=chain indexes a TrustPool
 * deployment into SQLite and serves the same routes from it. See apps/api/README.md.
 */
const cfg = loadConfig()
let app: ReturnType<typeof createApp>
let shutdown = () => {}

if (cfg.chain) {
  const db = openDatabase(cfg.chain.dbPath)
  const client = chainClient(cfg.chain.chainId, cfg.chain.rpcUrl)
  const indexer = new Indexer(db, client, cfg.chain)
  const prices = new PriceSampler(db, client, cfg.chain.priceSampleMs)
  indexer.start()
  prices.start()
  app = createApp({ store: sqliteStore(db), privy: cfg.privy, corsOrigins: cfg.corsOrigins, indexer: () => indexer.status() })
  shutdown = () => {
    indexer.stop()
    prices.stop()
    db.close()
  }
} else {
  app = createApp({ store: demoStore(), privy: cfg.privy, corsOrigins: cfg.corsOrigins })
}

if (!cfg.privy) log.warn('no Privy keys: /me routes trust X-Demo-User. Local use only.')

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    log.info('shutting down', { sig })
    shutdown()
    process.exit(0)
  })
}

log.info('trustpool api', { port: cfg.port, data: cfg.data, chainId: cfg.chain?.chainId })
export default { port: cfg.port, fetch: app.fetch }
