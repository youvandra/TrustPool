import { ArrowDown } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useState } from 'react'
import Container from '@/components/site/Container'
import { ArrowLink } from '@/components/ui'
import { usePageVisible } from '@/lib/hooks'
import CallCard from '@/features/calls/components/CallCard'
import { HERO_STATES } from '../demo'

const CYCLE_MS = 3800
const LABELS = ['Locked', 'Exit announced', 'Settled']

/** One call steps through locked, announced and settled. It rests while the page is hidden. */
function HeroCall() {
  const visible = usePageVisible()
  const [i, setI] = useState(0)
  useEffect(() => {
    if (!visible) return
    const id = setInterval(() => setI((n) => (n + 1) % HERO_STATES.length), CYCLE_MS)
    return () => clearInterval(id)
  }, [visible])
  return (
    <div className="relative mx-auto w-full max-w-[400px]">
      <motion.div key={i} initial={visible && i > 0 ? { y: 12 } : false} animate={{ y: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 30 }}>
        <CallCard call={HERO_STATES[i]!} handle="olu" static />
      </motion.div>
      <div className="mt-5 flex items-center justify-center gap-4" aria-hidden="true">
        {LABELS.map((l, n) => (
          <span key={l} className={`flex items-center gap-2 text-[12px] transition-colors duration-500 ${n === i ? 'text-ink' : 'text-ink-quiet/60'}`}>
            <span className={`h-1.5 rounded-full transition-all duration-500 ${n === i ? 'w-6 bg-ink' : 'w-1.5 bg-ink/25'}`} />
            {l}
          </span>
        ))}
      </div>
    </div>
  )
}

/** Horizontal rules like a measuring vessel; one of them is the accent line from the mark. */
function Levels() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-0" aria-hidden="true">
      <div className="absolute inset-0 bg-[repeating-linear-gradient(to_bottom,transparent_0,transparent_55px,rgb(var(--line)/0.45)_55px,rgb(var(--line)/0.45)_56px)]" />
      <div className="absolute right-0 top-1/2 hidden h-[3px] w-[44%] bg-accent/60 lg:block" />
    </div>
  )
}

export default function HeroSection() {
  return (
    <section className="relative isolate flex min-h-[100svh] flex-col overflow-hidden bg-mist pt-24">
      <Levels />
      <Container className="relative z-10 grid flex-1 items-center gap-14 pb-16 pt-10 lg:grid-cols-[1.3fr_1fr] lg:pb-20">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface py-1.5 pl-1.5 pr-3.5 text-[13px]">
            <span className="rounded-full bg-ink px-2.5 py-0.5 text-[11px] font-medium text-mist">Monad</span>
            <span className="text-ink-quiet">Built for Metropolis 2026</span>
          </span>
          <h1 className="mt-7 max-w-[16ch] text-balance text-[clamp(2.4rem,6.4vw,5rem)] font-medium leading-[1.02] tracking-[-0.04em]">
            The caller buys first, and cannot leave without telling you.
          </h1>
          <p className="mt-7 max-w-[54ch] text-[17px] leading-[1.6] text-ink-quiet sm:text-[19px]">
            On trustpool a call starts with the caller&apos;s own money, locked on chain. Every exit is announced hours before it can happen, and every result stays
            on their record, losses included.
          </p>
          <div className="mt-9 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <ArrowLink text="Browse calls" to="/calls" size="lg" />
            <ArrowLink text="How it works" href="#how-it-works" size="lg" variant="light" />
          </div>
        </div>
        <HeroCall />
      </Container>
      <Container className="relative z-10 hidden pb-8 lg:block">
        <a href="#how-it-works" className="inline-flex items-center gap-2 text-[13px] text-ink-quiet">
          Scroll <ArrowDown size={14} className="animate-bob motion-reduce:animate-none" />
        </a>
      </Container>
    </section>
  )
}
