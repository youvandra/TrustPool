# Product

trustpool runs pooled calls and keeps every caller's record.

A **caller** opens a call on one token, fixes every rule up front and puts their own MON
in first. For a short window anyone (**participants**) can deposit MON into that call's pool
and take it back 1:1. When the window closes the caller runs one buy for the whole pool, so
everyone, caller included, gets the same entry. When a rule fixed at open is met (take-profit,
stop-loss or max hold), anyone (a **keeper**) triggers one sale for the whole pool. Everyone
gets the same exit and claims pro rata. The caller earns a share of profit only, loses the
same percentage as everyone else, and the net result goes on their permanent record, which
sets how much they may raise next time.

> One buy. One sale. The same price for everyone.

## The problem

The pattern is documented and repeats: the person giving a signal buys early, then sells
into the people who followed it. Telegram and Discord call groups distribute signals well.
What they lack is consequence: callers put in no money, buy before their followers, sell
into them, drop losing calls from their history, and lose nothing when followers lose.

Examples worth citing in the write-up (verify links before submission):

- MELANIA: insiders reportedly front-ran the launch for about $100M (Yahoo Finance).
- ZREAL: one wallet turned $285 into $627,000 in a day with sniper-style entries (CoinDesk, 19 Jan 2026).
- ZachXBT's documentation of influencer pump-and-dump patterns (DEXTools, 2026).

A pooled call removes the head start instead of trying to police it: there is one buy and
one sale, the caller is inside the pool on the same terms, and nobody can leave alone.

## Why pooled, and what the first pooled design got wrong

The first design, early October, pooled followers' money too. It was dropped for locked
calls (the caller alone buys and locks, followers buy on their own), then the owner chose to
return to pooling on 11 October following the PM's capability document. The objections that
sank the first attempt, and how this version answers them:

| Objection to the first pooled design | This version |
| --- | --- |
| A cap of 3% of liquidity moves a constant-product price about 12%, so a 2% slippage check always fails at the cap | The cap is measured, not assumed: the largest pool whose buy has at most 2% price impact, checked at every deposit and again at the buy |
| A public pool buy invites front-running | The buy is one transaction by the caller with a least-tokens guard; the impact check applies on top. Early buyers before the pool's buy are listed on every call |
| Pools on Monad are small | Still true, and shown: see below. The cap exists to keep impact small, and it is honest about how small that makes a pool |
| The contract holds other people's money | Still true. Every path out is fixed in code (claim, refund, split); the admin has none. See the legal note |

Measured on Monad on 7 Oct 2026 (DexScreener, 37 non-major tokens):

| Metric | Value |
| --- | --- |
| Median deepest-pair liquidity | $26k |
| Tokens with at least $100k | 4 (one is a stablecoin) |
| Deepest pair quoted in MON | 30 of 37 |
| DEX of deepest pair | nad.fun 21, Uniswap 8, PancakeSwap 6 |

At 2% price impact a pool on the median token holds a few hundred dollars. That is the size
the product should run at on Monad today, and the cap enforces it.

## Actors

| Actor | Can | Cannot |
| --- | --- | --- |
| Caller | Open a call with all rules, deposit into their own pool, run the buy, claim their part and fee, withdraw the bond after cooldown with nothing active | Change any rule after open, take their stake out early, sell alone, raise above the cap, set a profit share above their tier |
| Participant | Deposit and withdraw while the window is open, claim after the end, act as keeper | Exit alone after the buy, get a different price |
| Keeper (anyone, caller included) | Record a price checkpoint, sell when a rule allows, refund and split after their deadlines | Choose the sale's minimum output, sell before a rule is met, change rules |
| Admin | Keep the token allow list, slash bonds with a public reason, set parameters for later calls, pause new calls, hand over admin in two steps | Touch MON or tokens held for any call, change a call's rules or adapter |

The bond (one per caller, across calls) and the caller's stake (one per call, in at the same
price as everyone) are separate everywhere: contract, API and UI.

## Lifecycle of one call

```
Open ──deposit/withdraw──▶ (window ends) ──caller buy──▶ Holding ──keeper sell──▶ Settled ──claims
  │                                    │                    │
  │                                    └─deadline passed, no buy──▶ Refunded (caller negligent)
  └─window ends below minimum──▶ Refunded (no fault)        └─no sale by max hold + grace──▶ Split
```

1. **Bond.** `postBond()`. Withdrawal needs no open or holding calls and a cooldown; opening a
   call cancels a pending withdrawal.
2. **Open.** `openCall(token, window, takeProfitBps, stopLossBps, maxHold, shareBps, thesis)`
   with the caller's stake attached. Every rule, the adapter, all timing parameters and the cap
   (bond × tier multiple) are copied into the call. Nothing about a call changes after this.
3. **Window.** `deposit(id)` and `withdraw(id, amount)`. A deposit reverts if it takes the pool
   over the cap, makes the buy's price impact exceed the limit, or puts the caller under their
   least stake (5%). The caller cannot withdraw.
