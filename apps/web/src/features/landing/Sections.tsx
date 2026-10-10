import { AnimatePresence, motion } from 'motion/react'
import { BellRing, Check, Lock, Minus, Plus, Receipt, Shield, X } from 'lucide-react'
import { useState } from 'react'
import { CALLERS, CALLS, returnBps } from '@trustpool/core'
import { ArrowLink, CallerAvatar, Signed, TokenIcon } from '@/components/ui'
import Reveal from '@/components/marketing/Reveal'
import Countdown from '@/features/app/components/Countdown'

const by = (a: string) => CALLERS.find((c) => c.address === a)
const DONE = CALLS.filter((c) => c.state === 'Settled' || c.state === 'Released')

function Heading({ eyebrow, title, body, center = false }: { eyebrow: string; title: string; body?: string; center?: boolean }) {
  return (
    <Reveal className={center ? 'mx-auto max-w-[720px] text-center' : 'max-w-[720px]'}>
      <p className="eyebrow text-accent">{eyebrow}</p>
      <h2 className="mt-4 text-[clamp(2rem,4.4vw,3.4rem)] font-semibold leading-[1.02] tracking-[-0.045em]">{title}</h2>
      {body && <p className={`mt-5 text-[17px] leading-[1.6] text-ink-2 ${center ? 'mx-auto max-w-[56ch]' : 'max-w-[56ch]'}`}>{body}</p>}
    </Reveal>
  )
}

