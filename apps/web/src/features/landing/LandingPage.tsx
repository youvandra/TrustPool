import { useTitle } from '@/lib/hooks'
import CtaSection from './sections/CtaSection'
import HeroSection from './sections/HeroSection'
import HowItWorksSection from './sections/HowItWorksSection'
import LimitsSection from './sections/LimitsSection'
import PrinciplesSection from './sections/PrinciplesSection'

export default function LandingPage() {
  useTitle('trustpool · Callers who buy first and exit in public')
  return (
    <main>
      <HeroSection />
      <HowItWorksSection />
      <PrinciplesSection />
      <LimitsSection />
      <CtaSection />
    </main>
  )
}