4. **Buy.** `buy(id, minTokens)`, caller only, after the window and before the buy deadline. It
   checks the token is still allowed, the pool is at its minimum, under the cap, the caller's
   stake, and the impact, then swaps the whole pool and records the tokens that arrived.
5. **Checkpoints.** `checkpoint(id)`, anyone, at most once per gap: stores what selling the whole
   position would return now.
6. **Sale.** `sell(id)`, anyone, when the last two checkpoints (a gap apart, the latest at most a
   gap old) both meet take-profit or both meet stop-loss, or at max hold when the two agree
   within the sale tolerance. The minimum the sale must return is the lower checkpoint less the
   tolerance, computed by the contract. The keeper earns 0.1% of gross.
7. **Claims.** `claim(id)`, once per participant: MON after a sale (plus the fee for the caller)
   or a refund, tokens after a split. The last claimer takes the remainder.
8. **Refund.** `refund(id)`, anyone: at window end if the pool is below its minimum (no fault),
   or after the buy deadline (the caller is recorded negligent, unless the token was delisted).
9. **Split.** `split(id)`, anyone, once max hold plus the split grace has passed with no sale.

## Settlement

```
net     = gross − keeper reward
profit  = max(net − totalIn, 0)
fee     = profit × shareBps
payout  = net − fee            shared pro rata by deposit, caller included
caller  = their pro-rata part + fee
```

Worked example (a contract test): 1,000 in (caller 100, A 300, B 400, C 200), 10% share,
1,300 gross. Caller 156.75, A 380.65, B 507.53, C 253.77; every participant +26.88%; record
+26.88%. At 700 gross: no fee, everyone −30.07%, record −30.07%.

## Record and tiers

Per caller, on chain (`recordOf`): `settled`, `losses`, `negligent`, `refunded`, `split`,
`slashes`, `active`, `lastActive`, `sumNetBps`. What is recorded is the **net return to
participants** (`payout / totalIn − 1`), never the gross pool return. Average = `sumNetBps /
settled`.

| Tier | Requirement | Cap | Max profit share |
| --- | --- | --- | --- |
| 0 | < 3 settled, a non-positive average, or ever slashed | 2× bond | 5% |
| 1 | ≥ 3 settled, average net > 0 | 5× bond | 10% |
| 2 | ≥ 10 settled, average net > 0 | 10× bond | 15% |
| 3 | ≥ 25 settled, average net > 0 | 20× bond | 20% |

Holding calls also show an **unrealised** value: what selling the whole position would return
now (`quoteSell`), sampled by the API every few minutes and labelled as a quote, never a result.

## Slashing

The admin (one key in this version, stated openly) can slash a bond with a reason emitted on
chain. The typical case: evidence that a wallet funded by the caller bought the token just
before the pool did. Each call lists the wallets that received the token in the blocks before
the pool's buy, and marks any that received MON straight from the caller shortly before. A
slash drops the caller to tier 0 for good.

## Parameters

| Param | Production default | Demo (testnet) |
| --- | --- | --- |
| `minBond` | 10 MON | 0.5 MON |
| `minPool` | 50 MON | 0.05 MON |
| window | 30 min to 6 h | 2 to 10 min |
| buy deadline | window + 2 h | window + 10 min |
| max hold | 1 h to 72 h | 5 to 30 min |
| `checkpointGap` | 15 min | 3 min |
| `splitGrace` | 6 h | 10 min |
| `bondCooldown` | 7 d | 10 min |
| stop-loss | 1% to 90% | 1% to 90% |
| `minCallerBps` | 500 | 500 |
| `maxImpactBps` | 200 | 200 |
| `sellToleranceBps` | 200 | 200 |
| `keeperBps` | 10 | 10 |

With the production defaults a tier-0 caller needs a bond of at least 25 MON for a cap that
covers the 50 MON minimum; the new call form posts that much. Lower `minPool` to at most twice
`minBond` before a production deploy.

## Contract decisions

- `buy(id, minTokens)`: the caller may add a least-tokens guard against a price moved just
  before the buy. The impact check still applies. The sale's minimum stays contract-computed.
- A joiner's deposit reverts if it would put the caller under `minCallerBps`. The caller cannot
  top up after the window, so otherwise one late deposit could make the buy impossible and get
  the caller recorded negligent.
- The caller cannot withdraw during the window ("cannot leave before others").
- The bond cap (bond × tier multiple) is fixed at open, like every other rule. A later slash
  does not shrink an open pool. Each call gets its own cap from the same bond.
- `sell` also needs the latest checkpoint to be at most one gap old for take-profit and
  stop-loss, not only for max hold, so old checkpoints cannot trigger a sale.
- Refund after the buy deadline marks the caller negligent unless the token was delisted.
- A fee-on-transfer token losing more than the 2% sale tolerance cannot be sold against the
  checkpoint quote; such a call ends in a split. Keep such tokens off the allow list.