/** Every settled result scrolling past, gains and losses in the same type. */
export function Ticker() {
  const items = [...DONE, ...DONE]
  return (
    <section className="border-y border-line bg-surface py-5" aria-label="Recent results">
      <div className="relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]">
        <div className="flex w-max animate-marquee gap-3">
          {[...items, ...items].map((c, i) => (
            <span key={i} className="flex shrink-0 items-center gap-2.5 rounded-full border border-line bg-bg py-1.5 pl-1.5 pr-3.5 text-[13px]">
              <TokenIcon token={c.token} size={24} />
              <span className="font-semibold">{c.token.symbol}</span>
              <span className="text-ink-3">by {by(c.caller)?.handle}</span>
              <Signed bps={returnBps(c)!} />
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}

function BondVisual() {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4 shadow-card">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-[13px] font-semibold">
          <CallerAvatar address={CALLERS[0]!.address} size={24} /> olu
        </span>
        <span className="rounded-full bg-accent-fill px-2 py-0.5 text-[11px] font-medium text-accent-deep">Bonded</span>
      </div>
      <p className="num mt-4 text-[30px] font-medium tracking-[-0.03em]">25.00 MON</p>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-subtle">
        <motion.div className="h-full rounded-full bg-accent" initial={{ width: '30%' }} whileInView={{ width: '100%' }} viewport={{ once: true }} transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }} />
      </div>
      <p className="mt-2 text-[12px] text-ink-3">Locked while any call is open · slashable with a public reason</p>
    </div>
  )
}

function LockVisual() {
  const c = CALLS.find((x) => x.state === 'Locked')!
  const r = 52
  const len = 2 * Math.PI * r
  return (
    <div className="flex items-center gap-5">
      <svg width="132" height="132" viewBox="0 0 132 132" className="shrink-0 -rotate-90">
        <circle cx="66" cy="66" r={r} fill="none" stroke="#E4EAED" strokeWidth="10" />
        <motion.circle
          cx="66"
          cy="66"
          r={r}
          fill="none"
          stroke="#12212A"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={len}
          initial={{ strokeDashoffset: len }}
          whileInView={{ strokeDashoffset: len * 0.62 }}
          viewport={{ once: true }}
          transition={{ duration: 1.6, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <div>
        <p className="flex items-center gap-1.5 text-[12px] text-ink-3">
          <Lock size={12} /> {c.token.symbol} lock ends in
        </p>
        <Countdown at={c.unlockAt} className="mt-1 block text-[24px] font-medium tracking-[-0.02em]" />
        <p className="mt-1 text-[12px] text-ink-3">Bought at the caller&apos;s own price, before the call was public.</p>
      </div>
    </div>
  )
}

function ExitVisual() {
  const ex = CALLS.filter((c) => c.state === 'Exiting')
  return (
    <div className="space-y-2.5">
      {ex.map((c, i) => (
        <motion.div
          key={c.id}
          initial={{ x: 24 }}
          whileInView={{ x: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.15 * i, type: 'spring', stiffness: 260, damping: 26 }}
          className={`flex items-center gap-3 rounded-2xl border p-3 ${i === 0 ? 'border-accent/30 bg-surface shadow-card' : 'border-line bg-surface/70'}`}
        >
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent text-white">
            <BellRing size={15} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold">
              {by(c.caller)?.handle} is exiting {c.token.symbol}
            </span>
            <span className="block text-[11.5px] text-ink-3">Can sell in</span>
          </span>
          <Countdown at={c.exitAt!} className="text-[13px] font-medium text-accent-deep" />
        </motion.div>
      ))}
    </div>
  )
}

function LedgerVisual() {
  return (
    <div className="divide-y divide-line rounded-2xl border border-line bg-surface shadow-card">
      {DONE.slice(0, 5).map((c) => (
        <div key={c.id} className="flex items-center gap-3 px-4 py-2.5">
          <TokenIcon token={c.token} size={26} />
          <span className="flex-1 text-[13px]">
            <span className="font-semibold">{c.token.symbol}</span> <span className="text-ink-3">by {by(c.caller)?.handle}</span>
          </span>
          <Signed bps={returnBps(c)!} pill />
        </div>
      ))}
    </div>
  )
}

export function HowItWorks() {
  const tiles = [
    { n: '01', icon: Shield, title: 'A bond on the line', body: 'Before a first call, the caller posts a bond. It stays behind every call and can be cut, with the reason written on chain.', visual: <BondVisual />, span: 'lg:col-span-2' },
    { n: '02', icon: Lock, title: 'They buy first, and it locks', body: 'Their MON buys the token through the contract. Token, lock and notice are fixed in that same transaction.', visual: <LockVisual />, span: 'lg:col-span-3' },
    { n: '03', icon: BellRing, title: 'Every exit is announced', body: 'To sell, the caller says so publicly, then waits. The notice period is your head start.', visual: <ExitVisual />, span: 'lg:col-span-3' },
    { n: '04', icon: Receipt, title: 'The result is permanent', body: 'The sale runs through the same contract, so the result is the real fill. A loss reads exactly like a gain.', visual: <LedgerVisual />, span: 'lg:col-span-2' },
  ]
  return (
    <section id="how" className="scroll-mt-20 py-24 sm:py-32">
      <div className="mx-auto max-w-[1240px] px-5 sm:px-8">
        <Heading eyebrow="How it works" title="Four steps, all on chain." body="Nothing is pooled and nobody holds your money. trustpool holds the caller's position, and the rules around it." />
        <div className="mt-14 grid gap-4 lg:grid-cols-5">
          {tiles.map((t, i) => (
            <Reveal key={t.n} delay={0.06 * i} className={t.span}>
              <div className="flex h-full flex-col justify-between gap-8 rounded-3xl border border-line bg-subtle p-6 sm:p-8">
                <div>
                  <div className="flex items-center gap-3">
                    <span className="grid h-9 w-9 place-items-center rounded-xl bg-surface text-ink ring-1 ring-inset ring-line">
                      <t.icon size={16} />
                    </span>
                    <span className="num text-[12px] text-ink-3">{t.n}</span>
                  </div>
                  <h3 className="mt-5 text-[22px] font-semibold tracking-[-0.03em]">{t.title}</h3>
                  <p className="mt-2 max-w-[44ch] text-[15px] leading-[1.6] text-ink-2">{t.body}</p>
                </div>
                <div>{t.visual}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

export function Audiences() {
  const cols = [
    {
      id: 'followers',
      eyebrow: 'For followers',
      title: 'Read the record, then decide.',
      points: ['See the caller’s own entry before you buy', 'Get an alert the moment an exit is announced', 'Every past call, wins and losses, on one page', 'Bond size and slash history on every card'],
      cta: 'Browse calls',
      to: '/app/calls',
      dark: false,
    },
    {
      id: 'callers',
      eyebrow: 'For callers',
      title: 'Let your record do the talking.',
      points: ['Your fill is public and fixed from the first second', 'Followers know you cannot dump on them', 'One permanent track record, no cherry-picking', 'Sign in with email; a wallet is made for you'],
      cta: 'Open a call',
      to: '/app/new',
      dark: true,
    },
  ]
  return (
    <section className="pb-24 sm:pb-32">
      <div className="mx-auto grid max-w-[1240px] gap-4 px-5 sm:px-8 lg:grid-cols-2">
        {cols.map((c, i) => (
          <Reveal key={c.id} delay={0.08 * i}>
            <div id={c.id} className={`h-full scroll-mt-24 rounded-3xl p-7 sm:p-10 ${c.dark ? 'bg-ink text-white' : 'border border-line bg-surface shadow-card'}`}>
              <p className={`eyebrow ${c.dark ? 'text-accent-lift' : 'text-accent'}`}>{c.eyebrow}</p>
              <h3 className="mt-4 text-[30px] font-semibold leading-[1.05] tracking-[-0.04em] sm:text-[36px]">{c.title}</h3>
              <ul className="mt-8 space-y-3.5">
                {c.points.map((p) => (
                  <li key={p} className={`flex items-start gap-3 text-[15px] ${c.dark ? 'text-white/80' : 'text-ink-2'}`}>
                    <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full ${c.dark ? 'bg-white/10 text-accent-lift' : 'bg-accent-fill text-accent-deep'}`}>
                      <Check size={12} strokeWidth={2.6} />
                    </span>
                    {p}
                  </li>
                ))}
              </ul>
              <ArrowLink to={c.to} tone={c.dark ? 'light' : 'dark'} className="mt-10">
                {c.cta}
              </ArrowLink>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  )
}

export function Compare() {
  const rows: [string, boolean, boolean][] = [
    ['Caller’s own money in before you see the call', false, true],
    ['Caller’s entry price public and fixed', false, true],
    ['Warning before the caller sells', false, true],
    ['Losing calls stay in the history', false, true],
    ['Something at stake if the caller misbehaves', false, true],
    ['Your money pooled with strangers', false, false],
  ]
  const Mark = ({ on }: { on: boolean }) =>
    on ? (
      <span className="mx-auto grid h-7 w-7 place-items-center rounded-full bg-ink text-white">
        <Check size={14} strokeWidth={2.6} />
      </span>
    ) : (
      <span className="mx-auto grid h-7 w-7 place-items-center rounded-full bg-subtle text-ink-3 ring-1 ring-inset ring-line">
        <X size={13} strokeWidth={2.4} />
      </span>
    )
  return (
    <section className="border-t border-line bg-surface py-24 sm:py-32">
      <div className="mx-auto max-w-[1000px] px-5 sm:px-8">
        <Heading center eyebrow="Compared" title="A call group, with consequences." body="Telegram and Discord already spread signals well. What they never had is a reason for the caller to stay honest." />
        <Reveal className="mt-14">
          <div className="overflow-hidden rounded-3xl border border-line">
            <div className="grid grid-cols-[1fr_96px_96px] bg-subtle px-5 py-4 text-[13px] font-medium sm:grid-cols-[1fr_150px_150px] sm:px-7">
              <span />
              <span className="text-center text-ink-3">Call group</span>
              <span className="flex items-center justify-center gap-1.5">trustpool</span>
            </div>
            {rows.map(([label, a, b]) => (
              <div key={label} className="grid grid-cols-[1fr_96px_96px] items-center border-t border-line px-5 py-4 sm:grid-cols-[1fr_150px_150px] sm:px-7">
                <span className="text-[14.5px] text-ink-2">{label}</span>
                <Mark on={a} />
                <Mark on={b} />
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  )
}

const FAQ = [
  ['What stops a caller from also buying with a second wallet?', 'Nothing stops it completely, and any platform that says otherwise is overselling. trustpool makes it cost them: their own money is locked in every call, a bond is at stake, and a wallet funded by the caller that buys just before a call is grounds for a public slash.'],
  ['Do I deposit money into trustpool?', 'No. You buy on your own, wherever you like. trustpool only holds the caller’s position and enforces the rules around it.'],
  ['Can a caller hide a losing call?', 'A settled call is permanent. A token that cannot be sold can be released to the caller unsold, and the record counts that as −100%. A caller can still leave a losing call open instead of closing it; open calls show their age, and a stale-call rule is on the roadmap.'],
  ['Who keeps the token list and slashes bonds?', 'An admin, in this version, and we say so plainly. The admin can never touch a locked position. A multisig is the minimum before real money.'],
  ['Is this investment advice?', 'No. trustpool shows what callers did with their own money. It never recommends, ranks by returns, or shows price targets.'],
]

export function Limits() {
  const [open, setOpen] = useState(0)
  return (
    <section id="limits" className="scroll-mt-20 py-24 sm:py-32">
      <div className="mx-auto grid max-w-[1240px] gap-12 px-5 sm:px-8 lg:grid-cols-[1fr_1.3fr]">
        <Heading eyebrow="Known limits" title="What it does, and what it leaves open." body="A record is only worth trusting if it is honest about itself. These are the questions we would ask." />
        <Reveal>
          <div className="divide-y divide-line rounded-3xl border border-line bg-surface">
            {FAQ.map(([q, a], i) => (
              <div key={q}>
                <button type="button" onClick={() => setOpen(open === i ? -1 : i)} className="flex w-full items-center justify-between gap-6 px-6 py-5 text-left" aria-expanded={open === i}>
                  <span className="text-[16px] font-medium tracking-[-0.01em]">{q}</span>
                  <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full transition-colors ${open === i ? 'bg-ink text-white' : 'bg-subtle text-ink-2'}`}>
                    {open === i ? <Minus size={14} /> : <Plus size={14} />}
                  </span>
                </button>
                <AnimatePresence initial={false}>
                  {open === i && (
                    <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden">
                      <p className="px-6 pb-6 text-[15px] leading-[1.65] text-ink-2">{a}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  )
}

export function FinalCta() {
  return (
    <section className="px-3 pb-3 sm:px-5 sm:pb-5">
      <div className="relative mx-auto max-w-[1240px] overflow-hidden rounded-[32px] bg-ink px-6 py-20 text-center text-white sm:px-10 sm:py-28">
        <div className="pointer-events-none absolute inset-0 opacity-[0.15] [background-image:radial-gradient(rgba(255,255,255,0.6)_1px,transparent_1px)] [background-size:20px_20px]" aria-hidden="true" />
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-[3px] bg-accent-lift/60" aria-hidden="true" />
        <Reveal className="relative">
          <h2 className="mx-auto max-w-[16ch] text-[clamp(2.2rem,5vw,4rem)] font-semibold leading-[1] tracking-[-0.045em]">Read the record before you follow anyone.</h2>
          <p className="mx-auto mt-6 max-w-[48ch] text-[17px] leading-[1.6] text-white/70">Browse every call without signing in. Sign in when you want alerts, or when you are ready to call.</p>
          <div className="mt-10 flex justify-center">
            <ArrowLink to="/app" tone="light">
              Launch app
            </ArrowLink>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
