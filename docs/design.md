# Design

One word: **calm**. The product sells accountability, and accountability looks
unconvincing in a loud wrapper. The test for every screen: if it shows a call
that lost 30%, does it still feel honest and quiet? A design that only works
when the numbers are green is wrong.

## Direction (rebuilt 10 Oct 2026)

Light theme only. A product, not a page: a marketing site at `/` and the app at
`/app`. References studied: Privy and Family (light marketing with a live product
shot, bento tiles), Bloom and Linear-style dashboards (white sidebar with grouped
nav, breadcrumb plus search top bar, sections with "See all", dense rows),
Polymarket (card grid with category chips). Kinsign contributes the motion
rules and the rolling arrow button.

### Information architecture

| Route | Who | What |
| --- | --- | --- |
| `/` | Everyone | Landing: hero with a real slice of the app, results ticker, 4-step bento, followers vs callers, comparison with call groups, honest FAQ, CTA |
| `/app` | Everyone | Home: pulse tiles, "Exiting soon" (the key list), new calls, following/suggested callers, explainer |
| `/app/calls` | Everyone | Explore: state tabs, token chips, search, sort, grid/list toggle. Newest first, no ranking |
| `/app/calls/:id` | Everyone | Call: status block (exit countdown / lock / result), price since entry, rules (fixed), position, thesis, timeline, caller card, watch + buy-on-your-own |
| `/app/callers` | Everyone | Directory, ordered by last activity |
| `/app/callers/:address` | Everyone | Profile: record stats, every call, slash history |
| `/app/portfolio` | Signed in | Caller console: bond, open calls with Announce exit / Sell and settle, history |
| `/app/alerts` | Signed in | Exit announcements and new calls from followed callers and watched calls |
| `/app/new` | Signed in | 4-step wizard: token, size (bond check), rules, review; live preview card |

Browsing never needs an account. Signing in is asked for at the moment it is
needed (follow, watch, portfolio, opening a call), through `useSession().login()`.

### Shell

Desktop: fixed 248px white sidebar (Discover / You groups, "Have a call?" card,
account chip), sticky translucent top bar (breadcrumb, search, alerts bell).
Phones: top bar plus a bottom tab bar with a central "Open a call" button.

## Tokens

Defined in `apps/web/tailwind.config.js`.

| Token | Hex | Use |
| --- | --- | --- |
| `bg` | #F3F6F7 | App and page ground |
| `surface` | #FFFFFF | Cards, sidebar |
| `subtle` | #F7F9FA | Insets, table heads |
| `line` / `line-strong` | #E4EAED / #D3DDE2 | Borders |
| `ink` / `ink-2` / `ink-3` | #12212A / #3F525D / #7A8B95 | Text levels, primary buttons |
| `accent` | #2E6E8E | Identity and the one live state: an announced exit |
| `accent-fill` / `accent-soft` | #E3EFF5 / #F0F6F9 | Pastel fields |
| `gain` / `gain-fill` | #0B7A57 / #E3F4EC | Positive results only |
| `loss` / `loss-fill` | #C0352E / #FBEAE8 | Negative results only |

Type: Geist for everything, Geist Mono for numbers (`.num`). Cards are 16px
radius with `shadow-card`; popovers and modals use `shadow-pop`. Buttons: ink
primary, white secondary with a ring, ghost.

### Components (`apps/web/src/components/ui`)

`Button`, `ButtonLink`, `ArrowLink` (marketing CTA), `Card`, `SectionHead`,
`SeeAll`, `StateTag`, `Signed`, `Tabs` (sliding indicator), `Row`, `Stat`,
`Skeleton`, `Empty`, `Modal`, `toast`/`Toaster`, `Sparkline`, `CallerAvatar`
(deterministic from the address), `TokenIcon`, `Mark`/`Wordmark`. App-level:
`CallCard`, `CallRow`, `Countdown`, `Timeline`, `FollowButton`, `WatchButton`
in `features/app/components`.

### Motion

Springs for entrances, layout animation for tab indicators, ticking countdowns,
a marquee for results. **Only transform animates on entrance.** Never make
content start at opacity 0 or wait on an exit animation (`AnimatePresence
mode="wait"`): browsers pause animation frames in background tabs, and the
content would never appear. This bit the wizard once already.

## Numbers

- Every price and percentage uses `.num`.
- Every result is signed, even when coloured.
- Never mix percentages and token amounts in one column.
- Addresses are cut in the middle (`shortAddress`).
- MON is rounded down, never up (`mon`).
- Always give a comparison: "−12.40%, from the actual fill".

## Interface rules (product rules, not taste)

1. A losing call looks exactly like a winning one apart from sign and colour.
2. No celebration: no confetti, badges, streaks or leaderboards. The feed is
   newest-first and says "No ranking".
3. Locked rules look locked: the rules panel carries a lock and "Fixed at open".
4. Limits are shown: bond, slashes and record line sit on the card and the call page.
5. No recommendations, targets or projections, anywhere.

## Voice

Like someone who knows the subject and is selling nothing. Short sentences, plain
words, no exclamation marks.

| Write | Avoid |
| --- | --- |
| The caller cannot sell before the lock ends | Guaranteed safe |
| This call lost 30% | This call underperformed |
| 12 calls settled, 5 at a loss | 58% win rate |
| Buy on your own | Ape in |

Never write: "move the market", "guaranteed", "risk-free", "safe" as a promise
of outcome, or "impossible" for something that is only made expensive.

## Logo

Concept A, "Vessel": a pool in section with one flat surface line, meaning one
price line. `Mark` in `components/ui/Logo.tsx`; static files in
`apps/web/public/brand/`. Minimum 16px. Name always lowercase: `trustpool`. Never
a circle crossed by a band (reads as another "-pool" brand).

The name "TrustPool" is also used by a mining pool (trustpool.cc) and a BNB
staking dapp. Fine for the hackathon; decide before going further.