- Window and max hold are bounded by params (production: window 30 min to 6 h, hold 1 h to 72 h;
  demo: window 2 to 10 min, hold 5 to 30 min). Stop-loss between 1% and 90%. Take-profit 0
  (none) up to 100x. A `thesis` (280 bytes) stays, as on locked calls.
- Views for the UI: `capOf(id)` (live cap, same impact measure as the contract),
  `impactBps(adapter, token, mon)`, `tierOf`, `tierLimits`, `participantsOf(id)`, `depositOf`.

## Departures from the capability document

| Capability document | This build | Why |
|---|---|---|
| TP/SL from a 30-minute average price | Two spot checkpoints ≥ `minCheckpointGap` apart, contract-computed minimum output | Uniswap v4 has no built-in oracle; the capability document's own fallback says use spot and say so. Two spaced checkpoints make a one-block push insufficient. |
| Pool cap 3% of liquidity, buy slippage 2% | Cap by measured price impact ≤ 2% | A pool of 3% of liquidity moves a constant-product price about 12% (see "Why pooled" above), so the 2% check always fails at the cap. |
| Pool currency WMON | Native MON | No WMON on the testnet after the 16 Dec 2025 regenesis; MON is also the deepest quote asset on Monad. |
| Slashing by multisig | Single admin key, stated openly | A multisig is not set up yet; stated in the README. |

## Known limits

| Risk | What the design does | What remains |
| --- | --- | --- |
| Caller buys from a second wallet before the pool | Their own stake rides the pool's price, the bond is at stake, early buyers are listed per call, slash on evidence | Not closed. Exchange transfers break the trail. The claim is "costly and visible", never "prevented". |
| A pushed price triggers or floors a sale | Two checkpoints a gap apart must both meet the rule, or agree at max hold; the contract sets the sale minimum | A price held down across a whole gap still counts. Uniswap v4 has no built-in average price; spot it is, and we say so. |
| The price falls fast at max hold | The sale waits for two checkpoints that agree | Joiners hold longer in a crash; the split after the grace period is the backstop. |
| The caller never buys | Anyone refunds after the deadline; the record counts it as negligent | A market move can make the impact check fail at the buy; the caller is then still marked negligent. |
| A token that cannot be sold | Split after max hold plus grace, no fee | Participants hold the token. |
| Fee-on-transfer tokens | Balances measured on every swap | A fee above the 2% tolerance makes the sale fail and the call split. Keep such tokens off the allow list. |
| The admin key | No path to pooled funds or rules; slashes carry reasons | One key, also the treasury. |
| One bond, many calls | Each call gets the cap from the bond at open | A caller can run several pools at once on one bond. |

The one answer to memorise, for "what stops a caller using another wallet?":

> Nothing stops it completely, and any platform that claims otherwise is overselling. We put
> the caller's own money in the pool on the same terms as everyone's, give them no way to sell
> before the others, and keep every result visible.

## Non-goals

- Driving token prices. The phrase "move the market" and its equivalents never appear
  anywhere: code, comments, commits, UI, submission. The cap exists to keep impact small.
- Leverage, perps, liquidation. Spot only.
- Advice. No recommendations, price targets, projections or "potential returns".
- Tracking trades outside trustpool.
- A platform token.

## Hackathon

Built for Monad **Metropolis** 2026, track **Trust, Identity & AI Infrastructure** (reputation
systems). The record and the tiers are what make this a reputation product.

## Legal note

This is no legal advice. Pooling other people's money into one trade, with a manager paid a
share of profit, is the shape regulators look at for collective investment schemes, whatever
the code says. Mechanics do not decide legal classification; behaviour and intent do. Never
claim the design is "legal" or "compliant". In Indonesia crypto supervision moved from
Bappebti to OJK (transition ended 20 Jan 2026) and crypto is now a financial asset. Talk to a
lawyer before taking this past the hackathon or onto mainnet.

## Security review

**10 Oct (locked calls).** Slither (102 detectors) plus a manual pass over the contract, the
adapters, the API and the web transaction layer. Fixed then and kept since: every
state-changing entry point is `nonReentrant`, indexed admin events, explicit ES256 on access
tokens, demo auth refused in production, request body limits, caps on follows and watches,
profiles limited to bonded callers, and a build that refuses a dev wallet key outside anvil.

**11 Oct (pooled calls).** Slither rerun on the rewrite. Fixed: an unused constant. Fixed
during the build: a max-hold sale could take its floor from one fresh checkpoint, so one
transaction could dump the price, checkpoint and sell at its own floor; max hold now needs two
checkpoints a gap apart that agree within the tolerance (tested with that exact attack).
Accepted as designed: timestamps drive windows and holds; adapter return values are ignored
because the contract measures balances; MON goes only to the claimer, the withdrawer, the
keeper or the treasury; reentrancy-shaped findings around the swaps are covered by the global
lock, which a test proves shut on every entry point during a swap; the exponent and
divide-before-multiply findings sit in the vendored Uniswap `FullMath`. Invariant tests check
that the contract's MON and tokens always equal what it owes. This is not an audit; get one
before real money.
