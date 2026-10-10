import Container from '@/components/site/Container'
import Reveal from '@/components/motion/Reveal'
import { Badge } from '@/components/ui'
import { PRINCIPLES } from '../content'

export default function PrinciplesSection() {
  return (
    <section className="bg-deep py-24 text-deep-text sm:py-32">
      <Container>
        <Badge n="2" label="Principles" dark />
        <h2 className="mt-6 max-w-[22ch] text-[clamp(2rem,4.5vw,3.4rem)] font-medium leading-[1.05] tracking-[-0.035em]">
          A record is only useful if it keeps the bad days.
        </h2>
        <div className="mt-14 grid gap-px overflow-hidden rounded-panel border border-deep-text/10 bg-deep-text/10 sm:grid-cols-2">
          {PRINCIPLES.map((p, i) => (
            <Reveal key={p.title} delay={0.05 * i} className="bg-deep p-7 sm:p-9">
              <p className="num text-[12px] text-deep-text/40">0{i + 1}</p>
              <h3 className="mt-3 text-[21px] font-medium tracking-[-0.01em]">{p.title}</h3>
              <p className="mt-3 max-w-[42ch] text-[15px] leading-[1.6] text-deep-text/60">{p.body}</p>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  )
}
