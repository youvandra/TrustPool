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
  { id: 'followers', label: 'For followers' },
  { id: 'callers', label: 'For callers' },
  { id: 'rules', label: 'Rules' },
  { id: 'contracts', label: 'Contracts' },
  { id: 'api', label: 'API' },
  { id: 'limits', label: 'Known limits' },
]

const FAQ: [string, string][] = [
  [
    'Can a caller also buy with a second wallet?',
    'Nothing stops it completely. It costs them: their own money is locked, a bond is at stake, and a wallet they funded that buys just before a call is grounds for a public slash. Each call lists the wallets that bought just before it, and marks any that received MON straight from the caller shortly before buying.',
  ],
  ['Do I deposit money into trustpool?', 'No. You buy on your own. trustpool only holds the caller’s position.'],
  [
    'Can a caller hide a losing call?',
    'A settled call is permanent. Releasing an unsellable token counts as −100%. A call left open past its max hold is marked stale on the record.',
  ],
  ['Who keeps the token list and slashes bonds?', 'An admin, in this version. The admin can never touch a locked position.'],
  ['Is this investment advice?', 'No. It shows what callers did with their own money. No rankings by return, no price targets.'],
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
    return publicClient.readContract({ address: deployment.trustPool as `0x${string}`, abi: trustPoolAbi, functionName: 'params' })
  }, [])
  if (!deployment) return <p>No deployment on this chain yet.</p>
  if (p === undefined) return <div className="skeleton h-[180px] rounded-2xl" />
  if (p === null) return <p>Could not read the contract right now.</p>
  const rows: [string, string][] = [
    ['Minimum bond', `${Number(p.minBond) / 1e18} MON`],
    ['Lock', `${duration(Number(p.minLock) * 1000)} to ${duration(Number(p.maxLock) * 1000)}`],
    ['Minimum exit notice', duration(Number(p.minNotice) * 1000)],
    ['Release grace', duration(Number(p.releaseGrace) * 1000)],
    ['Max hold before stale', duration(Number(p.maxHold) * 1000)],
    ['Bond withdrawal wait', duration(Number(p.bondCooldown) * 1000)],
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
          <p className="mt-4 text-[17px] text-ink-2">Everything a follower or a caller needs, in one page.</p>
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
                A caller buys a token with their own MON through the trustpool contract. The position is locked, every exit is announced before it can happen,
                and every result stays on their record. Nothing is pooled: followers buy on their own.
              </p>
            </Section>

            <Section id="followers" title="For followers">
              <Steps
                items={[
                  'Browse calls without signing in.',
                  'Check the caller’s record, bond and entry price.',
                  'Watch a call to get alerted the moment its exit is announced.',
                  'Every open, exit and result also goes to a Telegram channel.',
                ]}
              />
            </Section>

            <Section id="callers" title="For callers">
              <Steps
                items={[
                  'Sign in with email or a wallet. A wallet is created if you have none.',
                  'Post a bond, then open a call: token, amount, lock and notice.',
                  'To sell, announce the exit. You can execute once the notice ends.',
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
              <p>Public read API for calls, callers and tokens. Personal routes need a Privy token.</p>
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
