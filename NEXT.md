# NEXT

Handoff for whoever picks this up next. Read this file, then `docs/product.md`,
then `docs/design.md`. Update the "State" section whenever something lands.

**Deadline: 13 Oct 2026, 23:59 ET** (Monad Metropolis). Everything below is
ordered so that a submittable product exists as early as possible.

## State (10 Oct 2026)

| Part | Status |
| --- | --- |
| `contracts/src/TrustPool.sol` | Done for MVP: bond, open (buy + lock), announce, execute, release, slash, allow list. 14 Foundry tests green. |
| `contracts/src/interfaces/ISwapAdapter.sol` | Interface only. |
| `contracts/src/mocks/*` | Mock DEX (fixed price, can freeze a token) and mock ERC-20 with optional transfer fee. |
| `contracts/script/DeployLocal.s.sol` | Anvil deploy on the mock DEX. |
| Real DEX adapter | **Missing.** Task 2. |
| Testnet deploy | **Missing.** Task 3. |
| `apps/web` | Landing, feed, call page, caller profile, open-call form. Runs on demo data (`lib/data.ts`). Builds clean, light + dark, no horizontal scroll at 375px. |
| Chain reads / wallet | **Missing.** Tasks 4 and 5. |
| Submission material | **Missing.** Task 8. |

## Run

```bash
npm install
npm run dev              # web on http://localhost:5280
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

### 4. Chain data source

- Add `viem` to `apps/web`. Create `chainSource: DataSource` next to
  `demoSource` in `lib/data.ts`, and pick between them with `VITE_DATA=chain|demo`.
- `listCalls`: read `callCount()`, then `getCall(i)` (multicall). Token
  symbol/name via ERC-20 reads, cached.
- `getCaller`: `records(addr)`, `bonds(addr)`, `callsOf(addr)`; slash history
  from `Slashed` events.
- Units: contract uses wei and seconds; `lib/types.ts` uses MON and ms. Convert in
  the source, nowhere else.
- Keep `DemoNote` showing whenever `source.live` is false.

### 5. Wallet and caller actions

- Injected wallet via viem (or wagmi if it saves time). Chain switch to Monad.
- Wire `OpenCallPage`: `postBond` if the bond is short, then `openCall`. Compute
  `minOut` from a quote with a slippage setting; never send 0 on a real DEX.
- A caller console (e.g. `/me`): bond, post/withdraw, own open calls with
  "Announce exit", "Execute exit" (after `exitAt`), "Release tokens" (after grace).
- Every button that sends a transaction says exactly what it locks or spends.

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
  transform moves (`Reveal`, `usePageVisible`). Browsers pause animation frames
  in hidden tabs.
- A loss is shown exactly like a gain. If a change makes losses smaller, greyer
  or harder to find, it is a bug.
- Demo data must stay internally consistent: caller records in `lib/data.ts` are
  derived from the call list, so never hand-write a record.
