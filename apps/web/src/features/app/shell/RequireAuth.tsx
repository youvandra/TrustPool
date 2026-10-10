import { Lock } from 'lucide-react'
import type { ReactNode } from 'react'
import { useSession } from '@/auth/session'
import { Button, Card } from '@/components/ui'

/** Personal pages show a sign-in card in place of their content until there is a session. */
export default function RequireAuth({ title, body, children }: { title: string; body: string; children: ReactNode }) {
  const s = useSession()
  if (!s.ready) return null
  if (s.authenticated) return <>{children}</>
  return (
    <Card className="mx-auto mt-6 max-w-[480px] p-8 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-accent-fill text-accent-deep">
        <Lock size={20} />
      </div>
      <p className="mt-5 text-[18px] font-semibold tracking-[-0.01em]">{title}</p>
      <p className="mx-auto mt-2 max-w-[38ch] text-[14px] leading-[1.55] text-ink-3">{body}</p>
      <Button className="mt-6" onClick={s.login}>
        Sign in
      </Button>
      <p className="mt-3 text-[12px] text-ink-3">Email or a wallet. A wallet is created for you if you have none.</p>
    </Card>
  )
}
