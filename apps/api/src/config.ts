import { CHAINS, DEFAULT_CHAIN_ID, deploymentFor, type Deployment } from '@trustpool/core'

/**
 * Every setting the API reads, parsed once at start. `DATA=demo` serves the fixed demo
 * set; `DATA=chain` follows a TrustPool deployment into Postgres and serves from there.
 */
export interface Config {
  port: number
  data: 'demo' | 'chain'
  /** Where the web app is served, for links in share pages and Telegram posts. */
  publicUrl: string
  /** Origins allowed by CORS; `*` in development. */
  corsOrigins: string[]
  /** postgres://… in production; pglite://<dir> or empty (in memory) for local work. */
  databaseUrl: string
  limits: { read: { burst: number; perSecond: number; trustProxy: boolean }; write: { burst: number; perSecond: number; trustProxy: boolean } }
  chain?: ChainConfig
  privy?: { appId: string; verificationKey: string }
  /** Posts call events to one Telegram chat. Off unless both are set. */
  telegram?: { botToken: string; chatId: string }
}

export interface ChainConfig {
  chainId: number
  rpcUrl: string
  deployment: Deployment
  /** Blocks to stay behind the head, so a short reorg never reaches the database. */
  confirmations: number
  /** Largest eth_getLogs range; public Monad RPCs cap this, so keep it small. */
  maxBlockRange: number
  pollMs: number
  priceSampleMs: number
  /** Blocks before an open that the early-buyer check scans (~30 min of Monad blocks). */
  earlyBuyerWindow: number
  /** How long price samples are kept. */
  priceRetainMs: number
}

type Env = Record<string, string | undefined>

export function loadConfig(env: Env = process.env): Config {
  const data = oneOf(env.DATA ?? 'demo', ['demo', 'chain'] as const, 'DATA')
  const cfg: Config = {
    port: int(env.PORT, 8787),
    data,
    publicUrl: (env.PUBLIC_URL || 'https://trustpool.web.id').replace(/\/+$/, ''),
    corsOrigins: (env.CORS_ORIGINS ?? '*').split(',').map((s) => s.trim()).filter(Boolean),
    databaseUrl: env.DATABASE_URL ?? '',
    limits: {
      read: { burst: int(env.RATE_READ_BURST, 120), perSecond: int(env.RATE_READ_PER_SEC, 20), trustProxy: env.TRUST_PROXY === '1' },
      write: { burst: int(env.RATE_WRITE_BURST, 20), perSecond: int(env.RATE_WRITE_PER_SEC, 2), trustProxy: env.TRUST_PROXY === '1' },
    },
  }

  if (env.PRIVY_APP_ID || env.PRIVY_VERIFICATION_KEY) {
    if (!env.PRIVY_APP_ID || !env.PRIVY_VERIFICATION_KEY) {
      throw new Error('set both PRIVY_APP_ID and PRIVY_VERIFICATION_KEY, or neither')
    }
    // Env files usually carry the PEM on one line with literal \n.
    cfg.privy = { appId: env.PRIVY_APP_ID, verificationKey: env.PRIVY_VERIFICATION_KEY.replace(/\\n/g, '\n') }
  }

  // Without Privy, /me trusts a header: anyone could read anyone's alerts. Never in production.
  if (data === 'chain' && !cfg.privy && env.NODE_ENV === 'production' && env.ALLOW_DEMO_AUTH !== '1') {
    throw new Error('DATA=chain in production needs PRIVY_APP_ID and PRIVY_VERIFICATION_KEY (or ALLOW_DEMO_AUTH=1 for a throwaway demo)')
  }

  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
    cfg.telegram = { botToken: env.TELEGRAM_BOT_TOKEN, chatId: env.TELEGRAM_CHAT_ID }
  }

  if (data === 'chain') {
    const chainId = int(env.CHAIN_ID, DEFAULT_CHAIN_ID)
    const deployment = deploymentFor(chainId)
    const trustPool = env.TRUSTPOOL_ADDRESS as `0x${string}` | undefined
    if (!deployment && !trustPool) {
      throw new Error(`no deployment for chain ${chainId}: run Deploy.s.sol and npm run sync:contracts, or set TRUSTPOOL_ADDRESS`)
    }
    cfg.chain = {
      chainId,
      rpcUrl: env.RPC_URL ?? CHAINS[chainId]?.rpcUrl ?? fail(`RPC_URL is required for chain ${chainId}`),
      deployment: {
        ...(deployment ?? { chainId, adapter: '0x', adapterKind: 'existing', admin: '0x', treasury: '0x', tokens: [] }),
        trustPool: trustPool ?? deployment!.trustPool,
        startBlock: int(env.START_BLOCK, deployment?.startBlock ?? 0),
      },
      confirmations: int(env.CONFIRMATIONS, chainId === 31337 ? 0 : 2),
      maxBlockRange: int(env.MAX_BLOCK_RANGE, 100),
      pollMs: int(env.POLL_MS, chainId === 31337 ? 1_000 : 2_000),
      priceSampleMs: int(env.PRICE_SAMPLE_MS, 5 * 60_000),
      earlyBuyerWindow: int(env.EARLY_BUYER_WINDOW_BLOCKS, 4_500),
      priceRetainMs: int(env.PRICE_RETAIN_DAYS, 90) * 86_400_000,
    }
  }
  return cfg
}

function int(v: string | undefined, fallback: number): number {
  if (v === undefined || v === '') return fallback
  const n = Number(v)
  if (!Number.isInteger(n) || n < 0) throw new Error(`expected a non-negative integer, got "${v}"`)
  return n
}

function oneOf<T extends string>(v: string, options: readonly T[], name: string): T {
  if (!options.includes(v as T)) throw new Error(`${name} must be one of ${options.join(', ')}, got "${v}"`)
  return v as T
}

function fail(msg: string): never {
  throw new Error(msg)
}
