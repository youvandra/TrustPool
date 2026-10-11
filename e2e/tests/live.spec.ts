import { expect, test } from '@playwright/test'
import { encodeFunctionData, parseAbi, parseEther } from 'viem'
import { rpc } from '../lib'

// From the seed (contracts/script/SeedLocal.s.sol): anvil account 2 is a bonded caller.
const MARISA = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'
const POOL = '0x0165878A594ca255338adfa4d48449f69242Eb8F'
const CHOG = '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0'
const abi = parseAbi(['function openCall(address token, uint32 window, uint32 takeProfitBps, uint16 stopLossBps, uint32 maxHold, uint16 shareBps, string thesis) payable returns (uint256)'])

/** A follower hears about a new pool the moment the indexer sees it, without reloading. */
test('following a caller brings their next pool live', async ({ page }) => {
  await page.goto(`/app/callers/${MARISA}`)
  await page.getByRole('button', { name: 'Follow' }).first().click()
  await expect(page.getByRole('button', { name: 'Following' }).first()).toBeVisible()

  // anvil accounts are unlocked: send the caller's transaction straight to the node.
  await rpc('eth_sendTransaction', [
    {
      from: MARISA,
      to: POOL,
      value: `0x${parseEther('2').toString(16)}`,
      data: encodeFunctionData({ abi, functionName: 'openCall', args: [CHOG, 3600, 0, 2000, 86_400, 0, 'Live from the follower test.'] }),
    },
  ])

  await expect(page.getByText(/A caller you follow opened a pool/)).toBeVisible()
})
