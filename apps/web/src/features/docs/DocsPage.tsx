import { ExternalLink, Minus, Plus } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { trustPoolAbi } from '@trustpool/core'
import MarketingFooter from '@/components/marketing/MarketingFooter'
import MarketingNav from '@/components/marketing/MarketingNav'
import { ArrowLink } from '@/components/ui'
import { CHAIN_ID, chain, deployment, publicClient } from '@/lib/chain'
import { duration, shortAddress } from '@/lib/format'
import { useLoad, useTitle } from '@/lib/hooks'

const SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'monad', label: 'Why Monad' },
  { id: 'followers', label: 'For participants' },
  { id: 'callers', label: 'For callers' },
  { id: 'rules', label: 'Rules' },
  { id: 'contracts', label: 'Contracts' },
  { id: 'api', label: 'API' },
  { id: 'limits', label: 'Known limits' },
]

const FAQ: [string, string][] = [
  [
    'Can a caller also buy with a second wallet before the pool?',
    'Nothing stops it completely. It costs them: their own stake is in the pool on the same terms, a bond is at stake, and a wallet they funded that buys just before the pool is grounds for a public slash. Each call lists the wallets that bought just before the pool did, and marks any that received MON straight from the caller shortly before.',
  ],
  [
    'Can a caller sell before everyone else?',
    'No. There is one sale for the whole pool. Anyone may trigger it, the caller included, but only once a rule fixed at open is met, and the contract sets the least it must return.',
  ],
  [
    'How is take-profit or stop-loss decided without a price oracle?',
    'Uniswap v4 has no built-in average price, so the contract records spot quotes. A sale needs two records at least one gap apart that both meet the rule; at max hold, two records that agree. One block of pushed price cannot trigger a sale or set its floor.',
  ],
  [
    'What if the caller never buys?',
    'After the buy deadline anyone can refund the pool. Every deposit comes back 1:1, and the caller’s record counts it as negligent. A pool that stayed below its minimum is refunded with no mark.',
  ],
  [
    'What if the token cannot be sold?',
    'If no sale has gone through by max hold plus a grace period, anyone can split the position: each participant claims the tokens pro rata. No fee is taken, and the record shows a split.',
  ],
  ['Who keeps the token list and slashes bonds?', 'An admin, a single key in this version. The admin can never touch MON or tokens held for a call, and cannot change a call’s rules.'],
  ['Is this investment advice?', 'No. It shows what callers did with their own money, next to everyone else’s. No rankings by return, no price targets.'],
]

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-28 border-t border-line py-10 first:border-t-0 first:pt-0">
      <h2 className="text-[24px] font-semibold tracking-[-0.03em]">{title}</h2>
      <div className="mt-4 space-y-4 text-[15.5px] leading-[1.65] text-ink-2">{children}</div>
    </section>
  )
}

function Steps({ items }: { items: string[] }) {
  return (
    <ol className="space-y-2.5">
      {items.map((t, i) => (
        <li key={t} className="flex gap-3">
          <span className="num mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent-fill text-[11.5px] font-medium text-accent-strong">
            {i + 1}
          </span>
          <span>{t}</span>
        </li>
      ))}
    </ol>
  )
}

function AddressRow({ label, address }: { label: string; address: string }) {
  const url = chain.blockExplorers?.default.url
  return (
    <div className="flex items-center justify-between gap-4 border-t border-line px-5 py-3.5 first:border-t-0">
      <span className="text-[14px] text-ink-2">{label}</span>
      {url ? (
        <a
          href={`${url}/address/${address}`}
          target="_blank"
          rel="noopener noreferrer"
          className="num inline-flex items-center gap-1.5 text-[13.5px] text-accent hover:text-accent-strong"
        >
          {shortAddress(address, 8, 6)} <ExternalLink size={12} />
        </a>
      ) : (
        <span className="num text-[13.5px]">{shortAddress(address, 8, 6)}</span>
      )}
    </div>
  )
}

