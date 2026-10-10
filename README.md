# trustpool

The caller buys first, and cannot leave without telling you.

trustpool is a record of callers who put their own money in first. A call starts
with the caller buying a token through the trustpool contract. The position is
locked on chain for a fixed time, every exit is announced publicly hours before
it can execute, and every result stays on the caller's record, losses included.
Followers buy on their own. Nothing is pooled.

Built on Monad for Metropolis 2026.

## How it works

1. **Bond.** A caller posts a bond. It stays behind every call and can be slashed.
2. **Buy and lock.** The caller's own MON buys the token through the contract
   before the call is public. Token, lock time, exit notice and thesis are fixed
   in that transaction.
3. **Announce.** To sell, the caller announces the exit on chain. It can execute
   only after the notice period, and never before the lock ends.
4. **Settle.** The sale goes through the same contract, so the recorded result
   comes from the real fill, measured by the contract itself. A token that cannot be
   sold can be released to the caller unsold, and the record counts that as −100%.
5. **No quiet bag-holding.** A call left open past its max hold can be marked stale
   by anyone, and that mark stays on the caller's record.

## Known limits

- Nothing stops a caller from also buying with a second wallet. The design makes
  that costly (bond, own money locked) and visible; it does not prevent it.
- The token allow list and bond slashing are kept by an admin in this version.
  The admin has no path to any locked position: each call's adapter, release grace
  and max hold are fixed when it opens.
- A caller can leave a losing call open. It shows a marked-to-market value, and after
  its max hold it is marked stale on the record, but the loss is not realised.
- Followers enter after the caller, at market. The caller's entry is public so
  the gap is visible. trustpool shows records, never recommendations.

## Repository

```
contracts/
  src/TrustPool.sol             the locked-call contract
  src/adapters/                 NadFunAdapter, UniswapV2Adapter, behind ISwapAdapter
  src/mocks/                    fixed-price DEX, V2 router, tokens: tests and anvil only
  script/Deploy.s.sol           env-driven deploy, writes deployments/<chainId>.json
  script/SeedLocal.s.sol        three demo calls on anvil
  test/                         unit + fuzz tests, V2 adapter tests, opt-in fork test
packages/core/                  shared types, demo set, generated ABIs + deployments, chains
apps/api/                       Bun + Hono: demo mode, or chain mode with a SQLite indexer
apps/web/                       Vite + React + Tailwind: landing at /, app at /app, Privy
scripts/sync-contracts.mjs      Foundry output -> typed ABIs and addresses in core
docs/                           product.md (spec and decisions), design.md, writeup.md
NEXT.md                         current state and what is left
```

## Run

```bash
git submodule update --init
npm install
npm run dev                  # http://localhost:5280, demo data and demo sign-in
npm run dev:api              # optional Bun API on :8787 (with VITE_DATA=api)
npm test                     # contracts (forge) and API (bun) tests
npm run typecheck
```

Set `VITE_PRIVY_APP_ID` in `apps/web/.env` (see `.env.example`) to sign in with
Privy: email, Google or a wallet. Without it the app offers a demo sign-in.

### Full stack on a local chain

```bash
anvil
cd contracts
forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast --private-key <anvil key 0>
forge script script/SeedLocal.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
cd .. && npm run sync:contracts
DATA=chain CHAIN_ID=31337 npm run dev:api
VITE_DATA=api VITE_CHAIN_ID=31337 npm run dev
```

### Monad testnet

```bash
cd contracts
V2_ROUTER=0xfB8e1C3b833f9E67a71C859a132cf783b645e436 TOKENS=0x... ADMIN=0x... \
  forge script script/Deploy.s.sol --rpc-url monad_testnet --broadcast --account <keystore>
cd .. && npm run sync:contracts      # commit the new deployments/10143.json and core files
```

For nad.fun instead of Uniswap V2, set `NADFUN_LENS`, `NADFUN_CURVE_ROUTER` and
`NADFUN_DEX_ROUTER` (mainnet values in `NADFUN` in `packages/core/src/contracts/chains.ts`).
With neither, the script deploys the fixed-price mock DEX; say so in any demo.
API settings are in `apps/api/.env.example`, web settings in `apps/web/.env.example`.

## License

MIT
