import { motion } from 'motion/react'
import { ArrowDown } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { CALLERS, CALLS, type Call } from '@trustpool/core'
import { ArrowLink, CallerAvatar, Signed, Sparkline, TokenIcon } from '@/components/ui'
import { mon } from '@/lib/format'
import { usePageVisible } from '@/lib/hooks'
import Countdown from '@/features/app/components/Countdown'
import CallTicket from './CallTicket'
import HeroShader from './HeroShader'

const by = (a: string) => CALLERS.find((c) => c.address === a)
const EXITING = CALLS.filter((c) => c.state === 'Exiting')
const RECENT = CALLS.filter((c) => c.state === 'Settled' || c.state === 'Released').slice(-3).reverse()

/** A small, real slice of the app: the "Exiting soon" panel, built from the same components. */
export function ProductShot() {
  return (
    <div className="relative rounded-[28px] border border-line bg-surface p-2 shadow-pop">
      <div className="flex items-center gap-1.5 px-3 pb-2 pt-1">
        <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
        <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
        <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
        <span className="num ml-3 rounded-md bg-subtle px-2 py-0.5 text-[11px] text-ink-3">trustpool.app/app</span>
      </div>
      <div className="rounded-[22px] bg-bg p-4">
        <div className="grid grid-cols-3 gap-2.5">
          {[
            { l: 'Exits announced', v: EXITING.length, a: true },
            { l: 'Locked now', v: CALLS.filter((c) => c.state === 'Locked').length },
            { l: 'Settled', v: RECENT.length + 4 },
          ].map((t) => (
            <div key={t.l} className={`rounded-xl border p-3 ${t.a ? 'border-accent bg-accent text-white' : 'border-line bg-surface'}`}>
              <p className={`text-[10.5px] ${t.a ? 'text-white/80' : 'text-ink-3'}`}>{t.l}</p>
              <p className="num mt-1 text-[20px] font-medium">{t.v}</p>
            </div>
          ))}
        </div>
        <div className="mt-2.5 rounded-xl border border-line bg-surface p-1.5">
          <p className="px-2 pb-1 pt-1.5 text-[12px] font-semibold">Exiting soon</p>
          {EXITING.map((c) => (
            <div key={c.id} className="flex items-center gap-2.5 rounded-lg px-2 py-2">
              <TokenIcon token={c.token} size={28} />
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] font-semibold">{c.token.symbol}</p>
                <p className="flex items-center gap-1 text-[10.5px] text-ink-3">
                  <CallerAvatar address={c.caller} size={12} /> {by(c.caller)?.handle} · {mon(c.monIn, 0)}
                </p>
              </div>
              <div className="w-16">
                <Sparkline data={c.series} width={64} height={22} showEntry={false} />
              </div>
              <Countdown at={c.exitAt!} className="w-[64px] text-right text-[11.5px] font-medium text-accent-deep" />
            </div>
          ))}
        </div>
        <div className="mt-2.5 rounded-xl border border-line bg-surface p-1.5">
          <p className="px-2 pb-1 pt-1.5 text-[12px] font-semibold">Recently settled</p>
          {RECENT.map((c) => (
            <div key={c.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
              <TokenIcon token={c.token} size={24} />
              <p className="flex-1 text-[12px]">
                <span className="font-semibold">{c.token.symbol}</span> <span className="text-ink-3">by {by(c.caller)?.handle}</span>
              </p>
              <Signed bps={Math.round(((c.monOut ?? 0) - c.monIn) / c.monIn * 10_000)} pill className="!h-5 !text-[11px]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}


const WORDS = ['Follow', 'callers', 'who', 'buy', 'first.', 'Hear', 'before', 'they', 'sell.']

const H = 3_600_000
const SEED = CALLS.find((c) => c.id === 9)!
const T0 = Date.now()

/** One call at three moments. The last is a loss on purpose: the hero has to read the same either way. */
const STATES: Call[] = [
  SEED,
  { ...SEED, state: 'Exiting', announcedAt: T0 - 3 * H, exitAt: T0 + 9 * H + 14 * 60_000 },
  { ...SEED, state: 'Settled', announcedAt: T0 - 14 * H, exitAt: T0 - 2 * H, monOut: SEED.monIn * 0.876 },
]
const LABELS = ['Locked', 'Exit announced', 'Settled']
const CYCLE_MS = 3800

/** The ticket steps through locked, announced and settled, like Kinsign's phone. It rests while the page is hidden. */
function HeroTicket() {
  const visible = usePageVisible()
  const [i, setI] = useState(0)
  useEffect(() => {
    if (!visible) return
    const id = setInterval(() => setI((n) => (n + 1) % STATES.length), CYCLE_MS)
    return () => clearInterval(id)
  }, [visible])
  return (
    <div className="relative mx-auto w-[370px] xl:w-[400px]">
      {/* A second ticket behind, tilted: the stack of calls on the record. */}
      <div className="absolute bottom-16 left-10 right-[-28px] top-6 rotate-[6deg] rounded-[28px] bg-accent shadow-pop" aria-hidden="true">
        <div className="absolute inset-0 rounded-[28px] opacity-[0.2] [background-image:radial-gradient(rgba(255,255,255,0.9)_1px,transparent_1px)] [background-size:16px_16px]" />
      </div>
      <motion.div
        key={i}
        className="relative"
        initial={visible && i > 0 ? { y: 14, rotate: -1.5 } : false}
        animate={{ y: 0, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 240, damping: 26 }}
      >
        <CallTicket call={STATES[i]!} caller={by(SEED.caller)} />
      </motion.div>
      <div className="relative mt-8 flex justify-center gap-4" aria-hidden="true">
        {LABELS.map((l, n) => (
          <span key={l} className={`flex items-center gap-2 text-[12px] font-medium transition-colors duration-500 ${n === i ? 'text-ink' : 'text-ink-3/70'}`}>
            <span className={`h-1.5 rounded-full transition-all duration-500 ${n === i ? 'w-6 bg-accent' : 'w-1.5 bg-ink/25'}`} />
            {l}
          </span>
        ))}
      </div>
    </div>
  )
}

export default function Hero() {
  const visible = usePageVisible()
  return (
    <section className="relative isolate flex min-h-[100svh] flex-col overflow-hidden bg-bg pt-24">
      <HeroShader />
      <div className="relative z-10 mx-auto grid w-full max-w-[1240px] flex-1 items-center gap-14 px-5 pb-16 pt-10 sm:px-8 lg:grid-cols-[1.35fr_1fr] lg:pb-20">
        <div>
          <Link
            to="/app"
            className="group inline-flex items-center gap-2 rounded-full bg-surface/85 py-1.5 pl-1.5 pr-3.5 text-[13px] shadow-card backdrop-blur transition-shadow hover:shadow-pop"
          >
            <span className="rounded-full bg-accent px-2.5 py-0.5 text-[11px] font-semibold text-white">Live demo</span>
            <span className="text-ink-2">Browse every call without signing in</span>
            <span className="text-ink-3 transition-transform group-hover:translate-x-0.5">→</span>
          </Link>
          <h1 className="mt-7 max-w-[15ch] text-balance text-[clamp(2.6rem,6.6vw,5.4rem)] font-semibold leading-[0.98] tracking-[-0.05em]">
            {WORDS.map((w, i) => (
              <motion.span
                key={w + i}
                className={`mr-[0.22em] inline-block ${i >= 5 ? 'text-accent' : ''}`}
                initial={visible ? { y: 28 } : false}
                animate={{ y: 0 }}
                transition={{ delay: 0.04 * i, type: 'spring', stiffness: 220, damping: 24 }}
              >
                {w}
              </motion.span>
            ))}
          </h1>
          <p className="mt-7 max-w-[52ch] text-[17px] leading-[1.6] text-ink-2 sm:text-[19px]">
            On trustpool a caller buys with their own money before anyone sees the call. The position is locked, every exit is announced hours ahead, and
            every result stays on their record. Losses included.
          </p>
          <div className="mt-9 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <ArrowLink to="/app">Launch app</ArrowLink>
            <ArrowLink to="/#how" tone="light">
              How it works
            </ArrowLink>
          </div>
        </div>
        <div className="hidden lg:block">
          <HeroTicket />
        </div>
      </div>
      <div className="relative z-10 mx-auto hidden w-full max-w-[1240px] px-8 pb-8 lg:block">
        <a href="#how" className="inline-flex items-center gap-2 text-[13px] text-ink-2">
          Scroll <ArrowDown size={14} className="animate-bob motion-reduce:animate-none" />
        </a>
      </div>
    </section>
  )
}