/** The contract's current rules, read live so this page can never disagree with the chain. */
function LiveParams() {
  const p = useLoad(async () => {
    if (!deployment) return undefined
    return publicClient.readContract({ address: deployment.trustPool as `0x${string}`, abi: trustPoolAbi, functionName: 'params' }).catch(() => undefined)
  }, [])
  if (!deployment) return <p>No deployment on this chain yet.</p>
  if (p === undefined) return <div className="skeleton h-[180px] rounded-2xl" />
  if (p === null) return <p>Could not read the contract right now.</p>
  const rows: [string, string][] = [
    ['Minimum bond', `${Number(p.minBond) / 1e18} MON`],
    ['Minimum pool', `${Number(p.minPool) / 1e18} MON`],
    ['Window', `${duration(p.minWindow * 1000)} to ${duration(p.maxWindow * 1000)}`],
    ['Buy deadline', `${duration(p.buyGrace * 1000)} after the window`],
    ['Max hold', `${duration(p.minHold * 1000)} to ${duration(p.maxHold * 1000)}`],
    ['Stop-loss', `${p.minStopLossBps / 100}% to ${p.maxStopLossBps / 100}%`],
    ["Caller's least stake", `${p.minCallerBps / 100}%`],
    ['Price impact limit', `${p.maxImpactBps / 100}%`],
    ['Gap between price records', duration(p.checkpointGap * 1000)],
    ['Sale tolerance', `${p.sellToleranceBps / 100}%`],
    ['Keeper reward', `${p.keeperBps / 100}%`],
    ['Split grace', duration(p.splitGrace * 1000)],
    ['Bond withdrawal wait', duration(p.bondCooldown * 1000)],
  ]
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface">
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-center justify-between gap-4 border-t border-line px-5 py-3.5 first:border-t-0">
          <span className="text-[14px] text-ink-2">{k}</span>
          <span className="num text-[14px] text-ink">{v}</span>
        </div>
      ))}
    </div>
  )
}

