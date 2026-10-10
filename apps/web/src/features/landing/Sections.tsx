import { motion } from 'motion/react'
import { BellRing, Check, Lock, Receipt, Shield, X } from 'lucide-react'
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
    <section className="py-5" aria-label="Recent results">
      <div className="relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]">
        <div className="flex w-max animate-marquee gap-3">
          {[...items, ...items].map((c, i) => (
            <span key={i} className="flex shrink-0 items-center gap-2.5 rounded-full border border-line bg-surface py-1.5 pl-1.5 pr-3.5 text-[13px]">
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
    <div className="rounded-2xl border border-line bg-subtle p-4">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-[13px] font-semibold">
          <CallerAvatar address={CALLERS[0]!.address} size={24} /> olu
        </span>
        <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-white">Bonded</span>
      </div>
      <p className="num mt-4 text-[30px] font-medium tracking-[-0.03em]">25.00 MON</p>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-line">
        <motion.div className="h-full rounded-full bg-accent" initial={{ width: '30%' }} whileInView={{ width: '100%' }} viewport={{ once: true }} transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }} />
      </div>
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
        <circle cx="66" cy="66" r={r} fill="none" stroke="#DBEAF4" strokeWidth="10" />
        <motion.circle
          cx="66"
          cy="66"
          r={r}
          fill="none"
          stroke="#1F6E9C"
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
          className={`flex items-center gap-3 rounded-2xl border p-3 ${i === 0 ? 'border-accent/30 bg-accent-soft' : 'border-line bg-subtle'}`}
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
    <div className="divide-y divide-line rounded-2xl border border-line bg-subtle">
      {DONE.slice(0, 3).map((c) => (
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
    { n: '01', icon: Shield, title: 'A bond on the line', body: 'Posted before the first call. Slashable, in public.', visual: <BondVisual />, span: 'lg:col-span-2' },
    { n: '02', icon: Lock, title: 'They buy first, and it locks', body: 'Their own MON, locked. The rules are fixed.', visual: <LockVisual />, span: 'lg:col-span-3' },
    { n: '03', icon: BellRing, title: 'Every exit is announced', body: 'The notice period is your head start.', visual: <ExitVisual />, span: 'lg:col-span-3' },
    { n: '04', icon: Receipt, title: 'The result is permanent', body: 'From the real fill. Losses stay too.', visual: <LedgerVisual />, span: 'lg:col-span-2' },
  ]
  return (
    <section id="how" className="scroll-mt-20 py-24 sm:py-32">
      <div className="mx-auto max-w-[1240px] px-5 sm:px-8">
        <Heading eyebrow="How it works" title="Four steps, all on chain." />
        <div className="mt-14 grid gap-4 lg:grid-cols-5">
          {tiles.map((t, i) => (
            <Reveal key={t.n} delay={0.06 * i} className={t.span}>
              <div className="flex h-full flex-col gap-8 rounded-3xl border border-line bg-surface p-6 shadow-card sm:p-8">
                <div>
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent text-white">
                      <t.icon size={17} />
                    </span>
                    <span className="num text-[12px] font-medium text-accent">{t.n}</span>
                  </div>
                  <h3 className="mt-5 text-[22px] font-semibold tracking-[-0.03em]">{t.title}</h3>
                  <p className="mt-2 max-w-[44ch] text-[15px] leading-[1.6] text-ink-2">{t.body}</p>
                </div>
                {/* Visuals sit on the tile's bottom edge, so tiles in a row line up whatever their content. */}
                <div className="flex flex-1 flex-col justify-end">{t.visual}</div>
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
      points: ['See the caller’s entry before you buy', 'Get alerted when an exit is announced', 'Every past call on one page, losses too'],
      cta: 'Browse calls',
      to: '/app/calls',
      dark: false,
    },
    {
      id: 'callers',
      eyebrow: 'For callers',
      title: 'Let your record do the talking.',
      points: ['Your fill is public from the first second', 'Followers know you cannot dump on them', 'One permanent record, no cherry-picking'],
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
  ]
  const Mark = ({ on }: { on: boolean }) =>
    on ? (
      <span className="mx-auto grid h-7 w-7 place-items-center rounded-full bg-accent text-white">
        <Check size={14} strokeWidth={2.6} />
      </span>
    ) : (
      <span className="mx-auto grid h-7 w-7 place-items-center rounded-full bg-subtle text-ink-3 ring-1 ring-inset ring-line">
        <X size={13} strokeWidth={2.4} />
      </span>
    )
  return (
    <section className="border-t border-line bg-surface py-24 sm:py-32">
      <div className="mx-auto max-w-[1240px] px-5 sm:px-8">
        <Heading eyebrow="Compared" title="A call group, with consequences." />
        <Reveal className="mt-14">
          <div className="overflow-hidden rounded-3xl border border-line">
            <div className="grid grid-cols-[1fr_96px_96px] bg-subtle px-5 py-4 text-[13px] font-medium sm:grid-cols-[1fr_150px_150px] sm:px-7">
              <span />
              <span className="text-center text-ink-3">Call group</span>
              <span className="flex items-center justify-center gap-1.5 font-semibold text-accent">trustpool</span>
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

export function FinalCta() {
  return (
    <section className="px-3 pb-3 sm:px-5 sm:pb-5">
      <div className="relative mx-auto max-w-[1240px] overflow-hidden rounded-[32px] bg-ink px-6 py-20 text-center text-white sm:px-10 sm:py-28">
        <div className="pointer-events-none absolute inset-0 opacity-[0.15] [background-image:radial-gradient(rgba(255,255,255,0.6)_1px,transparent_1px)] [background-size:20px_20px]" aria-hidden="true" />
        <Reveal className="relative">
          <h2 className="mx-auto max-w-[16ch] text-[clamp(2.2rem,5vw,4rem)] font-semibold leading-[1] tracking-[-0.045em]">Read the record before you follow anyone.</h2>
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
