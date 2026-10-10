# Design

One word: **calm**. The product sells accountability, and accountability looks
unconvincing in a loud wrapper. The test for every screen: if it shows a call
that lost 30%, does it still feel honest and quiet? A design that only works
when the numbers are green is wrong.

## Where the patterns come from

The interaction patterns are ported from the Kinsign web app (same author, same
stack). The colours, type and density come from the trustpool brand. Where the
two disagree, the brand wins on colour and surface, Kinsign wins on motion and
interaction.

| Kept from Kinsign | Changed for trustpool |
| --- | --- |
| Floating pill header, full-screen sheet menu on phones | Pill gains a line on scroll instead of a shadow |
| Arrow buttons with rolling label and rotating knob | Primary is ink; the accent never fills a button |
| Numbered section badge (circle + outlined label) | Label uses the eyebrow style (11px, caps, 0.14em) |
| Auto-advancing step list beside a live preview | Preview is a call card in each state, no phone frame |
| `Reveal`: transform-only entrance, content visible from frame one | Same, unchanged |
| `usePageVisible`: no animation while the tab is hidden | Same, unchanged |
| Dark footer with link columns | Uses the `deep` token so it stays dark in both modes |
| Rounded-2xl white cards with shadow | Flat panels: 6px radius, 1px `line` border, no shadow |
| Orange accent, pulsing dots | One pulse only, on "Exit announced" |

## Tokens

Defined as RGB triplets in `apps/web/src/index.css`, mapped in
`apps/web/tailwind.config.js`. Every class works in light and dark.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `mist` | #E9F0F3 | #101819 | Page ground |
| `surface` | #F7FAFB | #18242A | Panels, cards |
| `line` | #D3DFE5 | #2A383F | Borders, dividers |
| `accent-fill` | #CBE0EB | #1C3A4A | Pastel field (never text) |
| `accent` | #2E6E8E | #8CC3DE | Identity, the one active state |
| `accent-deep` | #1C4B63 | #CBE0EB | Text on `accent-fill` |
| `ink` | #16252C | #E9F0F3 | Text, primary buttons |
| `ink-quiet` | #4C6270 | #9CB0BA | Secondary text |
| `gain` | #0B6E4F | #3DBF93 | Positive results only |
| `loss` | #B8302A | #FF8A80 | Negative results only |
| `deep` | #16252C | #090E0F | Footer and dark sections |

Rules:

1. Pastels are fields, never ink.
2. The accent is identity plus the single most important state on a screen.
3. Red always means loss and green always means gain; the brand uses neither otherwise.
4. Colour is never the only signal: every result carries `+` or `−` (see `signedPct`).
5. No gradients, glow, glass or celebration.

## Type

IBM Plex Sans for everything, IBM Plex Mono for numbers, addresses and hashes.
Utility classes: `.num` (mono + tabular figures) and `.eyebrow`.

| Role | Size | Weight |
| --- | --- | --- |
| Page title | 30px | 600 |
| Section title (in app) | 19px | 600 |
| Body | 15px | 400 |
| Eyebrow | 11px caps, 0.14em | 500 |
| Table numbers | 13.5px mono | 400 |

Landing headlines use larger clamp sizes at weight 500; app pages stay on the scale.

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
