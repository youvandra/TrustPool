import { clock, date } from '@/lib/format'
import { useNow } from '@/lib/hooks'

/** Ticking clock to `at`. Shows `done` once it passes. `short` drops the minutes beyond a day, for narrow cells. */
export default function Countdown({ at, done = 'now', className = '', short }: { at: number; done?: string; className?: string; short?: boolean }) {
  const now = useNow(1000)
  const left = at - now
  const text = left > 0 ? clock(left) : done
  return (
    <span className={`num ${className}`} title={date(at)}>
      {short && left > 86_400_000 ? text.replace(/ \d+m$/, '') : text}
    </span>
  )
}
