import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useState } from 'react'
import { CALLERS, CALLS, settle, type Call } from '@trustpool/core'
import { ArrowLink } from '@/components/ui'
import { usePageVisible } from '@/lib/hooks'
import HeroCard from './HeroCard'
import HeroShader from './HeroShader'

const H = 3_600_000
const SEED = CALLS.find((c) => c.id === 9)!
const SHAPE = CALLS.find((c) => c.id === 7)!.series
const CALLER = CALLERS.find((c) => c.address === SEED.caller)
const T0 = Date.now()
const SOLD_AT = 0.876 // the settled state sells 12.4% below entry
const ENTRY = 0.0021
const TOKENS = SEED.totalIn / ENTRY

/** A demo price shape moved onto this call's entry, bent so its last point is `end`: chart and result agree. */
function shaped(end: number): number[] {
  const base = SHAPE.map((v) => (v / SHAPE[0]!) * ENTRY)
  const n = base.length - 1
  const shift = end - base[n]!
  return base.map((v, i) => v + (shift * i) / n)
}

/** One pool at three moments. The last is a loss on purpose: the page reads the same either way. */
const gross = TOKENS * ENTRY * SOLD_AT
const STATES: Call[] = [
  { ...SEED, rules: { ...SEED.rules, windowEnd: T0 + 2 * H + 14 * 60_000 } },
  { ...SEED, state: 'Holding', tokens: TOKENS, boughtAt: T0 - 5 * H, holdUntil: T0 + 31 * H, series: shaped(ENTRY * 1.03) },
  {
    ...SEED,
    state: 'Settled',
    tokens: TOKENS,
    saleReason: 'stop_loss',
    gross,
    ...settle(SEED.totalIn, gross, SEED.rules.shareBps),
    series: shaped(ENTRY * SOLD_AT),
  },
]
const LABELS = ['Window open', 'Bought together', 'On the record']
const CYCLE_MS = 4200

/** Steps through the three moments, like Kinsign's phone. Rests while the page is hidden. */
function HeroVisual() {
  const visible = usePageVisible()
  const still = useReducedMotion()
  const [i, setI] = useState(0)
  useEffect(() => {
    if (!visible || still) return
    const id = setInterval(() => setI((n) => (n + 1) % STATES.length), CYCLE_MS)
    return () => clearInterval(id)
  }, [visible, still])
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

const WORDS = ['One', 'buy.', 'One', 'sale.', 'The', 'same', 'price', 'for', 'everyone.']

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
                className={`mr-[0.22em] inline-block ${i >= 4 ? 'text-accent' : ''}`}
                initial={visible ? { y: 28 } : false}
                animate={{ y: 0 }}
                transition={{ delay: 0.04 * i, type: 'spring', stiffness: 220, damping: 24 }}
              >
                {w}
              </motion.span>
            ))}
          </h1>
          <p className="mt-7 max-w-[44ch] text-[18px] leading-[1.6] text-ink-2">
            A caller opens a pool with their own money in and every rule fixed. Everyone buys together and sells together, and the result goes on the caller&apos;s record.
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
    </section>
  )
}
