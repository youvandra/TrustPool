# NEXT

Handoff for whoever picks this up next. Read this file, then `docs/product.md`,
then `docs/design.md`. Update the "State" section whenever something lands.

**Deadline: 13 Oct 2026, 23:59 ET** (Monad Metropolis). Everything below is
ordered so that a submittable product exists as early as possible.

## State (10 Oct 2026, evening)

The front end was rebuilt as a product on 10 Oct (owner's call: "make it feel
like a product, light theme, Privy, a light backend; contracts come after").

| Part | Status |
| --- | --- |
| `contracts/` | MVP contract done, 14 Foundry tests green. Untouched since the morning. |
| `packages/core` | Shared types (mirror the contract) and the demo data set. Records are derived from calls, never hand-written. |
| `apps/api` | Bun + Hono read API over the demo set: `/api/calls`, `/calls/:id`, `/callers`, `/callers/:address`, `/tokens`, `/me/alerts`, `/me/following`, `/health`. No auth, no persistence yet. |
| `apps/web` | Landing at `/`, app at `/app` (Home, Calls, Call, Callers, Caller, Portfolio, Alerts, Open-a-call wizard). Light only. Builds clean, no horizontal scroll at 375px. |
| Auth | `src/auth/session.tsx`: Privy when `VITE_PRIVY_APP_ID` is set (email, Google, wallet; embedded wallet for users without one; Monad testnet), otherwise a demo login as caller `olu`. Pages only use `useSession()`. |
| Data | `src/lib/data.ts`: `VITE_DATA=demo` (default, in-browser) or `api` (Bun API via the Vite proxy). |
| User state | `src/lib/store.ts`: follows, watches, read alerts, demo-announced exits, in localStorage. Moves to the API with accounts. |
| Real DEX adapter, deploy, chain reads, transactions | **Missing.** Tasks 1 to 5. Every button that would send a transaction is wired to a demo action or a toast. |

## Run

```bash
git submodule update --init
npm install
cp apps/web/.env.example apps/web/.env   # optional: VITE_PRIVY_APP_ID, VITE_DATA
npm run dev            # web, http://localhost:5280
npm run dev:api        # Bun API, http://localhost:8787 (needed only with VITE_DATA=api)
npm run typecheck
npm run build
cd contracts && forge test
```

Local chain end to end (once task 4 exists):

```bash
anvil
cd contracts && forge script script/DeployLocal.s.sol --rpc-url http://127.0.0.1:8545 --broadcast --private-key <anvil key 0>
```

## Tasks, in order

### 1. Day-one checks (do first, they can change the design)

- [ ] Testnet or mainnet for the submission? The Metropolis FAQ does not say.
      Ask in the Monad Discord. Default: Monad testnet.
- [ ] Chain ids, public RPC, WMON address, block explorer for Monad testnet (and mainnet).
- [ ] Which DEX to adapt. Measured 7 Oct: the deepest pair of most tokens is on
      **nad.fun's own DEX**; Uniswap and PancakeSwap are also live. Find the router
      address and interface for nad.fun, and whether it exists on testnet.
- [ ] On testnet, can we get a token with a real pool? If not, deploy the mock DEX
      on testnet for the demo and **say so in the write-up**.

### 2. Real swap adapter

- `contracts/src/adapters/<Dex>Adapter.sol` implementing `ISwapAdapter`.
- `buy`: swap the attached MON (wrap to WMON if the router needs it) for `token`, send to `to`.
- `sell`: TrustPool has already transferred `amountIn` to the adapter; approve the
  router, swap to MON, send MON to `to`. Use the fee-on-transfer-safe router
  functions where they exist.
- Fork test against the real router (`forge test --fork-url $MONAD_TESTNET_RPC`).
- Adapter is swappable by the admin (`setAdapter`), so ship mock first if needed.

### 3. Deploy

- `contracts/script/Deploy.s.sol` for testnet: TrustPool with admin, treasury,
  adapter; allow two or three tokens.
- Admin should be a multisig if time allows (Safe on Monad?). Otherwise one key,
  and say so.
- Write the addresses to `apps/web/src/lib/chain.ts` (create it) and to the README.

### 4. Indexer and chain reads (backend)

- In `apps/api`: follow TrustPool events (`CallOpened`, `ExitAnnounced`,
  `CallSettled`, `CallReleased`, `Slashed`, `BondPosted`) with viem into
  `bun:sqlite`, and answer the existing routes from it. Keep the route shapes:
  the web app already consumes them (`VITE_DATA=api`).
- Price series for the sparklines: sample the pair price every few minutes per
  open call. Until then the series is illustrative and the call page says so.
- Alerts: when `ExitAnnounced` lands, write an alert for every watcher and
  follower. Watches and follows move from `lib/store.ts` into the API, keyed by
  the Privy user (verify the Privy access token server side).
- Units: contract is wei and seconds; `@trustpool/core` types are MON and ms.
  Convert in the indexer, nowhere else.

### 5. Transactions from the web app

- Create a Privy app (dashboard.privy.io), set `VITE_PRIVY_APP_ID`. Add Monad
  testnet to the app's allowed chains.
- With the Privy wallet (`useWallets()` to a viem wallet client), wire:
  - `/app/new` "Buy and lock": `postBond` if the bond is short, then `openCall`.
    Compute `minOut` from a quote with a slippage setting; never send 0 on a real DEX.
  - `/app/portfolio` "Announce exit" to `announceExit`; "Sell and settle" to
    `executeExit` after `exitAt`; add "Release tokens" after `exitAt + releaseGrace`.
  - Bond "Add" / "Withdraw" to `postBond`, `requestBondWithdraw`, `withdrawBond`.
- Replace the demo `actions.announce` path and the "Simulate signature" button.
- Call page "Buy on your own": link to the DEX pair for the token (nad.fun or
  Uniswap), opening in a new tab. Today it is a disabled placeholder.

### 6. Design question still open: losing calls that never close

A caller can leave a losing position locked and never announce, so the loss
never reaches `sumReturnBps`. Options, pick one and note it in `docs/product.md`:

- (a) UI only: show open calls with their age and a marked-to-market value from a
  price read. Cheapest. Mark it clearly as unrealised.
- (b) `maxHold`: after `unlockAt + maxHold` anyone can call `expire(id)`, which
  counts the call in a separate `stale` counter on the record (no sale, no price
  needed). Honest and cheap on chain.
- (c) Forced sale after `maxHold` with a TWAP floor. Needs a price oracle; v2.

Recommendation: (b) plus (a).

### 7. Nice to have, in this order

1. Follow a caller and get told when they announce an exit (the product's best
   feature for followers; needs an indexer or polling).
2. Suspicious-wallet check: wallets that bought the token between a caller's
   funding transfer and `openCall`. Input for manual review, never proof.
3. Caller handles (ENS-style names on Monad, if any exist).

### 8. Submission (keep a full half day for this)

- Public repo with README (problem, mechanism, known limits, roadmap).
- Short write-up: same structure. Lead with the honest limits table.
- Demo video: open a call, show it locked, announce, show the notice countdown,
  execute, show the record with a loss on it.
- Public project profile on the submission platform.

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
