import { expect, test } from '@playwright/test'
import { encodeFunctionData, parseAbi, parseEther } from 'viem'
import { api, CALLER, chainNow, rpc, warp } from '../lib'

interface Caller {
  record: { settled: number; active: number; losses: number }
  bond: number
}
interface Call {
  id: number
  state: string
  totalIn: number
  holdUntil?: number
  rules: { checkpointGap: number }
}

// From the seed (contracts/script/SeedLocal.s.sol): anvil account 7 is a joiner with MON.
const JOINER = '0x14dC79964da2C08b23698B3D3cc7Ca32193d9955'
const abi = parseAbi(['function deposit(uint256 id) payable'])

/** The caller as the API sees it, or undefined until the indexer has caught up. */
const caller = () => api<Caller>(`/callers/${CALLER}`).catch(() => undefined)
const latest = async () => (await api<Call[]>(`/calls?caller=${CALLER}`))[0]

/**
 * The story the product exists for, through the real UI and real transactions: a new caller
 * opens a pool with their own stake, someone joins, the caller buys for everyone, anyone
 * records the price and sells at max hold, and the caller claims. The result is on the record.
 */
test('a pool opens, fills, buys, sells, and the record shows it', async ({ page }) => {
  // The browser's clock follows the chain's, so countdowns and enabled buttons match it.
  await page.clock.install({ time: await chainNow() })

  await page.goto('/app/new')
  await page.getByRole('button', { name: /CHOG/ }).click()
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByPlaceholder('0').fill('30')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByPlaceholder(/One or two sentences/).fill('CHOG for a day, end to end.')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Open the pool' }).click()

  // Two transactions: the bond (the caller had none; 2x it must cover the 50 MON minimum), then the pool.
  await expect(page.getByText('Your call is live')).toBeVisible()
  await expect.poll(async () => (await caller())?.record.active).toBe(1)
  expect((await caller())?.bond).toBe(25)
  const { id } = await latest()

  // Someone joins: anvil accounts are unlocked, so the joiner's deposit goes straight to the node.
  const pool = ((await api<{ indexer: { trustPool: string } }>('/health')).indexer.trustPool) as `0x${string}`
  await rpc('eth_sendTransaction', [
    { from: JOINER, to: pool, value: `0x${parseEther('20').toString(16)}`, data: encodeFunctionData({ abi, functionName: 'deposit', args: [BigInt(id)] }) },
  ])
  await expect.poll(async () => (await latest()).totalIn).toBe(50)

  // The window closes; the caller buys for the whole pool.
  await page.clock.setSystemTime(await warp(3600 + 60))
  await page.goto(`/app/calls/${id}`)
  await expect(page.getByText('CHOG for a day, end to end.')).toBeVisible()
  await page.getByRole('button', { name: /Buy CHOG with 50.00 MON/ }).first().click()
  await expect(page.getByText(/Bought for the whole pool/)).toBeVisible()
  await expect.poll(async () => (await latest()).state).toBe('Holding')

  // One gap before max hold anyone may record the price; one gap later, record again and sell.
  const call = await latest()
  const now = await chainNow()
  await page.clock.setSystemTime(await warp(Math.ceil((call.holdUntil! - call.rules.checkpointGap - now) / 1000)))
  await page.reload()
  await page.getByRole('button', { name: 'Record price' }).first().click()
  await expect(page.getByText('Price recorded.')).toBeVisible()
  await page.clock.setSystemTime(await warp(call.rules.checkpointGap / 1000))
  await page.reload()
  await page.getByRole('button', { name: 'Record price' }).first().click()
  await expect(page.getByText('Price recorded.')).toBeVisible()
  const sell = page.getByRole('button', { name: 'Sell now' }).first()
  await expect(sell).toBeEnabled()
  await sell.click()
  await expect(page.getByText(/Sold together/).first()).toBeVisible()

  // The record is public, written from the measured sale; then the caller claims.
  await expect.poll(async () => (await caller())?.record.settled).toBe(1)
  expect((await caller())?.record.active).toBe(0)
  await page.reload()
  await page.getByRole('button', { name: /^Claim / }).first().click()
  await expect(page.getByText(/Claimed/).first()).toBeVisible()
  await page.goto(`/app/callers/${CALLER}`)
  await expect(page.getByRole('link', { name: /CHOG #\d+ .*Settled/ })).toBeVisible()
})
