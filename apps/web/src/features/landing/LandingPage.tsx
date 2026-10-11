import MarketingFooter from '@/components/marketing/MarketingFooter'
import MarketingNav from '@/components/marketing/MarketingNav'
import { useTitle } from '@/lib/hooks'
import Hero from './Hero'
import { Audiences, Compare, FinalCta, HowItWorks, Ticker } from './Sections'

export default function LandingPage() {
  useTitle('trustpool · One buy, one sale, the same price for everyone')
  return (
    <div className="bg-bg">
      <MarketingNav />
      <main>
        <Hero />
        <Ticker />
        <HowItWorks />
        <Audiences />
        <Compare />
        <FinalCta />
      </main>
      <MarketingFooter />
    </div>
  )
}
