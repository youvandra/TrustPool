import Container from '@/components/site/Container'
import { ArrowLink } from '@/components/ui'
import { useTitle } from '@/lib/hooks'

export default function NotFoundPage() {
  useTitle('Not found · trustpool')
  return (
    <main className="flex min-h-[80vh] items-center pt-24">
      <Container>
        <p className="eyebrow text-ink-quiet">404</p>
        <h1 className="mt-3 text-[30px] font-semibold tracking-[-0.02em]">Nothing at this address</h1>
        <div className="mt-8">
          <ArrowLink text="Browse calls" to="/calls" />
        </div>
      </Container>
    </main>
  )
}
