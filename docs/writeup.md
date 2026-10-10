# trustpool: write-up

> The caller buys first, and cannot leave without telling you.

Submission for Monad Metropolis 2026. Track: Trust, Identity & AI Infrastructure
(reputation).

## Honest limits first

| What people will ask | The answer |
| --- | --- |
| Can a caller buy from a second wallet first? | Yes. Nothing stops it completely. The bond, the caller's own locked money and the early-buyer list make it costly and visible; the admin can slash with a public reason. |
| Can a caller sit on a losing call forever? | They can keep it open, but it shows a marked-to-market value, and after its max hold anyone can mark it stale on the record for good. The loss is not realised without a sale. |
| Who controls the contract? | One admin key, also the treasury: the deployer's. It keeps the token list, sets parameters for later calls and slashes bonds. It has no path to a locked position: each call's DEX adapter, release grace and max hold are fixed when the call opens. |
| Do followers get the caller's price? | No. They buy after the caller, at market. The caller's entry is public, so the gap is shown. |
| Testnet or mainnet? Real DEX? | Monad testnet. Swaps are real Uniswap v4 swaps against the live PoolManager, but on two demo tokens (tCHOG, tMOE) and pools we created and seeded with 1 MON each, because no (MON, token) v4 pool on testnet had liquidity. |

## Problem

Call groups distribute signals well and carry no consequence: the caller puts in no
money, can sell into followers, and can drop losing calls from their history.
Examples: [`docs/product.md`](product.md#the-problem).

## Mechanism

1. **Bond.** A caller posts a bond that stays behind every call and can be slashed.
2. **Buy and lock.** The call starts with the caller's own MON buying the token through
   the contract. Token, lock, notice and thesis are fixed in that transaction.
3. **Announce.** Selling needs a public announcement and a notice period, never before
   the lock ends. Followers who watch the call or follow the caller are alerted.
4. **Settle.** The sale goes through the same contract, which measures what actually
   arrived. That fill is the result on the record, losses included.
5. **No hiding.** An unsellable token can be taken unsold, counted as −100%. A call left
   open too long is marked stale, permanently.

## What is built

- `TrustPool.sol` with a per-call DEX adapter: `UniswapV4Adapter` (deployed), plus
  Uniswap V2 and nad.fun adapters. 54 Foundry unit and fuzz tests, 4 invariants, and
  opt-in fork tests against the live testnet PoolManager.
- A Bun API that indexes every event into Postgres, mirrors the on-chain record
  (checked against `recordOf` on anvil in CI), samples quotes for open calls, lists
  wallets that bought just before a call, pushes alerts live over SSE, and serves an
  OpenAPI 3.1 document. 42 API tests, run on PGlite and on Postgres 16.
- A React app (Privy sign-in) where callers open, announce, settle and manage their
  bond with real transactions, and followers read records, follow and watch.
- A Playwright test that drives a whole call through the browser on a local chain.

## Why Monad

- Cheap, fast blocks make it practical to settle every call on chain, sample each open
  call's price every few minutes, and run notice periods of minutes rather than days.
- Foundry needs `--network monad` to fork or broadcast with Monad's EVM rules.
- The testnet regenesis on 16 Dec 2025 removed the old WMON, Uniswap V2 and nad.fun
  deployments; we checked on chain and built on Uniswap v4, which is live.

## Built during the event

The repository was created on 10 October 2026; `git log --reverse` is the whole entry.

## Roadmap

- Price oracle, so a stale losing call can be closed at market.
- Slashing by a council or on-chain evidence instead of one admin.
- nad.fun adapter on mainnet (written, fork test pending).

## Links

- App: <https://trustpool.web.id>
- Docs: <https://trustpool.web.id/docs>
- Code: <https://github.com/youvandra/TrustPool>
- TrustPool contract: [`0x98eee74eBcCe4d109B8eA7D653A594435503f0Ab`](https://testnet.monadscan.com/address/0x98eee74eBcCe4d109B8eA7D653A594435503f0Ab) on Monad testnet
- Demo video: TODO
