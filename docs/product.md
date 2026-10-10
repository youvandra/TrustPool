# Product

trustpool is a record of callers who put their own money in first.

A **caller** opens a call by buying a token through the trustpool contract. The
position is locked on chain for a fixed time. To sell, the caller announces the
exit publicly and waits a notice period before the sale can execute. The sale
goes through the same contract, so the result on the caller's record comes from
the real fill. Followers read the record and buy on their own, whenever they
choose. Nothing is pooled.

> The caller buys first, and cannot leave without telling you.

## The problem

The pattern is documented and repeats: the person giving a signal buys early,
then sells into the people who followed it. Telegram and Discord call groups
already distribute signals well. What they lack is consequence: callers put in
no money, have no exit discipline, can drop losing calls from their history, and
lose nothing when followers lose.

Examples worth citing in the write-up (verify links before submission):

- MELANIA: insiders reportedly front-ran the launch for about $100M (Yahoo Finance).
- ZREAL: one wallet turned $285 into $627,000 in a day with sniper-style entries (CoinDesk, 19 Jan 2026).
- ZachXBT's documentation of influencer pump-and-dump patterns (DEXTools, 2026).

## Why this shape (the pivot from pooling)

The first design pooled followers' money and bought and sold for everyone at
once. Measured on Monad on 7 Oct 2026 (DexScreener, 37 non-major tokens):

| Metric | Value |
| --- | --- |
| Median deepest-pair liquidity | $26k |
| Tokens with at least $100k | 4 (one is a stablecoin) |
| Deepest pair quoted in MON | 30 of 37 |
| DEX of deepest pair | nad.fun 21, Uniswap 8, PancakeSwap 6 |

A pool capped to keep slippage near 2% could raise about **$530 per call** on
the median token. The pooled design also had a built-in contradiction (a 3%
liquidity cap moves a constant-product price about 12%, so a 2% slippage check
always fails at the cap), exposed a public pool buy to front-running, and
carried most of the collective-investment-scheme concern.

The locked-call shape keeps the accountability and drops all of that:

- No liquidity cap: the caller sizes their own position.
- No public pool buy to front-run: the caller's buy lands before the call exists.
- No custody of followers' money.

What it gives up: followers enter after the caller and at market. The product
shows that gap openly instead of hiding it.

## Actors

| Actor | Can | Cannot |
| --- | --- | --- |
| Caller | Post a bond, open a call, announce an exit, execute it after notice, release tokens if the sale keeps failing, move their own call to the current adapter | Change any rule after open, sell before the lock ends, sell without notice, remove a call from their record, withdraw the bond while a call is open |
| Follower | Read every call and record, buy on their own | (nothing to restrict; the contract never holds follower funds) |
| Anyone | Mark a call stale once it has sat open past its max hold | Close, sell or move anyone's call |
| Admin | Keep the token allow list, slash bonds with a written reason, set params for later calls, pause new calls, hand over admin in two steps | Touch any locked position: the adapter, grace and max hold of a call are fixed when it opens |

## Lifecycle of one call

```
postBond ──> openCall ──(lock)──> announceExit ──(notice)──> executeExit ──> Settled
                │                                       └──(grace, sale failing)──> releaseTokens ──> Released (-100%)
                └──(unlock + maxHold, or exitAt + maxHold, still open)──> markStale (anyone; flag stays on the record)
```

1. **Bond.** `postBond()` before the first call. Withdrawal needs no open calls
   and a cooldown (7 days default). Opening a call cancels a pending withdrawal.
2. **Open.** `openCall(token, lockSeconds, notice, minOut, thesis)` with MON
   attached. The contract buys through the swap adapter and records the tokens
   that actually arrived (fee-on-transfer safe). Token, lock, notice and thesis
   are fixed in this transaction, and so are the rules for leaving: the adapter the call
   sells through, the release grace and the max hold. Admin changes reach later calls only.
3. **Announce.** `announceExit(id)`. The exit can execute at
   `max(unlockAt, now + notice)`. A caller can announce early so the exit lands
   right at unlock, but the notice always applies in full.
4. **Settle.** `executeExit(id, minOut)` sells everything through the call's adapter.
   The contract measures the MON that actually arrived (it never trusts the adapter's
   report), checks `minOut` against it, and pays the caller. Return in basis points is
   computed from MON in and that measured MON out.
5. **Release.** If selling keeps failing (liquidity gone), after `exitAt +
   releaseGrace` the caller can `releaseTokens(id)` and take the tokens unsold.
   The record counts this as **-100%**, so the hatch can never hide a loss.
