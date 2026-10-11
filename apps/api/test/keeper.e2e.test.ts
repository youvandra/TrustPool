import { describe, expect, test } from 'bun:test'
import { deploymentFor, trustPoolAbi } from '@trustpool/core'
import { openDatabase } from '../src/db/client'
import { chainClient, walletClient } from '../src/indexer/chain'
import { EarlyBuyers } from '../src/indexer/earlyBuyers'
import { Indexer } from '../src/indexer/indexer'
import { Keeper } from '../src/keeper/keeper'
import { postgresStore } from '../src/store/postgres'

/**
 * The keeper drives the seeded calls to their ends on anvil, moving the chain's clock:
 * refunds the pools that stayed small, and after the caller buys, checkpoints and sells at
 * max hold. Run after indexer.e2e on a fresh Deploy.s.sol + SeedLocal.s.sol chain:
 *   E2E_RPC_URL=http://127.0.0.1:8545 bun test keeper.e2e
 */
const rpc = process.env.E2E_RPC_URL
const deployment = deploymentFor(31337)
// anvil accounts 1 (olu, caller of call 0) and 9 (the keeper)
const OLU = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'
const KEEPER = '0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6'

describe.skipIf(!rpc || !deployment)('keeper against anvil', () => {
  test('refunds small pools, then checkpoints and sells at max hold', async () => {
    const database = await openDatabase('')
    const client = chainClient(31337, rpc!)
    const pool = deployment!.trustPool
    const cfg = { chainId: 31337, rpcUrl: rpc!, deployment: deployment!, confirmations: 0, maxBlockRange: 50, pollMs: 0, priceSampleMs: 0, earlyBuyerWindow: 50, fundingWindow: 50, priceRetainMs: 0, keeperMs: 0 }
    const indexer = await new Indexer(database, client, cfg).init()
    const index = async () => {
      while (await indexer.tick()) {}
    }
    const warp = async (seconds: number) => {
      await client.request({ method: 'evm_increaseTime' as never, params: [seconds] as never })
      await client.request({ method: 'evm_mine' as never, params: [] as never })
    }
    const wallet = walletClient(31337, rpc!, KEEPER)
    const keeper = new Keeper(database.db, client, wallet, { pool, everyMs: 0 })
    const store = postgresStore(database.db)
    await index()

    const big = (await store.listCalls({ state: ['Open'] })).find((c) => c.totalIn >= c.rules.minPool)!
    const small = (await store.listCalls({ state: ['Open'] })).filter((c) => c.totalIn < c.rules.minPool)
    expect(small.length).toBeGreaterThan(0)

    // Every window closes: the small pools are refunded with no fault, the big one waits for its caller.
    const chainNow = async () => Number((await client.getBlock()).timestamp) * 1000
    await warp(Math.ceil((big.rules.windowEnd - (await chainNow())) / 1000) + 1)
    const refunds = await keeper.tick()
    expect(refunds.map((d) => `${d.id}:${d.action}`).sort()).toEqual(small.map((c) => `${c.id}:refund`).sort())

    const olu = walletClient(31337, rpc!, OLU)
    await client.waitForTransactionReceipt({
      hash: await olu.writeContract({ account: olu.account, address: pool, abi: trustPoolAbi, functionName: 'buy', args: [BigInt(big.id), 0n], chain: olu.chain }),
    })
    await index()
    const holding = (await store.getCall(big.id))!
    expect(holding.state).toBe('Holding')
    expect(await keeper.tick()).toEqual([]) // the price meets no rule: no checkpoint spent

    // One gap before max hold: the first checkpoint. One gap later: the second, and the sale.
    await warp(Math.ceil((holding.holdUntil! - holding.rules.checkpointGap - (await chainNow())) / 1000))
    await index()
    expect((await keeper.tick()).map((d) => d.action)).toEqual(['checkpoint'])
    await warp(holding.rules.checkpointGap / 1000)
    await index()
    const before = await client.getBalance({ address: wallet.account.address })
    expect((await keeper.tick()).map((d) => d.action)).toEqual(['checkpoint', 'sell'])

    await index()
    const sold = (await store.getCall(big.id))!
    expect(sold).toMatchObject({ state: 'Settled', saleReason: 'max_hold', keeper: wallet.account.address })
    expect(sold.checkpoints).toHaveLength(2)
    expect(sold.gross! - sold.keeperReward!).toBeCloseTo(sold.payout! + sold.fee!)
    // the reward arrived, net of the gas the keeper paid for two checkpoints and the sale
    expect(await client.getBalance({ address: wallet.account.address })).toBeGreaterThan(before - 10n ** 16n)
    for (const c of small) expect((await store.getCall(c.id))).toMatchObject({ state: 'Refunded', negligent: false })

    const record = (await store.getCaller(sold.caller))!.record
    const onChain = await client.readContract({ address: pool, abi: trustPoolAbi, functionName: 'recordOf', args: [sold.caller as `0x${string}`] })
    expect(record.settled).toBe(onChain.settled)
    expect(record.sumNetBps).toBe(Number(onChain.sumNetBps))

    // The pool has bought, so the early-buyer scan has a window to read.
    const report = await new EarlyBuyers(database.db, client, { pool, windowBlocks: 50, maxBlockRange: 7, fundingWindowBlocks: 50 }).report(big.id)
    expect(report?.fundingChecked).toBe(true)
    expect(report?.buyers.every((b) => b.wallet.toLowerCase() !== pool.toLowerCase())).toBe(true)
    await database.close()
  }, 60_000)
})
