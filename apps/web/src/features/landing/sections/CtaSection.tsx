import Container from '@/components/site/Container'
import { ArrowLink } from '@/components/ui'

export default function CtaSection() {
  return (
    <section className="border-t border-line bg-surface py-24 sm:py-28">
      <Container className="flex flex-col items-start justify-between gap-8 lg:flex-row lg:items-end">
        <h2 className="max-w-[20ch] text-[clamp(2rem,4.5vw,3.4rem)] font-medium leading-[1.05] tracking-[-0.035em]">Read the record before you follow anyone.</h2>
        <div className="flex flex-col gap-3 sm:flex-row">
          <ArrowLink text="Browse calls" to="/calls" size="lg" />
          <ArrowLink text="Open a call" to="/open" size="lg" variant="outline" />
        </div>
      </Container>
    </section>
  )
}
