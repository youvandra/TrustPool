# trustpool

**The caller buys first, and announces every exit before it happens.** trustpool is a
record of crypto callers who back each call with their own money. A call opens with the
caller buying the token through the trustpool contract. The position stays locked, every
sale is announced publicly hours ahead, and every result, losses included, stays on the
caller's record. Followers buy on their own; the contract only holds the caller's position.

[![Solidity](https://img.shields.io/badge/Solidity-0.8.28-363636)](contracts)
[![Foundry](https://img.shields.io/badge/Foundry-55%20tests%20%2B%20invariants-2f855a)](#testing)
[![Monad testnet](https://img.shields.io/badge/Monad%20testnet-10143-6E54FF)](https://testnet.monadscan.com/address/0x98eee74eBcCe4d109B8eA7D653A594435503f0Ab)
[![Uniswap v4](https://img.shields.io/badge/Uniswap-v4-FF007A)](contracts/src/adapters/UniswapV4Adapter.sol)
[![Bun](https://img.shields.io/badge/Bun-Hono%20API-000000)](apps/api)
[![React](https://img.shields.io/badge/React-18-149ECA)](apps/web)
[![Licence](https://img.shields.io/badge/licence-MIT-blue)](LICENSE)

| | |
|---|---|
| **Live app** | <https://trustpool.web.id> |
| **Docs** | <https://trustpool.web.id/docs> |
| **API reference** | <https://trustpool.web.id/api/docs> |
| **TrustPool contract** | [`0x98ee…f0Ab`](https://testnet.monadscan.com/address/0x98eee74eBcCe4d109B8eA7D653A594435503f0Ab) on Monad testnet |

Built for **Monad Metropolis 2026**. The repository was created on 10 October 2026 and
its whole history is the entry: `git log --reverse`.

---

## Contents

[Overview](#overview) · [How a call works](#how-a-call-works) · [One call, end to end](#one-call-end-to-end) ·
[Architecture](#architecture) · [The rules, and where each one lives](#the-rules-and-where-each-one-lives) ·
[What is deployed](#what-is-deployed) · [Quick start](#quick-start) · [Known limits](#known-limits) ·
[Security review](#security-review) · [Tech stack](#tech-stack) · [Repository structure](#repository-structure) ·
[Testing](#testing) · [Running it](#running-it) · [Roadmap](#roadmap) · [Licence](#licence)

---

## Overview

Call groups move tokens. A caller posts "buying X", followers pile in, and the caller is
free to sell into that buying, delete the call when it goes wrong, and start again
tomorrow with a clean history. Followers carry all of the risk and see none of the
caller's own trades.

trustpool turns a call into a commitment the caller pays for:

- **Own money first.** The caller's MON buys the token before anyone sees the call.
- **Locked.** The position sits in the contract for a lock the caller chose up front.
- **Announced exits.** Selling starts with a public announcement and a notice period,
  so followers hear about the exit before it can execute.
- **A permanent record.** The result comes from the real fill, measured by the contract.
  Taking a token unsold counts as −100%, and a call held open too long is marked stale.

---

## How a call works

1. **Bond.** The caller posts a bond in MON. It backs every call and the admin can slash
   it with a public reason.
2. **Buy and lock.** `openCall` buys the token through the swap adapter and locks it.
   Token, lock, notice and thesis are fixed in that transaction.
3. **Announce.** `announceExit` starts the notice period; the sale opens once both the
   notice and the lock have passed. Followers and watchers get an alert at once.
4. **Settle.** After the notice, `executeExit` sells through the same adapter. The MON
   that arrives is the result on the record.
5. **Fallbacks.** A token that cannot be sold can be taken with `releaseTokens`, recorded
   as −100%. Anyone can call `markStale` on a call open past its max hold.

---

## One call, end to end

| When | What happens | Where |
|---|---|---|
| Once | Caller signs in (email or wallet) and posts a bond | Privy, `TrustPool.postBond` |
| T+0 | Caller's MON buys the token, position locked | `TrustPool.openCall` → `UniswapV4Adapter.buy` |
| T+0 | Call appears in the app with entry price, lock and bond | indexer `CallOpened` → Postgres → `/calls` |
| During lock | Price sampled every few minutes from a sell quote | `indexer/prices.ts` → `adapter.quoteSell` |
| Any time | Caller announces the exit; sale opens after notice and lock | `TrustPool.announceExit` |
| Same block | Followers and watchers get a live alert | `ExitAnnounced` → Postgres `NOTIFY` → SSE `/api/me/stream` |
| After notice | Caller sells; contract measures MON received | `TrustPool.executeExit` → `CallSettled` |
| Forever | Result on the caller's record, gain or loss | `TrustPool.recordOf`, caller page |

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
   │ price sampler   early buyers  │      │        └ Uniswap v4 PoolManager│
   └────────────┬──────────────────┘      └────────────────────────────────┘
                ▼
        Postgres (Supabase; PGlite locally)
```

- **Contract** holds positions and bonds, enforces every timing rule and writes the record.
- **Adapter** is the only code that touches a DEX. Each call keeps the adapter it opened
  with, so a later admin change cannot redirect a locked position.
- **API** indexes events into Postgres, samples prices, fans out alerts and serves the
  app. One instance indexes at a time (advisory lock); any number can serve.
- **Web** reads from the API and sends transactions straight to the chain.

---

## The rules, and where each one lives

| Rule | Enforced by |
|---|---|
| The caller buys before the call exists | `openCall` swaps and records in one transaction |
| No sale before the lock ends | `announceExit` sets `exitAt` no earlier than `unlockAt` |
| No sale without notice | `executeExit` reverts before `exitAt` |
| Result is the real fill | `executeExit` measures the contract's MON balance change |
| Unsold exit counts as −100% | `releaseTokens`, after a release grace |
| Old open calls stay visible | `markStale`, callable by anyone after max hold |
| Admin cannot touch a position | adapter, grace and max hold copied into each call at open |
| Bond cannot be pulled mid-call | `requestBondWithdraw` then a cooldown |

Current values are read live on [the docs page](https://trustpool.web.id/docs#rules).
Full spec and decisions: [`docs/product.md`](docs/product.md).

---

## What is deployed

Monad testnet (chain 10143), deployed 11 October 2026 with
[`DeployV4.s.sol`](contracts/script/DeployV4.s.sol).

| Contract | Address |
|---|---|
| TrustPool | [`0x98eee74eBcCe4d109B8eA7D653A594435503f0Ab`](https://testnet.monadscan.com/address/0x98eee74eBcCe4d109B8eA7D653A594435503f0Ab) |
| UniswapV4Adapter | [`0xA50d9454E71aCf152399C872815ae6895cB53229`](https://testnet.monadscan.com/address/0xA50d9454E71aCf152399C872815ae6895cB53229) |
| tCHOG (demo token) | [`0x12d15135b5bBa8EEF0d1098Aa65A15AF503d09c9`](https://testnet.monadscan.com/address/0x12d15135b5bBa8EEF0d1098Aa65A15AF503d09c9) |
| tMOE (demo token) | [`0x2A8361Ac23F5FfcFDe9f0D7BC7618178770332d0`](https://testnet.monadscan.com/address/0x2A8361Ac23F5FfcFDe9f0D7BC7618178770332d0) |

Swaps are real Uniswap v4 swaps against the live PoolManager. The testnet had no
liquid (MON, token) pool, so the deploy script creates two fixed-supply demo tokens
and seeds a pool for each with 1 MON. Keep demo calls around 0.05–0.1 MON.

Demo parameters: 0.5 MON bond, 10 minute minimum lock, 5 minute minimum notice.

---

## Quick start

```bash
git submodule update --init
npm install
npm run dev
```

Open <http://localhost:5280>. The app runs on demo data with a demo sign-in, so every
screen works without a wallet or an API.

---

## Known limits

- **Second wallets.** A caller can also buy from another wallet. The bond, the locked
  own money and the early-buyers list on each call make that costly and visible.
- **Admin.** One admin key keeps the token list, sets parameters for later calls and
  slashes bonds. It has no path to a locked position.
- **Losing calls left open.** They show a marked-to-market value and turn stale after max
  hold; the loss is realised only on a sale or release.
- **Follower entry.** Followers buy after the caller, at market. The caller's entry price
  is public so the gap is visible.
- **Demo liquidity.** Testnet pools are ours and shallow, so large calls move the price.

---

## Security review

Slither (102 detectors) and a manual review on 10 October 2026. Every external entry point
is `nonReentrant`, admin is two-step, parameters are validated, and pausing affects new
calls only. The API verifies Privy access tokens locally and rate-limits writes. Details
and accepted findings: [`docs/product.md`](docs/product.md#security-review-10-oct). This is a
self-review, with no external audit.

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
  src/TrustPool.sol           the locked-call contract
  src/adapters/               UniswapV4Adapter, UniswapV2Adapter, NadFunAdapter
  src/v4/                     demo token and pool seeder for testnet
  script/                     Deploy, DeployV4, SeedLocal
  test/                       unit, fuzz, invariant, fork
packages/core/                shared types, demo data, generated ABIs and addresses
apps/api/                     Bun API: http/, indexer/, store/, db/, live/
apps/web/                     landing, docs and app
e2e/                          Playwright test of a whole call on anvil
scripts/                      local stack, ABI sync
docs/                         product.md, design.md, writeup.md
```

---

## Testing

```bash
npm test             # forge (55 tests + invariants) and API (42 tests)
npm run test:e2e     # browser drives a whole call on a local chain
npm run typecheck
```

API tests run on PGlite locally and on Postgres 16 in CI. The v4 adapter fork test runs
against the live testnet PoolManager:

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
node scripts/local-stack.mjs warp 3d     # move past a lock or notice
```

**API.** `npm run dev:api` starts it on :8787 in demo mode. Set `DATA=chain`,
`DATABASE_URL` and `PRIVY_APP_ID` for chain mode; see [`apps/api/.env.example`](apps/api/.env.example).
On Supabase use the session pooler (port 5432): advisory locks and `LISTEN` need it.

**Web.** Set `VITE_PRIVY_APP_ID` and `VITE_DATA=api` in `apps/web/.env`; see
[`apps/web/.env.example`](apps/web/.env.example).

**Deploy to Monad testnet.** Costs about 2.4 MON, of which 2 MON stays in the pools.

```bash
cast wallet import trustpool-deployer --interactive
cd contracts
forge script script/DeployV4.s.sol --network monad --rpc-url https://testnet-rpc.monad.xyz --broadcast --account trustpool-deployer
cd .. && npm run sync:contracts
```

`--network monad` is required for Foundry to apply Monad's EVM rules.

---

## Roadmap

- Price oracle, so a stale losing call can be closed at market.
- Slashing by a council or on-chain evidence instead of one admin.
- nad.fun adapter on mainnet (written, fork test pending).
- Caller handles from a Monad name service once one exists.

---

## Licence

MIT. See [LICENSE](LICENSE).
