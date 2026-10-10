import { Lock } from 'lucide-react'
import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import type { CallState } from '@trustpool/core'
import { signedPct, toneOf } from '@/lib/format'

export function Card({ className = '', children, as: As = 'div' }: { className?: string; children: ReactNode; as?: 'div' | 'section' }) {
  return <As className={`rounded-2xl border border-line bg-surface shadow-card ${className}`}>{children}</As>
}

/** Section header inside a card or page: title left, optional action right. */
export function SectionHead({ title, sub, action, className = '' }: { title: ReactNode; sub?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={`flex items-end justify-between gap-4 ${className}`}>
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold tracking-[-0.01em]">{title}</h2>
        {sub && <p className="mt-0.5 text-[13px] text-ink-3">{sub}</p>}
      </div>
      {action}
    </div>
  )
}

export function SeeAll({ to, children = 'See all' }: { to: string; children?: ReactNode }) {
  return (
    <Link to={to} className="shrink-0 text-[13px] font-medium text-ink-3 transition-colors hover:text-ink">
      {children} →
    </Link>
  )
}

const STATE: Record<CallState, { label: string; cls: string; dot: string }> = {
  Locked: { label: 'Locked', cls: 'bg-subtle text-ink-2 ring-line', dot: '' },
  Exiting: { label: 'Exit announced', cls: 'bg-accent-fill text-accent-deep ring-accent/20', dot: 'bg-accent animate-pulse2' },
  Settled: { label: 'Settled', cls: 'bg-subtle text-ink-2 ring-line', dot: 'bg-ink-3' },
  Released: { label: 'Released unsold', cls: 'bg-subtle text-ink-2 ring-line', dot: 'bg-ink-3' },
}

/** The one pulsing thing in the product is an announced exit: the moment a follower must see. */
export function StateTag({ state, size = 'md' }: { state: CallState; size?: 'sm' | 'md' }) {
  const s = STATE[state]
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-medium ring-1 ring-inset ${s.cls} ${size === 'sm' ? 'h-6 px-2 text-[11.5px]' : 'h-7 px-2.5 text-[12px]'}`}
    >
      {state === 'Locked' ? <Lock size={11} strokeWidth={2.4} /> : <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />}
      {s.label}
    </span>
  )
}

/** Signed result. A loss is drawn exactly like a gain: same size, same place; only sign and colour differ. */
export function Signed({ bps, className = '', pill = false }: { bps: number; className?: string; pill?: boolean }) {
  const t = toneOf(bps)
  const color = t === 'gain' ? 'text-gain' : t === 'loss' ? 'text-loss' : 'text-ink'
  if (!pill) return <span className={`num ${color} ${className}`}>{signedPct(bps)}</span>
  const bg = t === 'gain' ? 'bg-gain-fill' : t === 'loss' ? 'bg-loss-fill' : 'bg-subtle'
  return <span className={`num inline-flex h-6 items-center rounded-md px-1.5 text-[12.5px] font-medium ${bg} ${color} ${className}`}>{signedPct(bps)}</span>
}

/** Tab strip with a sliding indicator. */
export function Tabs<T extends string>({
  value,
  options,
  onChange,
  id,
  className = '',
}: {
  value: T
  options: { v: T; label: string; count?: number }[]
  onChange: (v: T) => void
  id: string
  className?: string
}) {
  return (
    <div className={`no-scrollbar flex gap-1 overflow-x-auto rounded-xl bg-ink/[0.04] p-1 ${className}`} role="tablist">
      {options.map((o) => {
        const on = value === o.v
        return (
          <button
            key={o.v}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.v)}
            className={`relative flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium transition-colors ${on ? 'text-ink' : 'text-ink-3 hover:text-ink-2'}`}
          >
            {on && <motion.span layoutId={`tab-${id}`} className="absolute inset-0 rounded-lg bg-surface shadow-card" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
            <span className="relative">{o.label}</span>
            {o.count !== undefined && <span className={`num relative text-[11px] ${on ? 'text-ink-3' : 'text-ink-3/70'}`}>{o.count}</span>}
          </button>
        )
      })}
    </div>
  )
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton rounded-xl ${className}`} />
}

export function Empty({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      {icon && <div className="grid h-12 w-12 place-items-center rounded-2xl bg-subtle text-ink-3 ring-1 ring-inset ring-line">{icon}</div>}
      <p className="mt-4 text-[15px] font-semibold">{title}</p>
      {body && <p className="mt-1.5 max-w-[42ch] text-[14px] leading-[1.55] text-ink-3">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

/** Label / value row for rule lists and summaries. */
export function Row({ label, children, hint }: { label: ReactNode; children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-t border-line py-3 text-[14px] first:border-t-0 first:pt-0 last:pb-0">
      <span className="text-ink-3">
        {label}
        {hint && <span className="block text-[12px] text-ink-3/80">{hint}</span>}
      </span>
      <span className="text-right text-ink">{children}</span>
    </div>
  )
}

export function Stat({ label, value, foot, className = '' }: { label: string; value: ReactNode; foot?: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <p className="text-[12.5px] text-ink-3">{label}</p>
      <p className="num mt-1.5 text-[24px] font-medium tracking-[-0.02em]">{value}</p>
      {foot && <div className="mt-1 text-[12.5px] text-ink-3">{foot}</div>}
    </div>
  )
}