6. **Stale.** A call still open `maxHold` after its unlock (or after its exit time, if
   announced and never executed) can be marked stale by anyone with `markStale(id)`.
   Nothing is sold and no price is needed. The call stays open and can still exit
   normally, but the `stale` count on the record never goes back down.
7. **Moving DEX.** If the DEX a call opened on loses its liquidity, the caller (only the
   caller) can `moveToCurrentAdapter(id)` before selling.

## Record

Per caller, on chain (`recordOf`): `settled`, `losses`, `released`, `open`, `slashes`,
`stale`, `sumReturnBps`, `lastActive`. Average return is `sumReturnBps / (settled +
released)`. The record is written by the contract only; nobody can edit it.

Open calls also show an **unrealised** value: what selling the whole position through
its adapter would return now (`quoteSell`), sampled by the API every few minutes and
labelled as a quote, never as a result.

## Slashing

The admin (a multisig before any real use) can slash a bond with a reason that
is emitted on chain. The typical case: evidence that a wallet funded by the
caller bought the token just before the call. This is a manual, centralised
judgment in this version and is stated openly.

## Parameters

| Param | Default | Note |
| --- | --- | --- |
| `minBond` | 10 MON | |
| `minLock` / `maxLock` | 1 day / 30 days | |
| `minNotice` | 6 hours | |
| `bondCooldown` | 7 days | |
| `releaseGrace` | 6 hours | Copied into each call at open |
| `maxHold` | 30 days | Copied into each call at open |
| thesis length | 280 bytes | |
| slippage (web app) | 1% | Applied to the adapter's quote for `minOut` |

All defaults are placeholders, chosen without research. Change them freely.

## Known limits (say these out loud)

| Risk | What the design does | What remains |
| --- | --- | --- |
| Caller buys from a second wallet | Bond at stake, own money locked, slash on evidence | Not closed. Exchange transfers break the trail. The claim is "costly and visible", never "prevented". |
| Caller never announces an exit on a losing call | Open calls show their age and a marked-to-market value; after `maxHold` anyone can mark the call stale, permanently, on the record | The loss itself is not realised: there is no forced sale without a price oracle (v2). |
| Caller abandons the account | Every call stays on that address | Starting over costs a fresh bond and an empty record. |
| Admin-kept token list | Admin cannot reach positions (adapter, grace and max hold are fixed per call); slashes carry reasons | Centralised in this version. |
| A swap gets sandwiched | `minOut` from a fresh quote with 1% slippage, checked against measured amounts | A public mempool still sees the trade. |
| Followers enter after the caller | Entry is public, so the gap is visible | Followers pay market. trustpool shows records, never recommendations. |

The one answer to memorise, for "what stops a caller using another wallet?":

> Nothing stops it completely, and any platform that claims otherwise is
> overselling. We make the caller put their own money in first, lock it, announce
> every exit, and keep every result visible.

## Non-goals

- Driving token prices. The phrase "move the market" and its equivalents never
  appear anywhere: code, comments, commits, UI, submission.
- Leverage, perps, liquidation. Spot only.
- Advice. No recommendations, price targets, projections or "potential returns".
- Tracking trades outside trustpool.
- A platform token.

## Hackathon

Monad **Metropolis**. Submission deadline **13 Oct 2026, 23:59 ET**. Judging 14 to
27 Oct, results 3 Nov. Required: a working product with a public project
profile, a demo, a short write-up and a link to the code.

Suggested track: **Trust, Identity & AI Infrastructure** (reputation systems).
Alternative: Social, Attention & Culture. Avoid Onchain Finance & Trading.

## Legal note

This is no legal advice. Mechanics do not decide legal classification; behaviour
and intent do. Never claim the design is "legal" or "compliant". In Indonesia
crypto supervision moved from Bappebti to OJK (transition ended 20 Jan 2026) and
crypto is now a financial asset. Talk to a lawyer before taking this past the
hackathon.

## Decision: losing calls that never close (was NEXT.md task 6)

Chosen 10 Oct: **(b) `maxHold` + `markStale`, plus (a) a marked value in the UI.**

- (b) is cheap and honest on chain: no sale, no price, just a permanent count on the
  record that anyone can trigger. The caller cannot pre-empt it by changing a rule,
  because `maxHold` is copied into the call at open.
- (a) puts a number on the open loss in the meantime, clearly labelled unrealised.
- (c), a forced sale with a TWAP floor, needs a price oracle and stays on the v2 list.
