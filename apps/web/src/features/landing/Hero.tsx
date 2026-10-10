import { motion } from 'motion/react'
import { ArrowDown } from 'lucide-react'
import { useEffect, useState } from 'react'
import { CALLERS, CALLS, type Call } from '@trustpool/core'
import { ArrowLink } from '@/components/ui'
import { usePageVisible } from '@/lib/hooks'
import HeroCard from './HeroCard'
import HeroShader from './HeroShader'

const H = 3_600_000
const SEED = CALLS.find((c) => c.id === 9)!
const CALLER = CALLERS.find((c) => c.address === SEED.caller)
const T0 = Date.now()
const SOLD_AT = 0.876 // the settled state sells 12.4% below entry

/** The demo series bent so its last point is the sale price: chart and result must agree. */
function endingAt(series: number[], end: number): number[] {
  const n = series.length - 1
  const shift = end - series[n]!
  return series.map((v, i) => v + (shift * i) / n)
}

/** One call at three moments. The last is a loss on purpose: the page reads the same either way. */
const STATES: Call[] = [
  SEED,
  { ...SEED, state: 'Exiting', announcedAt: T0 - 3 * H, exitAt: T0 + 9 * H + 14 * 60_000 },
  {
    ...SEED,
    state: 'Settled',
    announcedAt: T0 - 14 * H,
    exitAt: T0 - 2 * H,
    monOut: SEED.monIn * SOLD_AT,
    series: endingAt(SEED.series, SEED.series[0]! * SOLD_AT),
  },
]
const LABELS = ['Bought and locked', 'Exit announced', 'On the record']
const CYCLE_MS = 4200

/** Steps through the three moments, like Kinsign's phone. Rests while the page is hidden. */
function HeroVisual() {
  const visible = usePageVisible()
  const [i, setI] = useState(0)
  useEffect(() => {
    if (!visible) return
    const id = setInterval(() => setI((n) => (n + 1) % STATES.length), CYCLE_MS)
    return () => clearInterval(id)
  }, [visible])
  return (
    <div className="relative mx-auto w-full max-w-[470px] pt-8">
      <HeroCard call={STATES[i]!} caller={CALLER} />
      <div className="mt-6 flex justify-center gap-4" aria-hidden="true">
        {LABELS.map((l, n) => (
          <button
            key={l}
            type="button"
            tabIndex={-1}
            onClick={() => setI(n)}
            className={`flex items-center gap-2 text-[12px] font-medium transition-colors duration-500 ${n === i ? 'text-ink' : 'text-ink-3/70 hover:text-ink-2'}`}
          >
            <span className={`h-1.5 rounded-full transition-all duration-500 ${n === i ? 'w-6 bg-accent' : 'w-1.5 bg-ink/25'}`} />
            {l}
          </button>
        ))}
      </div>
    </div>
  )
}

const WORDS = ['Follow', 'callers', 'who', 'buy', 'first.', 'Hear', 'before', 'they', 'sell.']

export default function Hero() {
  const visible = usePageVisible()
  return (
    <section className="relative isolate flex min-h-[100svh] flex-col overflow-hidden bg-bg pt-24">
      <HeroShader />
      <div className="relative z-10 mx-auto grid w-full max-w-[1240px] flex-1 items-center gap-14 px-5 pb-16 pt-10 sm:px-8 lg:grid-cols-[1.25fr_1fr] lg:pb-20">
        <div>
          <h1 className="max-w-[15ch] text-balance text-[clamp(2.6rem,6.6vw,5.4rem)] font-semibold leading-[0.98] tracking-[-0.05em]">
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
          <p className="mt-7 max-w-[44ch] text-[18px] leading-[1.6] text-ink-2">
            Callers lock their own money before you see the call, and announce every exit hours ahead.
          </p>
          <div className="mt-9 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <ArrowLink to="/app">Launch app</ArrowLink>
            <ArrowLink to="/docs" tone="light">
              Read the docs
            </ArrowLink>
          </div>
        </div>
        <div className="hidden lg:block">
          <HeroVisual />
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
