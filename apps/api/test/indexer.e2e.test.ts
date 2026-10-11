import { describe, expect, test } from 'bun:test'
import { deploymentFor, trustPoolAbi } from '@trustpool/core'
import { formatEther } from 'viem'
import { openDatabase } from '../src/db/client'
import { chainClient } from '../src/indexer/chain'
import { Indexer } from '../src/indexer/indexer'
import { PriceSampler } from '../src/indexer/prices'
import { postgresStore } from '../src/store/postgres'

/**
 * Indexes a live local chain and checks every record, pool and deposit against the contract's own view.
 * Needs anvil with Deploy.s.sol (and ideally SeedLocal.s.sol) run, then:
 *   E2E_RPC_URL=http://127.0.0.1:8545 bun test indexer.e2e
 */
const rpc = process.env.E2E_RPC_URL
const deployment = deploymentFor(31337)

describe.skipIf(!rpc || !deployment)('indexer against anvil', () => {
  test('database matches the contract', async () => {
    const database = await openDatabase('')
    const db = database.db
    const client = chainClient(31337, rpc!)
    const cfg = { chainId: 31337, rpcUrl: rpc!, deployment: deployment!, confirmations: 0, maxBlockRange: 3, pollMs: 0, priceSampleMs: 0, earlyBuyerWindow: 50, fundingWindow: 50, priceRetainMs: 0, keeperMs: 0 }
    const indexer = await new Indexer(database, client, cfg).init()
    while (await indexer.tick()) {}
    expect(indexer.status().caughtUp).toBe(true)

    const store = postgresStore(db)
    const pool = deployment!.trustPool
    const count = await client.readContract({ address: pool, abi: trustPoolAbi, functionName: 'callCount' })
    expect((await store.listCalls()).length).toBe(Number(count))

    for (const caller of await store.listCallers()) {
      const r = await client.readContract({ address: pool, abi: trustPoolAbi, functionName: 'recordOf', args: [caller.address as `0x${string}`] })
      expect(caller.record).toEqual({
        settled: r.settled,
        losses: r.losses,
        negligent: r.negligent,
        refunded: r.refunded,
        split: r.split,
        active: r.active,
        slashes: r.slashes,
        sumNetBps: Number(r.sumNetBps),
        lastActive: Number(r.lastActive) * 1000,
      })
      expect(caller.tier).toBe(await client.readContract({ address: pool, abi: trustPoolAbi, functionName: 'tierOf', args: [caller.address as `0x${string}`] }))
    }

    // Every pool and every deposit matches the contract's own books.
    for (const call of await store.listCalls()) {
      const c = await client.readContract({ address: pool, abi: trustPoolAbi, functionName: 'getCall', args: [BigInt(call.id)] })
      expect(call.totalIn).toBe(Number(formatEther(c.totalIn)))
      expect(call.depositors).toBe(c.depositors)
      expect(call.rules.cap).toBe(Number(formatEther(c.rules.cap)))
      expect(call.rules.windowEnd).toBe(c.rules.windowEnd * 1000)
      for (const p of (await store.participants(call.id))!) {
        const d = await client.readContract({ address: pool, abi: trustPoolAbi, functionName: 'depositOf', args: [BigInt(call.id), p.address as `0x${string}`] })
        expect(p.deposit).toBe(Number(formatEther(d)))
      }
    }

    // Live caps come from the contract's capOf; with the mock DEX only the bond cap binds.
    const open = await store.listCalls({ state: ['Open'] })
    await new PriceSampler(db, client, 0, { pool }).sampleCaps(Number((await client.getBlock()).timestamp) * 1000)
    for (const call of open) expect((await store.getCall(call.id))!.liveCap).toBe(call.rules.cap)
    await database.close()
  })
})
