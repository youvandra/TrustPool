# NEXT

Handoff for whoever picks this up next. Read this file, then `docs/product.md`,
then `docs/design.md`. Update the "State" section whenever something lands.

**Deadline: 13 Oct 2026, 23:59 ET** (Monad Metropolis). Everything below is
ordered so that a submittable product exists as early as possible.

## State (10 Oct 2026, night)

Contracts, backend and the transaction layer landed on 10 Oct night. What is left
needs a person: a funded deploy key, a Privy app, a Discord answer, the video.

| Part | Status |
| --- | --- |
| `contracts/` | Hardened: every rule of a call (lock, notice, adapter, release grace, max hold) is fixed at open; settlement measures the MON that arrived; `markStale`; caller-only `moveToCurrentAdapter`; two-step admin; validated params; pause for new calls only. `UniswapV2Adapter` with quotes. 47 tests incl. fuzz, a V2 mock-router suite and an opt-in fork test. |
| Deploy | `script/Deploy.s.sol` (V2 router, existing adapter or mock DEX; writes `deployments/<chainId>.json`), `script/SeedLocal.s.sol` for anvil. `npm run sync:contracts` puts typed ABIs and addresses into `@trustpool/core`. **Not yet deployed to testnet** (no key in this environment). |
| `packages/core` | Types (now with `stale`, marked value, closing alerts), demo set, generated ABIs and deployments, chain list (Monad testnet 10143, Monad 143, anvil). |
| `apps/api` | `DATA=demo` or `DATA=chain`. Chain mode: viem indexer into PostgreSQL via Drizzle (PGlite locally; atomic ranges with the cursor, adaptive range, confirmations, one deployment per database, advisory lock so one of many instances indexes), price sampler (quotes through each call's adapter), alerts to followers and watchers, Privy access tokens verified locally, early-buyer scan. Route shapes unchanged; new `/me/*` writes and `/calls/:id/early-buyers`. 27 tests (run on PGlite and, in CI, a Postgres server) incl. an e2e check of every record against `recordOf` on anvil. |
| `apps/web` | `lib/chain.ts` + `lib/tx.ts`: real transactions for Buy and lock (bond first if short, `minOut` from a quote at 1% slippage), announce, sell and settle, release, bond add/request/withdraw. Falls back to demo actions without Privy or a deployment. Follows, watches and read alerts write through to the API. Call page: DEX link, marked value, early buyers. |
| CI | `.github/workflows/ci.yml`: forge fmt/build/test, ABI drift check, typecheck, API tests, anvil deploy + seed + indexer e2e, web build. |

## Run

```bash
git submodule update --init
npm install
npm run dev            # web, http://localhost:5280 (demo)
npm run dev:api        # API, http://localhost:8787 (DATA=demo by default)
npm test               # forge + bun tests
npm run typecheck
npm run build
```

Local chain end to end: see README "Full stack on a local chain".

## Findings from the day-one checks (task 1)

From docs.monad.xyz and third-party nad.fun skill docs, 10 Oct. Re-check before mainnet.

- Monad testnet: chain id 10143, RPC `https://testnet-rpc.monad.xyz`, WMON
  `0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701`, Uniswap V2 router
  `0xfB8e1C3b833f9E67a71C859a132cf783b645e436`, explorer `testnet.monadexplorer.com`.
- Monad mainnet: chain id 143, WMON `0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A`.
- nad.fun has its own routers (bonding curve before graduation, DEX after) and a Lens
  that names the live router and quotes, **not** the V2 interface. Official ABIs and
  mainnet addresses: github.com/Naddotfun/contract-v3-abi (in `NADFUN` in core).
  `NadFunAdapter` is built on them. Testnet addresses are not published there
  (third-party docs report testnet DEX router `0x5D4a4f430cA3B1b2dB86B9cFE48a5316800F5fb2`
  and Lens `0xB056d79CA5257589692699a46623F901a3BB76f1`; unverified).

## What is left, in order

1. [ ] Ask in the Monad Discord: testnet or mainnet for the submission? (default testnet)
2. [ ] Find a testnet token with a real WMON pair on the V2 router; run the fork test:
       `FORK_RPC_URL=$MONAD_TESTNET_RPC V2_ROUTER=0xfB8e… FORK_TOKEN=0x… forge test --match-path 'test/fork/*'`.
       No pool → deploy with the mock DEX and **say so in the write-up**.
3. [ ] Deploy to testnet (README "Monad testnet"), `npm run sync:contracts`, commit
       `contracts/deployments/10143.json` and the regenerated core files. Admin: a Safe
       if one exists on Monad, otherwise one key, and say so. The new admin must call
       `acceptAdmin()`.
4. [ ] Privy: create the app, add the chain, set `VITE_PRIVY_APP_ID` (web) and
       `PRIVY_APP_ID` + `PRIVY_VERIFICATION_KEY` (API).
5. [ ] Create a Postgres database (Neon, Supabase or Railway), host the API from
       `apps/api/Dockerfile` with `DATA=chain` and `DATABASE_URL`, web with `VITE_DATA=api`.
6. [x] `NadFunAdapter` from the official ABIs. [ ] Run its fork test on mainnet
       (`NADFUN_FORK_RPC_URL=$MONAD_RPC FORK_TOKEN=0x… forge test --match-path 'test/fork/NadFun*'`)
       and on testnet once its addresses are confirmed. Unverified on a real chain: that
       both routers pay native MON on sell (the contract reverts safely if not).
7. [x] Caller handles: no ENS-style names on Monad yet, so a caller signs a handle and
       bio with their wallet (`PUT /callers/:address/profile`, Portfolio "Edit name and
       bio"). Without one, a short address stands in.
8. [ ] Submission (keep a full half day): `docs/writeup.md` is drafted; record the demo
       video (open a call, show it locked, announce, the notice countdown, execute, the
       record with a loss on it), public project profile, verify the cited links.

## Rules for working in this repo

- Repo content is English. Chat with the owner in Indonesian.
- Commits: short imperative subject, one commit per real change, no co-author or
  "generated with" lines. No AI-tooling files committed (`CLAUDE.md`, `.claude/`
  are gitignored).
- Product language rules in `docs/design.md` "Voice" apply to code comments and
  commit messages too.
- Animation never gates visibility. Content must be readable at frame one; only
  transform moves on entrance (`Reveal`, `usePageVisible`). No `opacity: 0`
  starts and no `AnimatePresence mode="wait"` around content. Browsers pause
  animation frames in hidden tabs.
- Light theme only (owner's preference). Follow `docs/design.md` for tokens,
  components and the route map before adding a screen.
- Browsing never needs an account; ask for sign-in only at the action that needs it.
- A loss is shown exactly like a gain. If a change makes losses smaller, greyer
  or harder to find, it is a bug.
- Demo data must stay internally consistent: caller records in
  `packages/core/src/demo.ts` are derived from the call list, so never hand-write a record.
