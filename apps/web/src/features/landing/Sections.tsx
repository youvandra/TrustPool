import { motion } from 'motion/react'
import { Check, Lock, Receipt, Shield, Users, X } from 'lucide-react'
import { CALLERS, CALLS, returnBps, TIERS } from '@trustpool/core'
import { ArrowLink, CallerAvatar, Fill, Signed, TokenIcon } from '@/components/ui'
import { duration, mon, pct } from '@/lib/format'
import Reveal from '@/components/marketing/Reveal'
import Countdown from '@/features/app/components/Countdown'

const by = (a: string) => CALLERS.find((c) => c.address === a)
const DONE = CALLS.filter((c) => c.state === 'Settled')

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
  const c = CALLERS[0]!
  return (
    <div className="rounded-2xl border border-line bg-subtle p-4">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-[13px] font-semibold">
          <CallerAvatar address={c.address} size={24} /> {c.handle}
        </span>
        <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-white">Tier {c.tier}</span>
      </div>
      <p className="num mt-4 text-[30px] font-medium tracking-[-0.03em]">{mon(c.bond)}</p>
      <p className="mt-1 text-[12.5px] text-ink-3">
        bond · next pool up to <span className="num">{mon(c.bond * TIERS[c.tier]!.multiple, 0)}</span>
      </p>
    </div>
  )
}

function WindowVisual() {
  const c = CALLS.find((x) => x.state === 'Open' && x.id === 10) ?? CALLS.find((x) => x.state === 'Open')!
  const cap = c.liveCap ?? c.rules.cap
  return (
    <div className="rounded-2xl border border-accent/30 bg-accent-soft p-4">
      <div className="flex items-center justify-between text-[13px]">
        <span className="flex items-center gap-2 font-semibold">
          <TokenIcon token={c.token} size={24} /> {c.token.symbol} pool
        </span>
        <span className="text-ink-3">
          closes in <Countdown at={c.rules.windowEnd} className="font-medium text-accent-deep" />
        </span>
      </div>
      <p className="mt-4 flex items-baseline justify-between">
        <span className="num text-[24px] font-medium tracking-[-0.02em]">{mon(c.totalIn)}</span>
        <span className="num text-[12.5px] text-ink-3">of {mon(cap, 0)}</span>
      </p>
      <Fill value={c.totalIn} max={cap} className="mt-2" />
      <p className="mt-2 text-[12px] text-ink-3">
        <span className="num">{c.depositors}</span> in, the caller&apos;s <span className="num">{mon(c.callerStake)}</span> first
      </p>
    </div>
  )
}

function RulesVisual() {
  const c = CALLS.find((x) => x.state === 'Holding')!
  const rules = [
    ['Take-profit', c.rules.takeProfitBps ? `+${pct(c.rules.takeProfitBps)}` : 'None'],
    ['Stop-loss', `−${pct(c.rules.stopLossBps)}`],
    ['Max hold', duration(c.rules.maxHold)],
  ]
  return (
    <div className="space-y-2.5">
      {rules.map(([l, v], i) => (
        <motion.div
          key={l}
          initial={{ x: 24 }}
          whileInView={{ x: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.12 * i, type: 'spring', stiffness: 260, damping: 26 }}
          className="flex items-center gap-3 rounded-2xl border border-line bg-subtle p-3"
        >
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-ink text-white">
            <Lock size={15} />
          </span>
          <span className="flex-1 text-[13px] font-semibold">{l}</span>
          <span className="num text-[13px] font-medium">{v}</span>
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
    { n: '01', icon: Shield, title: 'A bond, and a record', body: 'The record sets how big the next pool may be.', visual: <BondVisual />, span: 'lg:col-span-2' },
    { n: '02', icon: Users, title: 'A window to join', body: 'The caller puts in first. Anyone joins, or leaves 1:1, until it closes.', visual: <WindowVisual />, span: 'lg:col-span-3' },
    { n: '03', icon: Lock, title: 'One buy, one sale', body: 'Rules fixed at open. Anyone sells once one is met; nobody sells alone.', visual: <RulesVisual />, span: 'lg:col-span-3' },
    { n: '04', icon: Receipt, title: 'The result is permanent', body: 'The same for everyone. Losses stay too.', visual: <LedgerVisual />, span: 'lg:col-span-2' },
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
      eyebrow: 'For participants',
      title: 'Read the record, then join.',
      points: ['The same entry and exit as the caller', 'Your MON back 1:1 until the window closes', 'Every past call on one page, losses too'],
      cta: 'See open windows',
      to: '/app/calls?tab=open',
      dark: false,
    },
    {
      id: 'callers',
      eyebrow: 'For callers',
      title: 'Let your record do the talking.',
      points: ['A share of profit only, never of a loss', 'Nobody can say you sold before them', 'One permanent record, no cherry-picking'],
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
    ['The caller’s own money in, on the same terms as yours', false, true],
    ['Everyone buys at the same price', false, true],
    ['Nobody can sell before the others, the caller included', false, true],
    ['Exit rules fixed before anyone joins', false, true],
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
          <h2 className="mx-auto max-w-[16ch] text-[clamp(2.2rem,5vw,4rem)] font-semibold leading-[1] tracking-[-0.045em]">Read the record before you join anyone.</h2>
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
