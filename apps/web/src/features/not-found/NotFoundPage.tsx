import { ArrowLink, Wordmark } from '@/components/ui'
import { useTitle } from '@/lib/hooks'

export default function NotFoundPage() {
  useTitle('Not found · trustpool')
  return (
    <main className="dots flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <Wordmark />
      <p className="num mt-10 text-[13px] text-ink-3">404</p>
      <h1 className="mt-2 text-[32px] font-semibold tracking-[-0.04em]">Nothing at this address</h1>
      <ArrowLink to="/app" className="mt-8">
        Go to the app
      </ArrowLink>
    </main>
  )
}
