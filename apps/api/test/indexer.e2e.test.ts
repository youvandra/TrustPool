import { describe, expect, test } from 'bun:test'
import { deploymentFor, trustPoolAbi } from '@trustpool/core'
import { openDatabase } from '../src/db/database'
import { chainClient } from '../src/indexer/chain'
import { EarlyBuyers } from '../src/indexer/earlyBuyers'
import { Indexer } from '../src/indexer/indexer'
import { PriceSampler } from '../src/indexer/prices'
import { sqliteStore } from '../src/store/sqlite'

/**
 * Indexes a live local chain and checks every record against the contract's own view.
 * Needs anvil with Deploy.s.sol (and ideally SeedLocal.s.sol) run, then:
 *   E2E_RPC_URL=http://127.0.0.1:8545 bun test indexer.e2e
 */
const rpc = process.env.E2E_RPC_URL
const deployment = deploymentFor(31337)

describe.skipIf(!rpc || !deployment)('indexer against anvil', () => {
  test('database matches the contract', async () => {
    const db = openDatabase(':memory:')
    const client = chainClient(31337, rpc!)
    const cfg = { chainId: 31337, rpcUrl: rpc!, deployment: deployment!, dbPath: ':memory:', confirmations: 0, maxBlockRange: 3, pollMs: 0, priceSampleMs: 0, earlyBuyerWindow: 50 }
    const indexer = new Indexer(db, client, cfg)
    while (await indexer.tick()) {}
    expect(indexer.status().caughtUp).toBe(true)

    const store = sqliteStore(db)
    const pool = deployment!.trustPool
    const count = await client.readContract({ address: pool, abi: trustPoolAbi, functionName: 'callCount' })
    expect(store.listCalls().length).toBe(Number(count))

    for (const caller of store.listCallers()) {
      const r = await client.readContract({ address: pool, abi: trustPoolAbi, functionName: 'recordOf', args: [caller.address as `0x${string}`] })
      expect(caller.record).toMatchObject({
        settled: r.settled,
        losses: r.losses,
        released: r.released,
        open: r.open,
        slashes: r.slashes,
        stale: r.stale,
        sumReturnBps: Number(r.sumReturnBps),
        lastActive: Number(r.lastActive) * 1000,
      })
    }

    const open = store.listCalls({ state: ['Locked', 'Exiting'] }).length
    expect(await new PriceSampler(db, client, 0).sample()).toBe(open)

    // The seed's own buys land in the open transaction, which the window excludes.
    const early = new EarlyBuyers(db, client, { pool, windowBlocks: 50, maxBlockRange: 7 })
    const last = store.listCalls().at(0)!
    const report = await early.report(last.id)
    expect(report?.toBlock).toBeGreaterThanOrEqual(0)
    expect(report?.buyers.every((b) => b.wallet.toLowerCase() !== pool.toLowerCase())).toBe(true)
    expect(await early.report(last.id)).toEqual(report) // cached
  })
})
