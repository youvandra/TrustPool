# trustpool

**One buy. One sale. The same price for everyone.** trustpool runs pooled calls. A caller
opens a call on one token, fixes every rule up front, and puts their own MON in first.
For a short window anyone can join the pool or take their MON back. Then the caller runs one
buy for the whole pool, and when a rule is met anyone triggers one sale for the whole pool.
Everyone, the caller included, gets the same entry, the same exit and the same percentage.
The net result goes on the caller's permanent record, and the record sets how much they may
raise next time.

[![Solidity](https://img.shields.io/badge/Solidity-0.8.28-363636)](contracts)
[![Foundry](https://img.shields.io/badge/Foundry-47%20tests%20%2B%205%20invariants-2f855a)](#testing)
[![Monad testnet](https://img.shields.io/badge/Monad%20testnet-10143-6E54FF)](#what-is-deployed)
[![Uniswap v4](https://img.shields.io/badge/Uniswap-v4-FF007A)](contracts/src/adapters/UniswapV4Adapter.sol)
[![Bun](https://img.shields.io/badge/Bun-Hono%20API-000000)](apps/api)
[![React](https://img.shields.io/badge/React-18-149ECA)](apps/web)
[![Licence](https://img.shields.io/badge/licence-MIT-blue)](LICENSE)

| | |
|---|---|
| **Live app** | <https://trustpool.web.id> |
| **Docs** | <https://trustpool.web.id/docs> |
| **API reference** | <https://trustpool.web.id/api/docs> |
| **Build spec** | [`docs/pool-spec.md`](docs/pool-spec.md) |

Built for **Monad Metropolis 2026**. The repository was created on 10 October 2026 and
its whole history is the entry: `git log --reverse`.

---

## Contents

[Overview](#overview) · [How a pooled call works](#how-a-pooled-call-works) · [The arithmetic](#the-arithmetic) ·
[One call, end to end](#one-call-end-to-end) · [Architecture](#architecture) ·
[The rules, and where each one lives](#the-rules-and-where-each-one-lives) · [What is deployed](#what-is-deployed) ·
[Quick start](#quick-start) · [Known limits](#known-limits) · [Security review](#security-review) ·
[Tech stack](#tech-stack) · [Repository structure](#repository-structure) · [Testing](#testing) ·
[Running it](#running-it) · [Roadmap](#roadmap) · [Licence](#licence)

---

## Overview

In a call group the caller posts "buying X", followers pile in, and the caller is free to
have bought earlier and sell into that buying, delete the call when it goes wrong, and start
again tomorrow with a clean history. Followers carry the risk and see none of the caller's
own trades.

A pooled call removes the head start instead of trying to police it:

- **Own money first, same terms.** The caller's stake is in the pool before anyone joins,
  at least 5% of it when it buys, and it cannot be taken out early.
- **One buy, one sale.** The caller can only buy for the whole pool. Nobody, the caller
  included, can sell alone: the sale is for everyone, at one price.
- **Rules fixed at open.** Take-profit, stop-loss, max hold and the caller's share of profit
  are written into the call when it opens. Neither the caller nor the admin can change them.
- **Paid for profit only.** The caller earns a share of profit, never of a loss, and loses
  the same percentage as everyone else.
- **A permanent record.** Every call's net result to participants goes on the record,
  losses included. The record sets the caller's tier, and the tier sets the next cap.

---

## How a pooled call works

1. **Bond.** The caller posts a bond in MON. It stays locked while any of their calls is
   open or holding, and the admin can slash it with a public reason.
2. **Open.** `openCall` takes the caller's first deposit and every rule: window, take-profit,
   stop-loss, max hold, profit share (capped by tier). The cap is fixed too: bond times the
   tier multiple.
3. **Window.** `deposit` and `withdraw` (1:1) while the window is open. A deposit is refused
   if it would take the pool over its cap, push one buy's price impact over 2%, or put the
   caller under 5% of the pool.
4. **Buy.** After the window, the caller's `buy` swaps the whole pool in one transaction. The
   contract checks the token, the minimum pool, the cap, the caller's stake and the impact
   again, then records the tokens that actually arrived.
5. **Price records.** Anyone can `checkpoint`: the contract stores what selling the whole
   position would return now. At most one per gap (3 minutes in the demo).
6. **Sale.** Anyone can `sell` when the last two records, a gap apart, both meet take-profit or
   both meet stop-loss, or at max hold when the two agree within 2%. The contract computes the
   least the sale must return from those records; nobody passes it in. The seller earns 0.1%.
7. **Claim.** Each participant `claim`s their part once. The last claimer takes the remainder,
   so nothing is stranded.
8. **Safety nets.** A pool below its minimum, or never bought by the deadline, is `refund`ed
   1:1 by anyone (the second case marks the caller negligent). A position nobody could sell by
   max hold plus a grace period is `split`: everyone claims tokens pro rata.

The keeper in the API sends checkpoints, sales, refunds and splits when the contract allows
them. Every one of those is also a plain button in the app, for anyone.

---

## The arithmetic

The PM's worked example, as a test (`test_workedExample_profit`): 1,000 MON in (caller 100,
A 300, B 400, C 200), 10% share of profit, sold for 1,300.

```
net     = gross − keeper reward = 1,300 − 1.30   = 1,298.70
profit  = max(net − totalIn, 0) =                    298.70
fee     = profit × 10%          =                     29.87
payout  = net − fee             =                  1,268.83   shared pro rata, caller included
caller  = 126.88 + 29.87        =                    156.75
A 380.65 · B 507.53 · C 253.77 · every participant +26.88% · record +26.88%
```

Sold for 700 instead: no profit, no fee, everyone −30.07%, and the record says −30.07%.

---

## One call, end to end

| When | What happens | Where |
|---|---|---|
| Once | Caller signs in (email or wallet) and posts a bond | Privy, `TrustPool.postBond` |
| T+0 | Pool opens with the caller's stake; rules fixed | `TrustPool.openCall` → `CallOpened` |
| Window | Anyone joins or takes their MON back; live cap from the contract | `deposit`, `withdraw`, `capOf` |
| Window end | Caller buys for the whole pool | `TrustPool.buy` → `UniswapV4Adapter.buy` |
| Holding | Price sampled every few minutes; keeper records prices | `indexer/prices.ts`, `keeper/keeper.ts` → `checkpoint` |
| Rule met | Anyone sells the whole position | `TrustPool.sell` → `Sold` |
| After | Participants claim; the result is on the record | `claim`, `recordOf`, caller page |
| Every step | Followers and watchers get a live alert, and a Telegram post | Postgres `NOTIFY` → SSE `/api/me/stream` |

---

## Architecture

```
            ┌──────────────── apps/web (Vite + React) ───────────────┐
            │  landing /   docs /docs   app /app   Privy sign-in     │
            └───────┬───────────────────────────────┬────────────────┘
        reads + SSE │                               │ transactions (viem)
                    ▼                               ▼
   ┌──── apps/api (Bun + Hono) ────┐      ┌──── Monad testnet ─────────────┐
   │ REST + OpenAPI   SSE alerts   │      │ TrustPool                      │
   │ indexer ── viem getLogs ──────┼─────▶│   └ UniswapV4Adapter           │
   │ price sampler   keeper        │      │        └ Uniswap v4 PoolManager│
   └────────────┬──────────────────┘      └────────────────────────────────┘
                ▼
        Postgres (Supabase; PGlite locally)
```

- **Contract** holds pooled MON, tokens and bonds, enforces every rule and writes the record.
- **Adapter** is the only code that touches a DEX. Each call keeps the adapter it opened
  with, so a later admin change cannot redirect a pool.
- **API** indexes events into Postgres, samples prices and live caps, runs the keeper, fans
  out alerts (in the app and to a Telegram channel) and serves the app. One instance indexes
  and keeps at a time (advisory lock); any number can serve.
- **Web** reads from the API and sends transactions straight to the chain.

---

## The rules, and where each one lives

| Rule | Enforced by |
|---|---|
| Nothing about a call changes after open | every rule, the adapter and all timings copied into the call; tested against every admin setter |
| The caller is in first and stays in | `openCall` requires a deposit; `withdraw` refuses the caller |
| The caller keeps at least 5% | `deposit` and `buy` both check it |
| Pools stay small enough for the market | cap = bond × tier; `deposit` and `buy` check impact ≤ 2% against a tiny probe |
| One buy for everyone | `buy` is the only path into the token, for the whole pool |
| No early sale, no sale on one pushed block | `sell` needs two records a gap apart that both meet a rule, or agree at max hold |
| No caller-chosen sale price | `sell` computes its minimum from the records |
| Result is what arrived | `buy` and `sell` measure balances; adapter return values are ignored |
| Fee on profit only | `sell`: `fee = max(net − totalIn, 0) × share` |
| Nobody's money is stranded | `refund`, `split`, and the last claim taking the remainder |
| Admin cannot touch a pool | no admin function reads or moves MON or tokens held for a call |

Current values are read live on [the docs page](https://trustpool.web.id/docs#rules).
Spec and decisions: [`docs/pool-spec.md`](docs/pool-spec.md), [`docs/product.md`](docs/product.md).

---

## What is deployed

Monad testnet (chain 10143), deployed 11 October 2026 with
[`DeployPool.s.sol`](contracts/script/DeployPool.s.sol). It reuses the adapter and demo tokens below.

| Contract | Address |
|---|---|
| TrustPool (pooled calls) | [`0xF21E849d861a70742cC975a8E1E4934f583ADa0E`](https://testnet.monadscan.com/address/0xF21E849d861a70742cC975a8E1E4934f583ADa0E) |
| UniswapV4Adapter | [`0xA50d9454E71aCf152399C872815ae6895cB53229`](https://testnet.monadscan.com/address/0xA50d9454E71aCf152399C872815ae6895cB53229) |
| tCHOG (demo token) | [`0x12d15135b5bBa8EEF0d1098Aa65A15AF503d09c9`](https://testnet.monadscan.com/address/0x12d15135b5bBa8EEF0d1098Aa65A15AF503d09c9) |
| tMOE (demo token) | [`0x2A8361Ac23F5FfcFDe9f0D7BC7618178770332d0`](https://testnet.monadscan.com/address/0x2A8361Ac23F5FfcFDe9f0D7BC7618178770332d0) |
| Earlier locked-call TrustPool | [`0x98eee74eBcCe4d109B8eA7D653A594435503f0Ab`](https://testnet.monadscan.com/address/0x98eee74eBcCe4d109B8eA7D653A594435503f0Ab), replaced |

Swaps are real Uniswap v4 swaps against the live PoolManager. The testnet had no liquid
(MON, token) pool, so the demo tokens and their pools are ours. The 2% impact limit makes
pool depth the cap: [`DeepenPools.s.sol`](contracts/script/DeepenPools.s.sol) adds
full-range liquidity to the demo pools so a pool can reach about 0.1 MON.

The pools in the live app's history were opened and joined by our own testnet wallets with
[`scripts/seed-demo.ts`](scripts/seed-demo.ts). One wallet trades the demo tokens between a
pool's buy and its sale, so one pool reaches its take-profit and one its stop-loss; the keeper
records prices and sells as it would for anyone.

Demo parameters: 0.5 MON bond, 0.05 MON minimum pool, windows of 2 to 10 minutes, max hold of
5 to 30 minutes, 3 minutes between price records.

---

## Quick start

```bash
git submodule update --init
npm install
npm run dev
```

Open <http://localhost:5280>. The app runs on demo data with a demo sign-in, so every
screen works without a wallet or an API, and joining or claiming in the demo is kept locally.

---

## Known limits

- **Second wallets.** A caller can still buy from another wallet before the pool does. Their
  own stake rides the same price, the bond is at stake, and each call lists the wallets that
  received the token just before the pool's buy, marking any the caller funded.
- **Spot prices.** Uniswap v4 has no built-in average price. Two records a gap apart make a
  one-block push useless, but a price held down across a whole gap still counts.
- **Falling fast at max hold.** If the price falls more than 2% per gap, a max-hold sale waits
  for two records that agree; the split after the grace period is the backstop.
- **Fee-on-transfer tokens.** A token taking more than the 2% sale tolerance cannot be sold
  against its quote and ends in a split. Keep such tokens off the allow list.
- **Admin.** One key keeps the token list, sets parameters for later calls and slashes
  bonds. It has no path to MON or tokens held for a call.
- **Small pools.** A pool is capped by what one buy can take within 2% of price impact. On
  Monad's median token that is a few hundred dollars. This is the point: the cap exists to
  keep impact small.

---

## Security review

Slither (102 detectors) and a manual review, run again on the pooled rewrite on 11 October
2026. Every external entry point is
`nonReentrant` (a test proves each door is shut during a swap), admin is two-step, parameters
are validated, pausing affects new calls only, the sale minimum comes from the contract, and
invariant tests check that the contract's MON and tokens always equal what it owes. The API
verifies Privy access tokens locally, rate-limits writes, and the keeper simulates every
transaction before sending it. Details: [`docs/product.md`](docs/product.md#security-review).
This is a self-review, with no external audit.

---

## Tech stack

| Layer | Tools |
|---|---|
| Contracts | Solidity 0.8.28, Foundry, Uniswap v4 (unlock → swap → settle → take) |
| API | Bun, Hono 4, Drizzle ORM, Postgres (Supabase) or PGlite, viem, SSE |
| Web | Vite 5, React 18, Tailwind 3, motion, react-router 7, Privy, viem |
| Testing | forge (unit, fuzz, invariant, fork), bun test, Playwright |
| Hosting | nginx + systemd on a VPS, Let's Encrypt |

---

## Repository structure

```
contracts/
  src/TrustPool.sol           the pooled-call contract
  src/adapters/               UniswapV4Adapter, UniswapV2Adapter, NadFunAdapter
  src/v4/                     demo token and pool seeder for testnet
  script/                     DeployPool, DeployV4, Deploy, SeedLocal
  test/                       unit, fuzz, invariant, fork
packages/core/                shared types, demo data, generated ABIs and addresses
apps/api/                     Bun API: http/, indexer/, keeper/, store/, db/, live/
apps/web/                     landing, docs and app
e2e/                          Playwright: a whole pooled call, and live alerts, on anvil
scripts/                      local stack, ABI sync
docs/                         pool-spec.md, product.md, design.md, writeup.md
```

---

## Testing

```bash
npm test             # forge (47 tests + 5 invariants) and API (62 tests)
npm run test:e2e     # the browser drives a whole pooled call on a local chain
npm run typecheck
```

The contract tests include the PM's two worked examples to the cent, every case of the PM's
table (break-even, caller at 4%, over cap, below minimum, no buy, fee-on-transfer, double
claim, a sale that keeps failing), rule immutability against every admin setter, the sale
guards (one record, records too close, a dump, record and sell in one transaction), and fuzz
tests that every participant gets the same percentage to the wei.

API tests run on PGlite locally and on Postgres 16 in CI. On anvil, `indexer.e2e` checks every
record, pool and deposit against the contract, and `keeper.e2e` lets the keeper drive the
seeded calls to their ends. The v4 adapter fork tests run against the live testnet PoolManager:

```bash
cd contracts
FORK_RPC_URL=https://testnet-rpc.monad.xyz forge test --network monad --match-path 'test/fork/UniswapV4*'
```

---

## Running it

**Full stack on a local chain.** Anvil, contracts, API and web in one command; the app
signs with an anvil key, so every button sends a real transaction.

```bash
npm run dev:local                        # open http://127.0.0.1:5290/app
node scripts/local-stack.mjs warp 1h     # move past a window or a hold
```

**API.** `npm run dev:api` starts it on :8787 in demo mode. Set `DATA=chain`,
`DATABASE_URL` and `PRIVY_APP_ID` for chain mode, and `KEEPER_PRIVATE_KEY` to run the keeper;
see [`apps/api/.env.example`](apps/api/.env.example). On Supabase use the session pooler
(port 5432): advisory locks and `LISTEN` need it.

**Web.** Set `VITE_PRIVY_APP_ID` and `VITE_DATA=api` in `apps/web/.env`; see
[`apps/web/.env.example`](apps/web/.env.example).

**Deploy to Monad testnet.** The command, what it costs and the order to upgrade the API are
at the top of [`docs/pool-spec.md`](docs/pool-spec.md). `--network monad` is required for
Foundry to apply Monad's EVM rules.

---

## Roadmap

- A time-weighted price once a Monad DEX offers one, in place of spaced spot records.
- Slashing by a council or on-chain evidence instead of one admin key.
- Reputation decay from `lastActive`, so an old record counts for less.
- nad.fun adapter on mainnet (written, fork test pending).

---

## Licence

MIT. See [LICENSE](LICENSE).
