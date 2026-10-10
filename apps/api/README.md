# @trustpool/api

Bun + Hono. Serves the web app's data in two modes with the same route shapes:

- `DATA=demo` (default): the fixed demo set from `@trustpool/core`.
- `DATA=chain`: follows a TrustPool deployment into **PostgreSQL** (Drizzle ORM) and serves from there.

Database by `DATABASE_URL`: `postgres://…` in production; `pglite://<dir>` (embedded
Postgres in a folder) or empty (in memory) for local work and tests. Same SQL, same
migrations, no server to install.

```bash
cp .env.example .env
bun run dev                      # watch mode on :8787
bun test                         # unit and HTTP tests (embedded Postgres)
TEST_DATABASE_URL=postgres://… bun test   # the same tests on a Postgres server
npm run db:generate              # after changing src/db/schema.ts: writes a migration to drizzle/
npm run db:studio                # browse the database
E2E_RPC_URL=http://127.0.0.1:8545 bun test indexer.e2e   # against anvil, see below
```

## Layout

```
src/
  index.ts            wiring: config -> database -> indexer + price sampler -> HTTP
  config.ts           every env var, parsed and checked once
  db/schema.ts        Drizzle schema: every table, with what is rebuildable and what is not
  db/client.ts        Postgres or PGlite, migrations on start, the indexer advisory lock
drizzle/              generated SQL migrations; never edit one that has shipped
  indexer/
    indexer.ts        block-range loop: getLogs -> one transaction per range with the cursor
    writer.ts         event -> rows; mirrors the contract's record arithmetic exactly
    prices.ts         quotes each open call through its adapter: sparkline + marked value
    units.ts          wei/seconds -> MON/ms. The only place units change.
  store/              ReadStore + UserStore, implemented by demo.ts and postgres.ts
  http/               routes, input checks, Privy token verification
```

## Indexer guarantees

- **Atomic ranges.** Events of a block range and the new cursor commit together. A crash
  replays at most one range; alert inserts are idempotent, so a replay changes nothing.
- **Reorgs.** It stays `CONFIRMATIONS` blocks behind the head (0 on anvil).
- **RPC limits.** Ranges start at `MAX_BLOCK_RANGE` and halve when the node rejects one.
- **One deployment per database.** It remembers its chain and contract and refuses another.
- **Many instances, one indexer.** A Postgres advisory lock picks the instance that indexes
  and samples prices; the others serve reads and take over if it dies.
- **What a backup must keep.** Chain tables can be rebuilt by indexing again. `follows`,
  `watches`, `alerts` and `profiles` cannot.
- **Record = contract.** The e2e test compares every caller's record with `recordOf` on chain.

## Limits

Token bucket per client IP and per instance: reads (GET) 120 burst / 20 per second,
writes 20 burst / 2 per second, answering 429 with `Retry-After`. Set `TRUST_PROXY=1`
behind a proxy you control so the client IP comes from `X-Forwarded-For`.

## Routes

Full reference: `GET /api/openapi.json` (OpenAPI 3.1), rendered at `/api/docs`. A test
fails when a route is served without being documented, or documented without being served.

Public: `GET /api/health`, `/calls?state=&caller=&limit=&offset=`, `/calls/:id`, `/callers`,
`/callers/:address`, `/tokens`.

Per user (`Authorization: Bearer <Privy access token>`): `GET /me/alerts`,
`POST /me/alerts/read {ids}`, `GET /me/following`, `PUT|DELETE /me/following/:address`,
`GET /me/watching`, `PUT|DELETE /me/watching/:id`.

Live: `GET /me/stream` is a server-sent event stream (`ready`, then `alert` per new alert,
`ping` every 25 s). Read it with fetch so the access token travels in a header. The
indexer announces each alert with `pg_notify` inside its transaction, and every instance
`LISTEN`s, so a browser on any instance hears an alert the moment its block range commits,
and never hears one from a range that rolled back.

Alerts are written by the indexer to every follower of the caller and every watcher of the
call: `call_opened`, `exit_announced`, `exit_executable` (by chain time), `call_settled`,
`call_released`, `call_stale`.

Share: `GET /og/calls/<id>.png` and `/og/callers/<address>.png` are 1200x630 cards drawn
with resvg (`src/share/cards.ts`). `GET /share/calls/:id` and `/share/callers/:address` are
small pages with Open Graph tags that forward people to the app; the Share buttons copy them.

Telegram: with `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` set, the indexing instance also
posts every call event except `exit_executable` to that chat, one line and a link each, at
most 20 a minute (`src/live/telegram.ts`).

## Local chain end to end

```bash
anvil
cd contracts
forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast --private-key <anvil key 0>
forge script script/SeedLocal.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
cd .. && npm run sync:contracts
DATA=chain CHAIN_ID=31337 DATABASE_URL=pglite://data/dev npm run dev:api
```

## Deploy

```bash
docker build -f apps/api/Dockerfile -t trustpool-api .
docker run -p 8787:8787 -e DATA=chain -e CHAIN_ID=10143 -e DATABASE_URL=postgres://… \
  -e PRIVY_APP_ID=… -e PRIVY_VERIFICATION_KEY=… -e CORS_ORIGINS=https://your.site trustpool-api
```

Migrations run on start. Point several instances at one database if needed.