function Faq() {
  const [open, setOpen] = useState(0)
  return (
    <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
      {FAQ.map(([q, a], i) => (
        <div key={q}>
          <button
            type="button"
            onClick={() => setOpen(open === i ? -1 : i)}
            className="flex w-full items-center justify-between gap-6 px-5 py-4 text-left"
            aria-expanded={open === i}
          >
            <span className="text-[15px] font-medium text-ink">{q}</span>
            <span
              className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${open === i ? 'bg-accent text-white' : 'bg-accent-fill text-accent-strong'}`}
            >
              {open === i ? <Minus size={13} /> : <Plus size={13} />}
            </span>
          </button>
          {open === i && <p className="px-5 pb-5 text-[14.5px] leading-[1.6] text-ink-2">{a}</p>}
        </div>
      ))}
    </div>
  )
}

/** Highlights the section in view in the side menu. */
function useActive(ids: string[]) {
  const [active, setActive] = useState(ids[0])
  useEffect(() => {
    const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && setActive(e.target.id)), { rootMargin: '-10% 0px -75% 0px' })
    ids.forEach((id) => {
      const el = document.getElementById(id)
      if (el) io.observe(el)
    })
    return () => io.disconnect()
  }, [ids])
  return active
}

export default function DocsPage() {
  useTitle('Docs · trustpool')
  const active = useActive(SECTIONS.map((s) => s.id))
  return (
    <div className="bg-bg">
      <MarketingNav />
      <main className="mx-auto grid max-w-[1240px] gap-12 px-5 pb-24 pt-32 sm:px-8 lg:grid-cols-[200px_1fr]">
        <aside className="hidden lg:block">
          <nav className="sticky top-28 space-y-0.5" aria-label="Docs">
            <p className="eyebrow mb-3 text-ink-3">Docs</p>
            {SECTIONS.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className={`block rounded-lg px-3 py-2 text-[14px] transition-colors ${active === s.id ? 'bg-accent-fill font-medium text-accent-deep' : 'text-ink-2 hover:text-ink'}`}
              >
                {s.label}
              </a>
            ))}
          </nav>
        </aside>

        <article className="min-w-0 max-w-[720px]">
          <h1 className="text-[clamp(2.2rem,5vw,3.2rem)] font-semibold leading-[1.02] tracking-[-0.045em]">Docs</h1>
          <p className="mt-4 text-[17px] text-ink-2">Everything a participant or a caller needs, in one page.</p>
          <nav className="scroll-quiet -mx-5 mt-6 flex gap-2 overflow-x-auto px-5 lg:hidden" aria-label="Docs sections">
            {SECTIONS.map((s) => (
              <a key={s.id} href={`#${s.id}`} className="shrink-0 rounded-full border border-line bg-surface px-3.5 py-1.5 text-[13px] text-ink-2">
                {s.label}
              </a>
            ))}
          </nav>

          <div className="mt-12">
            <Section id="overview" title="Overview">
              <p>
                A caller opens a call on one token and fixes every rule up front: take-profit, stop-loss, max hold and their share of profit. For a short window anyone
                can put MON into the pool, the caller first, and take it back 1:1. When the window closes the caller runs one buy for the whole pool, so everyone gets the
                same entry. When a rule is met, anyone sells the whole position, so everyone gets the same exit, and claims pro rata.
              </p>
              <p>
                The caller earns a share of profit only, loses the same percentage as everyone else, and the net result goes on their permanent record. The record sets how
                much they may raise next time: from 2x their bond up to 20x. The cap also keeps one buy&apos;s price impact under 2%.
              </p>
            </Section>

            <Section id="monad" title="Why Monad">
              <ul className="list-disc space-y-2 pl-5 marker:text-ink-3">
                <li>Cheap, fast blocks make it practical to settle every call on chain.</li>
                <li>Every pool is priced every few minutes, and windows can be minutes rather than days.</li>
                <li>Swaps are real Uniswap v4 swaps on Monad testnet, on two demo tokens and pools we seeded.</li>
              </ul>
            </Section>

            <Section id="followers" title="For followers">
              <Steps
                items={[
                  'Browse calls without signing in. Open windows come first.',
                  'Check the caller’s record, tier, bond and the rules of the call.',
                  'Join with any amount under the cap. Until the window closes you can take it back 1:1.',
                  'After the sale, or a refund, or a split, claim your part from the call page or Portfolio.',
                  'Every window, buy, sale and result also goes to a Telegram channel.',
                ]}
              />
            </Section>

            <Section id="callers" title="For callers">
              <Steps
                items={[
                  'Sign in with email or a wallet. A wallet is created if you have none.',
                  'Post a bond, then open a call: token, your stake, window, take-profit, stop-loss, max hold and your share of profit.',
                  'Keep at least 5% of the pool. When the window closes, buy for the whole pool before the deadline.',
                  'The sale happens when a rule is met: anyone may send it, you included. Claim your part and your fee after.',
                ]}
              />
              <div className="pt-2">
                <ArrowLink to="/app/new">Open a call</ArrowLink>
              </div>
            </Section>

            <Section id="rules" title="Rules">
              <p>Read live from the contract on {chain.name}.</p>
              <LiveParams />
            </Section>

            <Section id="contracts" title="Contracts">
              <p>
                Live on {chain.name} (chain {CHAIN_ID}). Swaps run through Uniswap v4.
              </p>
              {deployment ? (
                <div className="overflow-hidden rounded-2xl border border-line bg-surface">
                  <AddressRow label="TrustPool" address={deployment.trustPool} />
                  <AddressRow label="Swap adapter" address={deployment.adapter} />
                  {deployment.tokens.map((t, i) => (
                    <AddressRow key={t} label={`Demo token ${i + 1}`} address={t} />
                  ))}
                </div>
              ) : (
                <p>No deployment on this chain yet.</p>
              )}
            </Section>

            <Section id="api" title="API">
              <p>Public read API for calls, participants, positions, callers and tokens. Personal routes need a Privy token.</p>
              <a href="/api/docs" className="inline-flex items-center gap-1.5 font-medium text-accent hover:text-accent-strong">
                API reference <ExternalLink size={13} />
              </a>
              <p>Any caller&apos;s record as a badge for a README or a bio (Embed badge on the caller page):</p>
              <pre className="num overflow-x-auto rounded-xl bg-subtle p-3 text-[12.5px] text-ink-2">
                ![trustpool](https://trustpool.web.id/api/callers/&lt;address&gt;/badge.svg)
              </pre>
            </Section>

            <Section id="limits" title="Known limits">
              <Faq />
            </Section>
          </div>
        </article>
      </main>
      <MarketingFooter />
    </div>
  )
}
