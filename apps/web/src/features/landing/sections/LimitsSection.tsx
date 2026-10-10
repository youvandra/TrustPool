import Container from '@/components/site/Container'
import { Badge } from '@/components/ui'
import { LIMITS } from '../content'

/** What the design does about each risk, and what it leaves open, side by side. */
export default function LimitsSection() {
  return (
    <section id="limits" className="scroll-mt-24 bg-mist py-24 sm:py-32">
      <Container>
        <Badge n="3" label="Known limits" />
        <h2 className="mt-6 max-w-[22ch] text-[clamp(2rem,4.5vw,3.4rem)] font-medium leading-[1.05] tracking-[-0.035em]">What trustpool does, and what it leaves open.</h2>
        <p className="mt-5 max-w-[60ch] text-[17px] leading-[1.6] text-ink-quiet">
          Nothing stops a caller from using a second wallet, and any platform that says otherwise is overselling. What we can do is make it cost them, and make it
          visible.
        </p>
        <div className="mt-12 overflow-hidden rounded-panel border border-line bg-surface">
          <div className="hidden grid-cols-[1fr_1.3fr_1.3fr] gap-6 border-b border-line px-6 py-3 text-[12px] text-ink-quiet md:grid">
            <span>Risk</span>
            <span>What the design does</span>
            <span>What remains</span>
          </div>
          {LIMITS.map((l) => (
            <div key={l.risk} className="grid gap-3 border-b border-line px-6 py-5 last:border-b-0 md:grid-cols-[1fr_1.3fr_1.3fr] md:gap-6">
              <p className="text-[15px] font-medium">{l.risk}</p>
              <p className="text-[14px] leading-[1.6] text-ink-quiet">{l.done}</p>
              <p className="text-[14px] leading-[1.6]">{l.left}</p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  )
}
