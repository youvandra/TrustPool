# @trustpool/api

Bun + Hono. Serves the web app's data in two modes with the same route shapes:

- `DATA=demo` (default): the fixed demo set from `@trustpool/core`.
- `DATA=chain`: follows a TrustPool deployment into SQLite (`bun:sqlite`) and serves from there.

```bash
cp .env.example .env
bun run dev                      # watch mode on :8787
bun test                         # unit and HTTP tests
E2E_RPC_URL=http://127.0.0.1:8545 bun test indexer.e2e   # against anvil, see below
```

## Layout

```
src/
  index.ts            wiring: config -> database -> indexer + price sampler -> HTTP
  config.ts           every env var, parsed and checked once
  db/                 SQLite open, pragmas, append-only migrations (PRAGMA user_version)
  indexer/
    indexer.ts        block-range loop: getLogs -> one transaction per range with the cursor
    writer.ts         event -> rows; mirrors the contract's record arithmetic exactly
    prices.ts         quotes each open call through its adapter: sparkline + marked value
    units.ts          wei/seconds -> MON/ms. The only place units change.
  store/              ReadStore + UserStore, implemented by demo.ts and sqlite.ts
  http/               routes, input checks, Privy token verification
```

## Indexer guarantees

- **Atomic ranges.** Events of a block range and the new cursor commit together. A crash
  replays at most one range; alert inserts are idempotent, so a replay changes nothing.
- **Reorgs.** It stays `CONFIRMATIONS` blocks behind the head (0 on anvil).
- **RPC limits.** Ranges start at `MAX_BLOCK_RANGE` and halve when the node rejects one.
- **One deployment per file.** The database remembers its chain and contract and refuses another.
- **Record = contract.** The e2e test compares every caller's record with `recordOf` on chain.

## Routes

Public: `GET /api/health`, `/calls?state=&caller=&limit=&offset=`, `/calls/:id`, `/callers`,
`/callers/:address`, `/tokens`.

Per user (`Authorization: Bearer <Privy access token>`): `GET /me/alerts`,
`POST /me/alerts/read {ids}`, `GET /me/following`, `PUT|DELETE /me/following/:address`,
`GET /me/watching`, `PUT|DELETE /me/watching/:id`.

Alerts are written by the indexer to every follower of the caller and every watcher of the
call: `call_opened`, `exit_announced`, `exit_executable` (by chain time), `call_settled`,
`call_released`, `call_stale`.

## Local chain end to end

```bash
anvil
cd contracts
forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast --private-key <anvil key 0>
forge script script/SeedLocal.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
cd .. && npm run sync:contracts
DATA=chain CHAIN_ID=31337 npm run dev:api
```
