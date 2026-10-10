import MarketingFooter from '@/components/marketing/MarketingFooter'
import MarketingNav from '@/components/marketing/MarketingNav'
import { useTitle } from '@/lib/hooks'
import Hero from './Hero'
import { Audiences, Compare, FinalCta, HowItWorks, InsideApp, Limits, Ticker } from './Sections'

export default function LandingPage() {
  useTitle('trustpool · Follow callers who buy first')
  return (
    <div className="bg-bg">
      <MarketingNav />
      <main>
        <Hero />
        <Ticker />
        <HowItWorks />
        <InsideApp />
        <Audiences />
        <Compare />
        <Limits />
        <FinalCta />
      </main>
      <MarketingFooter />
    </div>
  )
}
