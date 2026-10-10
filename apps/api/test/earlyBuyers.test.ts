import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { getAddress, parseEther, type PublicClient } from 'viem'
import { openDatabase, type Database } from '../src/db/client'
import { EarlyBuyers } from '../src/indexer/earlyBuyers'
import { EventWriter } from '../src/indexer/writer'

const POOL = getAddress('0x5FbDB2315678afecb367f032d93F642f64180aa3')
const CALLER = getAddress('0x90F79bf6EB2c4f870365E785982E1f101E93b906')
const TOKEN = getAddress('0x8A791620dd6260079BF849Dc5567aDC3F2FdC318')
const A = getAddress('0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65') // funded by the caller 10 blocks before its buy
const B = getAddress('0x9965507D1a55bcC2695C58ba1D2c9b2245C7e3d2') // funded too long before its buy
const D = getAddress('0x976EA74026E726554dB657fA54763abd0C3a0aa9') // never funded
const E = getAddress('0x14dC79964da2C08b23698B3D3cc7Ca32193d9955') // paid by the caller, never bought

// The fixture chain: token transfers, and the caller's own transactions.
const transfers = [
  { to: CALLER, block: 120n },
  { to: A, block: 150n },
  { to: B, block: 160n },
  { to: D, block: 170n },
  { to: POOL, block: 175n }, // the pool is never listed
]
const callerTxs = [
  { to: B, block: 10n },
  { to: A, block: 140n },
  { to: E, block: 145n },
  { to: TOKEN, block: 146n, value: 0n }, // a contract call, no MON
]

function mockClient(opts: { nonces?: boolean; blocks?: boolean } = {}) {
  const fetched: bigint[] = []
  const client = {
    async getLogs({ fromBlock, toBlock }: { fromBlock: bigint; toBlock: bigint }) {
      return transfers
        .filter((t) => t.block >= fromBlock && t.block <= toBlock)
        .map((t) => ({ args: { from: POOL, to: t.to, value: parseEther('5') }, blockNumber: t.block }))
    },
    async getTransactionCount({ blockNumber }: { blockNumber: bigint }) {
      if (opts.nonces === false) throw new Error('missing trie node')
      return callerTxs.filter((t) => t.block <= blockNumber).length
    },
    async getBlock({ blockNumber }: { blockNumber: bigint }) {
      if (opts.blocks === false) throw new Error('rate limited')
      fetched.push(blockNumber)
      const transactions = callerTxs.filter((t) => t.block === blockNumber).map((t) => ({ from: CALLER.toLowerCase(), to: t.to.toLowerCase(), value: t.value ?? parseEther('1') }))
      return { number: blockNumber, transactions }
    },
  }
  return { client: client as unknown as PublicClient, fetched }
}

let database: Database
let w: EventWriter
let nextId = 50

beforeAll(async () => {
  database = await openDatabase(process.env.TEST_DATABASE_URL ?? '')
  w = new EventWriter(database.db)
  await w.upsertToken({ address: TOKEN, symbol: 'tMOE', name: 'Moe', decimals: 18, hue: 1 })
  await w.bondPosted(CALLER, parseEther('1'), { at: 1, tx: '0x1' })
})
afterAll(() => database.close())

async function openCall() {
  const id = nextId++
  await w.callOpened(
    { id: BigInt(id), caller: CALLER, token: TOKEN, adapter: POOL, monIn: 1n, tokens: 1n, unlockAt: 1n, notice: 1, thesis: '' },
    { at: 1, tx: '0x2', block: 200n },
  )
  return id
}

const scan = (client: PublicClient) => new EarlyBuyers(database.db, client, { pool: POOL, windowBlocks: 100, maxBlockRange: 30, fundingWindowBlocks: 50 })
const flags = (r: Awaited<ReturnType<EarlyBuyers['report']>>) => Object.fromEntries(r!.buyers.map((b) => [b.wallet, b.fundedByCaller]))

describe('early buyers funded by the caller', () => {
  test("marks a wallet the caller paid shortly before its buy, reading only the caller's blocks", async () => {
    const { client, fetched } = mockClient()
    const report = await scan(client).report(await openCall())
    expect(report!.fundingChecked).toBe(true)
    expect(flags(report)).toEqual({ [CALLER]: false, [A]: true, [B]: false, [D]: false })
    expect(fetched.sort()).toEqual([140n, 145n, 146n]) // the caller's blocks in the window, nothing else
  })

  test('without historical nonces it scans the blocks and finds the same', async () => {
    const { client, fetched } = mockClient({ nonces: false })
    const report = await scan(client).report(await openCall())
    expect(report!.fundingChecked).toBe(true)
    expect(flags(report)).toEqual({ [CALLER]: false, [A]: true, [B]: false, [D]: false })
    expect(fetched.length).toBeGreaterThan(3)
  })

  test('when the RPC cannot answer, the list stands and says it was not checked', async () => {
    const id = await openCall()
    const report = await scan(mockClient({ nonces: false, blocks: false }).client).report(id)
    expect(report!.fundingChecked).toBe(false)
    expect(report!.buyers.map((b) => b.wallet).sort()).toEqual([A, B, CALLER, D].sort())
    expect(report!.buyers.every((b) => !b.fundedByCaller)).toBe(true)
    // Cached as scanned: the answer is stored once, like the list itself.
    expect(await scan(mockClient().client).report(id)).toEqual(report)
  })
})
