import { motion } from 'motion/react'
import { useEffect, useState } from 'react'
import Container from '@/components/site/Container'
import { Badge, Panel, Row } from '@/components/ui'
import CallCard from '@/features/calls/components/CallCard'
import { usePageVisible } from '@/lib/hooks'
import { STEPS } from '../content'
import { HERO_STATES } from '../demo'

const STEP_MS = 5200

function BondPreview() {
  return (
    <Panel className="p-5">
      <p className="eyebrow text-ink-quiet">Bond</p>
      <div className="mt-3">
        <Row label="Posted">
          <span className="num">25.00 MON</span>
        </Row>
        <Row label="Open calls">
          <span className="num">1</span>
        </Row>
        <Row label="Can withdraw">7 days after the last call closes</Row>
        <Row label="Slashed">
          <span className="num">0 times</span>
        </Row>
      </div>
    </Panel>
  )
}

/** Four steps beside one preview. Steps advance on their own until the reader picks one. */
export default function HowItWorksSection() {
  const visible = usePageVisible()
  const [active, setActive] = useState(0)
  const [auto, setAuto] = useState(true)
  useEffect(() => {
    if (!auto || !visible) return
    const id = setInterval(() => setActive((n) => (n + 1) % STEPS.length), STEP_MS)
    return () => clearInterval(id)
  }, [auto, visible])
  const step = STEPS[active]!

  return (
    <section id="how-it-works" className="scroll-mt-24 border-t border-line bg-surface py-24 sm:py-32">
      <Container>
        <Badge n="1" label="How it works" />
        <h2 className="mt-6 max-w-[20ch] text-[clamp(2rem,4.5vw,3.4rem)] font-medium leading-[1.05] tracking-[-0.035em]">Four steps, all of them on chain.</h2>
        <p className="mt-5 max-w-[56ch] text-[17px] leading-[1.6] text-ink-quiet">
          Nothing pools. Followers buy on their own, whenever they choose. What trustpool holds is the caller&apos;s position, and the rules around it.
        </p>
        <div className="mt-14 grid items-center gap-12 lg:grid-cols-[1.1fr_1fr] lg:gap-20">
          <ol className="space-y-3" role="tablist" aria-label="Steps">
            {STEPS.map((s, i) => {
              const on = i === active
              const Icon = s.icon
              return (
                <li key={s.key}>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={on}
                    onClick={() => {
                      setActive(i)
                      setAuto(false)
                    }}
                    className={`relative w-full overflow-hidden rounded-panel border p-6 text-left transition-colors duration-500 ease-calm ${
                      on ? 'border-ink bg-ink text-mist' : 'border-line bg-mist text-ink hover:border-ink/40'
                    }`}
                  >
                    <div className="flex items-start gap-5">
                      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${on ? 'bg-mist text-ink' : 'bg-surface text-ink'}`}>
                        <Icon size={19} />
                      </span>
                      <div>
                        <p className={`num text-[12px] ${on ? 'text-mist/50' : 'text-ink-quiet'}`}>{s.key}</p>
                        <h3 className="mt-1 text-[19px] font-medium tracking-[-0.01em]">{s.title}</h3>
                        <p className={`mt-2 text-[15px] leading-[1.6] ${on ? 'text-mist/70' : 'text-ink-quiet'}`}>{s.body}</p>
                      </div>
                    </div>
                    {on && auto && visible && (
                      <motion.span
                        key={active}
                        className="absolute bottom-0 left-0 h-[3px] w-full origin-left bg-accent"
                        initial={{ scaleX: 0 }}
                        animate={{ scaleX: 1 }}
                        transition={{ duration: STEP_MS / 1000, ease: 'linear' }}
                        aria-hidden="true"
                      />
                    )}
                  </button>
                </li>
              )
            })}
          </ol>
          <div className="mx-auto w-full max-w-[400px]">
            <motion.div key={active} initial={visible ? { y: 14 } : false} animate={{ y: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 28 }}>
              {step.preview === 'bond' ? <BondPreview /> : <CallCard call={HERO_STATES[step.preview]!} handle="olu" static />}
            </motion.div>
          </div>
        </div>
      </Container>
    </section>
  )
}
