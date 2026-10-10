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
   comes from the real fill. A token that cannot be sold can be released to the
   caller unsold, and the record counts that as −100%.

## Known limits

- Nothing stops a caller from also buying with a second wallet. The design makes
  that costly (bond, own money locked) and visible; it does not prevent it.
- The token allow list and bond slashing are kept by an admin in this version.
  The admin has no path to any locked position.
- A caller can leave a losing call open instead of closing it. See `NEXT.md`.
- Followers enter after the caller, at market. The caller's entry is public so
  the gap is visible. trustpool shows records, never recommendations.

## Repository

```
contracts/      Foundry: TrustPool.sol, swap adapter interface, mocks, tests
packages/core/  Shared types and the demo data set
apps/api/       Bun + Hono read API
apps/web/       Vite + React + Tailwind: landing at /, app at /app, Privy sign-in
docs/           product.md (spec), design.md (design system and route map)
NEXT.md         current state and the ordered task list
```

## Run

```bash
git submodule update --init
npm install
npm run dev                  # http://localhost:5280, demo data and demo sign-in
npm run dev:api              # optional Bun API on :8787 (with VITE_DATA=api)
cd contracts && forge test
```

Set `VITE_PRIVY_APP_ID` in `apps/web/.env` (see `.env.example`) to sign in with
Privy: email, Google or a wallet. Without it the app offers a demo sign-in.

## License

MIT
