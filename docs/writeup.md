# trustpool: write-up

> One buy. One sale. The same price for everyone.

Submission for Monad Metropolis 2026. Track: Trust, Identity & AI Infrastructure
(reputation).

## Honest limits first

| What people will ask | The answer |
| --- | --- |
| Can a caller buy from a second wallet before the pool? | Yes. Nothing stops it completely. Their own stake rides the pool's price, the bond is at stake, each call lists the wallets that received the token just before the pool's buy (marking any the caller funded), and the admin can slash with a public reason. |
| Can a caller sell before everyone else? | No. There is one sale for the whole pool. Anyone may send it, the caller included, but only when a rule fixed at open is met, and the contract sets the least it must return. |
| How do take-profit and stop-loss work without an oracle? | Uniswap v4 has no built-in average price, so the contract records spot quotes. A sale needs two records at least one gap apart that both meet the rule (at max hold, two that agree), so one pushed block cannot trigger a sale or set its floor. A price held down across a whole gap still counts. |
| What if the caller never buys, or the token cannot be sold? | Anyone refunds the pool 1:1 after the buy deadline, and the record counts it as negligent. A position nobody could sell is split after max hold plus a grace period: everyone claims their tokens, no fee. |
| How big can a pool get? | The lower of the caller's bond times their tier (2x to 20x) and the most one buy can take with at most 2% price impact. On Monad's median token that is a few hundred dollars. The cap exists to keep impact small. |
| Who controls the contract? | One admin key, also the treasury: the deployer's. It keeps the token list, sets parameters for later calls and slashes bonds. It has no path to MON or tokens held for a call, and cannot change a call's rules. |
| Testnet or mainnet? Real DEX? | Monad testnet. Swaps are real Uniswap v4 swaps against the live PoolManager, but on two demo tokens (tCHOG, tMOE) and pools we created and seeded, because no (MON, token) v4 pool on testnet had liquidity. |
| Is pooling other people's money legal? | We do not claim it is. Pooling with a profit-sharing manager is the shape regulators look at; this is a hackathon build, not a product cleared for real money. |

## Problem

Call groups distribute signals well and carry no consequence: the caller puts in no money,
can buy before their followers and sell into them, and can drop losing calls from their
history. Examples: [`docs/product.md`](product.md#the-problem).

## Mechanism

1. **Bond and record.** A caller posts a bond that can be slashed. Their record sets their
   tier, and the tier sets how large their next pool may be and their largest profit share.
2. **Open.** The caller puts their own MON in first and fixes every rule: window,
   take-profit, stop-loss, max hold, share of profit. Nothing changes after this, for anyone.
3. **Window.** Anyone joins, or takes their MON back 1:1, until the window closes. The caller
   always holds at least 5% of the pool and cannot leave.
4. **One buy.** The caller buys for the whole pool in one transaction: one entry for all.
5. **One sale.** When two spaced price records meet a rule, or at max hold, anyone sells the
   whole position at one price. The seller earns 0.1%.
6. **Claims and record.** Everyone claims pro rata. The caller adds a share of profit only,
   never of a loss. The net result to participants goes on the record, losses included.

## What is built

- `TrustPool.sol`, pooled calls with a per-call DEX adapter: `UniswapV4Adapter` (live on
  testnet), plus Uniswap V2 and nad.fun adapters. 47 Foundry unit and fuzz tests, including
  the PM's two worked examples to the cent and every case of the PM's table, 5 invariants
  that the contract's MON and tokens always equal what it owes, and opt-in fork tests against
  the live testnet PoolManager. Slither rerun on the rewrite.
- A Bun API that indexes every event into Postgres, mirrors the on-chain record, pools and
  deposits (checked against the contract on anvil in CI), samples quotes and live caps, runs a
  keeper that records prices and sells, refunds and splits when the contract allows (simulating
  each transaction first), lists wallets that bought just before each pool, pushes alerts live
  over SSE and to Telegram, and serves an OpenAPI 3.1 document. 62 API tests, run on PGlite and
  on Postgres 16, and two end-to-end tests on anvil.
- A React app (Privy sign-in) where callers open pools and buy, participants join, take back
  and claim, and anyone can press "Record price" and "Sell now" when the rules allow.
- Playwright tests that drive a whole pooled call, and a live alert, through the browser on a
  local chain.

## Why Monad

- Cheap, fast blocks make it practical to record prices every few minutes, run windows of
  minutes rather than days, and let anyone pay the gas to sell for everyone.
- Foundry needs `--network monad` to fork or broadcast with Monad's EVM rules.
- The testnet regenesis on 16 Dec 2025 removed the old WMON, Uniswap V2 and nad.fun
  deployments; we checked on chain and built on Uniswap v4, which is live. The pool currency
  is native MON.

## Built during the event

The repository was created on 10 October 2026; `git log --reverse` is the whole entry. It
started as locked calls (the caller alone buys and locks, followers buy on their own) and
moved to pooled calls on 11 October, following the PM's capability document. The reasons and
every departure from that document are in [`docs/product.md`](product.md#departures-from-the-capability-document).

## Roadmap

- A time-weighted price once a Monad DEX offers one, in place of spaced spot records.
- Slashing by a council or on-chain evidence instead of one admin key.
- Reputation decay from `lastActive`.
- nad.fun adapter on mainnet (written, fork test pending).

## Links

- App: <https://trustpool.web.id>
- Docs: <https://trustpool.web.id/docs>
- Code: <https://github.com/youvandra/TrustPool>
- TrustPool contract: [`0xF21E849d861a70742cC975a8E1E4934f583ADa0E`](https://testnet.monadscan.com/address/0xF21E849d861a70742cC975a8E1E4934f583ADa0E)
- Demo video: TODO
