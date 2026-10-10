import { clock } from '@/lib/format'
import { useNow } from '@/lib/hooks'

/** Ticking clock to `at`. Shows `done` once it passes. */
export default function Countdown({ at, done = 'now', className = '' }: { at: number; done?: string; className?: string }) {
  const now = useNow(1000)
  const left = at - now
  return <span className={`num ${className}`}>{left > 0 ? clock(left) : done}</span>
}
