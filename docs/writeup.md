# trustpool: write-up (draft)

> The caller buys first, and cannot leave without telling you.

Draft for the Metropolis submission. Fill in the links marked TODO and check every
citation before sending. Track: Trust, Identity & AI Infrastructure (reputation).

## Honest limits first

| What people will ask | The answer |
| --- | --- |
| Can a caller buy from a second wallet first? | Yes. Nothing stops it completely. The bond, the caller's own locked money and the early-buyer list make it costly and visible; the admin can slash with a public reason. |
| Can a caller sit on a losing call forever? | They can keep it open, but it shows a marked-to-market value, and after its max hold anyone can mark it stale on the record for good. The loss is not realised without a sale. |
| Who controls the contract? | An admin keeps the token list, sets parameters for later calls and slashes bonds. It has no path to a locked position: each call's DEX adapter, release grace and max hold are fixed when the call opens. |
| Do followers get the caller's price? | No. They buy after the caller, at market. The caller's entry is public, so the gap is shown. |
| TODO testnet or mainnet, real DEX or mock DEX | Say exactly which, and why. |

## Problem

Call groups distribute signals well and carry no consequence: the caller puts in no
money, can sell into followers, and can drop losing calls from their history.
(Examples: see docs/product.md "The problem"; verify links.)

## Mechanism

1. **Bond.** A caller posts a bond that stays behind every call and can be slashed.
2. **Buy and lock.** The call starts with the caller's own MON buying the token through
   the contract. Token, lock, notice and thesis are fixed in that transaction.
3. **Announce.** Selling needs a public announcement and a notice period, never before
   the lock ends. Followers who watch the call or follow the caller are alerted.
4. **Settle.** The sale goes through the same contract, which measures what actually
   arrived. That fill is the result on the record, losses included.
5. **No hiding.** An unsellable token can be taken unsold, counted as −100%. A call left
   open too long is marked stale, permanently.

## What is built

- `TrustPool.sol` with a swappable DEX adapter (Uniswap V2 adapter plus mocks), 47
  Foundry tests including fuzzing.
- An indexer and API (Bun, viem, PostgreSQL) that follows every event, mirrors the on-chain
  record exactly (checked against the contract in CI), samples quotes for open calls,
  writes alerts, and lists wallets that bought just before a call.
- A web app (React, Privy) where callers open, announce, settle and manage their bond
  with real transactions, and followers read records, follow and watch.

## Roadmap

- Forced sale after max hold against a TWAP floor (needs an oracle).
- A nad.fun adapter; caller handles; a multisig admin, then slashing by a review panel.

## Links

- Code: TODO
- Demo video: TODO
- Deployed contract: TODO (explorer link)
