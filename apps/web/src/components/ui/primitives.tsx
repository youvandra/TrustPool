import { Lock } from 'lucide-react'
import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import type { CallState } from '@trustpool/core'
import { signedPct, toneOf } from '@/lib/format'

/** White card. `tone="accent"` swaps the surface for the solid brand blue, for the one tile that must lead. */
export function Card({ className = '', children, as: As = 'div', tone = 'plain' }: { className?: string; children: ReactNode; as?: 'div' | 'section'; tone?: 'plain' | 'accent' }) {
  const t = tone === 'accent' ? 'border-accent bg-accent text-white' : 'border-line bg-surface'
  return <As className={`rounded-2xl border shadow-card ${t} ${className}`}>{children}</As>
}

/** Section header inside a card or page: title left, optional action right. */
export function SectionHead({ title, sub, action, className = '' }: { title: ReactNode; sub?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={`flex items-end justify-between gap-4 ${className}`}>
      <div className="min-w-0">
        <h2 className="text-[16px] font-semibold tracking-[-0.015em]">{title}</h2>
        {sub && <p className="mt-0.5 text-[13.5px] text-ink-3">{sub}</p>}
      </div>
      {action}
    </div>
  )
}

export function SeeAll({ to, children = 'See all' }: { to: string; children?: ReactNode }) {
  return (
    <Link to={to} className="shrink-0 text-[13px] font-medium text-accent transition-colors hover:text-accent-strong">
      {children} →
    </Link>
  )
}

const STATE: Record<CallState, { label: string; cls: string; dot: string }> = {
  Open: { label: 'Window open', cls: 'bg-accent text-white ring-accent', dot: 'bg-white' },
  Holding: { label: 'Bought together', cls: 'bg-ink/[0.06] text-ink ring-ink/10', dot: '' },
  Settled: { label: 'Settled', cls: 'bg-subtle text-ink-2 ring-line-strong', dot: 'bg-ink-3' },
  Refunded: { label: 'Refunded', cls: 'bg-subtle text-ink-2 ring-line-strong', dot: 'bg-ink-3' },
  Split: { label: 'Split, unsold', cls: 'bg-loss-fill text-loss ring-loss/20', dot: 'bg-loss' },
}

/** The one pulsing thing in the product is an open window: the moment someone can still join. */
export function StateTag({ state, size = 'md' }: { state: CallState; size?: 'sm' | 'md' }) {
  const s = STATE[state]
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-medium ring-1 ring-inset ${s.cls} ${size === 'sm' ? 'h-6 px-2 text-[11.5px]' : 'h-7 px-2.5 text-[12px]'}`}
    >
      {state === 'Holding' ? (
        <Lock size={11} strokeWidth={2.4} />
      ) : state === 'Open' ? (
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inset-0 animate-ping rounded-full bg-white/70 motion-reduce:animate-none" />
          <span className="relative h-1.5 w-1.5 rounded-full bg-white" />
        </span>
      ) : (
        <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      )}
      {s.label}
    </span>
  )
}

/** How full a pool is against its cap: one thin bar, the numbers beside it. */
export function Fill({ value, max, className = '' }: { value: number; max: number; className?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className={`h-1.5 overflow-hidden rounded-full bg-ink/[0.07] ${className}`} role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
      <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
    </div>
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

/** A list card while it loads: the same rows (avatar, two lines, a value) as the real one. */
export function SkeletonRows({ rows = 4, className = '' }: { rows?: number; className?: string }) {
  return (
    <div className={`divide-y divide-line overflow-hidden rounded-2xl bg-surface shadow-card ${className}`} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-5 py-4">
          <div className="skeleton h-10 w-10 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="skeleton h-3.5 w-32 max-w-full rounded-md" />
            <div className="skeleton h-3 w-48 max-w-full rounded-md" />
          </div>
          <div className="skeleton h-8 w-20 shrink-0 rounded-lg" />
        </div>
      ))}
    </div>
  )
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
      <p className="num mt-1.5 text-[26px] font-medium tracking-[-0.03em]">{value}</p>
      {foot && <div className="mt-1 text-[12.5px] text-ink-3">{foot}</div>}
    </div>
  )
}
