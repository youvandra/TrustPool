import { expect, test } from '@playwright/test'
import { api, CALLER, chainNow, warp } from '../lib'

interface Caller {
  record: { settled: number; open: number; losses: number }
  bond: number
}

/** The caller as the API sees it, or undefined until the indexer has caught up. */
const caller = () => api<Caller>(`/callers/${CALLER}`).catch(() => undefined)

/**
 * The story the product exists for, through the real UI and real transactions:
 * a new caller bonds and opens a call, announces the exit, waits out the notice,
 * sells, and the result lands on their public record.
 */
test('a caller opens, announces, settles, and the record shows it', async ({ page }) => {
  // The browser's clock follows the chain's, so countdowns and enabled buttons match it.
  await page.clock.install({ time: await chainNow() })

  await page.goto('/app/new')
  await page.getByRole('button', { name: /CHOG/ }).click()
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByPlaceholder('0').fill('10')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByPlaceholder(/One or two sentences/).fill('CHOG for a day, end to end.')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Buy and lock' }).click()

  // Two transactions: the bond (the caller had none), then the buy and lock.
  await expect(page.getByText('Your call is live')).toBeVisible()
  await expect.poll(async () => (await caller())?.record.open).toBe(1)
  expect((await caller())?.bond).toBe(10)

  await page.getByRole('button', { name: 'See your call' }).click()
  await expect(page.getByText('CHOG for a day, end to end.')).toBeVisible()

  // Announce: the exit can run once the 3-day lock ends.
  await page.goto('/app/portfolio')
  await page.getByRole('button', { name: 'Announce exit' }).click()
  await page.getByRole('button', { name: 'Announce', exact: true }).click()
  await expect(page.getByText(/Exit announced on chain/)).toBeVisible()

  // Past the lock on chain and in the browser, then sell.
  await page.clock.setSystemTime(await warp(3 * 86_400 + 60))
  await page.reload()
  const sell = page.getByRole('button', { name: 'Sell and settle' })
  await expect(sell).toBeEnabled()
  await sell.click()
  await expect(page.getByText(/Sold and settled/)).toBeVisible()

  // The record is public, written from the real fill.
  await expect.poll(async () => (await caller())?.record.settled).toBe(1)
  expect((await caller())?.record.open).toBe(0)
  await page.goto(`/app/callers/${CALLER}`)
  await expect(page.getByRole('link', { name: /CHOG #\d+ .*Settled/ })).toBeVisible()
})
