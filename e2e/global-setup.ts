import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { API, CALLER_KEY, MNEMONIC, RPC, WEB } from './lib'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const children: ChildProcess[] = []

function start(cmd: string, args: string[], opts: { cwd?: string; env?: Record<string, string> } = {}) {
  // detached: each server leads its own process group, so teardown stops its children too
  // (npx would otherwise leave vite running).
  const child = spawn(cmd, args, {
    cwd: opts.cwd ?? root,
    env: { ...process.env, ...opts.env },
    stdio: process.env.E2E_VERBOSE ? 'inherit' : 'ignore',
    detached: true,
  })
  children.push(child)
  return child
}

function run(cmd: string, args: string[], cwd = root) {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', env: { ...process.env, FOUNDRY_DISABLE_NIGHTLY_WARNING: '1' } })
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed:\n${r.stdout}\n${r.stderr}`)
  return r.stdout
}

async function waitFor(url: string, init?: RequestInit, tries = 120) {
  for (let i = 0; i < tries; i++) {
    try {
      if ((await fetch(url, init)).ok) return
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`${url} did not come up`)
}

async function free(url: string) {
  try {
    await fetch(url, { method: 'POST', body: '{}' })
  } catch {
    return
  }
  throw new Error(`${url} is already in use: stop the old process first`)
}

export default async function setup() {
  // A leftover chain or server would silently feed the test stale state.
  for (const url of [RPC, API, WEB]) await free(url)
  start('anvil', ['--silent', '--port', '8545'])
  await waitFor(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' })

  // A fresh anvil gives the same addresses as contracts/deployments/31337.json.
  const deployer = run('cast', ['wallet', 'private-key', MNEMONIC, '0']).trim()
  const contracts = join(root, 'contracts')
  run('forge', ['script', 'script/Deploy.s.sol', '--rpc-url', RPC, '--broadcast', '--private-key', deployer], contracts)
  run('forge', ['script', 'script/SeedLocal.s.sol', '--rpc-url', RPC, '--broadcast'], contracts)
  run('git', ['checkout', '--', 'contracts/deployments/31337.json']) // the deploy rewrote it with the same addresses

  start('bun', ['src/index.ts'], {
    cwd: join(root, 'apps/api'),
    env: { DATA: 'chain', CHAIN_ID: '31337', PORT: '8788', DATABASE_URL: '', POLL_MS: '500', LOG_LEVEL: 'warn' },
  })
  await waitFor(`${API}/api/health`)

  start('npx', ['vite', '--port', '5290', '--strictPort', '--host', '127.0.0.1'], {
    cwd: join(root, 'apps/web'),
    env: { VITE_DATA: 'api', VITE_CHAIN_ID: '31337', VITE_DEV_WALLET_KEY: CALLER_KEY, API_URL: API },
  })
  await waitFor(WEB)

  return async () => {
    for (const c of children.reverse()) {
      try {
        process.kill(-c.pid!, 'SIGTERM')
      } catch {
        // already gone
      }
    }
  }
}
