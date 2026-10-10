#!/usr/bin/env node
// The whole product on one machine: anvil, the contracts (deployed and seeded), the API in
// chain mode and the web app signing with an anvil key. No Privy, no testnet, no Postgres
// server. Used by `npm run dev:local` (for working and recording demos) and by the e2e tests.
//
//   npm run dev:local                 then open http://127.0.0.1:5290/app
//   node scripts/local-stack.mjs warp 3d   moves the chain forward (lock and notice clocks)
import { spawn, spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const RPC = 'http://127.0.0.1:8545'
export const API = 'http://127.0.0.1:8788'
export const WEB = 'http://127.0.0.1:5290'
export const MNEMONIC = 'test test test test test test test test test test test junk'
/** anvil account 5: no bond and no calls, so the web app starts as a new caller. */
export const CALLER_KEY = '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba'
export const CALLER = '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function run(cmd, args, cwd = root) {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed:\n${r.stdout}\n${r.stderr}`)
  return r.stdout
}

async function reachable(url) {
  try {
    await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' })
    return true
  } catch {
    return false
  }
}

async function waitFor(url, tries = 120) {
  for (let i = 0; i < tries; i++) {
    if (await reachable(url)) return
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`${url} did not come up`)
}

export async function rpc(method, params = []) {
  const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) })
  const body = await r.json()
  if (body.error) throw new Error(`${method}: ${body.error.message}`)
  return body.result
}

/** Moves the chain forward and mines a block; returns the new chain time in ms. */
export async function warp(seconds) {
  await rpc('evm_increaseTime', [seconds])
  await rpc('evm_mine')
  const block = await rpc('eth_getBlockByNumber', ['latest', false])
  return Number(BigInt(block.timestamp)) * 1000
}

/**
 * Starts everything and resolves once all of it answers. Each server leads its own process
 * group, so stop() also ends the children that npx and bun start.
 */
export async function startStack({ quiet = true } = {}) {
  for (const url of [RPC, API, WEB]) {
    if (await reachable(url)) throw new Error(`${url} is already in use: stop the old process first`)
  }
  const children = []
  const start = (cmd, args, cwd, env = {}) => {
    const child = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, stdio: quiet ? 'ignore' : 'inherit', detached: true })
    children.push(child)
  }
  const stop = () => {
    for (const c of children.reverse()) {
      try {
        process.kill(-c.pid, 'SIGTERM')
      } catch {
        // already gone
      }
    }
  }

  try {
    start('anvil', ['--silent', '--port', '8545'], root)
    await waitFor(RPC)
    // A fresh anvil gives the same addresses as contracts/deployments/31337.json.
    const deployer = run('cast', ['wallet', 'private-key', MNEMONIC, '0']).trim()
    const contracts = join(root, 'contracts')
    run('forge', ['script', 'script/Deploy.s.sol', '--rpc-url', RPC, '--broadcast', '--private-key', deployer], contracts)
    run('forge', ['script', 'script/SeedLocal.s.sol', '--rpc-url', RPC, '--broadcast'], contracts)
    run('git', ['checkout', '--', 'contracts/deployments/31337.json']) // rewritten with the same addresses

    start('bun', ['src/index.ts'], join(root, 'apps/api'), {
      DATA: 'chain', CHAIN_ID: '31337', PORT: '8788', DATABASE_URL: '', POLL_MS: '500', LOG_LEVEL: 'warn',
    })
    await waitFor(`${API}/api/health`)
    start('npx', ['vite', '--port', '5290', '--strictPort', '--host', '127.0.0.1'], join(root, 'apps/web'), {
      VITE_DATA: 'api', VITE_CHAIN_ID: '31337', VITE_DEV_WALLET_KEY: CALLER_KEY, API_URL: API,
    })
    await waitFor(WEB)
  } catch (err) {
    stop()
    throw err
  }
  return stop
}

const UNITS = { s: 1, m: 60, h: 3600, d: 86400 }

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [cmd, arg] = process.argv.slice(2)
  if (cmd === 'warp') {
    const m = /^(\d+)([smhd])$/.exec(arg ?? '')
    if (!m) throw new Error('usage: local-stack.mjs warp <n>[s|m|h|d]')
    const now = await warp(Number(m[1]) * UNITS[m[2]])
    console.log(`chain time is now ${new Date(now).toISOString()} (the browser keeps its own clock)`)
  } else {
    const stop = await startStack({ quiet: false })
    console.log(`\ntrustpool is running on anvil:\n  web  ${WEB}/app   (signed in as ${CALLER}, a new caller)\n  api  ${API}/api/health\n  rpc  ${RPC}\nCtrl+C stops everything.`)
    for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => (stop(), process.exit(0)))
  }
}
